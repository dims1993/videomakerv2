import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeSpokenForFishCompare,
  resolveValidFishSpeechText,
  stripFishSpeechTags,
  voiceoverSettingsWithFishSpeechText,
} from "@/lib/fish-speech-tags";

test("stripFishSpeechTags removes bracket directions", () => {
  assert.equal(
    stripFishSpeechTags(
      "[sad] A Christian [emphasis]sins again, [short pause]after promising God.",
    ),
    "A Christian sins again, after promising God.",
  );
});

test("resolveValidFishSpeechText accepts matching tags", () => {
  const script = "A Christian sins again, after promising God.";
  const tagged =
    "[sad] A Christian [emphasis]sins again, [short pause]after promising God.";
  assert.equal(resolveValidFishSpeechText(script, tagged), tagged);
});

test("resolveValidFishSpeechText rejects rewritten words", () => {
  assert.equal(
    resolveValidFishSpeechText(
      "A Christian sins again.",
      "[sad] A believer sins again.",
    ),
    null,
  );
});

test("normalizeSpokenForFishCompare ignores punctuation and case", () => {
  assert.equal(
    normalizeSpokenForFishCompare("Hello, World!"),
    normalizeSpokenForFishCompare("hello world"),
  );
});

test("voiceoverSettingsWithFishSpeechText merges and clears", () => {
  assert.deepEqual(
    voiceoverSettingsWithFishSpeechText(null, "[warm] Hi."),
    { fishSpeechText: "[warm] Hi." },
  );
  assert.deepEqual(
    voiceoverSettingsWithFishSpeechText(
      { fishSpeechText: "old", speed: 1 },
      null,
    ),
    { speed: 1 },
  );
});
