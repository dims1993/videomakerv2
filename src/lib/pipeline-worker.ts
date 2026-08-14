import { revalidatePath } from "next/cache";

import {
  clearPipelineWorkerCancel,
  getPipelineWorkerProcessId,
  isPipelineWorkerCancelRequested,
  isPipelineWorkerRunning,
  requestPipelineWorkerCancel,
  setPipelineWorkerProcessId,
  setPipelineWorkerRunning,
} from "@/lib/pipeline-cancel";
import { appendPipelineErrorLog } from "@/lib/pipeline-error-log";
import {
  isPipelineStep,
  nextPipelineStep,
  pickNextQueueItem,
  pipelineStepLabel,
  type PipelineStep,
} from "@/lib/pipeline-queue";
import {
  bumpPipelineStepAttempt,
  clearPipelineStepAttempts,
  isTransientPipelineFailure,
  PIPELINE_TRANSIENT_MAX_ATTEMPTS,
  pipelineRetryDelayMs,
  reclaimOrphanedPipelineWork,
  resetPipelineAttemptCounts,
} from "@/lib/pipeline-resilience";
import {
  isPipelineUserStopError,
  parkPipelineItemForResume,
  PIPELINE_STOP_RESUME_MESSAGE,
  stopPipelineWorkerAndSafeguard,
} from "@/lib/pipeline-stop";
import { runPipelineStep } from "@/lib/pipeline-steps";
import { prisma } from "@/lib/prisma";
import {
  cancelProcess,
  failProcess,
  finishProcess,
  startProcess,
  updateProcess,
} from "@/lib/process-runs";

