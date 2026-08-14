/**
 * Podcast pause cues → Scene.pauseAfterMs (milliseconds).
 * Aligns script cues like [PAUSE: 2s] with the voiceover stitch pause field.
 */

export const DEFAULT_PODCAST_PAUSE_SEC = 2;
export const DEFAULT_PODCAST_LONG_PAUSE_SEC = 6;

import { isPodcastSectionClipVisualIdea } from "@/lib/podcast-video-library-shared";

export function isPauseCardVisualIdea(visualIdea: string | null | undefined) {
  const normalized = (visualIdea ?? "").trim().toUpperCase();
  return (
    normalized.startsWith("PAUSE_CARD:") || normalized.startsWith("PAUSE_CARD |")
  );
}

export function isMusicBedVisualIdea(visualIdea: string | null | undefined) {
  const normalized = (visualIdea ?? "").trim().toUpperCase();
  return (
    normalized.startsWith("MUSIC_BED:") || normalized.startsWith("MUSIC_BED |")
  );
}

/** True when the scene is a non-spoken production cue (pause, music, or section bumper). */
export function isNonSpokenCueVisualIdea(visualIdea: string | null | undefined) {
  return (
    isPauseCardVisualIdea(visualIdea) ||
    isMusicBedVisualIdea(visualIdea) ||
    isPodcastSectionClipVisualIdea(visualIdea)
  );
}

/**
 * Parse seconds from a script cue label body, e.g. "PAUSE: 2s", "LONG PAUSE: 8s".
 * Returns null when the cue has no explicit duration.
 */
export function parsePauseCueSecondsFromLabel(label: string): number | null {
  const normalized = label.trim().replace(/\s+/g, " ");
  const match = normalized.match(
    /^(?:LONG\s+)?PAUSE\s*:\s*(\d+(?:[.,]\d+)?)\s*s?$/i,
  );
  if (!match) {
    return null;
  }
  const seconds = Number(match[1].replace(",", "."));
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds;
}

/**
 * Default seconds when the cue has no explicit duration.
 */
export function defaultPauseCueSeconds(label: string): number {
  const normalized = label.trim().replace(/\s+/g, " ").toUpperCase();
  if (normalized === "LONG PAUSE" || normalized.startsWith("LONG PAUSE:")) {
    return DEFAULT_PODCAST_LONG_PAUSE_SEC;
  }
  return DEFAULT_PODCAST_PAUSE_SEC;
}

export function pauseSecondsToMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.round(seconds * 1000);
}

/**
 * Normalize an optional pauseAfterMs value from JSON (number or numeric string).
 * Accepts seconds only when the value is small and looks like seconds with a
 * unit hint — callers should prefer explicit milliseconds.
 */
export function normalizePauseAfterMs(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return Math.round(number);
}

export type FoldablePauseScene = {
  scriptText: string;
  visualIdea: string;
  duration: number;
  pauseAfterMs?: number | null;
};

/**
 * Fold legacy PAUSE_CARD scenes into the previous scene's pauseAfterMs
 * (duration seconds → milliseconds). Music beds and spoken scenes stay.
 */
export function foldPauseCardScenesIntoPauseAfterMs<T extends FoldablePauseScene>(
  scenes: T[],
): { scenes: Array<T & { pauseAfterMs: number | null }>; foldedCount: number } {
  const out: Array<T & { pauseAfterMs: number | null }> = [];
  let foldedCount = 0;

  for (const scene of scenes) {
    const emptyScript = !scene.scriptText.trim();
    if (emptyScript && isPauseCardVisualIdea(scene.visualIdea)) {
      const previous = out[out.length - 1];
      if (previous) {
        const fromDuration = pauseSecondsToMs(
          Number.isFinite(scene.duration) && scene.duration > 0
            ? scene.duration
            : DEFAULT_PODCAST_PAUSE_SEC,
        );
        const existing = normalizePauseAfterMs(previous.pauseAfterMs) ?? 0;
        previous.pauseAfterMs = Math.max(existing, fromDuration);
        foldedCount += 1;
        continue;
      }
      // Orphan pause at start — drop; nothing to attach to.
      foldedCount += 1;
      continue;
    }

    out.push({
      ...scene,
      pauseAfterMs: normalizePauseAfterMs(scene.pauseAfterMs),
    });
  }

  return { scenes: out, foldedCount };
}
