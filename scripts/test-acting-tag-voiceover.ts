/**
 * A/B voiceover test: scene with script [laughs] cue.
 * A = pipeline-clean text (tags stripped)
 * B = same line with [laughs] kept and sent to ElevenLabs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { getAudioDurationSec } from "../src/lib/audio";
import { generateElevenLabsSpeech } from "../src/lib/elevenlabs";
import { prepareVoiceoverSpeechText } from "../src/lib/speech-text";
import { normalizeSceneVoiceoverText } from "../src/lib/voiceover-scenes";
import {
  ensureSceneVoiceoversDir,
  sceneVoiceoverFileName,
  sceneVoiceoverRelativePath,
} from "../src/lib/voiceover-scenes";

const VIDEO_ID = "cms7alvzy0000nu84mv44maz6";
const SCENE_ORDER = 6; // Emma [laughs] → "Then today, we are bringing it back…"
const EMMA_VOICE_ID = "Hh0rE70WfnSFN80K8uJC";

const prisma = new PrismaClient();

async function main() {
  const scene = await prisma.scene.findFirst({
    where: { videoId: VIDEO_ID, sortOrder: SCENE_ORDER },
  });
  if (!scene) {
    throw new Error(`Scene ${SCENE_ORDER} not found`);
  }

  const clean = normalizeSceneVoiceoverText(scene.scriptText);
  const withTag = `[laughs]\n${clean}`;
  const cleanSpoken = prepareVoiceoverSpeechText(clean).spokenText;
  const taggedSpoken = prepareVoiceoverSpeechText(withTag).spokenText;
  // Force-keep the tag for variant B even if a future strip removes it.
  const taggedForApi = `[laughs] ${cleanSpoken}`;

  console.log("Scene", SCENE_ORDER, scene.id);
  console.log("A (clean):", JSON.stringify(cleanSpoken.slice(0, 120)));
  console.log("B (with tag):", JSON.stringify(taggedForApi.slice(0, 120)));
  console.log("normalize would strip tag to:", JSON.stringify(normalizeSceneVoiceoverText(withTag).slice(0, 120)));

  const dir = await ensureSceneVoiceoversDir(VIDEO_ID);
  const compareDir = path.join(process.cwd(), "storage", "voiceover-acting-tests", VIDEO_ID);
  await mkdir(compareDir, { recursive: true });

  console.log("Generating A (clean / pipeline)...");
  const audioA = await generateElevenLabsSpeech({
    text: cleanSpoken,
    voiceId: EMMA_VOICE_ID,
  });
  const fileA = sceneVoiceoverFileName({ sceneId: scene.id });
  const pathA = path.join(dir, fileA);
  await writeFile(pathA, audioA);
  const durA = await getAudioDurationSec(pathA);

  console.log("Generating B (with [laughs] sent to ElevenLabs)...");
  const audioB = await generateElevenLabsSpeech({
    text: taggedForApi,
    voiceId: EMMA_VOICE_ID,
  });
  const fileB = `scene_${SCENE_ORDER}_with_laughs_tag.mp3`;
  const pathB = path.join(compareDir, fileB);
  await writeFile(pathB, audioB);
  const durB = await getAudioDurationSec(pathB);

  // Also copy A into compare folder for easy side-by-side listening.
  const pathACopy = path.join(compareDir, `scene_${SCENE_ORDER}_clean.mp3`);
  await writeFile(pathACopy, audioA);

  await prisma.scene.update({
    where: { id: scene.id },
    data: {
      voiceoverStatus: "generated",
      voiceoverLocalPath: sceneVoiceoverRelativePath(VIDEO_ID, fileA),
      voiceoverFileName: fileA,
      voiceoverDuration: durA,
      voiceoverProvider: "elevenlabs",
      voiceoverError: null,
      voiceoverSettingsJson: {
        testNote: "A/B acting-tag test: attached clean variant A",
        actingCueFromScript: "[laughs]",
        compareWithTagPath: path.join(
          "storage",
          "voiceover-acting-tests",
          VIDEO_ID,
          fileB,
        ),
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        sceneOrder: SCENE_ORDER,
        actingCue: "[laughs]",
        durationA_sec: durA,
        durationB_sec: durB,
        previewA: `/api/generated-audio/${VIDEO_ID}/scenes/${fileA}`,
        compareFolder: path.relative(process.cwd(), compareDir),
        files: {
          A_attached: sceneVoiceoverRelativePath(VIDEO_ID, fileA),
          A_copy: path.relative(process.cwd(), pathACopy),
          B_withTag: path.relative(process.cwd(), pathB),
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
