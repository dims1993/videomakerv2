import assert from "node:assert/strict";
import { test } from "node:test";

import { validateHandoffScenes } from "@/lib/chatgpt-scene-handoff";
import {
  foldPauseCardScenesIntoPauseAfterMs,
  pauseSecondsToMs,
} from "@/lib/podcast-pause-cues";

test("pauseSecondsToMs converts cue seconds to voiceover pauseAfterMs", () => {
  assert.equal(pauseSecondsToMs(2), 2000);
  assert.equal(pauseSecondsToMs(3), 3000);
  assert.equal(pauseSecondsToMs(8), 8000);
});

test("foldPauseCardScenesIntoPauseAfterMs attaches pause to previous spoken scene", () => {
  const { scenes, foldedCount } = foldPauseCardScenesIntoPauseAfterMs([
    {
      scriptText: "Today, that changes.",
      visualIdea: "TEACHER_EMMA: studio",
      duration: 3,
    },
    {
      scriptText: "",
      visualIdea: "PAUSE_CARD: soft studio background",
      duration: 2,
    },
    {
      scriptText: "",
      visualIdea: "MUSIC_BED: waveform",
      duration: 2,
    },
  ]);

  assert.equal(foldedCount, 1);
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0]?.pauseAfterMs, 2000);
  assert.match(scenes[1]?.visualIdea ?? "", /^MUSIC_BED:/i);
});

test("handoff validation folds PAUSE_CARD and keeps MUSIC_BED empty script", () => {
  const result = validateHandoffScenes([
    {
      order: 1,
      scriptText: "Today, that changes.",
      sceneType: "avatar",
      visualPurpose: "Emma closes the beat.",
      visualIdea: "TEACHER_EMMA: medium shot",
      duration: 3,
      imagePrompt: "Clean illustration of a teacher speaking.",
      status: "planned",
    },
    {
      order: 2,
      scriptText: "",
      sceneType: "space",
      visualPurpose: "Learner repeat window.",
      visualIdea: "PAUSE_CARD: soft studio",
      duration: 2,
      imagePrompt: "Soft studio background.",
      status: "planned",
    },
    {
      order: 3,
      scriptText: "",
      sceneType: "insert",
      visualPurpose: "Soft music fade.",
      visualIdea: "MUSIC_BED: waveform",
      duration: 2,
      imagePrompt: "Abstract waveform.",
      status: "planned",
    },
  ]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.scenes.length, 2);
  assert.equal(result.scenes[0]?.pauseAfterMs, 2000);
  assert.equal(result.scenes[0]?.scriptText, "Today, that changes.");
  assert.match(result.scenes[1]?.visualIdea ?? "", /^MUSIC_BED:/i);
  assert.equal(result.scenes[1]?.scriptText, "");
});

test("handoff accepts explicit pauseAfterMs on spoken scenes", () => {
  const result = validateHandoffScenes([
    {
      order: 1,
      scriptText: "Listen and repeat.",
      sceneType: "avatar",
      visualPurpose: "Prompt.",
      visualIdea: "TEACHER_EMMA: studio",
      duration: 3,
      imagePrompt: "Teacher speaking.",
      status: "planned",
      pauseAfterMs: 3000,
    },
  ]);

  assert.equal(result.errors.length, 0);
  assert.equal(result.scenes[0]?.pauseAfterMs, 3000);
});
