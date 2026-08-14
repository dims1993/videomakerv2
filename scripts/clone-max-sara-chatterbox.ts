import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  checkChatterboxHealth,
  generateChatterboxSpeech,
  uploadChatterboxReferenceAudio,
} from "../src/lib/chatterbox";
import {
  normalizeNamedVoices,
  readElevenLabsPreferences,
  saveNamedElevenLabsVoices,
} from "../src/lib/elevenlabs-preferences";

async function cloneOne(name: string, filePath: string) {
  const bytes = await readFile(filePath);
  console.log(`[clone] ${name}: ${bytes.byteLength} bytes from ${filePath}`);
  const t0 = Date.now();
  const upload = await uploadChatterboxReferenceAudio({
    fileName: path.basename(filePath),
    bytes,
    contentType: "audio/mpeg",
  });
  console.log(`[clone] ${name} upload ok in ${Date.now() - t0}ms`, upload);

  const voice = {
    name,
    voiceId: upload.referenceFileName,
    provider: "chatterbox" as const,
    referenceFileName: upload.referenceFileName,
    localSamplePath: upload.localSamplePath,
  };

  const existing = await readElevenLabsPreferences();
  const without = (existing?.namedVoices ?? []).filter(
    (entry) => entry.voiceId !== voice.voiceId && entry.name !== voice.name,
  );
  const namedVoices = normalizeNamedVoices([voice, ...without]);
  await saveNamedElevenLabsVoices(namedVoices);
  console.log(`[clone] ${name} saved to catalog as ${voice.voiceId}`);
  return voice;
}

async function main() {
  const health = await checkChatterboxHealth();
  console.log("[health]", health);
  if (!health.ok) {
    throw new Error(health.message);
  }

  const max = await cloneOne("Max", "data/sound-library/Max.mp3");
  const sara = await cloneOne("Sara", "data/sound-library/Sara.mp3");

  console.log("[tts] generating short sample with Max…");
  const t1 = Date.now();
  const audio = await generateChatterboxSpeech({
    text: "Hello. This is a quick test of the Max voice clone.",
    referenceFileName: max.referenceFileName!,
    speed: 1,
  });
  console.log(`[tts] Max ok in ${Date.now() - t1}ms, bytes=${audio.byteLength}`);
  await mkdir("storage/tmp", { recursive: true });
  await writeFile("storage/tmp/max-clone-test.mp3", audio);
  console.log("[done] wrote storage/tmp/max-clone-test.mp3");
  console.log("[catalog]", { max: max.voiceId, sara: sara.voiceId });
}

main().catch((error) => {
  console.error("[fail]", error);
  process.exit(1);
});
