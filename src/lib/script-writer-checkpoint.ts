import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const SCRIPT_WRITER_CHECKPOINT_VERSION = 1 as const;

export type ScriptWriterCheckpointPhase = "drafted" | "scored";

export type ScriptWriterCheckpoint = {
  version: typeof SCRIPT_WRITER_CHECKPOINT_VERSION;
  videoId: string;
  ideaHash: string;
  draftNumber: number;
  script: string;
  score: number | null;
  briefReason: string | null;
  phase: ScriptWriterCheckpointPhase;
  updatedAt: string;
};

export type ScriptWriterCheckpointSummary = {
  draftNumber: number;
  version: string;
  score: number | null;
  briefReason: string | null;
  phase: ScriptWriterCheckpointPhase;
  scriptLength: number;
  updatedAt: string;
  path: string;
  stale?: boolean;
};

function checkpointDir() {
  return path.join(process.cwd(), "data", "script-writer-checkpoints");
}

export function scriptWriterCheckpointPath(videoId: string) {
  const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(checkpointDir(), `${safeId}.json`);
}

export function hashScriptWriterIdea(ideaJson: string) {
  return createHash("sha256").update(ideaJson.trim()).digest("hex");
}

function isCheckpoint(value: unknown): value is ScriptWriterCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    entry.version === SCRIPT_WRITER_CHECKPOINT_VERSION &&
    typeof entry.videoId === "string" &&
    typeof entry.ideaHash === "string" &&
    typeof entry.draftNumber === "number" &&
    Number.isFinite(entry.draftNumber) &&
    typeof entry.script === "string" &&
    (entry.score === null || typeof entry.score === "number") &&
    (entry.briefReason === null || typeof entry.briefReason === "string") &&
    (entry.phase === "drafted" || entry.phase === "scored") &&
    typeof entry.updatedAt === "string"
  );
}

export async function loadScriptWriterCheckpoint(
  videoId: string,
): Promise<ScriptWriterCheckpoint | null> {
  try {
    const raw = await fs.readFile(scriptWriterCheckpointPath(videoId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isCheckpoint(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveScriptWriterCheckpoint(
  checkpoint: Omit<ScriptWriterCheckpoint, "version" | "updatedAt"> & {
    updatedAt?: string;
  },
) {
  const absolute = scriptWriterCheckpointPath(checkpoint.videoId);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const payload: ScriptWriterCheckpoint = {
    version: SCRIPT_WRITER_CHECKPOINT_VERSION,
    videoId: checkpoint.videoId,
    ideaHash: checkpoint.ideaHash,
    draftNumber: checkpoint.draftNumber,
    script: checkpoint.script,
    score: checkpoint.score,
    briefReason: checkpoint.briefReason,
    phase: checkpoint.phase,
    updatedAt: checkpoint.updatedAt ?? new Date().toISOString(),
  };
  await fs.writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function clearScriptWriterCheckpoint(videoId: string) {
  try {
    await fs.unlink(scriptWriterCheckpointPath(videoId));
  } catch {
    // ignore missing file
  }
}

export async function getScriptWriterCheckpointSummary(options: {
  videoId: string;
  ideaJson: string | null | undefined;
}): Promise<ScriptWriterCheckpointSummary | null> {
  const checkpoint = await loadScriptWriterCheckpoint(options.videoId);
  if (!checkpoint?.script.trim()) {
    return null;
  }

  const ideaHash = hashScriptWriterIdea(options.ideaJson ?? "");
  const stale = Boolean(options.ideaJson?.trim()) && checkpoint.ideaHash !== ideaHash;

  return {
    draftNumber: checkpoint.draftNumber,
    version: `V${checkpoint.draftNumber}`,
    score: checkpoint.score,
    briefReason: checkpoint.briefReason,
    phase: checkpoint.phase,
    scriptLength: checkpoint.script.length,
    updatedAt: checkpoint.updatedAt,
    path: scriptWriterCheckpointPath(options.videoId),
    ...(stale ? { stale: true } : {}),
  };
}
