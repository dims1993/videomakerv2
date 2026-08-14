import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  chunkIsAlreadyFilled,
  hashVisualPlanScript,
  mergeVisualPlanHybridCheckpoint,
  mergeVisualPlanSectionCheckpoint,
  type VisualPlanHybridCheckpoint,
  type VisualPlanSectionCheckpoint,
} from "@/lib/visual-plan-checkpoint";
import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";

function scene(
  order: number,
  scriptText: string,
  filled = false,
): PodcastVisualPlanSkeletonScene {
  return {
    order,
    scriptText,
    sceneType: "avatar",
    visualPurpose: filled ? "filled purpose" : "pending",
    visualIdea: filled ? "TEACHER_EMMA | filled" : "TEACHER_EMMA | pending",
    duration: 5,
    imagePrompt: filled ? "filled prompt" : "pending prompt",
    status: "planned",
    pauseAfterMs: null,
    speaker: "teacher",
    visualsFilled: filled,
  };
}

test("mergeVisualPlanHybridCheckpoint restores filled visuals for matching script", () => {
  const skeleton = [scene(1, "Hello"), scene(2, "World")];
  const checkpoint: VisualPlanHybridCheckpoint = {
    version: 1,
    videoId: "v1",
    scriptHash: hashVisualPlanScript("script"),
    channelKey: "podcast-english-lessons",
    chunkSize: 20,
    scenes: [scene(1, "Hello", true), scene(2, "World")],
    updatedAt: new Date().toISOString(),
  };

  const merged = mergeVisualPlanHybridCheckpoint({
    skeleton,
    checkpoint,
    scriptHash: checkpoint.scriptHash,
  });

  assert.equal(merged.resumed, true);
  assert.equal(merged.filledCount, 1);
  assert.equal(merged.scenes[0]?.visualsFilled, true);
  assert.equal(merged.scenes[0]?.imagePrompt, "filled prompt");
  assert.equal(merged.scenes[1]?.visualsFilled, false);
});

test("mergeVisualPlanHybridCheckpoint ignores mismatched script hash", () => {
  const skeleton = [scene(1, "Hello")];
  const checkpoint: VisualPlanHybridCheckpoint = {
    version: 1,
    videoId: "v1",
    scriptHash: "other",
    channelKey: "podcast-english-lessons",
    chunkSize: 20,
    scenes: [scene(1, "Hello", true)],
    updatedAt: new Date().toISOString(),
  };

  const merged = mergeVisualPlanHybridCheckpoint({
    skeleton,
    checkpoint,
    scriptHash: hashVisualPlanScript("script"),
  });

  assert.equal(merged.resumed, false);
  assert.equal(merged.scenes[0]?.visualsFilled, false);
});

test("chunkIsAlreadyFilled skips completed chunk orders", () => {
  const working = [scene(1, "A", true), scene(2, "B", true), scene(3, "C")];
  assert.equal(chunkIsAlreadyFilled([working[0]!, working[1]!], working), true);
  assert.equal(chunkIsAlreadyFilled([working[1]!, working[2]!], working), false);
});

test("hashVisualPlanScript is stable", () => {
  assert.equal(hashVisualPlanScript("abc"), hashVisualPlanScript("abc"));
  assert.notEqual(hashVisualPlanScript("abc"), hashVisualPlanScript("abd"));
});

test("mergeVisualPlanSectionCheckpoint resumes completed sections", () => {
  const checkpoint: VisualPlanSectionCheckpoint = {
    version: 2,
    mode: "section_generate",
    videoId: "v1",
    scriptHash: hashVisualPlanScript("script"),
    channelKey: "the-gods-word",
    sectionIds: ["section-1", "section-2", "section-3"],
    completedSectionIds: ["section-1", "section-2"],
    scenes: [
      {
        order: 1,
        scriptText: "Hello",
        sceneType: "avatar",
        visualPurpose: "open",
        visualIdea: "TEACHING_BOARD | open",
        duration: 6,
        imagePrompt: "prompt",
        status: "planned",
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  const merged = mergeVisualPlanSectionCheckpoint({
    sectionIds: ["section-1", "section-2", "section-3"],
    checkpoint,
    scriptHash: checkpoint.scriptHash,
  });

  assert.equal(merged.resumed, true);
  assert.deepEqual(merged.completedSectionIds, ["section-1", "section-2"]);
  assert.equal(merged.scenes.length, 1);
});

test("mergeVisualPlanSectionCheckpoint ignores fill checkpoints", () => {
  const fillCheckpoint: VisualPlanHybridCheckpoint = {
    version: 1,
    videoId: "v1",
    scriptHash: hashVisualPlanScript("script"),
    channelKey: "podcast-english-lessons",
    chunkSize: 20,
    scenes: [scene(1, "Hello", true)],
    updatedAt: new Date().toISOString(),
  };

  const merged = mergeVisualPlanSectionCheckpoint({
    sectionIds: ["section-1"],
    checkpoint: fillCheckpoint,
    scriptHash: fillCheckpoint.scriptHash,
  });

  assert.equal(merged.resumed, false);
  assert.equal(merged.scenes.length, 0);
});

// Keep fs noise out of repo data/ during unit tests — path helpers stay pure above.
test("tmp sanity for checkpoint directory naming", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vp-cp-"));
  assert.ok(dir.includes("vp-cp-"));
  await fs.rm(dir, { recursive: true, force: true });
});
