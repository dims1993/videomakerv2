import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { normalizeNamedVoices } from "@/lib/elevenlabs-preferences";
import {
  DEFAULT_FISH_AUDIO_MODEL,
  FISH_AUDIO_PROVIDER,
  generateFishSpeech,
  getDefaultFishAudioModel,
  sanitizeFishAudioSpeed,
} from "@/lib/fish-audio";
import {
  normalizeFishAudioCatalogConfig,
  normalizeTtsVoiceProvider,
  resolveNamedVoiceProvider,
} from "@/lib/tts-voices";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.FISH_AUDIO_API_KEY;
const originalModel = process.env.FISH_AUDIO_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.FISH_AUDIO_API_KEY;
  } else {
    process.env.FISH_AUDIO_API_KEY = originalApiKey;
  }
  if (originalModel === undefined) {
    delete process.env.FISH_AUDIO_MODEL;
  } else {
    process.env.FISH_AUDIO_MODEL = originalModel;
  }
});

test("sanitizeFishAudioSpeed clamps to practical band", () => {
  assert.equal(sanitizeFishAudioSpeed(undefined), 1);
  assert.equal(sanitizeFishAudioSpeed(0.1), 0.5);
  assert.equal(sanitizeFishAudioSpeed(0.9), 0.9);
  assert.equal(sanitizeFishAudioSpeed(1.5), 1.5);
  assert.equal(sanitizeFishAudioSpeed(3), 2);
});

test("normalizeTtsVoiceProvider accepts fish", () => {
  assert.equal(normalizeTtsVoiceProvider("fish"), "fish");
  assert.equal(normalizeTtsVoiceProvider("FISH"), "elevenlabs");
});

test("normalizeFishAudioCatalogConfig keeps model and speed", () => {
  const config = normalizeFishAudioCatalogConfig({
    model: "s2.1-pro",
    speed: 1.1,
  });
  assert.deepEqual(config, { model: "s2.1-pro", speed: 1.1 });
  assert.equal(normalizeFishAudioCatalogConfig({}), undefined);
  assert.equal(
    normalizeFishAudioCatalogConfig({ speed: 0.1 })?.speed,
    0.5,
  );
});

test("normalizeNamedVoices persists fishConfig", () => {
  const voices = normalizeNamedVoices([
    {
      name: "Narrator",
      voiceId: "abc123ref",
      provider: "fish",
      fishConfig: { model: "s2.1-pro", speed: 1.05 },
    },
  ]);
  assert.equal(voices.length, 1);
  assert.equal(voices[0]?.provider, "fish");
  assert.equal(voices[0]?.fishConfig?.model, "s2.1-pro");
  assert.equal(voices[0]?.fishConfig?.speed, 1.05);
  assert.equal(resolveNamedVoiceProvider(voices, "abc123ref"), "fish");
});

test("generateFishSpeech POSTs /v1/tts with Bearer and model header", async () => {
  process.env.FISH_AUDIO_API_KEY = "test-key";
  delete process.env.FISH_AUDIO_MODEL;

  const calls: Array<{
    url: string;
    init?: RequestInit;
  }> = [];

  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(Buffer.alloc(128, 1), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }) as typeof fetch;

  const audio = await generateFishSpeech({
    text: "Hello from Fish.",
    referenceId: "ref-voice-1",
    speed: 1.1,
  });

  assert.equal(audio.byteLength, 128);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.fish.audio/v1/tts");
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer test-key");
  assert.equal(headers.get("model"), DEFAULT_FISH_AUDIO_MODEL);
  assert.equal(headers.get("Content-Type"), "application/json");

  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
    string,
    unknown
  >;
  assert.equal(body.text, "Hello from Fish.");
  assert.equal(body.reference_id, "ref-voice-1");
  assert.equal(body.format, "mp3");
  assert.equal(body.mp3_bitrate, 128);
  assert.deepEqual(body.prosody, { speed: 1.1 });
  assert.equal(FISH_AUDIO_PROVIDER, "fish");
  assert.equal(getDefaultFishAudioModel(), DEFAULT_FISH_AUDIO_MODEL);
});

test("generateFishSpeech throws without API key", async () => {
  delete process.env.FISH_AUDIO_API_KEY;
  await assert.rejects(
    () =>
      generateFishSpeech({
        text: "Hi",
        referenceId: "ref",
      }),
    /FISH_AUDIO_API_KEY/,
  );
});
