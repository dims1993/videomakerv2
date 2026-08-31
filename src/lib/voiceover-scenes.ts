import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS,
  suggestWealthInsightsPauseAfterMs,
} from "@/lib/wealth-insights-pause";
import { suggestContinuityAwarePauseAfterMs } from "@/lib/voiceover-continuity";
import {
  VOICEOVER_PAUSE_DEFAULT_MS,
  suggestPunctuationPauseAfterMs,
} from "@/lib/voiceover-punctuation-pause";
import { stripStructuralMarkers } from "@/lib/visual-plan-script";

export const SCENE_VOICEOVER_MODE = "by_scene" as const;
/** Soft fallback when punctuation has no cue (all channels). */
export const DEFAULT_SCENE_PAUSE_AFTER_MS = VOICEOVER_PAUSE_DEFAULT_MS;
/** Wealth Insights soft fallback — same punctuation default. */
export { WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS };

/**
 * Channel-aware micro-pause when Scene.pauseAfterMs is null.
 * Wealth Insights → punctuation + cast handoff; other channels → punctuation only.
 */
export function defaultScenePauseAfterMsForChannel(
  channelKey?: string | null,
): number {
  if (channelKey === "wealth-insights") {
    return WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS;
  }
  return DEFAULT_SCENE_PAUSE_AFTER_MS;
}

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
  scriptText,
  existingPauseAfterMs,
  defaultPauseAfterMs = DEFAULT_SCENE_PAUSE_AFTER_MS,
  channelKey,
  visualIdea,
  nextVisualIdea,
  nextScriptText,
}: {
  scriptText: string;
  sortOrder: number;
  index: number;
  cumulativeTimeSec: number;
  /** Prefer an already imported / manually set pause (milliseconds). */
  existingPauseAfterMs?: number | null;
  /** Used only when existing pause is unset and punctuation cannot run. */
  defaultPauseAfterMs?: number;
  channelKey?: string | null;
  visualIdea?: string | null;
  nextVisualIdea?: string | null;
  nextScriptText?: string | null;
}) {
  if (
    typeof existingPauseAfterMs === "number" &&
    Number.isFinite(existingPauseAfterMs) &&
    existingPauseAfterMs >= 0
  ) {
    return Math.round(existingPauseAfterMs);
  }

  if (channelKey === "wealth-insights") {
    return suggestWealthInsightsPauseAfterMs({
      scriptText,
      visualIdea,
      nextVisualIdea,
      nextScriptText,
    });
  }

  const fromPunctuation = suggestPunctuationPauseAfterMs(scriptText);
  return suggestContinuityAwarePauseAfterMs({
    scriptText,
    nextScriptText,
    basePauseAfterMs:
      fromPunctuation > 0 ? fromPunctuation : defaultPauseAfterMs,
  });
}
