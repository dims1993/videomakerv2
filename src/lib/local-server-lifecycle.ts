import {
  getChatterboxProcessStatus,
  startChatterboxServer,
  stopChatterboxServer,
} from "@/lib/chatterbox-process";
import {
  getWhisperXProcessStatus,
  startWhisperXServer,
  stopWhisperXServer,
} from "@/lib/whisperx-process";

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 180_000;

export type LocalServerKind = "chatterbox" | "whisperx";

async function pollUntilHealthy({
  kind,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  shouldAbort,
}: {
  kind: LocalServerKind;
  timeoutMs?: number;
  pollMs?: number;
  shouldAbort?: () => boolean;
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldAbort?.()) {
      throw new Error(`${kind} start canceled.`);
    }
    const status =
      kind === "chatterbox"
        ? await getChatterboxProcessStatus()
        : await getWhisperXProcessStatus();
    if (status.healthy) {
      return status;
    }
    if (!status.installReady && !status.processAlive) {
      throw new Error(status.message);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(
    `${kind} did not become ready within ${Math.round(timeoutMs / 1000)}s. Check storage/logs/${kind}-server.log.`,
  );
}

/**
 * Start a local HTTP server (Chatterbox / WhisperX) and wait until /health is ok.
 * Returns whether this call owns a stop (always true after a successful ensure —
 * callers should stop in `finally` when pipeline-managed).
 */
export async function ensureLocalServerReady(
  kind: LocalServerKind,
  options?: {
    timeoutMs?: number;
    pollMs?: number;
    shouldAbort?: () => boolean;
  },
) {
  if (kind === "chatterbox") {
    await startChatterboxServer();
  } else {
    await startWhisperXServer();
  }
  await pollUntilHealthy({ kind, ...options });
  return { kind, started: true as const };
}

export async function stopLocalServer(kind: LocalServerKind) {
  if (kind === "chatterbox") {
    return stopChatterboxServer();
  }
  return stopWhisperXServer();
}