function revalidatePipelinePaths(videoId?: string) {
  revalidatePath("/pipeline-queue");
  revalidatePath("/");
  if (videoId) {
    revalidatePath(`/videos/${videoId}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function markItemPaused(
  itemId: string,
  videoId: string,
  currentStep: string,
  errorMessage: string,
  processRunId?: string | null,
) {
  await prisma.pipelineQueueItem.update({
    where: { id: itemId },
    data: {
      status: "paused",
      currentStep,
      errorMessage,
      lastProcessRunId: processRunId ?? undefined,
      finishedAt: null,
    },
  });
  revalidatePipelinePaths(videoId);
}

async function markItemQueuedForRetry(
  itemId: string,
  videoId: string,
  currentStep: string,
  errorMessage: string,
  processRunId?: string | null,
) {
  await prisma.pipelineQueueItem.update({
    where: { id: itemId },
    data: {
      status: "queued",
      enabled: true,
      currentStep,
      errorMessage: `Retry pending: ${errorMessage}`,
      lastProcessRunId: processRunId ?? undefined,
      finishedAt: null,
    },
  });
  revalidatePipelinePaths(videoId);
}

async function markItemSucceeded(itemId: string, videoId: string) {
  clearPipelineStepAttempts(itemId);
  await prisma.pipelineQueueItem.update({
    where: { id: itemId },
    data: {
      status: "succeeded",
      currentStep: "done",
      errorMessage: null,
      finishedAt: new Date(),
    },
  });
  revalidatePipelinePaths(videoId);
}

async function markItemCancelled(itemId: string, videoId: string, step: string) {
  // Soft-stop from the worker loop: park for resume, do not mark cancelled.
  await parkPipelineItemForResume({
    itemId,
    videoId,
    currentStep: step,
    message: PIPELINE_STOP_RESUME_MESSAGE,
  });
  revalidatePipelinePaths(videoId);
}

async function runQueueItem(item: {
  id: string;
  videoId: string;
  channelKey: string;
  currentStep: string;
  video: { id: string; title: string; channelKey: string };
}) {
  const startStep = isPipelineStep(item.currentStep)
    ? item.currentStep
    : ("script" as PipelineStep);

  await prisma.pipelineQueueItem.update({
    where: { id: item.id },
    data: {
      status: "running",
      currentStep: startStep,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
    },
  });
  revalidatePipelinePaths(item.videoId);

  let step: PipelineStep | "done" = startStep;

  while (step !== "done") {
    if (isPipelineWorkerCancelRequested()) {
      await markItemCancelled(item.id, item.videoId, step);
      return { stopped: true as const };
    }

    const stepProcessId = await startProcess({
      type: `pipeline_${step}`,
      videoId: item.videoId,
      channelKey: item.channelKey,
      title: `${pipelineStepLabel(step)} — ${item.video.title}`,
      description: `Pipeline queue step ${step}`,
      currentStep: pipelineStepLabel(step),
      totalSteps: 1,
    });

    await prisma.pipelineQueueItem.update({
      where: { id: item.id },
      data: {
        currentStep: step,
        lastProcessRunId: stepProcessId,
      },
    });
    await updateProcess(getPipelineWorkerProcessId(), {
      currentStep: `${item.video.title}: ${pipelineStepLabel(step)}`,
      logMessage: `Starting ${pipelineStepLabel(step)} for ${item.video.title}.`,
    });

    try {
      const result = await runPipelineStep(item.videoId, step);
      clearPipelineStepAttempts(item.id, step);
      await finishProcess(stepProcessId, { logMessage: result.message });
      await updateProcess(getPipelineWorkerProcessId(), {
        logMessage: `${pipelineStepLabel(step)} OK: ${result.message}`,
        logLevel: "success",
      });
      step = nextPipelineStep(step);
      if (step !== "done") {
        await prisma.pipelineQueueItem.update({
          where: { id: item.id },
          data: { currentStep: step, errorMessage: null },
        });
        revalidatePipelinePaths(item.videoId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Pipeline step failed.";

      // User Stop / batch cancel → preserve checkpoints and leave item queued.
      if (
        isPipelineUserStopError(error, message) ||
        isPipelineWorkerCancelRequested()
      ) {
        await cancelProcess(stepProcessId);
        await updateProcess(getPipelineWorkerProcessId(), {
          logMessage: PIPELINE_STOP_RESUME_MESSAGE,
          logLevel: "warning",
        });
        await parkPipelineItemForResume({
          itemId: item.id,
          videoId: item.videoId,
          currentStep: step,
          processRunId: stepProcessId,
        });
        await appendPipelineErrorLog({
          kind: "worker_stop",
          message: PIPELINE_STOP_RESUME_MESSAGE,
          queueItemId: item.id,
          videoId: item.videoId,
          channelKey: item.channelKey,
          processRunId: stepProcessId,
          step,
          title: item.video.title,
        });
        return { stopped: true as const };
      }

      await failProcess(stepProcessId, { errorMessage: message });
      await updateProcess(getPipelineWorkerProcessId(), {
        logMessage: `${pipelineStepLabel(step)} failed: ${message}`,
        logLevel: "error",
      });

      const attempt = bumpPipelineStepAttempt(item.id, step);
      const canRetry =
        isTransientPipelineFailure(error) &&
        attempt < PIPELINE_TRANSIENT_MAX_ATTEMPTS &&
        !isPipelineWorkerCancelRequested();

      if (canRetry) {
        const delayMs = pipelineRetryDelayMs(attempt);
        await appendPipelineErrorLog({
          kind: "step_retry",
          message,
          queueItemId: item.id,
          videoId: item.videoId,
          channelKey: item.channelKey,
          processRunId: stepProcessId,
          step,
          title: item.video.title,
          attempt,
          meta: { delayMs, maxAttempts: PIPELINE_TRANSIENT_MAX_ATTEMPTS },
        });
        await updateProcess(getPipelineWorkerProcessId(), {
          logMessage: `Transient error — retry ${attempt}/${PIPELINE_TRANSIENT_MAX_ATTEMPTS - 1} for ${pipelineStepLabel(step)} in ${Math.round(delayMs / 1000)}s.`,
          logLevel: "warning",
        });
        await markItemQueuedForRetry(
          item.id,
          item.videoId,
          step,
          message,
          stepProcessId,
        );
        await sleep(delayMs);
        return {
          retried: true as const,
          step,
          message,
          attempt,
        };
      }

      await appendPipelineErrorLog({
        kind: "step_failed",
        message,
        queueItemId: item.id,
        videoId: item.videoId,
        channelKey: item.channelKey,
        processRunId: stepProcessId,
        step,
        title: item.video.title,
        attempt,
      });
      await markItemPaused(
        item.id,
        item.videoId,
        step,
        message,
        stepProcessId,
      );
      return { paused: true as const, step, message };
    }
  }

  await markItemSucceeded(item.id, item.videoId);
  await updateProcess(getPipelineWorkerProcessId(), {
    logMessage: `Completed pipeline for ${item.video.title}.`,
    logLevel: "success",
  });
  return { succeeded: true as const };
}

export async function runPipelineWorkerLoop() {
  if (isPipelineWorkerRunning()) {
    return { ok: false as const, reason: "already_running" as const };
  }

  setPipelineWorkerRunning(true);
  clearPipelineWorkerCancel();
  resetPipelineAttemptCounts();

  // Any DB "running" rows are orphans — previous Next.js process died.
  const reclaimed = await reclaimOrphanedPipelineWork({
    staleMs: 0,
    reason:
      "Orphan reclaim on worker start: previous worker process was gone while items/processRuns stayed running.",
  });

  const processId = await startProcess({
    type: "pipeline_queue_worker",
    title: "Pipeline queue worker",
    description: "Processing enabled queue items (1 video at a time).",
    currentStep: "Starting",
    totalSteps: null,
  });
  setPipelineWorkerProcessId(processId);
  revalidatePipelinePaths();

  if (reclaimed.requeuedItems || reclaimed.cancelledProcessRuns) {
    await updateProcess(processId, {
      logMessage: `Reclaimed orphans: ${reclaimed.requeuedItems} queue item(s), ${reclaimed.cancelledProcessRuns} process run(s).`,
      logLevel: "warning",
    });
  }

  try {
    let processed = 0;

    while (!isPipelineWorkerCancelRequested()) {
      const item = await pickNextQueueItem();
      if (!item) {
        await updateProcess(processId, {
          currentStep: "Idle — queue empty",
          logMessage: processed
            ? `Finished queue after ${processed} video(s).`
            : "No enabled queued items.",
          logLevel: "info",
        });
        break;
      }

      await updateProcess(processId, {
        currentStep: `Running ${item.video.title}`,
        logMessage: `Picked queue item ${item.id} at step ${item.currentStep}.`,
      });

      const outcome = await runQueueItem(item);
      processed += 1;

      if ("stopped" in outcome && outcome.stopped) {
        break;
      }
      // Retried items go back to queued and will be picked again.
      // Paused items wait for Resume. Keep going if another queued item exists.
    }

    if (isPipelineWorkerCancelRequested()) {
      await cancelProcess(processId);
      await appendPipelineErrorLog({
        kind: "worker_stop",
        message: "Pipeline worker stop requested.",
        processRunId: processId,
      });
    } else {
      await finishProcess(processId, {
        logMessage: `Worker finished (${processed} video(s) attempted).`,
      });
    }

    return { ok: true as const, processed };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Pipeline worker failed.";
    await failProcess(processId, { errorMessage: message });
    await appendPipelineErrorLog({
      kind: "worker_crash",
      message,
      processRunId: processId,
    });
    return { ok: false as const, reason: "failed" as const, message };
  } finally {
    setPipelineWorkerRunning(false);
    setPipelineWorkerProcessId(null);
    clearPipelineWorkerCancel();
    revalidatePipelinePaths();
  }
}

export function stopPipelineWorker() {
  // Prefer the full safeguard path from the API DELETE handler.
  // This soft entry still signals cancel for in-loop checks.
  requestPipelineWorkerCancel();
  const processId = getPipelineWorkerProcessId();
  if (processId) {
    void updateProcess(processId, {
      currentStep: "Stopping — preserving progress",
      logMessage: PIPELINE_STOP_RESUME_MESSAGE,
      logLevel: "warning",
    });
  }
  return { ok: true as const, running: isPipelineWorkerRunning() };
}

export { stopPipelineWorkerAndSafeguard };
