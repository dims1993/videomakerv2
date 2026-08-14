import fs from "node:fs/promises";
import path from "node:path";

export type PipelineErrorLogEntry = {
  at: string;
  kind:
    | "orphan_reclaim"
    | "step_failed"
    | "step_retry"
    | "worker_crash"
    | "worker_stop";
  message: string;
  videoId?: string | null;
  queueItemId?: string | null;
  processRunId?: string | null;
  step?: string | null;
  channelKey?: string | null;
  attempt?: number;
  title?: string | null;
  meta?: Record<string, unknown>;
};

function errorLogDir() {
  return path.join(process.cwd(), "data", "pipeline-errors");
}

export function pipelineErrorLogPath() {
  return path.join(errorLogDir(), "pipeline-errors.jsonl");
}

/**
 * Append-only JSONL error log for overnight pipeline diagnosis.
 * Separate from ProcessRun.logsJson (which mixes info/success noise).
 */
export async function appendPipelineErrorLog(
  entry: Omit<PipelineErrorLogEntry, "at"> & { at?: string },
) {
  const dir = errorLogDir();
  await fs.mkdir(dir, { recursive: true });
  const line =
    JSON.stringify({
      at: entry.at ?? new Date().toISOString(),
      kind: entry.kind,
      message: entry.message,
      videoId: entry.videoId ?? null,
      queueItemId: entry.queueItemId ?? null,
      processRunId: entry.processRunId ?? null,
      step: entry.step ?? null,
      channelKey: entry.channelKey ?? null,
      attempt: entry.attempt ?? null,
      title: entry.title ?? null,
      ...(entry.meta ? { meta: entry.meta } : {}),
    }) + "\n";
  await fs.appendFile(pipelineErrorLogPath(), line, "utf8");
}
