import {
  clearPipelineWorkerCancel,
  getPipelineWorkerProcessId,
  isPipelineWorkerRunning,
  requestPipelineWorkerCancel,
  setPipelineWorkerProcessId,
  setPipelineWorkerRunning,
} from "@/lib/pipeline-cancel";
import { prisma } from "@/lib/prisma";
import { requestScriptWriterCancel } from "@/lib/script-writer-cancel";
import { requestSceneVoiceoverCancel } from "@/lib/scene-voiceover-cancel";
import { requestVisualPlanCancel } from "@/lib/visual-plan-cancel";
import { cancelProcess, updateProcess } from "@/lib/process-runs";
import { appendPipelineErrorLog } from "@/lib/pipeline-error-log";

export const PIPELINE_STOP_RESUME_MESSAGE =
  "Stopped by user. Progress/checkpoints preserved — Start worker to resume.";

export function isPipelineUserStopError(
  error: unknown,
  message?: string,
): boolean {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: string }).name)
      : "";
  if (
    name === "VisualPlanCanceledError" ||
    name === "ScriptWriterCanceledError"
  ) {
    return true;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: string }).code) === "canceled"
  ) {
    return true;
  }
  const m = (message ?? (error instanceof Error ? error.message : "")).toLowerCase();
  return (
    m.includes("batch canceled") ||
    m.includes("batch cancelled") ||
    m.includes("pipeline worker stopped") ||
    m.includes("stopped by user") ||
    (m.includes("canceled") && !m.includes("orphaned"))
  );
}

/** Park a running item so Start worker can pick it up again (checkpoints kept). */
export async function parkPipelineItemForResume(options: {
  itemId: string;
  videoId: string;
  currentStep: string;
  processRunId?: string | null;
  message?: string;
}) {
  const message = options.message ?? PIPELINE_STOP_RESUME_MESSAGE;
  await prisma.pipelineQueueItem.update({
    where: { id: options.itemId },
    data: {
      status: "queued",
      enabled: true,
      currentStep: options.currentStep,
      errorMessage: message,
      lastProcessRunId: options.processRunId ?? undefined,
      finishedAt: null,
    },
  });
}

async function cancelInFlightBatchesForVideo(videoId: string) {
  requestVisualPlanCancel(videoId);
  requestScriptWriterCancel(videoId);
  requestSceneVoiceoverCancel(videoId);

  // Best-effort: mark any running image batches canceled so Flow stops at checkpoint.
  const batches = await prisma.imageBatch.findMany({
    where: {
      videoId,
      status: { in: ["running", "queued", "pending"] },
    },
    select: { id: true },
    take: 10,
  });
  for (const batch of batches) {
    await prisma.imageBatch.update({
      where: { id: batch.id },
      data: { status: "canceled" },
    });
  }
}

/**
 * Graceful Stop worker:
 * - signals cancel to ChatGPT/visual/script/voiceover waits
 * - parks running queue items as queued (resume-ready; checkpoints untouched)
 * - cancels in-flight process runs as "stopped by user"
 * - clears in-memory worker flags so Start works immediately
 */
export async function stopPipelineWorkerAndSafeguard() {
  const wasFlagRunning = isPipelineWorkerRunning();
  const workerProcessId = getPipelineWorkerProcessId();

  requestPipelineWorkerCancel();
  if (workerProcessId) {
    await updateProcess(workerProcessId, {
      currentStep: "Stopping — preserving progress",
      logMessage: PIPELINE_STOP_RESUME_MESSAGE,
      logLevel: "warning",
    }).catch(() => undefined);
  }

  const runningItems = await prisma.pipelineQueueItem.findMany({
    where: { status: "running" },
    select: {
      id: true,
      videoId: true,
      channelKey: true,
      currentStep: true,
      lastProcessRunId: true,
      video: { select: { title: true } },
    },
  });

  const parkedItemIds: string[] = [];
  for (const item of runningItems) {
    await cancelInFlightBatchesForVideo(item.videoId);
    await parkPipelineItemForResume({
      itemId: item.id,
      videoId: item.videoId,
      currentStep: item.currentStep,
      processRunId: item.lastProcessRunId,
    });
    parkedItemIds.push(item.id);
    await appendPipelineErrorLog({
      kind: "worker_stop",
      message: PIPELINE_STOP_RESUME_MESSAGE,
      queueItemId: item.id,
      videoId: item.videoId,
      channelKey: item.channelKey,
      step: item.currentStep,
      title: item.video.title,
      processRunId: item.lastProcessRunId,
    });
  }

  const runningRuns = await prisma.processRun.findMany({
    where: {
      status: "running",
      OR: [
        { type: { startsWith: "pipeline_" } },
        { type: "pipeline_queue_worker" },
      ],
    },
    select: { id: true, type: true, title: true, videoId: true, logsJson: true },
  });

  const cancelledRunIds: string[] = [];
  for (const run of runningRuns) {
    const logs = Array.isArray(run.logsJson)
      ? [...(run.logsJson as unknown[])]
      : [];
    logs.push({
      timestamp: new Date().toISOString(),
      level: "warning",
      message: PIPELINE_STOP_RESUME_MESSAGE,
    });
    await prisma.processRun.update({
      where: { id: run.id },
      data: {
        status: "cancelled",
        currentStep: "Stopped by user",
        errorMessage: PIPELINE_STOP_RESUME_MESSAGE,
        finishedAt: new Date(),
        logsJson: logs as object,
      },
    });
    cancelledRunIds.push(run.id);
  }

  if (workerProcessId && !cancelledRunIds.includes(workerProcessId)) {
    await cancelProcess(workerProcessId).catch(() => undefined);
  }

  setPipelineWorkerRunning(false);
  setPipelineWorkerProcessId(null);
  // Keep cancel flag set briefly so an in-flight loop still exits; clear on next Start.
  // Do not clearPipelineWorkerCancel here — Start clears it.

  await appendPipelineErrorLog({
    kind: "worker_stop",
    message: `Stop worker safeguarded ${parkedItemIds.length} item(s), cancelled ${cancelledRunIds.length} process run(s).`,
    processRunId: workerProcessId,
    meta: { parkedItemIds, cancelledRunIds },
  });

  return {
    ok: true as const,
    wasRunning: wasFlagRunning,
    running: false as const,
    parkedItems: parkedItemIds.length,
    cancelledProcessRuns: cancelledRunIds.length,
    message: PIPELINE_STOP_RESUME_MESSAGE,
  };
}

export function clearPipelineStopCancelFlag() {
  clearPipelineWorkerCancel();
}
