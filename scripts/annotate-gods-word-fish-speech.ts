/**
 * One-off: annotate existing Gods Word scenes with fishSpeechText
 * without touching scriptText. Safe fail-soft validation.
 *
 * Usage:
 *   npx tsx scripts/annotate-gods-word-fish-speech.ts [videoId]
 */
import { PrismaClient } from "@prisma/client";

import {
  resolveValidFishSpeechText,
  voiceoverSettingsWithFishSpeechText,
} from "../src/lib/fish-speech-tags";

const prisma = new PrismaClient();

const DEFAULT_VIDEO_ID = "cmt3m0e5601hpnu0h3imc6ez3";

function pickMoodTag(text: string): string {
  const lower = text.toLowerCase();
  if (
    /\b(sin|sins|failure|frightened|fear|lost|warning|warnings|shake|trampling|falling away|too far)\b/.test(
      lower,
    )
  ) {
    return "[sad]";
  }
  if (
    /\b(comfort|secure|snatch|grace|hope|love|belong|hands of god|my hand)\b/.test(
      lower,
    )
  ) {
    return "[warm]";
  }
  if (/\?|\b(wonder|question|which is it|can a|can someone|or is)\b/.test(lower)) {
    return "[curious]";
  }
  if (/\b(promise|endures|saved|forgiveness|theology|bible)\b/.test(lower)) {
    return "[gentle]";
  }
  return "[solemn]";
}

/**
 * Insert light Fish tags while preserving exact spoken words/order.
 */
function buildFishSpeechText(scriptText: string): string | null {
  const text = scriptText.trim();
  if (!text) {
    return null;
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  let body = text;

  if (wordCount >= 8) {
    body = body.replace(
      /\b(after|until|but|yet|so which|or is|have I|somewhere underneath)\b/gi,
      (match) => `[short pause] ${match}`,
    );

    body = body.replace(
      /\b(sins again|lose salvation|finally lost|No one will snatch|endures to the end|falling away|trampling the Son of God|Spirit of grace|too far|ground shake)\b/gi,
      (match) => `[emphasis] ${match}`,
    );
  }

  const mood = pickMoodTag(text);
  const tagged = `${mood} ${body}`.replace(/[ \t]{2,}/g, " ").trim();
  return resolveValidFishSpeechText(text, tagged);
}

function fishSpeechFromSettings(settings: unknown): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = (settings as Record<string, unknown>).fishSpeechText;
  return typeof value === "string" ? value : null;
}

async function main() {
  const videoId = process.argv[2]?.trim() || DEFAULT_VIDEO_ID;
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, title: true, channelKey: true },
  });
  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }
  if (video.channelKey !== "the-gods-word") {
    throw new Error(
      `Refusing: channel is "${video.channelKey}", expected the-gods-word.`,
    );
  }

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      voiceoverSettingsJson: true,
    },
  });

  let updated = 0;
  let skippedEmpty = 0;
  let skippedInvalid = 0;
  let skippedExisting = 0;

  for (const scene of scenes) {
    const script = scene.scriptText.trim();
    if (!script) {
      skippedEmpty += 1;
      continue;
    }

    const existing = fishSpeechFromSettings(scene.voiceoverSettingsJson);
    if (existing && resolveValidFishSpeechText(script, existing)) {
      skippedExisting += 1;
      continue;
    }

    const tagged = buildFishSpeechText(script);
    if (!tagged) {
      skippedInvalid += 1;
      continue;
    }

    const nextSettings = voiceoverSettingsWithFishSpeechText(
      scene.voiceoverSettingsJson,
      tagged,
    );

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverSettingsJson: nextSettings as object,
      },
    });
    updated += 1;
  }

  const sample = await prisma.scene.findFirst({
    where: { videoId, sortOrder: 3 },
    select: { scriptText: true, voiceoverSettingsJson: true },
  });

  console.log(
    JSON.stringify(
      {
        videoId: video.id,
        title: video.title,
        total: scenes.length,
        updated,
        skippedEmpty,
        skippedInvalid,
        skippedExisting,
        sampleScene3: {
          scriptText: sample?.scriptText ?? null,
          fishSpeechText: fishSpeechFromSettings(sample?.voiceoverSettingsJson),
        },
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
