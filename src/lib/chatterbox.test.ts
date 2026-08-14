import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  checkChatterboxHealth,
  generateChatterboxSpeech,
  getChatterboxBaseUrl,
  uploadChatterboxReferenceAudio,
} from "@/lib/chatterbox";
import { normalizeNamedVoices } from "@/lib/elevenlabs-preferences";
import {
  normalizeTtsVoiceProvider,
  resolveNamedVoiceProvider,
} from "@/lib/tts-voices";
import { normalizeVoiceoverSectionVoices } from "@/lib/voiceover-section-voices";

const originalFetch = globalThis.fetch;
const originalEnv = process.env.CHATTERBOX_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv === undefined) {
    delete process.env.CHATTERBOX_BASE_URL;
  } else {
    process.env.CHATTERBOX_BASE_URL = originalEnv;
  }
});

test("normalizeTtsVoiceProvider defaults missing entries to elevenlabs", () => {
  assert.equal(normalizeTtsVoiceProvider(undefined), "elevenlabs");
  assert.equal(normalizeTtsVoiceProvider("elevenlabs"), "elevenlabs");
  assert.equal(normalizeTtsVoiceProvider("chatterbox"), "chatterbox");
  assert.equal(normalizeTtsVoiceProvider("google"), "google");
  assert.equal(normalizeTtsVoiceProvider("other"), "elevenlabs");
});

test("normalizeNamedVoices soft-migrates provider and keeps chatterbox metadata", () => {
  const voices = normalizeNamedVoices([
    { name: "Legacy", voiceId: "abc123" },
    {
      name: "Max clone",
      voiceId: "max-clone.wav",
      provider: "chatterbox",
      referenceFileName: "max-clone.wav",
      localSamplePath: "storage/chatterbox-voices/max-clone.wav",
    },
    {
      name: "Emily",
      voiceId: "Emily.wav",
      provider: "chatterbox",
      chatterboxMode: "predefined",
      predefinedVoiceId: "Emily.wav",
    },
    { name: "Dup", voiceId: "abc123", provider: "elevenlabs" },
  ]);

  assert.equal(voices.length, 3);
  assert.deepEqual(voices[0], {
    name: "Legacy",
    voiceId: "abc123",
    provider: "elevenlabs",
  });
  assert.deepEqual(voices[1], {
    name: "Max clone",
    voiceId: "max-clone.wav",
    provider: "chatterbox",
    chatterboxMode: "clone",
    referenceFileName: "max-clone.wav",
    localSamplePath: "storage/chatterbox-voices/max-clone.wav",
  });
  assert.deepEqual(voices[2], {
    name: "Emily",
    voiceId: "Emily.wav",
    provider: "chatterbox",
    chatterboxMode: "predefined",
    predefinedVoiceId: "Emily.wav",
  });
});

test("normalizeVoiceoverSectionVoices persists provider", () => {
  const normalized = normalizeVoiceoverSectionVoices({
    teacher: {
      voiceId: "max-clone.wav",
      voiceName: "Max",
      provider: "chatterbox",
      speed: 0.9,
    },
    student: { voiceId: "el-1", voiceName: "Sara" },
  });

  assert.equal(normalized.teacher?.provider, "chatterbox");
  assert.equal(normalized.student?.provider, "elevenlabs");
  assert.equal(normalized.teacher?.speed, 0.9);
});

test("resolveNamedVoiceProvider prefers explicit then catalog", () => {
  const catalog = normalizeNamedVoices([
    {
      name: "Clone",
      voiceId: "clone.wav",
      provider: "chatterbox",
    },
  ]);
  assert.equal(
    resolveNamedVoiceProvider(catalog, "clone.wav", "elevenlabs"),
    "elevenlabs",
  );
  assert.equal(resolveNamedVoiceProvider(catalog, "clone.wav"), "chatterbox");
  assert.equal(resolveNamedVoiceProvider(catalog, "missing"), "elevenlabs");
});

test("getChatterboxBaseUrl reads env and strips trailing slash", () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:9000/";
  assert.equal(getChatterboxBaseUrl(), "http://127.0.0.1:9000");
});

