import assert from "node:assert/strict";
import { test } from "node:test";

import {
  channelUsesPlatformFillHybrid,
  resolveVisualPlanFillProfile,
} from "@/lib/visual-plan-channel-profile";
import {
  assertWealthSkeletonCoverage,
  buildWealthInsightsVisualPlanSkeleton,
} from "@/lib/wealth-insights-visual-skeleton";

test("channelUsesPlatformFillHybrid excludes only podcast", () => {
  assert.equal(channelUsesPlatformFillHybrid("podcast-english-lessons"), false);
  assert.equal(channelUsesPlatformFillHybrid("wealth-insights"), true);
  assert.equal(channelUsesPlatformFillHybrid("the-gods-word"), true);
  assert.equal(channelUsesPlatformFillHybrid("stickman-pshicologyst"), true);
});

test("wealth fill profile builds local skeleton with coverage", () => {
  const script = [
    "[HOOK]",
    "Waiting feels safe. But waiting has a cost.",
    "Every month you delay, the math gets worse.",
    "[END HOOK]",
    "",
    "Here is the mechanism. Compound growth rewards time more than perfect timing.",
    "If you wait for certainty, you usually wait forever.",
    "",
    "So start with a small automatic transfer. Then protect it from your own hesitation.",
  ].join("\n");

  const skeleton = buildWealthInsightsVisualPlanSkeleton(script);
  // Short scripts may collapse into a single HOOK section (timing floor ~2 min).
  assert.ok(skeleton.scenes.length >= 3);
  assert.ok(skeleton.sectionCount >= 1);
  const coverage = assertWealthSkeletonCoverage(script, skeleton.scenes);
  assert.equal(coverage.ok, true);

  const profile = resolveVisualPlanFillProfile({
    channelKey: "wealth-insights",
    script,
    title: "Why Waiting Feels Safer",
  });
  assert.equal(profile.kind, "wealth-insights");
  assert.equal(profile.coverageError, null);
  assert.ok(profile.scenes.length >= 3);
  assert.match(profile.contextPrompt, /Fill-chunk mode notes/i);
  assert.ok(!/Section-chunk mode notes/i.test(profile.contextPrompt));
  assert.ok(!/Hard Hook Segmentation Override/i.test(profile.contextPrompt));
  assert.ok(!/Scene boundary planning/i.test(profile.contextPrompt));
  assert.match(profile.contextPrompt, /fill-hybrid/i);
  assert.match(profile.contextPrompt, /MAIN HOST:/);
});

test("gods-word fill profile still owns coverage", () => {
  const script = [
    "[HOOK]",
    "You thought obedience would feel clear.",
    "But clarity often arrives after the first step.",
    "[END HOOK]",
    "[CHAPTER 1 — THE WEIGHT]",
    "Faith is not postponing the decision until the room is bright.",
    "It is walking while the light is still forming.",
    "[FINAL — RETURN]",
    "Return to the word that steadied you.",
  ].join("\n");

  const profile = resolveVisualPlanFillProfile({
    channelKey: "the-gods-word",
    script,
  });
  assert.equal(profile.kind, "gods-word");
  assert.equal(profile.coverageError, null);
  assert.ok(profile.scenes.length >= 3);
});

test("generic channel fill profile packs unmarked script", () => {
  const script = [
    "[INTRODUCTION]",
    "Anxiety grows when the mind rehearses danger without a next action.",
    "Name the fear. Then choose one small move that breaks the loop.",
    "",
    "Practice that move daily until the body trusts the plan.",
    "Repeat until the body stops treating every sensation as an emergency.",
    "Then teach someone else the same two-step reset.",
  ].join("\n");

  const profile = resolveVisualPlanFillProfile({
    channelKey: "stickman-pshicologyst",
    script,
  });
  assert.equal(profile.kind, "generic");
  assert.equal(profile.coverageError, null);
  assert.ok(profile.scenes.length >= 1);
  assert.equal(profile.versionLabel, "v2-platform-fill");
});
