import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractBalancedJsonAt,
  extractJsonPayload,
  extractScoreJsonObject,
} from "@/lib/browser-automation/types";
import { extractEmbeddedScoreJson } from "@/lib/script-writer-critique";

const SAMPLE_SCORE = `{
  "score": 9.0,
  "briefReason": "Clear and complete.",
  "topFixes": ["a", "b", "c"],
  "blockScores": {
    "semanticAlignment": 8.5,
    "segmentationComplexity": 9.4,
    "promptQuality": 9.1,
    "compositionClarity": 9.0,
    "varietyRepetition": 8.9,
    "rhythmDuration": 9.3,
    "continuityEmotionalImpact": 8.5
  }
}`;

test("extractBalancedJsonAt handles nested objects", () => {
  const raw = `prefix ${SAMPLE_SCORE} trailing chrome`;
  const start = raw.indexOf("{");
  const balanced = extractBalancedJsonAt(raw, start);
  assert.ok(balanced);
  assert.equal(JSON.parse(balanced!).score, 9.0);
});

test("extractScoreJsonObject wins over earlier scenes JSON", () => {
  const mixed = `[
  {"scriptText":"Hello","sceneType":"avatar","imagePrompt":"a face"}
]
Here is the critique:
${SAMPLE_SCORE}`;

  const score = extractScoreJsonObject(mixed);
  assert.ok(score);
  assert.equal(JSON.parse(score!).score, 9.0);

  // Generic payload still prefers the first JSON (scenes array).
  const first = extractJsonPayload(mixed);
  assert.ok(first?.startsWith("["));

  // Embedded score helper must still find the critique object.
  const embedded = extractEmbeddedScoreJson(mixed);
  assert.ok(embedded);
  assert.equal(JSON.parse(embedded!).score, 9.0);
});

test("extractEmbeddedScoreJson accepts visual-plan score alone", () => {
  const embedded = extractEmbeddedScoreJson(SAMPLE_SCORE);
  assert.ok(embedded);
  assert.equal(JSON.parse(embedded!).score, 9.0);
});
