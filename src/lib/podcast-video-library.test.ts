import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSectionClipVisualIdea,
  parsePodcastSectionClipLabel,
} from "@/lib/podcast-video-library-shared";
import { buildPodcastVisualPlanSkeleton } from "@/lib/visual-plan-skeleton";
import { isPartCoverVisualIdea } from "@/lib/podcast-part-covers";

test("parsePodcastSectionClipLabel accepts bracket and bare forms", () => {
  assert.equal(parsePodcastSectionClipLabel("[INTRO]"), "INTRO");
  assert.equal(parsePodcastSectionClipLabel("LESSON"), "LESSON");
  assert.equal(parsePodcastSectionClipLabel("[FINAL]"), "FINAL");
  assert.equal(parsePodcastSectionClipLabel("[CLOSING]"), "CLOSING");
  assert.equal(parsePodcastSectionClipLabel("COLD OPEN"), null);
});

test("skeleton creates SECTION_CLIP inserts with empty scriptText", () => {
  const script = `[INTRO]
[EMMA]
Hello.
[LESSON]
[PART 1 - SAYING YOUR NAME]
[EMMA]
My name is Emma.
[CLOSING]
[EMMA]
Well done.
[FINAL]
[EMMA]
Bye.
`;
  const skeleton = buildPodcastVisualPlanSkeleton(script);
  const tags = skeleton.scenes
    .filter((scene) => scene.visualIdea.startsWith("SECTION_CLIP |"))
    .map((scene) => scene.visualIdea);
  assert.deepEqual(tags, [
    buildSectionClipVisualIdea("INTRO"),
    buildSectionClipVisualIdea("LESSON"),
    buildSectionClipVisualIdea("CLOSING"),
    buildSectionClipVisualIdea("FINAL"),
  ]);
  for (const scene of skeleton.scenes) {
    if (scene.visualIdea.startsWith("SECTION_CLIP |")) {
      assert.equal(scene.scriptText, "");
      assert.equal(scene.sceneType, "insert");
    }
  }
  const cover = skeleton.scenes.find((scene) =>
    isPartCoverVisualIdea(scene.visualIdea),
  );
  assert.equal(cover?.scriptText, "Part 1. Saying your name.");
});
