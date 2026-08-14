import assert from "node:assert/strict";
import test from "node:test";

import {
  checkWhisperXHealth,
  getWhisperXBaseUrl,
  normalizeWhisperXAlignment,
} from "@/lib/whisperx";

test("normalizeWhisperXAlignment accepts flat words array", () => {
  const words = normalizeWhisperXAlignment({
    words: [
      { word: "Hello", start: 0.1, end: 0.4 },
      { word: "world", start: 0.45, end: 0.8 },
    ],
  });
  assert.equal(words.length, 2);
  assert.equal(words[0]?.word, "Hello");
  assert.equal(words[1]?.end, 0.8);
});

test("normalizeWhisperXAlignment flattens nested segment words", () => {
  const words = normalizeWhisperXAlignment({
    segments: [
      {
        words: [
          { word: "One", start: 0.0, end: 0.2 },
          { word: "two", start: 0.25, end: 0.5 },
        ],
      },
      {
        words: [{ word: "three", start: 0.6, end: 0.9 }],
      },
    ],
  });
  assert.deepEqual(
    words.map((w) => w.word),
    ["One", "two", "three"],
  );
});

test("normalizeWhisperXAlignment returns empty for garbage", () => {
  assert.deepEqual(normalizeWhisperXAlignment(null), []);
  assert.deepEqual(normalizeWhisperXAlignment({}), []);
  assert.deepEqual(normalizeWhisperXAlignment({ words: "nope" }), []);
});

test("getWhisperXBaseUrl uses env and strips trailing slash", () => {
  const previous = process.env.WHISPERX_BASE_URL;
  process.env.WHISPERX_BASE_URL = "http://127.0.0.1:8011/";
  try {
    assert.equal(getWhisperXBaseUrl(), "http://127.0.0.1:8011");
  } finally {
    if (previous === undefined) {
      delete process.env.WHISPERX_BASE_URL;
    } else {
      process.env.WHISPERX_BASE_URL = previous;
    }
  }
});

test("checkWhisperXHealth reports unreachable server", async () => {
  const previous = process.env.WHISPERX_BASE_URL;
  process.env.WHISPERX_BASE_URL = "http://127.0.0.1:59999";
  try {
    const health = await checkWhisperXHealth();
    assert.equal(health.ok, false);
    assert.match(health.message, /WhisperX/i);
    assert.equal(health.baseUrl, "http://127.0.0.1:59999");
  } finally {
    if (previous === undefined) {
      delete process.env.WHISPERX_BASE_URL;
    } else {
      process.env.WHISPERX_BASE_URL = previous;
    }
  }
});

test("align path health mock success via fetch", async () => {
  const previous = process.env.WHISPERX_BASE_URL;
  process.env.WHISPERX_BASE_URL = "http://whisperx.test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const health = await checkWhisperXHealth();
    assert.equal(health.ok, true);
    assert.match(health.message, /reachable/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) {
      delete process.env.WHISPERX_BASE_URL;
    } else {
      process.env.WHISPERX_BASE_URL = previous;
    }
  }
});

test("alignWhisperXAudioWithText posts multipart and returns JSON", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { alignWhisperXAudioWithText } = await import("@/lib/whisperx");

  const dir = await mkdtemp(path.join(tmpdir(), "whisperx-align-"));
  const audioPath = path.join(dir, "scene.mp3");
  await writeFile(audioPath, Buffer.from("fake-mp3"));

  const previous = process.env.WHISPERX_BASE_URL;
  process.env.WHISPERX_BASE_URL = "http://whisperx.test";
  const originalFetch = globalThis.fetch;
  let sawAlign = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/align") && init?.method === "POST") {
      sawAlign = true;
      assert.ok(init.body instanceof FormData);
      return new Response(
        JSON.stringify({
          words: [{ word: "Hi", start: 0.0, end: 0.3 }],
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const payload = await alignWhisperXAudioWithText({
      audioFilePath: audioPath,
      text: "Hi there",
    });
    assert.equal(sawAlign, true);
    const words = normalizeWhisperXAlignment(payload);
    assert.equal(words[0]?.word, "Hi");
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) {
      delete process.env.WHISPERX_BASE_URL;
    } else {
      process.env.WHISPERX_BASE_URL = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
