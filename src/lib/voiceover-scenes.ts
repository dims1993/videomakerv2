import { mkdir } from "node:fs/promises";
import path from "node:path";

import { stripStructuralMarkers } from "@/lib/visual-plan-script";

export const SCENE_VOICEOVER_MODE = "by_scene" as const;
export const DEFAULT_SCENE_PAUSE_AFTER_MS = 180;

function storageRoot() {
  return path.join(process.cwd(), "storage");
}

export function sceneVoiceoversDir(videoId: string) {
  return path.join(storageRoot(), "voiceovers", videoId, "scenes");
}

export function sceneVoiceoverFileName({
  sceneId,
}: {
  sceneId: string;
}) {
  return `scene_${sceneId}.mp3`;
}

export function sceneVoiceoverRelativePath(videoId: string, fileName: string) {
  return path.join("storage", "voiceovers", videoId, "scenes", fileName);
}

export function sceneVoiceoverMasterRelativePath(videoId: string) {
  return path.join(
    "storage",
    "voiceovers",
    videoId,
    "voiceover_by_scene_master.wav",
  );
}

export async function ensureSceneVoiceoversDir(videoId: string) {
  const directory = sceneVoiceoversDir(videoId);

  await mkdir(directory, { recursive: true });

  return directory;
}

export function normalizeSceneVoiceoverText(text: string) {
  return stripStructuralMarkers(text).replace(/\n{3,}/g, "\n\n");
}

export function getPauseAfterScene({
  existingPauseAfterMs,
}: {
  scriptText: string;
  sortOrder: number;
  index: number;
  cumulativeTimeSec: number;
  /** Prefer an already imported / manually set pause (milliseconds). */
  existingPauseAfterMs?: number | null;
}) {
  if (
    typeof existingPauseAfterMs === "number" &&
    Number.isFinite(existingPauseAfterMs) &&
    existingPauseAfterMs >= 0
  ) {
    return Math.round(existingPauseAfterMs);
  }
  return DEFAULT_SCENE_PAUSE_AFTER_MS;
}