test("checkChatterboxHealth reports unreachable server", async () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:59999";
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;

  const health = await checkChatterboxHealth();
  assert.equal(health.ok, false);
  assert.match(health.message, /unreachable|ECONNREFUSED/i);
});

test("checkChatterboxHealth parses reference files on success", async () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:8004";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        reference_files: ["a.wav", { filename: "b.mp3" }],
        predefined_voices: [
          { display_name: "Emily", filename: "Emily.wav" },
          { display_name: "Alice", filename: "Alice.wav" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  const health = await checkChatterboxHealth();
  assert.equal(health.ok, true);
  assert.deepEqual(health.referenceFiles, ["a.wav", "b.mp3"]);
  assert.deepEqual(health.predefinedVoices, [
    { displayName: "Emily", filename: "Emily.wav" },
    { displayName: "Alice", filename: "Alice.wav" },
  ]);
});

test("uploadChatterboxReferenceAudio posts multipart and returns filename", async () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:8004";
  let seenUrl = "";
  let seenMethod = "";
  globalThis.fetch = (async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    assert.ok(init?.body instanceof FormData);
    return new Response(
      JSON.stringify({
        uploaded_files: ["sample-voice.wav"],
        all_reference_files: ["sample-voice.wav"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await uploadChatterboxReferenceAudio({
    fileName: "sample voice.wav",
    bytes: Buffer.from("RIFF....WAVEfmt "),
    contentType: "audio/wav",
  });

  assert.match(seenUrl, /\/upload_reference$/);
  assert.equal(seenMethod, "POST");
  assert.equal(result.referenceFileName, "sample-voice.wav");
  assert.match(result.localSamplePath, /storage\/chatterbox-voices\//);
});

test("generateChatterboxSpeech posts clone payload and returns mp3 bytes", async () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:8004";
  const captured: { body: Record<string, unknown> | null } = { body: null };
  globalThis.fetch = (async (_input, init) => {
    captured.body = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    const payload = Buffer.alloc(128, 0xff);
    payload[0] = 0xff;
    payload[1] = 0xfb;
    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }) as typeof fetch;

  const audio = await generateChatterboxSpeech({
    text: "Hello from Chatterbox.",
    referenceFileName: "max-clone.wav",
    speed: 0.95,
  });

  assert.equal(captured.body?.voice_mode, "clone");
  assert.equal(captured.body?.reference_audio_filename, "max-clone.wav");
  assert.equal(captured.body?.speed_factor, 0.95);
  assert.equal(captured.body?.output_format, "mp3");
  assert.equal(captured.body?.exaggeration, 0.3);
  assert.equal(captured.body?.cfg_weight, 0.65);
  assert.equal(captured.body?.temperature, 0.55);
  assert.ok(audio.byteLength >= 4);
});

test("generateChatterboxSpeech posts predefined payload", async () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:8004";
  const captured: { body: Record<string, unknown> | null } = { body: null };
  globalThis.fetch = (async (_input, init) => {
    captured.body = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;
    const payload = Buffer.alloc(128, 0xff);
    payload[0] = 0xff;
    payload[1] = 0xfb;
    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }) as typeof fetch;

  await generateChatterboxSpeech({
    text: "Hello Emily.",
    voiceMode: "predefined",
    predefinedVoiceId: "Emily.wav",
  });

  assert.equal(captured.body?.voice_mode, "predefined");
  assert.equal(captured.body?.predefined_voice_id, "Emily.wav");
  assert.equal(captured.body?.reference_audio_filename, undefined);
});

test("generateChatterboxSpeech throws when server returns an error", async () => {
  process.env.CHATTERBOX_BASE_URL = "http://127.0.0.1:8004";
  globalThis.fetch = (async () =>
    new Response("model not loaded", { status: 503 })) as typeof fetch;

  await assert.rejects(
    () =>
      generateChatterboxSpeech({
        text: "Hello",
        referenceFileName: "x.wav",
      }),
    /503/,
  );
});
