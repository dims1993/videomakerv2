/**
 * Rebuild subtitle cues from stored alignment + voiceover text, fitting word
 * timings to real scene audio duration so captions do not bleed after stitch.
 * Does NOT regenerate audio or re-call ElevenLabs alignment.
 *
 * Usage:
 *   npx tsx scripts/realign-subtitles-from-voiceover-text.ts <videoId>
 */

import { Prisma, PrismaClient } from "@prisma/client";

import { getCaptionStylePreset } from "../src/lib/caption-styles";
import {
  buildActiveWordCaptionCuesFromWords,
  exportActiveWordCaptionsToAss,
  exportCombinedCues,
  fitAlignedWordsToAudioDuration,
  normalizeElevenLabsAlignment,
  offsetCues,
} from "../src/lib/subtitle-alignment";
import {
  exportCuesToSrt,
  exportCuesToVtt,
  isSilentSubtitleVoiceoverText,
  type FormattedSubtitleCue,
} from "../src/lib/subtitles";
import {
  prepareVoiceoverSpeechText,
  remapSpeechWordsToDisplay,
} from "../src/lib/speech-text";
import { spokenTextForSubtitlePreserve } from "../src/lib/subtitle-segment-preserve";

function parseSubtitleCuesJson(value: unknown): FormattedSubtitleCue[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is FormattedSubtitleCue => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const cue = item as Record<string, unknown>;
    return (
      typeof cue.index === "number" &&
      typeof cue.start === "number" &&
      typeof cue.end === "number" &&
      typeof cue.text === "string"
    );
  });
}

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error(
      "Usage: npx tsx scripts/realign-subtitles-from-voiceover-text.ts <videoId>",
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        title: true,
        channelKey: true,
        captionStylePreset: true,
        scenes: {
          orderBy: { sortOrder: "asc" },
          select: {
            sortOrder: true,
            voiceoverDuration: true,
            pauseAfterMs: true,
            duration: true,
          },
        },
      },
    });
    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    const stylePresetId =
      video.captionStylePreset &&
      video.captionStylePreset !== "active_word_highlight"
        ? video.captionStylePreset
        : video.channelKey === "wealth-insights"
          ? "clean_active_word"
          : video.channelKey === "the-gods-word"
            ? "godsword_style"
            : video.captionStylePreset || "clean_active_word";
    const stylePreset = getCaptionStylePreset(stylePresetId);
    const sceneByOrder = new Map(
      video.scenes.map((scene) => [scene.sortOrder, scene]),
    );

    const segments = await prisma.subtitleSegment.findMany({
      where: { videoId },
      orderBy: { index: "asc" },
      select: {
        id: true,
        index: true,
        rawAlignmentJson: true,
        voiceoverSegment: {
          select: {
            text: true,
            pacedTextUsed: true,
            durationSec: true,
            sceneStartOrder: true,
          },
        },
      },
    });

    let rebuilt = 0;
    let fitted = 0;
    let silent = 0;
    let skippedNoAlign = 0;

    for (const segment of segments) {
      const displayText = segment.voiceoverSegment?.text ?? "";
      const pacedText = segment.voiceoverSegment?.pacedTextUsed ?? "";
      if (
        isSilentSubtitleVoiceoverText(
          spokenTextForSubtitlePreserve(displayText, pacedText),
        )
      ) {
        await prisma.subtitleSegment.update({
          where: { id: segment.id },
          data: {
            provider: "silent_skip",
            rawAlignmentJson: Prisma.JsonNull,
            localCuesJson: [],
            localSrt: "",
            localVtt: "",
            status: "ready",
            error: null,
          },
        });
        silent += 1;
        continue;
      }

      const spokenWords = normalizeElevenLabsAlignment(segment.rawAlignmentJson);
      if (spokenWords.length === 0) {
        skippedNoAlign += 1;
        continue;
      }

      const scene = sceneByOrder.get(
        segment.voiceoverSegment?.sceneStartOrder ?? -1,
      );
      const audioDurationSec =
        scene?.voiceoverDuration ??
        Math.max(
          0,
          (segment.voiceoverSegment?.durationSec ?? 0) -
            Math.max(0, (scene?.pauseAfterMs ?? 0) / 1000),
        );

      const speech = prepareVoiceoverSpeechText(displayText);
      const remapped = remapSpeechWordsToDisplay(
        spokenWords,
        speech.replacements,
      );
      const beforeEnd = remapped.reduce((max, word) => Math.max(max, word.end), 0);
      const words = fitAlignedWordsToAudioDuration(remapped, audioDurationSec);
      const afterEnd = words.reduce((max, word) => Math.max(max, word.end), 0);
      if (afterEnd + 0.001 < beforeEnd) {
        fitted += 1;
      }

      const localCues = buildActiveWordCaptionCuesFromWords(words, stylePreset);
      await prisma.subtitleSegment.update({
        where: { id: segment.id },
        data: {
          localCuesJson: localCues,
          localSrt: exportCuesToSrt(localCues),
          localVtt: exportCuesToVtt(localCues),
          status: "ready",
          error: null,
        },
      });
      rebuilt += 1;
    }

    const voiceoverSegments = await prisma.voiceoverSegment.findMany({
      where: { videoId },
      orderBy: [{ index: "asc" }, { sceneStartOrder: "asc" }],
      include: { subtitleSegment: true },
    });

    let offset = 0;
    let nextCueIndex = 1;
    const combinedCues: FormattedSubtitleCue[] = [];

    for (const segment of voiceoverSegments) {
      const subtitleSegment = segment.subtitleSegment;
      if (!subtitleSegment) {
        continue;
      }
      const localCues = parseSubtitleCuesJson(subtitleSegment.localCuesJson);
      const globalCues = offsetCues(localCues, offset, nextCueIndex);
      const localMaxEnd = localCues.reduce(
        (maxEnd, cue) => Math.max(maxEnd, cue.end),
        0,
      );
      const globalExport = exportCombinedCues(globalCues);

      await prisma.subtitleSegment.update({
        where: { id: subtitleSegment.id },
        data: {
          globalCuesJson: globalCues,
          globalSrt: globalExport.srt,
          globalVtt: globalExport.vtt,
          status: "ready",
        },
      });

      combinedCues.push(...globalCues);
      nextCueIndex += globalCues.length;
      const scene = sceneByOrder.get(segment.sceneStartOrder);
      offset +=
        segment.durationSec ??
        (scene?.voiceoverDuration != null
          ? scene.voiceoverDuration +
            Math.max(0, (scene.pauseAfterMs ?? 0) / 1000)
          : scene?.duration ?? null) ??
        localMaxEnd;
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        rawSubtitleFormat: "generated",
        formattedSubtitleJson: combinedCues,
        formattedSubtitleText: exportCuesToSrt(combinedCues),
        styledSubtitleJson: {
          style: stylePreset.id,
          styleOptions: stylePreset,
          cues: combinedCues,
        } as Prisma.InputJsonValue,
        styledSubtitleAss: exportActiveWordCaptionsToAss(
          combinedCues,
          stylePreset,
        ),
        captionStylePreset: stylePreset.id,
        subtitleStatus: "ready",
      },
    });

    // Verify overshoot after fit
    let stillOver = 0;
    for (const segment of voiceoverSegments) {
      const scene = sceneByOrder.get(segment.sceneStartOrder);
      const audioDurationSec = scene?.voiceoverDuration ?? 0;
      const local = parseSubtitleCuesJson(segment.subtitleSegment?.localCuesJson);
      const localEnd = local.reduce((max, cue) => Math.max(max, cue.end), 0);
      if (audioDurationSec > 0 && localEnd > audioDurationSec + 0.05) {
        stillOver += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          videoId,
          title: video.title,
          stylePresetId: stylePreset.id,
          rebuilt,
          fittedToAudio: fitted,
          silent,
          skippedNoAlign,
          stillOverAudio: stillOver,
          combinedCues: combinedCues.length,
          timelineSec: Number(offset.toFixed(3)),
          lastCueEnd: Number(
            combinedCues
              .reduce((max, cue) => Math.max(max, cue.end), 0)
              .toFixed(3),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
