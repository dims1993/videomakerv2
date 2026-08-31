/**
 * Fix Wealth (or any) video where scene/segment voiceoverDuration is inflated
 * vs the real MP3 (e.g. old 180ms pause baked into durationSec) while the
 * stitched master matches the files. Reprobes files, corrects durations,
 * rebuilds local cues from stored alignment, and recombines the global track.
 *
 *   npx tsx scripts/fix-voiceover-duration-inflation.ts [videoId]
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { getCaptionStylePreset } from "../src/lib/caption-styles";
import {
  buildActiveWordCaptionCuesFromWords,
  exportActiveWordCaptionsToAss,
  fitAlignedWordsToAudioDuration,
  normalizeElevenLabsAlignment,
  offsetCues,
  prepareAlignedWordsForCaptionStyle,
} from "../src/lib/subtitle-alignment";
import { spokenTextForSubtitlePreserve } from "../src/lib/subtitle-segment-preserve";
import {
  prepareVoiceoverSpeechText,
  remapSpeechWordsToDisplay,
} from "../src/lib/speech-text";
import {
  exportCuesToSrt,
  exportCuesToVtt,
  isSilentSubtitleVoiceoverText,
  type FormattedSubtitleCue,
} from "../src/lib/subtitles";

const VIDEO_ID = process.argv[2] || "cmszscjhp02f1nu8z78uj77gh";

function probeDurationSec(audioPath: string): number | null {
  const absolute = path.isAbsolute(audioPath)
    ? audioPath
    : path.join(process.cwd(), audioPath);
  if (!existsSync(absolute)) {
    return null;
  }
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        absolute,
      ],
      { encoding: "utf8" },
    ).trim();
    const value = Number(out);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function parseCues(value: unknown): FormattedSubtitleCue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (cue): cue is FormattedSubtitleCue =>
      Boolean(cue) &&
      typeof cue === "object" &&
      typeof (cue as FormattedSubtitleCue).start === "number" &&
      typeof (cue as FormattedSubtitleCue).end === "number",
  );
}

async function main() {
  const prisma = new PrismaClient();

  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: {
      id: true,
      title: true,
      captionStylePreset: true,
      voiceoverDurationSec: true,
      voiceoverAudioPath: true,
    },
  });
  if (!video) {
    throw new Error(`Video not found: ${VIDEO_ID}`);
  }

  const scenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID, status: { not: "rejected" } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      voiceoverLocalPath: true,
      voiceoverDuration: true,
      pauseAfterMs: true,
    },
  });

  let fixedScenes = 0;
  let sumFile = 0;
  let sumOld = 0;
  const durationByOrder = new Map<number, number>();

  for (const scene of scenes) {
    if (!scene.voiceoverLocalPath) continue;
    const fileDur = probeDurationSec(scene.voiceoverLocalPath);
    if (fileDur == null) continue;
    sumFile += fileDur;
    sumOld += scene.voiceoverDuration ?? 0;
    durationByOrder.set(scene.sortOrder, fileDur);
    if (
      scene.voiceoverDuration == null ||
      Math.abs(scene.voiceoverDuration - fileDur) > 0.01
    ) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { voiceoverDuration: fileDur },
      });
      fixedScenes += 1;
    }
  }

  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { index: "asc" },
    include: {
      subtitleSegment: {
        select: {
          id: true,
          rawAlignmentJson: true,
          localCuesJson: true,
          status: true,
        },
      },
    },
  });

  const stylePreset = getCaptionStylePreset(
    video.captionStylePreset || "clean_active_word",
  );

  let fixedSegments = 0;
  let rebuiltLocal = 0;

  for (const segment of segments) {
    const scene = scenes.find((s) => s.sortOrder === segment.sceneStartOrder);
    const fileDur =
      durationByOrder.get(segment.sceneStartOrder) ??
      (segment.audioPath ? probeDurationSec(segment.audioPath) : null);
    if (fileDur == null) continue;

    const pauseSec = Math.max(0, (scene?.pauseAfterMs ?? 0) / 1000);
    const segmentDur = fileDur + pauseSec;

    if (
      segment.durationSec == null ||
      Math.abs(segment.durationSec - segmentDur) > 0.01
    ) {
      await prisma.voiceoverSegment.update({
        where: { id: segment.id },
        data: { durationSec: segmentDur },
      });
      fixedSegments += 1;
    }

    const subtitle = segment.subtitleSegment;
    if (!subtitle) continue;

    const spoken = spokenTextForSubtitlePreserve(
      segment.text,
      segment.pacedTextUsed,
    );
    if (isSilentSubtitleVoiceoverText(spoken)) {
      await prisma.subtitleSegment.update({
        where: { id: subtitle.id },
        data: {
          localCuesJson: [],
          localSrt: "",
          localVtt: "",
          status: "ready",
          error: null,
        },
      });
      continue;
    }

    const spokenWords = normalizeElevenLabsAlignment(subtitle.rawAlignmentJson);
    if (spokenWords.length === 0) continue;

    const speech = prepareVoiceoverSpeechText(segment.text);
    const remapped = remapSpeechWordsToDisplay(spokenWords, speech.replacements);
    const words = prepareAlignedWordsForCaptionStyle(
      fitAlignedWordsToAudioDuration(remapped, fileDur),
      stylePreset,
      segment.text,
    );
    const localCues = buildActiveWordCaptionCuesFromWords(words, stylePreset);
    await prisma.subtitleSegment.update({
      where: { id: subtitle.id },
      data: {
        localCuesJson: localCues,
        localSrt: exportCuesToSrt(localCues),
        localVtt: exportCuesToVtt(localCues),
        status: "formatted",
        error: null,
      },
    });
    rebuiltLocal += 1;
  }

  // Re-read segments after updates for combine
  const fresh = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { index: "asc" },
    include: { subtitleSegment: true },
  });

  let offset = 0;
  let nextCueIndex = 1;
  const combinedCues: FormattedSubtitleCue[] = [];

  for (const segment of fresh) {
    const subtitle = segment.subtitleSegment;
    if (!subtitle) continue;
    const localCues = parseCues(subtitle.localCuesJson);
    const globalCues = offsetCues(localCues, offset, nextCueIndex);
    await prisma.subtitleSegment.update({
      where: { id: subtitle.id },
      data: {
        globalCuesJson: globalCues,
        globalSrt: exportCuesToSrt(globalCues),
        globalVtt: exportCuesToVtt(globalCues),
        status: "ready",
      },
    });
    combinedCues.push(...globalCues);
    nextCueIndex += globalCues.length;
    offset += segment.durationSec ?? 0;
  }

  const lastEnd =
    combinedCues.length > 0
      ? Math.max(...combinedCues.map((cue) => cue.end))
      : 0;

  await prisma.video.update({
    where: { id: VIDEO_ID },
    data: {
      formattedSubtitleJson: combinedCues,
      formattedSubtitleText: exportCuesToSrt(combinedCues),
      styledSubtitleJson: {
        style: stylePreset.id,
        styleOptions: stylePreset,
        cues: combinedCues,
      } as Prisma.InputJsonValue,
      styledSubtitleAss: exportActiveWordCaptionsToAss(combinedCues, stylePreset),
      captionStylePreset: stylePreset.id,
      subtitleStatus: "ready",
      renderDraftStatus: "pending",
    },
  });

  const masterDur =
    video.voiceoverAudioPath != null
      ? probeDurationSec(video.voiceoverAudioPath)
      : video.voiceoverDurationSec;

  console.log(
    JSON.stringify(
      {
        videoId: VIDEO_ID,
        title: video.title,
        fixedScenes,
        fixedSegments,
        rebuiltLocal,
        sumOldDb: Number(sumOld.toFixed(3)),
        sumFile: Number(sumFile.toFixed(3)),
        subtitleOffsetEnd: Number(offset.toFixed(3)),
        lastCueEnd: Number(lastEnd.toFixed(3)),
        masterDur: masterDur != null ? Number(masterDur.toFixed(3)) : null,
        deltaLastCueVsMaster:
          masterDur != null ? Number((lastEnd - masterDur).toFixed(3)) : null,
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
