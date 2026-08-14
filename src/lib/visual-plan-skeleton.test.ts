import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVisualPlanFillPatches,
  isVisualPlanMegaSceneCollapse,
  isVisualPlanOutputTooLarge,
  slimHybridVisualPlanContext,
  validateVisualPlanFillResponse,
} from "@/lib/visual-plan-fill";
import {
  buildPodcastVisualPlanSkeleton,
  chunkPodcastSkeletonScenes,
  skeletonScenesToImportJson,
} from "@/lib/visual-plan-skeleton";

const SAMPLE_SCRIPT = `COLD OPEN
[MUSIC: begin]
[EMMA]
You understand simple English.
You know words like hello.
[LEO]
Completely blank.
[PAUSE: 2s]
[EMMA]
Today, that changes.
[LEO]
Not tomorrow?
[EMMA]
No, Leo. Today.
[MUSIC: fade]
`;

test("buildPodcastVisualPlanSkeleton creates one scene per spoken turn plus music", () => {
  const skeleton = buildPodcastVisualPlanSkeleton(SAMPLE_SCRIPT);
  assert.equal(skeleton.musicBedCount, 2);
  assert.ok(skeleton.spokenTurnCount >= 5);
  assert.equal(skeleton.scenes[0]?.speaker, "music");
  assert.equal(skeleton.scenes[0]?.scriptText, "");
  assert.match(skeleton.scenes[0]?.visualIdea ?? "", /^MUSIC_BED \|/);

  const emma = skeleton.scenes.find(
    (scene) => scene.scriptText.includes("You understand simple English"),
  );
  assert.ok(emma);
  assert.equal(emma?.speaker, "teacher");
  assert.match(emma?.visualIdea ?? "", /^TEACHER_EMMA \|/);

  const afterBlank = skeleton.scenes.find(
    (scene) => scene.scriptText === "Completely blank.",
  );
  assert.equal(afterBlank?.pauseAfterMs, 2000);
});

test("chunkPodcastSkeletonScenes splits into fixed sizes", () => {
  const scenes = Array.from({ length: 45 }, (_, index) => ({ order: index + 1 }));
  const chunks = chunkPodcastSkeletonScenes(scenes, 20);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]?.length, 20);
  assert.equal(chunks[1]?.length, 20);
  assert.equal(chunks[2]?.length, 5);
});

test("validateVisualPlanFillResponse accepts compact patches", () => {
  const validation = validateVisualPlanFillResponse(
    JSON.stringify([
      {
        order: 2,
        sceneType: "avatar",
        visualPurpose: "Emma teaches warmly.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: warm host medium",
        imagePrompt: "Soft semi-flat 2D editorial Emma at desk.",
        duration: 8,
      },
    ]),
    [2],
  );
  assert.equal(validation.ok, true);
  assert.equal(validation.patches[0]?.order, 2);
});

test("validateVisualPlanFillResponse flags too-large refusals", () => {
  const validation = validateVisualPlanFillResponse(
    JSON.stringify([
      {
        error:
          "I could not return the complete full-video scenes JSON inline in this chat message because the generated JSON array is too large to paste reliably without truncation.",
      },
    ]),
    [1],
  );
  // Parsed array but missing required fill fields / unexpected shape → not ok.
  // Explicit too-large string form:
  const refusal = validateVisualPlanFillResponse(
    '[{"error":"I could not return the complete full-video scenes JSON inline because the generated JSON array is too large to paste reliably without truncation."}]',
    [1],
  );
  assert.equal(refusal.tooLarge, true);
  assert.equal(refusal.ok, false);
  assert.equal(validation.ok, false);
});

test("isVisualPlanOutputTooLarge detects refusal copy", () => {
  assert.equal(
    isVisualPlanOutputTooLarge(
      "I could not return the complete full-video scenes JSON inline without truncation.",
    ),
    true,
  );
  assert.equal(isVisualPlanOutputTooLarge('[{"order":1}]'), false);
});

test("isVisualPlanMegaSceneCollapse catches single giant scene", () => {
  assert.equal(
    isVisualPlanMegaSceneCollapse([
      { scriptText: "word ".repeat(400) },
    ]),
    true,
  );
  assert.equal(
    isVisualPlanMegaSceneCollapse([
      { scriptText: "Short." },
      { scriptText: "Also short." },
    ]),
    false,
  );
});

test("applyVisualPlanFillPatches merges by order and keeps scriptText", () => {
  const skeleton = buildPodcastVisualPlanSkeleton(SAMPLE_SCRIPT);
  const target = skeleton.scenes.find((scene) => scene.speaker === "teacher");
  assert.ok(target);
  const merged = applyVisualPlanFillPatches(skeleton.scenes, [
    {
      order: target!.order,
      visualPurpose: "Emma opens the lesson.",
      visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: confident host",
      imagePrompt: "Updated image prompt for Emma.",
      duration: 9,
    },
  ]);
  const updated = merged.find((scene) => scene.order === target!.order);
  assert.equal(updated?.scriptText, target?.scriptText);
  assert.equal(updated?.visualPurpose, "Emma opens the lesson.");
  assert.equal(updated?.visualsFilled, true);
  assert.equal(updated?.duration, 9);
  assert.ok(updated?.imagePrompt.includes("voluminous curly chestnut-brown"));
  assert.ok(updated?.imagePrompt.toLowerCase().includes("no visible text"));
  assert.ok(updated?.imagePrompt.includes("Emma opens the lesson"));
});

test("skeletonScenesToImportJson keeps pauseAfterMs", () => {
  const skeleton = buildPodcastVisualPlanSkeleton(SAMPLE_SCRIPT);
  const json = skeletonScenesToImportJson(skeleton.scenes);
  const parsed = JSON.parse(json) as Array<{ pauseAfterMs?: number }>;
  assert.ok(parsed.some((scene) => scene.pauseAfterMs === 2000));
});

test("slimHybridVisualPlanContext drops Current Video Data script blob", () => {
  const full = [
    "# Channel Profile",
    "",
    "Podcast English Lessons",
    "",
    "---",
    "",
    "# Visual Planner Prompt",
    "",
    "Use flat 2D studio continuity.",
    "",
    "---",
    "",
    "# Current Video Data",
    "",
    JSON.stringify({ script: "x".repeat(50_000) }, null, 2),
  ].join("\n");

  const slim = slimHybridVisualPlanContext(full);
  assert.ok(slim.includes("flat 2D studio continuity"));
  assert.ok(!slim.includes("Current Video Data"));
  assert.ok(slim.length < 5_000);
});
