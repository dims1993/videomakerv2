import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ensureHookMarkersInScript,
  normalizeForScriptCoverage,
  segmentHookNarration,
  validateScriptCoverage,
  validateVisualIdeaPrefixes,
} from "@/lib/visual-plan-script";

const HOOK_FIXTURE = `What if Scripture is not failing to reach you?

What if it never had room to land?

You read the passage. You hear the sermon. You recognize the truth.

But before it settles, your mind moves.

A notification.

A worry.

A memory.

A plan for tomorrow.

The words enter your ears, but they never reach the deeper place where conviction, comfort, and change begin.

And after a while, you may start to wonder whether your heart has become numb.`;

const EXPECTED_HOOK_SCENES = [
  "What if Scripture is not failing to reach you?",
  "What if it never had room to land?",
  "You read the passage.",
  "You hear the sermon.",
  "You recognize the truth.",
  "But before it settles, your mind moves.",
  "A notification. A worry.",
  "A memory. A plan for tomorrow.",
  "The words enter your ears,",
  "but they never reach the deeper place",
  "where conviction, comfort, and change begin.",
  "And after a while, you may start to wonder",
  "whether your heart has become numb.",
];

test("hook segmentation acceptance fixture preserves every word and order", () => {
  const scenes = segmentHookNarration(HOOK_FIXTURE);

  assert.deepEqual(scenes, EXPECTED_HOOK_SCENES);

  const coverage = validateScriptCoverage(HOOK_FIXTURE, scenes);
  assert.equal(coverage.ok, true);

  assert.equal(scenes.filter((s) => s.includes("?")).length, 2);
  assert.ok(scenes.includes("You read the passage."));
  assert.ok(scenes.includes("You hear the sermon."));
  assert.ok(scenes.includes("You recognize the truth."));
  assert.equal(scenes.filter((s) => /^A /i.test(s) || s.startsWith("A ")).length >= 2, true);
  assert.ok(scenes.some((s) => /notification/i.test(s) && /worry/i.test(s)));
  assert.ok(scenes.some((s) => /memory/i.test(s) && /tomorrow/i.test(s)));
  assert.ok(scenes.some((s) => /enter your ears/i.test(s)));
  assert.ok(scenes.some((s) => /^but they never reach/i.test(s)));
  assert.ok(scenes.some((s) => /^where conviction/i.test(s)));
});

test("ensureHookMarkersInScript wraps unmarked opening before chapter", () => {
  const script = `${HOOK_FIXTURE}\n\n[CHAPTER 01 — Soil]\n\nBody text here.`;
  const result = ensureHookMarkersInScript(script);
  assert.match(result.script, /^\[HOOK\]/);
  assert.match(result.script, /\[END HOOK\]/);
  assert.match(result.script, /\[CHAPTER 01 — Soil\]/);
  assert.equal(
    normalizeForScriptCoverage(result.script).includes("Body text here"),
    true,
  );
});

test("validateVisualIdeaPrefixes requires known format labels", () => {
  const errors = validateVisualIdeaPrefixes([
    { order: 1, visualIdea: "Concept card: Information is not transformation." },
    { order: 2, visualIdea: "A seed on soil" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /scene 2/);
});
