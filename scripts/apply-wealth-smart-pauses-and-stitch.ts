/**
 * Apply Wealth smart pauses, refresh subtitle offsets, and re-stitch master VO.
 *
 *   npx tsx scripts/apply-wealth-smart-pauses-and-stitch.ts [videoId]
 */

import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  MUSIC_BED_PROVIDER,
  isMusicBedScene,
} from "../src/lib/music-beds";
import { applyWealthSmartScenePauses } from "../src/lib/pipeline-settings";
import { stitchSceneVoiceoverAudio } from "../src/lib/render/audio";
import { sceneVoiceoverMasterRelativePath } from "../src/lib/voiceover-scenes";
import { suggestWealthInsightsPausesForScenes } from "../src/lib/wealth-insights-pause";

const VIDEO_ID = process.argv[2] || "cmszscjhp02f1nu8z78uj77gh";

async function main() {
  const prisma = new PrismaClient();

  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: {
      id: true,
      title: true,
      channelKey: true,
      pipelineSettingsJson: true,
    },
  });
  if (!video) throw new Error(`Video not found: ${VIDEO_ID}`);
  if (video.channelKey !== "wealth-insights") {
    throw new Error(`Not a Wealth Insights video: ${video.channelKey}`);
  }

  // Prefer auto smart pauses on next pipeline VO runs (not flat 0).
  if (video.pipelineSettingsJson?.trim()) {
    try {
      const parsed = JSON.parse(video.pipelineSettingsJson) as Record<
        string,
        unknown
      >;
      const voiceover =
        parsed.voiceover && typeof parsed.voiceover === "object"
          ? { ...(parsed.voiceover as Record<string, unknown>) }
          : {};
      voiceover.pauseAfterMs = null;
      parsed.voiceover = voiceover;
      await prisma.video.update({
        where: { id: VIDEO_ID },
        data: { pipelineSettingsJson: JSON.stringify(parsed) },
      });
    } catch {
      // keep existing settings
    }
  }

  const applied = await applyWealthSmartScenePauses(VIDEO_ID);

  const scenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID, status: { not: "rejected" } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      visualIdea: true,
      pauseAfterMs: true,
      voiceoverDuration: true,
      voiceoverLocalPath: true,
      voiceoverProvider: true,
      voiceoverStatus: true,
      clipLocalPath: true,
      clipMuted: true,
    },
  });

  const pauseHist = new Map<number, number>();
  let sumPause = 0;
  for (const scene of scenes) {
    const pause = scene.pauseAfterMs ?? 0;
    sumPause += pause;
    pauseHist.set(pause, (pauseHist.get(pause) || 0) + 1);
  }

  // Sync VoiceoverSegment.durationSec = vo + pause/1000
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    select: { id: true, sceneStartOrder: true, durationSec: true },
  });
  const sceneByOrder = new Map(scenes.map((s) => [s.sortOrder, s]));
  for (const segment of segments) {
    const scene = sceneByOrder.get(segment.sceneStartOrder);
    if (!scene?.voiceoverDuration) continue;
    const next =
      scene.voiceoverDuration + Math.max(0, (scene.pauseAfterMs ?? 0) / 1000);
    if (
      segment.durationSec == null ||
      Math.abs(segment.durationSec - next) > 0.01
    ) {
      await prisma.voiceoverSegment.update({
        where: { id: segment.id },
        data: { durationSec: next },
      });
    }
  }

  const stitchClips = scenes
    .filter((scene) => scene.voiceoverLocalPath?.trim())
    .map((scene) => ({
      sortOrder: scene.sortOrder,
      audioPath: scene.voiceoverLocalPath!,
      pauseAfterMs: scene.pauseAfterMs,
      isMusicBed:
        scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
        isMusicBedScene(scene),
    }));

  if (stitchClips.length === 0) {
    throw new Error("No scene voiceover files to stitch.");
  }

  const outputRelativePath = sceneVoiceoverMasterRelativePath(VIDEO_ID);
  const stitched = await stitchSceneVoiceoverAudio(
    VIDEO_ID,
    stitchClips,
    outputRelativePath,
    { defaultPauseAfterMs: 120 },
  );

  await prisma.video.update({
    where: { id: VIDEO_ID },
    data: {
      voiceoverAudioPath: outputRelativePath,
      voiceoverFileName: path.basename(outputRelativePath),
      voiceoverDurationSec: stitched.durationSec,
      voiceoverStatus: "ready",
      subtitleStatus: "needs_update",
      renderDraftStatus: "pending",
    },
  });

  // Quick global cue re-offset using updated segment durations
  const { offsetCues } = await import("../src/lib/subtitle-alignment");
  const { exportCuesToSrt, exportCuesToVtt } = await import(
    "../src/lib/subtitles"
  );
  const { exportActiveWordCaptionsToAss } = await import(
    "../src/lib/subtitle-alignment"
  );
  const { getCaptionStylePreset } = await import("../src/lib/caption-styles");

  const freshSegs = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { index: "asc" },
    include: { subtitleSegment: true },
  });
  const videoRow = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: { captionStylePreset: true },
  });
  const stylePreset = getCaptionStylePreset(
    videoRow?.captionStylePreset || "clean_active_word",
  );

  let offset = 0;
  let nextCueIndex = 1;
  const combined: Array<{ start: number; end: number; [key: string]: unknown }> =
    [];
  for (const segment of freshSegs) {
    const sub = segment.subtitleSegment;
    if (!sub) continue;
    const local = Array.isArray(sub.localCuesJson) ? sub.localCuesJson : [];
    const global = offsetCues(local as never, offset, nextCueIndex);
    await prisma.subtitleSegment.update({
      where: { id: sub.id },
      data: {
        globalCuesJson: global,
        globalSrt: exportCuesToSrt(global),
        globalVtt: exportCuesToVtt(global),
        status: "ready",
      },
    });
    combined.push(...(global as never[]));
    nextCueIndex += global.length;
    offset += segment.durationSec ?? 0;
  }

  await prisma.video.update({
    where: { id: VIDEO_ID },
    data: {
      formattedSubtitleJson: combined,
      formattedSubtitleText: exportCuesToSrt(combined as never),
      styledSubtitleJson: {
        style: stylePreset.id,
        styleOptions: stylePreset,
        cues: combined,
      },
      styledSubtitleAss: exportActiveWordCaptionsToAss(
        combined as never,
        stylePreset,
      ),
      subtitleStatus: "ready",
    },
  });

  const sample = suggestWealthInsightsPausesForScenes(scenes.slice(0, 8)).map(
    (s, i) => ({
      order: scenes[i]!.sortOrder,
      pause: s.suggestedPauseAfterMs,
      text: s.scriptText.slice(0, 50),
    }),
  );

  console.log(
    JSON.stringify(
      {
        videoId: VIDEO_ID,
        title: video.title,
        applied: applied.updated,
        sumPauseSec: Number((sumPause / 1000).toFixed(2)),
        pauseHist: Object.fromEntries(
          [...pauseHist.entries()].sort((a, b) => a[0] - b[0]),
        ),
        masterDur: Number(stitched.durationSec.toFixed(3)),
        subtitleClock: Number(offset.toFixed(3)),
        sample,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
