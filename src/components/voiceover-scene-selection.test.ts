import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countVoiceoverSceneSelectSet,
  matchesVoiceoverSceneSelectSet,
} from "./voiceover-scene-selection";

const scenes = [
  {
    sortOrder: 1,
    sceneType: "avatar",
    visualIdea: "TEACHER_EMMA | COMP: Emma greets.",
    pauseAfterMs: null,
  },
  {
    sortOrder: 2,
    sceneType: "avatar",
    visualIdea: "STUDENT_LEO | COMP: Leo answers.",
    pauseAfterMs: 0,
  },
  {
    sortOrder: 3,
    sceneType: "insert",
    visualIdea: "Chapter cover: Part 1",
    pauseAfterMs: 80,
  },
  {
    sortOrder: 99,
    sceneType: "avatar",
    visualIdea: "STUDENT_LEO | COMP: Leo far down the list.",
    pauseAfterMs: null,
  },
];

test("matchesVoiceoverSceneSelectSet finds Leo across full scene list", () => {
  assert.equal(countVoiceoverSceneSelectSet(scenes, "leo"), 2);
  assert.deepEqual(
    scenes.filter((scene) => matchesVoiceoverSceneSelectSet(scene, "leo")).map(
      (scene) => scene.sortOrder,
    ),
    [2, 99],
  );
});

test("matchesVoiceoverSceneSelectSet finds Emma teacher scenes", () => {
  assert.equal(countVoiceoverSceneSelectSet(scenes, "emma"), 1);
});
