import assert from "node:assert/strict";

import {
  sortExistingScenesForUpwardShift,
  sortScenesByOptionalOrder,
  shiftedSortOrdersAfterPrepend,
} from "@/lib/scene-prepend";
import {
  buildScenePatchApplyItems,
  buildScenePatchPrependItems,
  buildScenePatchPreview,
  isPrependPatchOrder,
} from "@/lib/scene-patch";

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test("negative orders are prepend markers", () => {
  assert.equal(isPrependPatchOrder(-1), true);
  assert.equal(isPrependPatchOrder(-16), true);
  assert.equal(isPrependPatchOrder(1), false);
  assert.equal(isPrependPatchOrder(0), false);
  assert.equal(isPrependPatchOrder(undefined), false);
});

test("sortScenesByOptionalOrder sorts negatives before positives", () => {
  const sorted = sortScenesByOptionalOrder([
    { order: 2, label: "b" },
    { order: -2, label: "a" },
    { order: 1, label: "c" },
    { order: -1, label: "d" },
  ]);
  assert.deepEqual(
    sorted.map((scene) => scene.label),
    ["a", "d", "c", "b"],
  );
});

test("shiftedSortOrdersAfterPrepend preserves relative order", () => {
  assert.deepEqual(shiftedSortOrdersAfterPrepend([1, 2, 20], 16), [17, 18, 36]);
});

test("sortExistingScenesForUpwardShift goes high to low", () => {
  const sorted = sortExistingScenesForUpwardShift([
    { id: "a", sortOrder: 1 },
    { id: "b", sortOrder: 20 },
    { id: "c", sortOrder: 5 },
  ]);
  assert.deepEqual(
    sorted.map((scene) => scene.id),
    ["b", "c", "a"],
  );
});

test("scene patch preview accepts negative orders as prepend inserts", () => {
  const preview = buildScenePatchPreview({
    rawText: JSON.stringify([
      {
        order: -2,
        scriptText: "New opening beat.",
        sceneType: "avatar",
        visualIdea: "A believer opens a Bible.",
        duration: 4,
      },
      {
        order: -1,
        scriptText: "Second new beat.",
        sceneType: "insert",
        visualIdea: "A closed door.",
        duration: 4,
      },
      {
        order: 1,
        visualIdea: "Updated existing scene.",
        imagePrompt: "Updated prompt",
      },
    ]),
    scenes: [
      {
        id: "scene-1",
        order: 1,
        scriptText: "Old scene one",
        visualIdea: "Old idea",
        imagePrompt: "Old prompt",
        hasGeneratedImage: true,
      },
      {
        id: "scene-20",
        order: 20,
        scriptText: "Old scene twenty",
        visualIdea: "Keep me",
        imagePrompt: "Keep prompt",
        hasGeneratedImage: true,
      },
    ],
    channelKey: "the-gods-word",
    currentVideoId: "video-1",
    allowScriptTextChanges: false,
  });

  assert.equal(preview.prependCount, 2);
  assert.equal(preview.validCount, 3);
  assert.equal(preview.invalidCount, 0);
  assert.equal(
    preview.rows.filter((row) => row.matchStatus === "insert_prepend").length,
    2,
  );
  assert.equal(
    preview.rows.filter((row) => row.matchStatus === "matched").length,
    1,
  );

  const updates = buildScenePatchApplyItems(preview, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.sceneId, "scene-1");
  assert.equal(updates[0]?.fields.visualIdea, "Updated existing scene.");

  const prepends = buildScenePatchPrependItems(preview);
  assert.equal(prepends.length, 2);
  assert.equal(prepends[0]?.scriptText, "New opening beat.");
  assert.equal(prepends[1]?.scriptText, "Second new beat.");
  assert.equal(prepends[0]?.sourceOrder, -2);
  assert.equal(prepends[1]?.sourceOrder, -1);
});

test("prepend without scriptText is invalid", () => {
  const preview = buildScenePatchPreview({
    rawText: JSON.stringify([{ order: -1, visualIdea: "Missing narration" }]),
    scenes: [
      {
        id: "scene-1",
        order: 1,
        scriptText: "Existing",
        visualIdea: null,
        imagePrompt: null,
      },
    ],
    channelKey: "the-gods-word",
    currentVideoId: "video-1",
    allowScriptTextChanges: true,
  });

  assert.equal(preview.prependCount, 0);
  assert.equal(preview.invalidCount, 1);
  assert.equal(preview.rows[0]?.matchStatus, "invalid_patch_item");
});

console.log("All scene-prepend / scene-patch prepend tests passed.");
