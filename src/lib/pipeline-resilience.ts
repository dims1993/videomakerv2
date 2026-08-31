import { appendPipelineErrorLog } from "@/lib/pipeline-error-log";
import { prisma } from "@/lib/prisma";

/** How long a queue/process can sit as `running` before we treat it as orphaned. */
export const PIPELINE_ORPHAN_STALE_MS = 3 * 60 * 1000;

/** Max automatic retries for transient ChatGPT / browser / network glitches. */
export const PIPELINE_TRANSIENT_MAX_ATTEMPTS = 4;

const attemptCounts = new Map<string, number>();

function attemptKey(queueItemId: string, step: string) {
  return `${queueItemId}::${step}`;
}

export function getPipelineStepAttempt(queueItemId: string, step: string) {
  return attemptCounts.get(attemptKey(queueItemId, step)) ?? 0;
}

export function bumpPipelineStepAttempt(queueItemId: string, step: string) {
  const key = attemptKey(queueItemId, step);
  const next = (attemptCounts.get(key) ?? 0) + 1;
  attemptCounts.set(key, next);
  return next;
}

export function clearPipelineStepAttempts(queueItemId: string, step?: string) {
  if (step) {
    attemptCounts.delete(attemptKey(queueItemId, step));
    return;
  }
  for (const key of [...attemptCounts.keys()]) {
    if (key.startsWith(`${queueItemId}::`)) {
      attemptCounts.delete(key);
    }
  }
}

/** Reset in-memory counters (tests / worker start). */
export function resetPipelineAttemptCounts() {
  attemptCounts.clear();
}

/**
 * Errors that usually clear on retry without human intervention.
 * Permanent validation / missing-data errors should NOT match.
 */
export function isTransientPipelineError(message: string): boolean {
  const m = message.toLowerCase();
  if (!m.trim()) return false;

  // Permanent / intentional
  if (m.includes("canceled") || m.includes("cancelled")) return false;
  if (m.includes("video not found")) return false;
  if (m.includes("has no script")) return false;
  if (m.includes("could not build")) return false;
  if (m.includes("validation")) return false;
  if (m.includes("still invalid after repair")) return false;
  if (m.includes("assets incomplete")) return false;
  if (m.includes("assets still failed")) return false;

  return (
    // Network / Next.js restart / CDP drops (often surfaces as bare "network error")
    m.includes("network error") ||
    m.includes("networkerror") ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("socket hang up") ||
    m.includes("socket closed") ||
    m.includes("und_err") ||
    m.includes("other side closed") ||
    m.includes("net::err_") ||
    m.includes("ssl") ||
    m.includes("tls") ||
    // ChatGPT / Playwright
    m.includes("timed out waiting for chatgpt") ||
    m.includes("locator.innertext") ||
    m.includes("model picker") ||
    m.includes("gpt-5.5") ||
    m.includes("model option") ||
    m.includes("did not accept the prompt") ||
    m.includes("never started a new assistant") ||
    m.includes("send stayed disabled") ||
    m.includes("send button stayed disabled") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("composer") ||
    m.includes("locator.click") ||
    m.includes("prompt-textarea") ||
    m.includes("performing click action") ||
    m.includes("chatgpt session is not open") ||
    m.includes("could not find the chatgpt") ||
    m.includes("attachment") ||
    m.includes("stop cleared but no new assistant") ||
    m.includes("target page") ||
    m.includes("browser has been closed") ||
    m.includes("connection refused") ||
    m.includes("9222") ||
    m.includes("script coverage") ||
    m.includes("reading 'locator'") ||
    m.includes("cannot read properties of null") ||
    m.includes("execution context was destroyed") ||
    m.includes("because of a navigation") ||
    m.includes("frame was detached") ||
    m.includes("could not select chatgpt")
  );
}

/** Accept Error / unknown thrown values (TypeError: network error, etc.). */
export function isTransientPipelineFailure(error: unknown): boolean {
  if (error instanceof Error) {
    if (isTransientPipelineError(error.message)) return true;
    if (
      error.name === "TypeError" &&
      /network|fetch|load failed/i.test(error.message)
    ) {
      return true;
    }
    if (error.name === "AbortError") return true;
  }
  if (typeof error === "string") {
    return isTransientPipelineError(error);
  }
  return false;
}

export function pipelineRetryDelayMs(attempt: number) {
  // 20s, 80s, 180s (capped), 180s
  return Math.min(180_000, 20_000 * attempt * attempt);
}

export type OrphanReclaimResult = {
  requeuedItems: number;
  cancelledProcessRuns: number;
  itemIds: string[];
  processRunIds: string[];
};

/**
 * When a worker starts, any DB row still marked `running` is orphaned:
 * Next.js restarted, Stop left a soft flag, or the process died mid-ChatGPT wait.
 * Requeue those videos (checkpoints remain) and cancel stuck ProcessRuns.
 */
export async function reclaimOrphanedPipelineWork(options?: {
  staleMs?: number;
  reason?: string;
}): Promise<OrphanReclaimResult> {
  const staleMs = options?.staleMs ?? PIPELINE_ORPHAN_STALE_MS;
  const reason =
    options?.reason ??
    `Orphan reclaim: work left stuck as running (stale > ${Math.round(staleMs / 1000)}s). Requeued to continue overnight.`;
  const cutoff = new Date(Date.now() - staleMs);

  const stuckItems = await prisma.pipelineQueueItem.findMany({
    where: {
      status: "running",
      OR: [{ updatedAt: { lte: cutoff } }, { startedAt: { lte: cutoff } }],
    },
    select: {
      id: true,
      videoId: true,
      channelKey: true,
      currentStep: true,
      video: { select: { title: true } },
    },
  });

  const itemIds: string[] = [];
  for (const item of stuckItems) {
    await prisma.pipelineQueueItem.update({
      where: { id: item.id },
      data: {
        status: "queued",
        enabled: true,
        errorMessage: null,
        finishedAt: null,
      },
    });
    itemIds.push(item.id);
    await appendPipelineErrorLog({
      kind: "orphan_reclaim",
      message: reason,
      queueItemId: item.id,
      videoId: item.videoId,
      channelKey: item.channelKey,
      step: item.currentStep,
      title: item.video.title,
    });
  }

  const stuckRuns = await prisma.processRun.findMany({
    where: {
      status: "running",
      OR: [
        { type: { startsWith: "pipeline_" } },
        { type: "pipeline_queue_worker" },
      ],
      updatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      type: true,
      title: true,
      videoId: true,
      currentStep: true,
      logsJson: true,
    },
  });

  const processRunIds: string[] = [];
  for (const run of stuckRuns) {
    const logs = Array.isArray(run.logsJson)
      ? [...(run.logsJson as unknown[])]
      : [];
    logs.push({
      timestamp: new Date().toISOString(),
      level: "warning",
      message: reason,
    });
    await prisma.processRun.update({
      where: { id: run.id },
      data: {
        status: "cancelled",
        currentStep: "Cancelled",
        errorMessage: reason,
        finishedAt: new Date(),
        logsJson: logs as object,
      },
    });
    processRunIds.push(run.id);
    await appendPipelineErrorLog({
      kind: "orphan_reclaim",
      message: reason,
      processRunId: run.id,
      videoId: run.videoId,
      step: run.currentStep,
      title: run.title,
      meta: { processType: run.type },
    });
  }

  return {
    requeuedItems: itemIds.length,
    cancelledProcessRuns: processRunIds.length,
    itemIds,
    processRunIds,
  };
}
