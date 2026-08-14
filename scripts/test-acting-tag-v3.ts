import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { getAudioDurationSec } from "../src/lib/audio";
import { generateElevenLabsSpeech } from "../src/lib/elevenlabs";
import { prepareVoiceoverSpeechText } from "../src/lib/speech-text";
import { normalizeSceneVoiceoverText } from "../src/lib/voiceover-scenes";

const VIDEO_ID = "cms7alvzy0000nu84mv44maz6";
const SCENE_ORDER = 6;
const EMMA_VOICE_ID = "Hh0rE70WfnSFN80K8uJC";

const prisma = new PrismaClient();

async function main() {
  const scene = await prisma.scene.findFirst({
    where: { videoId: VIDEO_ID, sortOrder: SCENE_ORDER },
  });
  if (!scene) {
    throw new Error(`Scene ${SCENE_ORDER} not found`);
  }

  const clean = prepareVoiceoverSpeechText(
    normalizeSceneVoiceoverText(scene.scriptText),
  ).spokenText;
  const withTag = `[laughs] ${clean}`;

  const outDir = path.join(
    process.cwd(),
    "storage",
    "voiceover-acting-tests",
    VIDEO_ID,
  );
  const scenesDir = path.join(
    process.cwd(),
    "storage",
    "voiceovers",
    VIDEO_ID,
    "scenes",
  );
  await mkdir(outDir, { recursive: true });
  await mkdir(scenesDir, { recursive: true });

  console.log("Model: eleven_v3");
  console.log("Text:", JSON.stringify(withTag.slice(0, 160)));
  console.log("Generating...");

  const audio = await generateElevenLabsSpeech({
    text: withTag,
    voiceId: EMMA_VOICE_ID,
    modelId: "eleven_v3",
  });

  const fileName = "scene_6_v3_with_laughs_tag.mp3";
  const filePath = path.join(outDir, fileName);
  await writeFile(filePath, audio);
  await writeFile(path.join(scenesDir, fileName), audio);
  const duration = await getAudioDurationSec(filePath);

  console.log(
    JSON.stringify(
      {
        durationSec: duration,
        path: path.relative(process.cwd(), filePath),
        preview: `http://localhost:3000/api/generated-audio/${VIDEO_ID}/scenes/${fileName}`,
        compare: {
          A_turbo_clean: `http://localhost:3000/api/generated-audio/${VIDEO_ID}/scenes/scene_cms95ojhf009fnuw1h4pt6y6y.mp3`,
          B_turbo_withTag: `http://localhost:3000/api/generated-audio/${VIDEO_ID}/scenes/scene_6_with_laughs_tag.mp3`,
          C_v3_withTag: `http://localhost:3000/api/generated-audio/${VIDEO_ID}/scenes/${fileName}`,
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
