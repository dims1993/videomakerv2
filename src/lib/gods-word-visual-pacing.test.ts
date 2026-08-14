import assert from "node:assert/strict";
import test from "node:test";

import {
  countNarratedWords,
  isGodsWordAllowedShortEmphasis,
  isGodsWordExemptPacingScene,
  validateGodsWordSceneDurations,
} from "@/lib/gods-word-visual-pacing";

test("countNarratedWords", () => {
  assert.equal(countNarratedWords("So."), 1);
  assert.equal(countNarratedWords("Jesus heard it."), 3);
  assert.equal(countNarratedWords(""), 0);
});

test("exempts chapter covers and empty FINAL bumper", () => {
  assert.equal(
    isGodsWordExemptPacingScene({
      scriptText: "THE DELAY",
      visualIdea: "Chapter cover: THE DELAY, with one road.",
    }),
    true,
  );
  assert.equal(
    isGodsWordExemptPacingScene({
      scriptText: "",
      visualIdea: "SECTION_CLIP | FINAL: end bumper",
    }),
    true,
  );
  assert.equal(
    isGodsWordExemptPacingScene({
      scriptText: "Jesus waited at the road.",
      visualIdea: "Narrative scene: Jesus waits.",
    }),
    false,
  );
});

test("allows short quote / word-study emphasis", () => {
  assert.equal(
    isGodsWordAllowedShortEmphasis({
      scriptText: '"Follow Me"',
      visualIdea: "Concept card: Follow Me",
    }),
    true,
  );
  assert.equal(
    isGodsWordAllowedShortEmphasis({
      scriptText: "So.",
      visualIdea: "Atmosphere/space: a pause.",
    }),
    false,
  );
});

test("body rejects sub-5s and under-word scenes", () => {
  const errors = validateGodsWordSceneDurations(
    [
      {
        scriptText: "Jesus waited on the road near Bethany.",
        duration: 3,
        visualIdea: "Narrative scene: Jesus waits.",
      },
      {
        scriptText: "A parent. A friend.",
        duration: 6,
        visualIdea: "Object/detail insert: two portraits.",
      },
    ],
    { isHookSection: false },
  );
  assert.ok(errors.some((error) => /below soft floor 5s/i.test(error)));
  assert.ok(errors.some((error) => /only 4 words|soft min 12/i.test(error)));
});

test("body accepts 15–25 word / 6–8s scenes", () => {
  const text =
    "Jesus stayed where He was for two more days, and the delay itself became the doorway to glory.";
  assert.ok(countNarratedWords(text) >= 12);
  const errors = validateGodsWordSceneDurations(
    [
      {
        scriptText: text,
        duration: 7,
        visualIdea: "Narrative scene: Jesus remains in place.",
      },
    ],
    { isHookSection: false },
  );
  assert.deepEqual(errors, []);
});

test("forbids single-word scenes even in hook", () => {
  const errors = validateGodsWordSceneDurations(
    [
      {
        scriptText: "So.",
        duration: 3,
        visualIdea: "Atmosphere/space: a pause of light.",
      },
    ],
    { isHookSection: true },
  );
  assert.ok(errors.some((error) => /single-word/i.test(error)));
});

test("exempt cover skips body floors", () => {
  const errors = validateGodsWordSceneDurations(
    [
      {
        scriptText: "THE STONE",
        duration: 4,
        visualIdea: "Chapter cover: THE STONE, with the sealed tomb.",
      },
    ],
    { isHookSection: false },
  );
  assert.deepEqual(errors, []);
});
