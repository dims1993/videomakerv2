import assert from "node:assert/strict";
import test from "node:test";

import {
  PODCAST_ATTACHED_STILL_IMAGE_PROMPT,
  PODCAST_PART_COVER_PROMPT_TEMPLATE,
  assemblePodcastImagePrompt,
  assemblePodcastPartCoverImagePrompt,
  buildPodcastHybridFillBrief,
  inferPodcastImagePromptRole,
  normalizePodcastImagePrompt,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import { applyVisualPlanFillPatches } from "@/lib/visual-plan-fill";
import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";

test("normalizePodcastImagePrompt uses attach note for Emma/Leo", () => {
  const a = normalizePodcastImagePrompt({
    role: "emma",
    visualPurpose: "Warm welcoming smile while greeting Leo.",
    visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
    imagePrompt: "totally different improvised emma with blonde hair and a cafe",
    scriptText: "Hello Leo.",
    title: "Day 1 Introductions",
  });
  const b = normalizePodcastImagePrompt({
    role: "leo",
    visualPurpose: "Curious learner look.",
    visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT",
    imagePrompt: "photoreal leo drift",
    scriptText: "Nice to meet you.",
  });

  assert.equal(a, PODCAST_ATTACHED_STILL_IMAGE_PROMPT);
  assert.equal(b, PODCAST_ATTACHED_STILL_IMAGE_PROMPT);
});

test("inferPodcastImagePromptRole uses visualIdea prefixes", () => {
  assert.equal(
    inferPodcastImagePromptRole({
      visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT",
    }),
    "leo",
  );
  assert.equal(
    inferPodcastImagePromptRole({
      visualIdea: "MUSIC_BED | COMP_MUSIC_BED",
    }),
    "music",
  );
  assert.equal(
    inferPodcastImagePromptRole({ scriptText: "[EMMA]\nHello." }),
    "emma",
  );
});

test("assemblePodcastImagePrompt is attach note only", () => {
  assert.equal(
    assemblePodcastImagePrompt("leo", "Curious raised eyebrow."),
    PODCAST_ATTACHED_STILL_IMAGE_PROMPT,
  );
});

test("buildPodcastHybridFillBrief documents attach-only avatars and PART template", () => {
  const brief = buildPodcastHybridFillBrief();
  assert.ok(brief.includes(PODCAST_ATTACHED_STILL_IMAGE_PROMPT));
  assert.ok(brief.includes("do NOT write Flow imagePrompts"));
  assert.ok(brief.includes("[PART_TEXT]"));
  assert.ok(brief.includes("#102A2E"));
});

test("applyVisualPlanFillPatches forces attach note for Emma", () => {
  const scenes: PodcastVisualPlanSkeletonScene[] = [
    {
      order: 1,
      scriptText: "[EMMA]\nHi Leo.",
      sceneType: "avatar",
      visualPurpose: "",
      visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      duration: 3,
      imagePrompt: "",
      status: "planned",
      pauseAfterMs: null,
      speaker: "teacher",
      visualsFilled: false,
    },
  ];

  const filled = applyVisualPlanFillPatches(scenes, [
    {
      order: 1,
      sceneType: "avatar",
      visualPurpose: "Friendly greeting smile.",
      visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST",
      imagePrompt: "wrong cafe photoreal emma",
      duration: 3,
    },
  ]);

  assert.equal(filled[0]?.imagePrompt, PODCAST_ATTACHED_STILL_IMAGE_PROMPT);
  assert.ok(filled[0]?.visualsFilled);
});

test("music prompts use attach note", () => {
  const prompt = normalizePodcastImagePrompt({
    role: "music",
    visualPurpose: "Soft waveform transition.",
    visualIdea: "MUSIC_BED | COMP_MUSIC_BED",
  });
  assert.equal(prompt, PODCAST_ATTACHED_STILL_IMAGE_PROMPT);
});

test("assemblePodcastPartCoverImagePrompt injects title into cinematic template", () => {
  const prompt = assemblePodcastPartCoverImagePrompt(
    "PART 1 — THE SMALL MISTAKE",
  );
  assert.ok(prompt.startsWith("Create a 16:9 realistic cinematic podcast title card"));
  assert.ok(prompt.includes('"PART 1 — THE SMALL MISTAKE"'));
  assert.ok(!prompt.includes("[PART_TEXT]"));
  assert.ok(prompt.includes("#102A2E"));
  assert.ok(prompt.includes("#F8F3E8"));
  assert.ok(prompt.includes("#061417"));
  assert.ok(prompt.includes("No people."));
  assert.equal(
    prompt,
    PODCAST_PART_COVER_PROMPT_TEMPLATE.replaceAll(
      "[PART_TEXT]",
      "PART 1 — THE SMALL MISTAKE",
    ),
  );
});
