import assert from "node:assert/strict";
import { test } from "node:test";

import { fitAlignedWordsToAudioDuration } from "./subtitle-alignment";

test("fitAlignedWordsToAudioDuration scales only when words overshoot audio", () => {
  const words = [
    { word: "hello", start: 0.1, end: 0.5 },
    { word: "world", start: 0.6, end: 2.0 },
  ];

  const unchanged = fitAlignedWordsToAudioDuration(words, 2.05);
  assert.deepEqual(unchanged, words);

  const fitted = fitAlignedWordsToAudioDuration(words, 1.5);
  assert.ok(fitted[1]!.end <= 1.5);
  assert.ok(fitted[1]!.end > fitted[0]!.end);
  assert.ok(fitted[0]!.start < fitted[0]!.end);
  // Relative order preserved; last word pulled into audio window.
  assert.equal(fitted.length, 2);
});
