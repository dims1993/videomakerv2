/**
 * Sync Scene.duration and voiceoverDuration from narration block manifest timings.
 */

import type { NarrationManifest } from "@/lib/voiceover-block-manifest";
import { readNarrationManifest } from "@/lib/voiceover-block-manifest";
import { buildNarrationBlockPausePlan } from "@/lib/narration-block-sync";
import type { NarrationBlockPlan } from "@/lib/narration-planner";
import { sceneVisualDurationSec } from "@/lib/music-bed-stitch";
import { prisma } from "@/lib/prisma";
import { defaultScenePauseAfterMsForChannel } from "@/lib/voiceover-scenes";

export type NarrationBlockSceneDurationUpdate = {
  sceneId: string;
  sortOrder: number;
  voiceoverDurationSec: number;
  pauseAfterMs: number;
  visualDurationSec: number;
  durationInt: number;
};

export function computeNarrationBlockSceneDurations(opts: {
  manifest: NarrationManifest;
  pauseAfterMsBySceneId?: Map<string, number>;
  scenePauseAfterMs?: Map<string, number | null>;
  defaultPauseAfterMs?: number;
}): NarrationBlockSceneDurationUpdate[] {
  const defaultPause = opts.defaultPauseAfterMs ?? 80;
  const updates: NarrationBlockSceneDurationUpdate[] = [];

  for (const block of opts.manifest.blocks) {
    if (!block.segmentTimings?.length) {
      continue;
    }

    for (const timing of block.segmentTimings) {
      const voiceoverDurationSec = Math.max(
        0.05,
        timing.endTimeSec - timing.startTimeSec,
      );
      const pauseAfterMs =
        opts.pauseAfterMsBySceneId?.get(timing.sceneId) ??
        (typeof opts.scenePauseAfterMs?.get(timing.sceneId) === "number"
          ? opts.scenePauseAfterMs.get(timing.sceneId)!
          : defaultPause);

      const visualDurationSec =
        sceneVisualDurationSec({
          voiceoverDuration: voiceoverDurationSec,
          pauseAfterMs,
          defaultPauseAfterMs: defaultPause,
        }) ?? voiceoverDurationSec;

      updates.push({
        sceneId: timing.sceneId,
        sortOrder: timing.sortOrder,
        voiceoverDurationSec,
        pauseAfterMs,
        visualDurationSec,
        durationInt: Math.max(1, Math.ceil(visualDurationSec)),
      });
    }
  }

  return updates;
}

/** Map scene id → aligned voiceover duration from manifest (for stitch override). */
export function narrationManifestVoiceoverDurationBySceneId(
  manifest: NarrationManifest | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!manifest) {
    return map;
  }
  for (const update of computeNarrationBlockSceneDurations({ manifest })) {
    map.set(update.sceneId, update.voiceoverDurationSec);
  }
  return map;
}

export function narrationBlockPlansFromManifest(
  manifest: NarrationManifest,
): NarrationBlockPlan[] {
  return manifest.blocks.map((block) => ({
    index: block.index,
    blockId: block.blockId,
    provider: block.provider,
    voiceKey: block.voiceKey,
    voiceId: block.voiceId,
    scenes: (block.segmentTimings ?? []).map((timing) => ({
      sceneId: timing.sceneId,
      sortOrder: timing.sortOrder,
      scriptText: "",
      spokenText: "",
      ttsText: "",
    })),
    fullText: "",
    estimatedDurationSec: block.durationSec ?? 0,
    charCount: 0,
  }));
}

export function buildPausePlanFromManifest(manifest: NarrationManifest): Map<string, number> {
  const blocks = narrationBlockPlansFromManifest(manifest);
  const lastSortOrder = Math.max(
    0,
    ...manifest.blocks.flatMap(
      (block) => block.segmentTimings?.map((timing) => timing.sortOrder) ?? [],
    ),
  );
  return buildNarrationBlockPausePlan({
    blocks,
    successfulBlockIds: new Set(manifest.blocks.map((block) => block.blockId)),
    lastSortOrder,
  });
}

export async function applyNarrationBlockDurationSync(
  videoId: string,
  opts: {
    pauseAfterMsBySceneId?: Map<string, number>;
    channelKey?: string | null;
  } = {},
): Promise<{ updated: number }> {
  const manifest = await readNarrationManifest(videoId);
  if (!manifest || manifest.blocks.length === 0) {
    return { updated: 0 };
  }

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    select: { id: true, sortOrder: true, pauseAfterMs: true },
  });
  const scenePauseAfterMs = new Map(
    scenes.map((scene) => [scene.id, scene.pauseAfterMs]),
  );
  const defaultPauseAfterMs = defaultScenePauseAfterMsForChannel(opts.channelKey);

  const pausePlan =
    opts.pauseAfterMsBySceneId ?? buildPausePlanFromManifest(manifest);

  const updates = computeNarrationBlockSceneDurations({
    manifest,
    pauseAfterMsBySceneId: pausePlan,
    scenePauseAfterMs,
    defaultPauseAfterMs,
  });

  if (updates.length === 0) {
    return { updated: 0 };
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.scene.update({
        where: { id: update.sceneId },
        data: {
          voiceoverDuration: update.voiceoverDurationSec,
          pauseAfterMs: update.pauseAfterMs,
          duration: update.durationInt,
        },
      }),
    ),
  );

  return { updated: updates.length };
}
