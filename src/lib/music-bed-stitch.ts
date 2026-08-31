import {
  MUSIC_BED_MIN_INTRO_SEC,
  MUSIC_BED_ORPHAN_FADE_SEC,
  MUSIC_BED_UNDERLAY_TAIL_SEC,
} from "@/lib/music-beds";
import { DEFAULT_SCENE_PAUSE_AFTER_MS } from "@/lib/voiceover-scenes";

export type EffectiveScenePauseOptions = {
  isMusicBed?: boolean;
  pauseAfterMs?: number | null;
  /** When pauseAfterMs is null (spoken scenes). Default: punctuation fallback. */
  defaultPauseAfterMs?: number;
};

export type MusicBedStitchClipPlan = {
  isMusicBed: boolean;
  pauseAfterMs: number | null;
  durationSec: number;
};

export type MusicBedStitchStep =
  | {
      kind: "clip";
      clipIndex: number;
      /** Soft end fade when bed has no following speech to underlay. */
      fadeOutSec: number;
    }
  | {
      kind: "overlap";
      bedIndex: number;
      speechIndex: number;
      /** Bed alone (full volume) before speech starts. */
      introSec: number;
      /** Long fade under the following spoken scene. */
      underlaySec: number;
    }
  | {
      kind: "silence";
      pauseSec: number;
    };

export type MusicBedOverlap = {
  bedIndex: number;
  speechIndex: number;
  introSec: number;
  underlaySec: number;
};

/**
 * Spoken scenes: null pause → punctuation fallback micro-gap (80ms default).
 * Explicit 0 stays 0. Music beds default to 0 (underlay handles the join)
 * but still honor an explicit pauseAfterMs if set.
 */
export function effectiveScenePauseAfterMs(clip: EffectiveScenePauseOptions) {
  if (
    typeof clip.pauseAfterMs === "number" &&
    Number.isFinite(clip.pauseAfterMs) &&
    clip.pauseAfterMs >= 0
  ) {
    return Math.round(clip.pauseAfterMs);
  }

  if (clip.isMusicBed) {
    return 0;
  }

  const fallback =
    typeof clip.defaultPauseAfterMs === "number" &&
    Number.isFinite(clip.defaultPauseAfterMs) &&
    clip.defaultPauseAfterMs >= 0
      ? clip.defaultPauseAfterMs
      : DEFAULT_SCENE_PAUSE_AFTER_MS;
  return Math.round(fallback);
}

export function musicBedIntroSec(bedDurationSec: number) {
  const bed = Math.max(0.05, bedDurationSec);
  return Math.max(bed, MUSIC_BED_MIN_INTRO_SEC);
}

export function musicBedUnderlaySec(speechDurationSec: number) {
  const speech = Math.max(0.05, speechDurationSec);
  const underlay = speech - MUSIC_BED_UNDERLAY_TAIL_SEC;
  return Math.max(0.8, underlay);
}

/**
 * Plans scene-voiceover stitch steps so MUSIC_BED clips keep a longer intro,
 * then fade gently under nearly the entire following spoken scene.
 */
export function planMusicBedStitch(
  clips: MusicBedStitchClipPlan[],
  options?: { defaultPauseAfterMs?: number },
): MusicBedStitchStep[] {
  const steps: MusicBedStitchStep[] = [];
  let i = 0;
  const withDefault = (clip: MusicBedStitchClipPlan) => ({
    ...clip,
    defaultPauseAfterMs: options?.defaultPauseAfterMs,
  });

  while (i < clips.length) {
    const clip = clips[i]!;
    const next = clips[i + 1];
    const pauseSec = effectiveScenePauseAfterMs(withDefault(clip)) / 1000;
    const canUnderlay =
      clip.isMusicBed &&
      Boolean(next) &&
      !next!.isMusicBed &&
      pauseSec <= 0.05;

    if (canUnderlay && next) {
      const introSec = musicBedIntroSec(clip.durationSec);
      const underlaySec = musicBedUnderlaySec(next.durationSec);
      if (underlaySec >= 0.8) {
        steps.push({
          kind: "overlap",
          bedIndex: i,
          speechIndex: i + 1,
          introSec,
          underlaySec,
        });
        const speechPauseSec =
          effectiveScenePauseAfterMs(withDefault(next)) / 1000;
        if (speechPauseSec > 0 && i + 1 < clips.length - 1) {
          steps.push({ kind: "silence", pauseSec: speechPauseSec });
        }
        i += 2;
        continue;
      }
    }

    const fadeOutSec =
      clip.isMusicBed && clip.durationSec > 0.35
        ? Math.min(
            MUSIC_BED_ORPHAN_FADE_SEC,
            Math.max(0.25, clip.durationSec * 0.4),
          )
        : 0;

    steps.push({ kind: "clip", clipIndex: i, fadeOutSec });
    if (pauseSec > 0 && i < clips.length - 1) {
      steps.push({ kind: "silence", pauseSec });
    }
    i += 1;
  }

  return steps;
}

export function musicBedOverlapsFromSteps(
  steps: MusicBedStitchStep[],
): MusicBedOverlap[] {
  return steps
    .filter((step): step is Extract<MusicBedStitchStep, { kind: "overlap" }> =>
      step.kind === "overlap",
    )
    .map((step) => ({
      bedIndex: step.bedIndex,
      speechIndex: step.speechIndex,
      introSec: step.introSec,
      underlaySec: step.underlaySec,
    }));
}

/**
 * Visual span for a scene after stitch.
 * Music beds that underlay the next scene keep their intro length as the
 * on-screen duration (music continues under the next image while fading).
 */
export function sceneVisualDurationSec(scene: {
  voiceoverDuration: number | null;
  pauseAfterMs: number | null;
  isMusicBed?: boolean;
  /** When set (music bed underlay), overrides voiceoverDuration for visuals. */
  introSec?: number;
  defaultPauseAfterMs?: number;
}) {
  const baseDuration =
    typeof scene.introSec === "number" && Number.isFinite(scene.introSec)
      ? scene.introSec
      : scene.voiceoverDuration;

  if (baseDuration == null || !Number.isFinite(baseDuration)) {
    return null;
  }

  const pauseSec = effectiveScenePauseAfterMs(scene) / 1000;
  return Math.max(0.05, baseDuration) + pauseSec;
}

/**
 * Per-scene visual durations that match the stitched by-scene master audio.
 * Bed scenes use the planned intro; underlay audio plays under the next scene.
 */
export function buildOverlapAwareSceneDurations(
  scenes: Array<{
    sortOrder: number;
    voiceoverDuration: number | null;
    pauseAfterMs: number | null;
    isMusicBed: boolean;
  }>,
): Map<number, number> {
  const ordered = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
  const overlaps = musicBedOverlapsFromSteps(
    planMusicBedStitch(
      ordered.map((scene) => ({
        isMusicBed: scene.isMusicBed,
        pauseAfterMs: scene.pauseAfterMs,
        durationSec: scene.voiceoverDuration ?? 0,
      })),
    ),
  );
  const introByBedIndex = new Map(
    overlaps.map((overlap) => [overlap.bedIndex, overlap.introSec]),
  );
  const durations = new Map<number, number>();

  for (const [index, scene] of ordered.entries()) {
    const visualDuration = sceneVisualDurationSec({
      voiceoverDuration: scene.voiceoverDuration,
      pauseAfterMs: scene.pauseAfterMs,
      isMusicBed: scene.isMusicBed,
      introSec: introByBedIndex.get(index),
    });

    if (visualDuration != null) {
      durations.set(scene.sortOrder, visualDuration);
    }
  }

  return durations;
}
