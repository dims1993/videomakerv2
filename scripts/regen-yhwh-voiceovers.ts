import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";

import { generateElevenLabsSpeech } from "../src/lib/elevenlabs";
import { getAudioDurationSec } from "../src/lib/audio";
import { prepareVoiceoverSpeechText } from "../src/lib/speech-text";
import {
  normalizeSceneVoiceoverText,
  sceneVoiceoverFileName,
  sceneVoiceoverRelativePath,
  ensureSceneVoiceoversDir,
} from "../src/lib/voiceover-scenes";

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

async function main() {
  const scenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      voiceoverSettingsJson: true,
      voiceoverProvider: true,
      voiceoverLocalPath: true,
      pauseAfterMs: true,
    },
  });

  const affected = scenes.filter((scene) =>
    /YHWH|YHVH/i.test(scene.scriptText ?? ""),
  );

  console.log(`Found ${affected.length} scenes with YHWH/YHVH`);
  if (affected.length === 0) {
    return;
  }

  await ensureSceneVoiceoversDir(VIDEO_ID);

  for (const scene of affected) {
    const settings =
      scene.voiceoverSettingsJson &&
      typeof scene.voiceoverSettingsJson === "object" &&
      !Array.isArray(scene.voiceoverSettingsJson)
        ? (scene.voiceoverSettingsJson as Record<string, unknown>)
        : {};

    const clean = normalizeSceneVoiceoverText(scene.scriptText ?? "");
    const speech = prepareVoiceoverSpeechText(clean);
    if (!speech.spokenText.trim()) {
      console.warn(`skip #${scene.sortOrder}: empty spoken text`);
      continue;
    }

    console.log(
      `#${scene.sortOrder}: "${(scene.scriptText ?? "").slice(0, 70)}"`,
    );
    console.log(`  spoken: "${speech.spokenText.slice(0, 90)}"`);

    const voiceId =
      (typeof settings.voiceId === "string" && settings.voiceId) ||
      "alFofuDn3cOwyoz1i44T";
    const modelId =
      (typeof settings.modelId === "string" && settings.modelId) ||
      "eleven_turbo_v2_5";
    const outputFormat =
      (typeof settings.outputFormat === "string" && settings.outputFormat) ||
      "mp3_44100_128";
    const stability =
      typeof settings.stability === "number" ? settings.stability : 0.5;
    const similarityBoost =
      typeof settings.similarityBoost === "number"
        ? settings.similarityBoost
        : 0.75;
    const speed = typeof settings.speed === "number" ? settings.speed : 1;

    const audio = await generateElevenLabsSpeech({
      text: speech.spokenText,
      voiceId,
      modelId,
      outputFormat,
      stability,
      similarityBoost,
      speed,
    });

    const fileName = sceneVoiceoverFileName({ sceneId: scene.id });
    const relativePath = sceneVoiceoverRelativePath(VIDEO_ID, fileName);
    const absolutePath = path.join(process.cwd(), relativePath);
    await writeFile(absolutePath, audio);
    const durationSec = await getAudioDurationSec(absolutePath);

    const nextSettings: Prisma.InputJsonValue = {
      ...settings,
      voiceId,
      modelId,
      outputFormat,
      stability,
      similarityBoost,
      speed,
      spokenPreview: speech.spokenText.slice(0, 180),
      yhwhNormalized: true,
    };

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverStatus: "generated",
        voiceoverLocalPath: relativePath,
        voiceoverFileName: fileName,
        voiceoverDuration: durationSec,
        voiceoverError: null,
        voiceoverProvider: "elevenlabs",
        voiceoverSettingsJson: nextSettings,
      },
    });

    console.log(
      `  ok ${Number(durationSec).toFixed(1)}s → ${relativePath}`,
    );
  }

  console.log("Done. Re-stitch master voiceover if you use a master mix.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
