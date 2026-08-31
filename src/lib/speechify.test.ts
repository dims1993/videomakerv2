import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { normalizeNamedVoices } from "@/lib/elevenlabs-preferences";
import {
  DEFAULT_SPEECHIFY_MODEL,
  SPEECHIFY_PROVIDER,
  generateSpeechifySpeech,
  getDefaultSpeechifyModel,
} from "@/lib/speechify";
import {
  normalizeSpeechifyCatalogConfig,
  normalizeTtsVoiceProvider,
  resolveNamedVoiceProvider,
} from "@/lib/tts-voices";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.SPEECHIFY_API_KEY;
const originalModel = process.env.SPEECHIFY_MODEL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.SPEECHIFY_API_KEY;
  } else {
    process.env.SPEECHIFY_API_KEY = originalApiKey;
  }
  if (originalModel === undefined) {
    delete process.env.SPEECHIFY_MODEL;
  } else {
    process.env.SPEECHIFY_MODEL = originalModel;
  }
});

test("normalizeTtsVoiceProvider accepts speechify", () => {
  assert.equal(normalizeTtsVoiceProvider("speechify"), "speechify");
  assert.equal(normalizeTtsVoiceProvider("SPEECHIFY"), "elevenlabs");
});

test("normalizeSpeechifyCatalogConfig keeps model", () => {
  assert.deepEqual(normalizeSpeechifyCatalogConfig({ model: "simba-3.2" }), {
    model: "simba-3.2",
  });
  assert.equal(normalizeSpeechifyCatalogConfig({}), undefined);
});

test("normalizeNamedVoices persists speechifyConfig", () => {
  const voices = normalizeNamedVoices([
    {
      name: "Geffen",
      voiceId: "geffen_32",
      provider: "speechify",
      speechifyConfig: { model: "simba-3.2" },
    },
  ]);
  assert.equal(voices.length, 1);
  assert.equal(voices[0]?.provider, "speechify");
  assert.equal(voices[0]?.speechifyConfig?.model, "simba-3.2");
  assert.equal(resolveNamedVoiceProvider(voices, "geffen_32"), "speechify");
});

test("generateSpeechifySpeech POSTs /v1/audio/speech and decodes audio_data", async () => {
  process.env.SPEECHIFY_API_KEY = "test-key";
  delete process.env.SPEECHIFY_MODEL;

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const audioBytes = Buffer.alloc(128, 7);

  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        audio_data: audioBytes.toString("base64"),
        audio_format: "mp3",
        billable_characters_count: 12,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const audio = await generateSpeechifySpeech({
    text: "Hello from Speechify.",
    voiceId: "geffen_32",
  });

  assert.equal(audio.byteLength, 128);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.speechify.ai/v1/audio/speech");
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer test-key");
  assert.equal(headers.get("Content-Type"), "application/json");

  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
    string,
    unknown
  >;
  assert.equal(body.input, "Hello from Speechify.");
  assert.equal(body.voice_id, "geffen_32");
  assert.equal(body.audio_format, "mp3");
  assert.equal(body.model, DEFAULT_SPEECHIFY_MODEL);
  assert.equal(SPEECHIFY_PROVIDER, "speechify");
  assert.equal(getDefaultSpeechifyModel(), DEFAULT_SPEECHIFY_MODEL);
});

test("generateSpeechifySpeech throws without API key", async () => {
  delete process.env.SPEECHIFY_API_KEY;
  await assert.rejects(
    () =>
      generateSpeechifySpeech({
        text: "Hi",
        voiceId: "geffen_32",
      }),
    /SPEECHIFY_API_KEY/,
  );
});
