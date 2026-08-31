/**
 * Regenerate missing subtitle segments (YHWH → Yahweh VO regen left gaps),
 * then recombine the combined caption track.
 *
 *   npx tsx scripts/regen-missing-subtitles-gods-word.ts
 */

import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

import { getCaptionStylePreset } from "../src/lib/caption-styles";
import { alignElevenLabsAudioWithText } from "../src/lib/elevenlabs";
import {
  buildActiveWordCaptionCuesFromWords,
  exportActiveWordCaptionsToAss,
  exportCombinedCues,
  fitAlignedWordsToAudioDuration,
  normalizeElevenLabsAlignment,
  offsetCues,
  prepareAlignedWordsForCaptionStyle,
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

for (const file of [".env", ".env.local"]) {
  try {
    const raw = readFileSync(path.join(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]!]) {
        continue;
      }
      let value = match[2] ?? "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]!] = value;
    }
  } catch {
    // ignore
  }
}

const VIDEO_ID = "cmswmknhv0001nu1i5zqi23q1";
const prisma = new PrismaClient();

function resolveStoredAudioPath(audioPath: string) {
  const normalized = audioPath.replace(/\\/g, "/");
  const storagePrefix = "storage/voiceovers/";
  if (!normalized.startsWith(storagePrefix)) {
    throw new Error(`Bad audio path: ${audioPath}`);
  }
  const resolvedPath = path.resolve(process.cwd(), normalized);
  const voiceoversRoot = path.resolve(process.cwd(), "storage", "voiceovers");
  if (!resolvedPath.startsWith(`${voiceoversRoot}${path.sep}`)) {
    throw new Error(`Audio path escapes storage: ${audioPath}`);
  }
  return resolvedPath;
}

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
  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: {
      id: true,
      title: true,
      channelKey: true,
      captionStylePreset: true,
      voiceoverDurationSec: true,
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
    throw new Error(`Video not found: ${VIDEO_ID}`);
  }

  const stylePreset = getCaptionStylePreset(
    video.captionStylePreset || "godsword_style",
  );
  const sceneByOrder = new Map(
    video.scenes.map((scene) => [scene.sortOrder, scene]),
  );

  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { index: "asc" },
    include: { subtitleSegment: true },
  });

  const missing = segments.filter((segment) => {
    const spoken = spokenTextForSubtitlePreserve(
      segment.text,
      segment.pacedTextUsed,
    );
    if (isSilentSubtitleVoiceoverText(spoken)) {
      return !segment.subtitleSegment;
    }
    const cues = parseSubtitleCuesJson(
      segment.subtitleSegment?.localCuesJson,
    );
    return !segment.subtitleSegment || cues.length === 0;
  });

  console.log(
    `Video: ${video.title}\nMissing subtitle jobs: ${missing.length} / ${segments.length}`,
  );

  let ok = 0;
  let failed = 0;

  for (const segment of missing) {
    const spoken =
      segment.pacedTextUsed?.trim() || segment.text.trim();
    const label = `scene ${segment.sceneStartOrder} (seg #${segment.index})`;

    if (!segment.audioPath) {
      console.error(`FAIL ${label}: no audioPath`);
      failed += 1;
      continue;
    }

    if (isSilentSubtitleVoiceoverText(spoken)) {
      await prisma.subtitleSegment.upsert({
        where: { voiceoverSegmentId: segment.id },
        create: {
          videoId: VIDEO_ID,
          voiceoverSegmentId: segment.id,
          index: segment.index,
          sceneStartOrder: segment.sceneStartOrder,
          sceneEndOrder: segment.sceneEndOrder,
          provider: "silent_skip",
          rawAlignmentJson: Prisma.JsonNull,
          localCuesJson: [],
          localSrt: "",
          localVtt: "",
          status: "ready",
          error: null,
        },
        update: {
          provider: "silent_skip",
          rawAlignmentJson: Prisma.JsonNull,
          localCuesJson: [],
          localSrt: "",
          localVtt: "",
          status: "ready",
          error: null,
        },
      });
      console.log(`OK ${label}: silent`);
      ok += 1;
      continue;
    }

    try {
      const audioFilePath = resolveStoredAudioPath(segment.audioPath);
      await access(audioFilePath);

      console.log(`Aligning ${label}…`);
      const rawAlignmentJson = await alignElevenLabsAudioWithText({
        audioFilePath,
        text: spoken,
      });
      const spokenWords = normalizeElevenLabsAlignment(rawAlignmentJson);
      if (spokenWords.length === 0) {
        throw new Error("Forced alignment returned no words.");
      }

      const speech = prepareVoiceoverSpeechText(segment.text);
      const remapped = remapSpeechWordsToDisplay(
        spokenWords,
        speech.replacements,
      );
      const scene = sceneByOrder.get(segment.sceneStartOrder);
      const audioDurationSec =
        scene?.voiceoverDuration ??
        Math.max(
          0,
          (segment.durationSec ?? 0) -
            Math.max(0, (scene?.pauseAfterMs ?? 0) / 1000),
        );
      const fitted = fitAlignedWordsToAudioDuration(
        remapped,
        audioDurationSec,
      );
      const words = prepareAlignedWordsForCaptionStyle(
        fitted,
        stylePreset,
        segment.text,
      );
      const localCues = buildActiveWordCaptionCuesFromWords(
        words,
        stylePreset,
      );

      await prisma.subtitleSegment.upsert({
        where: { voiceoverSegmentId: segment.id },
        create: {
          videoId: VIDEO_ID,
          voiceoverSegmentId: segment.id,
          index: segment.index,
          sceneStartOrder: segment.sceneStartOrder,
          sceneEndOrder: segment.sceneEndOrder,
          provider: "elevenlabs_forced_alignment",
          rawAlignmentJson: rawAlignmentJson as Prisma.InputJsonValue,
          localCuesJson: localCues,
          localSrt: exportCuesToSrt(localCues),
          localVtt: exportCuesToVtt(localCues),
          status: "ready",
          error: null,
        },
        update: {
          index: segment.index,
          sceneStartOrder: segment.sceneStartOrder,
          sceneEndOrder: segment.sceneEndOrder,
          provider: "elevenlabs_forced_alignment",
          rawAlignmentJson: rawAlignmentJson as Prisma.InputJsonValue,
          localCuesJson: localCues,
          localSrt: exportCuesToSrt(localCues),
          localVtt: exportCuesToVtt(localCues),
          status: "ready",
          error: null,
        },
      });

      console.log(`OK ${label}: ${localCues.length} cues`);
      ok += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${label}: ${message}`);
      failed += 1;
      await prisma.subtitleSegment.upsert({
        where: { voiceoverSegmentId: segment.id },
        create: {
          videoId: VIDEO_ID,
          voiceoverSegmentId: segment.id,
          index: segment.index,
          sceneStartOrder: segment.sceneStartOrder,
          sceneEndOrder: segment.sceneEndOrder,
          status: "error",
          error: message,
        },
        update: {
          status: "error",
          error: message,
        },
      });
    }
  }

  if (failed > 0) {
    throw new Error(
      `Stopped before combine: ${failed} failed, ${ok} ok. Fix errors and re-run.`,
    );
  }

  // Mark remaining formatted segments ready, then combine.
  await prisma.subtitleSegment.updateMany({
    where: {
      videoId: VIDEO_ID,
      status: { in: ["formatted", "ready"] },
    },
    data: { status: "ready" },
  });

  const voiceoverSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: [{ index: "asc" }, { sceneStartOrder: "asc" }],
    include: { subtitleSegment: true },
  });

  const notReady = voiceoverSegments.filter((segment) => {
    const spoken = spokenTextForSubtitlePreserve(
      segment.text,
      segment.pacedTextUsed,
    );
    const sub = segment.subtitleSegment;
    if (!sub || !["formatted", "ready"].includes(sub.status)) {
      return true;
    }
    if (isSilentSubtitleVoiceoverText(spoken)) {
      return false;
    }
    return parseSubtitleCuesJson(sub.localCuesJson).length === 0;
  });

  if (notReady.length > 0) {
    throw new Error(
      `Still missing ${notReady.length} subtitle jobs: ${notReady
        .map((s) => s.sceneStartOrder)
        .join(",")}`,
    );
  }

  let offset = 0;
  let nextCueIndex = 1;
  const combinedCues: FormattedSubtitleCue[] = [];

  for (const segment of voiceoverSegments) {
    const subtitleSegment = segment.subtitleSegment!;
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
    where: { id: VIDEO_ID },
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
      renderDraftStatus: "pending",
    },
  });

  const lastCueEnd = combinedCues.reduce(
    (max, cue) => Math.max(max, cue.end),
    0,
  );
  const master = video.voiceoverDurationSec ?? 0;
  console.log(
    JSON.stringify(
      {
        regenerated: ok,
        combinedCues: combinedCues.length,
        timelineSec: Number(offset.toFixed(3)),
        lastCueEnd: Number(lastCueEnd.toFixed(3)),
        masterSec: Number(master.toFixed(3)),
        lastCueVsMaster: Number((lastCueEnd - master).toFixed(3)),
        subtitleStatus: "ready",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
