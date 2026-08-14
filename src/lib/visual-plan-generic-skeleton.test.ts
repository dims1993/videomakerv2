import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGenericVisualPlanSkeleton,
  packSentencesIntoBeats,
} from "./visual-plan-generic-skeleton";

describe("visual-plan-generic-skeleton", () => {
  it("packs short sentences into beats", () => {
    const beats = packSentencesIntoBeats([
      "One two three four five.",
      "Six seven eight nine ten.",
      "Eleven twelve thirteen.",
    ]);
    assert.ok(beats.length >= 1);
    assert.ok(beats.every((beat) => beat.length > 0));
  });

  it("builds scenes from labeled script without speaking markers", () => {
    const skeleton = buildGenericVisualPlanSkeleton(`
[INTRODUCTION]

Jesus chose twelve men to walk with Him.

They heard His voice when the crowds only heard the sermon.

[CHAPTER COVER — GENESIS 3]

When the woman saw that the tree was good for food, she took some of its fruit and ate.
`);

    assert.ok(skeleton.scenes.length >= 2);
    assert.ok(
      skeleton.scenes.every(
        (scene) =>
          !scene.scriptText.includes("[INTRODUCTION]") &&
          !scene.scriptText.includes("CHAPTER COVER"),
      ),
    );
    assert.ok(
      skeleton.scenes.some((scene) =>
        scene.scriptText.includes("Jesus chose twelve"),
      ),
    );
    assert.ok(
      skeleton.scenes.some((scene) =>
        scene.scriptText.toLowerCase().includes("tree was good"),
      ),
    );
    assert.equal(skeleton.scenes[0]?.visualsFilled, false);
    assert.match(skeleton.scenes[0]?.visualIdea ?? "", /^Narrative scene:/);
  });
});
