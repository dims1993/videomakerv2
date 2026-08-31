import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Load .env without depending on the dotenv package resolution from /tmp.
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
    // ignore missing env files
  }
}

import { PrismaClient } from "@prisma/client";
import { generateGoogleTtsSpeech } from "../src/lib/google-tts";
import {
  mapScenesToPodcastDeliveryModes,
  resolvePodcastHostKey,
  resolvePodcastSectionSpeakingRate,
  PODCAST_INTRO_SCENE_PAUSE_AFTER_MS,
} from "../src/lib/podcast-voice-profiles";
import {
  ensureSceneVoiceoversDir,
  normalizeSceneVoiceoverText,
  sceneVoiceoverFileName,
  sceneVoiceoverRelativePath,
  DEFAULT_SCENE_PAUSE_AFTER_MS,
} from "../src/lib/voiceover-scenes";
import { prepareVoiceoverSpeechText } from "../src/lib/speech-text";
import { getAudioDurationSec } from "../src/lib/audio";
import { groupScenesByScriptSection } from "../src/lib/script-sections";

const VIDEO_ID = "cmswdlx4i0000nuxju1sypeko";
const prisma = new PrismaClient();

async function main() {
  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: { script: true },
  });
  if (!video?.script) {
    throw new Error("missing script");
  }

  const allScenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      visualIdea: true,
      scriptText: true,
    },
  });

  const delivery = mapScenesToPodcastDeliveryModes(allScenes);
  const assignments = groupScenesByScriptSection({
    script: video.script,
    scenes: allScenes,
  });
  const bySort = new Map(assignments.map((a) => [a.sortOrder, a]));
  const lessonOrder = allScenes.find((s) =>
    /SECTION_CLIP\s*\|\s*LESSON/i.test(s.visualIdea ?? ""),
  )?.sortOrder;
  if (!lessonOrder) {
    throw new Error("no LESSON clip");
  }

  const onlyMax = process.env.MAX_ONLY === "1";
  const onlyLong = process.env.LONG_ONLY === "1";

  const introOrders = allScenes
    .filter(
      (s) =>
        s.sortOrder > 1 &&
        s.sortOrder < lessonOrder &&
        (s.scriptText ?? "").trim(),
    )
    .map((s) => s.sortOrder);

  const wordTour = allScenes.find(
    (s) =>
      delivery.get(s.sortOrder) === "wordTour" && (s.scriptText ?? "").trim(),
  );
  const mainSample = allScenes.find(
    (s) =>
      s.sortOrder > lessonOrder &&
      delivery.get(s.sortOrder) === "main" &&
      (s.scriptText ?? "").trim() &&
      s.sortOrder < 40,
  );
  const closingSample = allScenes.find(
    (s) =>
      delivery.get(s.sortOrder) === "closing" && (s.scriptText ?? "").trim(),
  );

  let targetOrders = onlyMax
    ? introOrders.filter((order) => {
        const kind = bySort.get(order)?.sectionKind;
        return kind === "teacher";
      })
    : [
        ...introOrders,
        ...(mainSample ? [mainSample.sortOrder] : []),
        ...(wordTour ? [wordTour.sortOrder] : []),
        ...(closingSample ? [closingSample.sortOrder] : []),
      ];

  if (onlyLong) {
    targetOrders = targetOrders.filter((order) => {
      const scene = allScenes.find((s) => s.sortOrder === order);
      return ((scene?.scriptText ?? "").trim().length >= 140);
    });
  }

  console.log("targets", targetOrders.length, {
    intro: introOrders.length,
    main: mainSample?.sortOrder ?? null,
    wordTour: wordTour?.sortOrder ?? null,
    closing: closingSample?.sortOrder ?? null,
    wordTourModeAt304: delivery.get(304) ?? null,
  });

  await ensureSceneVoiceoversDir(VIDEO_ID);
  const report: Array<Record<string, unknown>> = [];

  for (const order of targetOrders) {
    const scene = allScenes.find((s) => s.sortOrder === order);
    if (!scene) {
      continue;
    }
    const clean = normalizeSceneVoiceoverText(scene.scriptText ?? "");
    if (!clean.trim()) {
      continue;
    }
    const speech = prepareVoiceoverSpeechText(clean);
    const sectionKind = bySort.get(order)?.sectionKind ?? "other";
    const mode = delivery.get(order) ?? "main";
    const host = resolvePodcastHostKey({
      voiceId:
        sectionKind === "teacher"
          ? "en-US-Chirp3-HD-Fenrir"
          : sectionKind === "student"
            ? "en-US-Chirp3-HD-Erinome"
            : null,
      sectionKind,
    });
    if (!host) {
      continue;
    }
    const speed = resolvePodcastSectionSpeakingRate({
      host,
      mode,
      spokenText: speech.spokenText,
    });
    const voiceId =
      host === "max" ? "en-US-Chirp3-HD-Fenrir" : "en-US-Chirp3-HD-Erinome";

    const audio = await generateGoogleTtsSpeech({
      text: speech.spokenText,
      voiceId,
      languageCode: "en-US",
      speed,
    });

    const fileName = sceneVoiceoverFileName({ sceneId: scene.id });
    const filePath = path.join(
      process.cwd(),
      "storage",
      "voiceovers",
      VIDEO_ID,
      "scenes",
      fileName,
    );
    await writeFile(filePath, audio);
    const durationSec = await getAudioDurationSec(filePath);
    const pauseAfterMs =
      mode === "intro"
        ? PODCAST_INTRO_SCENE_PAUSE_AFTER_MS
        : DEFAULT_SCENE_PAUSE_AFTER_MS;

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverStatus: "generated",
        voiceoverLocalPath: sceneVoiceoverRelativePath(VIDEO_ID, fileName),
        voiceoverFileName: fileName,
        voiceoverDuration: durationSec,
        voiceoverError: null,
        voiceoverProvider: "google",
        pauseAfterMs,
        voiceoverSettingsJson: {
          voiceId,
          provider: "google",
          speed,
          sectionKind,
          podcastDeliveryMode: mode,
          podcastHost: host,
        },
      },
    });

    report.push({
      order,
      host,
      mode,
      speed,
      pauseAfterMs,
      durationSec,
      preview: speech.spokenText.slice(0, 70),
    });
    console.log(
      `ok #${order} ${host}/${mode}@${speed} ${Number(durationSec).toFixed(1)}s`,
    );
  }

  console.log("---SUMMARY---");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
