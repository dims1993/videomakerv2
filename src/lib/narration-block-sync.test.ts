import assert from "node:assert/strict";
import test from "node:test";

import { buildNarrationBlockPausePlan } from "@/lib/narration-block-sync";
import type { NarrationBlockPlan } from "@/lib/narration-planner";
import { validateNarrationBlockGeneration } from "@/lib/voiceover-block-validation";

function sampleBlock(
  scenes: Array<{ sceneId: string; sortOrder: number; scriptText: string }>,
): NarrationBlockPlan {
  return {
    index: 0,
    blockId: "nb_test",
    provider: "fish",
    voiceKey: "fish:v1",
    voiceId: "v1",
    scenes: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sortOrder: scene.sortOrder,
      scriptText: scene.scriptText,
      spokenText: scene.scriptText,
      ttsText: scene.scriptText,
    })),
    fullText: scenes.map((scene) => scene.scriptText).join(" "),
    estimatedDurationSec: 12,
    charCount: 40,
  };
}

test("buildNarrationBlockPausePlan uses 0ms intra-block", () => {
  const block = sampleBlock([
    { sceneId: "a", sortOrder: 1, scriptText: "Hello." },
    { sceneId: "b", sortOrder: 2, scriptText: "World." },
  ]);
  const plan = buildNarrationBlockPausePlan({
    blocks: [block],
    successfulBlockIds: new Set(["nb_test"]),
    lastSortOrder: 2,
  });
  assert.equal(plan.get("a"), 0);
  assert.ok((plan.get("b") ?? 0) >= 80);
});

test("validateNarrationBlockGeneration rejects slice count mismatch", () => {
  const block = sampleBlock([
    { sceneId: "a", sortOrder: 1, scriptText: "One." },
    { sceneId: "b", sortOrder: 2, scriptText: "Two." },
  ]);
  const result = validateNarrationBlockGeneration({
    block,
    slices: [
      {
        sceneId: "a",
        durationSec: 1.2,
        startTimeSec: 0,
        endTimeSec: 1.2,
      },
    ],
    totalDurationSec: 1.2,
    alignmentConfidence: 0.9,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "slice_count_mismatch"));
});

test("validateNarrationBlockGeneration accepts healthy block", () => {
  const block = sampleBlock([
    { sceneId: "a", sortOrder: 1, scriptText: "Hello there." },
    { sceneId: "b", sortOrder: 2, scriptText: "How are you?" },
  ]);
  block.estimatedDurationSec = 2.7;
  const result = validateNarrationBlockGeneration({
    block,
    slices: [
      {
        sceneId: "a",
        durationSec: 1.5,
        startTimeSec: 0,
        endTimeSec: 1.5,
      },
      {
        sceneId: "b",
        durationSec: 1.2,
        startTimeSec: 1.5,
        endTimeSec: 2.7,
      },
    ],
    totalDurationSec: 2.7,
    alignmentConfidence: 0.88,
  });
  assert.equal(result.ok, true);
});

test("validateNarrationBlockGeneration ignores duration estimate drift", () => {
  const block = sampleBlock([
    { sceneId: "a", sortOrder: 1, scriptText: "Hello there friend." },
    { sceneId: "b", sortOrder: 2, scriptText: "How are you today?" },
  ]);
  block.estimatedDurationSec = 19.98;
  const result = validateNarrationBlockGeneration({
    block,
    slices: [
      {
        sceneId: "a",
        durationSec: 3.2,
        startTimeSec: 0,
        endTimeSec: 3.2,
      },
      {
        sceneId: "b",
        durationSec: 3.4,
        startTimeSec: 3.2,
        endTimeSec: 6.6,
      },
    ],
    totalDurationSec: 6.56,
    alignmentConfidence: 0.95,
  });
  assert.equal(result.ok, true);
  assert.ok(
    !result.issues.some((issue) => issue.code === "duration_drift"),
  );
  assert.ok(
    !result.issues.some((issue) => issue.code === "abnormal_speech_rate"),
  );
});
