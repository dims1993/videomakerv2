import assert from "node:assert/strict";
import test from "node:test";

import {
  PODCAST_AVATAR_EMMA_CHARACTER_LOCK,
  PODCAST_AVATAR_LEO_CHARACTER_LOCK,
  PODCAST_AVATAR_NEGATIVE_LOCK,
  PODCAST_AVATAR_SHOPPING_ENVIRONMENT_LOCK,
  PODCAST_AVATAR_STUDIO_ENVIRONMENT_LOCK,
  PODCAST_AVATAR_STYLE_LOCK,
  classifyPodcastShoppingSceneVariables,
  compilePodcastAvatarImagePrompt,
  detectPodcastShoppingVisualContext,
} from "@/lib/podcast-avatar-image-prompt";
import { normalizePodcastImagePrompt } from "@/lib/podcast-english-lessons-image-prompt-contract";

test("detectPodcastShoppingVisualContext finds shopping signals", () => {
  assert.equal(
    detectPodcastShoppingVisualContext({
      title: "Day 4 — Shopping for Clothes",
    }),
    true,
  );
  assert.equal(
    detectPodcastShoppingVisualContext({
      scriptText: "Welcome back to the studio podcast.",
    }),
    false,
  );
  assert.equal(
    detectPodcastShoppingVisualContext({
      scriptText: "How much is this shirt?",
    }),
    true,
  );
});

test("classifyPodcastShoppingSceneVariables maps price beats for Leo", () => {
  const vars = classifyPodcastShoppingSceneVariables({
    speaker: "leo",
    scriptText: "It is a little expensive.",
  });
  assert.equal(vars.environment, "shopping");
  assert.equal(vars.locationId, "display_table");
  assert.equal(vars.expressionId, "surprised_polite");
  assert.equal(vars.gestureId, "checking_price");
});

test("classifyPodcastShoppingSceneVariables maps size beats for Emma", () => {
  const vars = classifyPodcastShoppingSceneVariables({
    speaker: "emma",
    scriptText: "Do you have this in a medium?",
  });
  assert.equal(vars.locationId, "clothing_rack");
  assert.equal(vars.gestureId, "holding_blank_cards");
  assert.equal(vars.expressionId, "calm_explanation");
});

test("compilePodcastAvatarImagePrompt builds Leo shopping example structure", () => {
  const prompt = compilePodcastAvatarImagePrompt({
    speaker: "leo",
    scriptText: "It is a little expensive.",
    title: "Shopping for Clothes",
  });

  assert.ok(prompt.startsWith(PODCAST_AVATAR_STYLE_LOCK));
  assert.ok(prompt.includes(PODCAST_AVATAR_LEO_CHARACTER_LOCK));
  assert.ok(prompt.includes(PODCAST_AVATAR_SHOPPING_ENVIRONMENT_LOCK));
  assert.ok(prompt.includes("clean-shaven"));
  assert.ok(prompt.includes("no beard"));
  assert.ok(prompt.includes("blank price-tag"));
  assert.ok(prompt.includes("PRIMARY NARRATIVE BEAT"));
  assert.ok(prompt.includes('Leo is saying: "It is a little expensive."'));
  assert.ok(prompt.includes("Dominant story requirement"));
  assert.ok(prompt.includes("Again: this image is about"));
  assert.ok(prompt.includes(PODCAST_AVATAR_NEGATIVE_LOCK));
  assert.ok(!prompt.toLowerCase().includes("visible text limited to"));
});

test("compilePodcastAvatarImagePrompt uses studio when no shopping context", () => {
  const prompt = compilePodcastAvatarImagePrompt({
    speaker: "emma",
    scriptText: "Hello Leo, welcome back.",
    title: "Day 1 Introductions",
    expressionHint: "Warm welcoming smile while greeting Leo.",
  });

  assert.ok(prompt.includes(PODCAST_AVATAR_EMMA_CHARACTER_LOCK));
  assert.ok(prompt.includes(PODCAST_AVATAR_STUDIO_ENVIRONMENT_LOCK));
  assert.ok(!prompt.includes(PODCAST_AVATAR_SHOPPING_ENVIRONMENT_LOCK));
  assert.ok(prompt.includes("Warm welcoming smile while greeting Leo"));
});

test("normalizePodcastImagePrompt shopping override for emma/leo only", () => {
  const leo = normalizePodcastImagePrompt({
    role: "leo",
    scriptText: "It is a little expensive.",
    title: "Shopping",
    visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT",
    imagePrompt: "totally drifted cafe photoreal leo with beard",
  });
  assert.equal(
    leo,
    "Attached still from podcast image library / episode still folder (not Flow-generated).",
  );

  const part = normalizePodcastImagePrompt({
    role: "part",
    visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — NAMES",
    scriptText: "Part 1. Names.",
    imagePrompt: "ignore me",
  });
  assert.ok(part.includes('"PART 1 — NAMES"'));
  assert.ok(part.includes("realistic cinematic podcast title card"));
  assert.ok(!part.includes("Attached still from podcast image library"));
});
