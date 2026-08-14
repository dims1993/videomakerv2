import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupScenesBySelectableStructure,
  isSelectableStructureStartLabel,
  splitScriptIntoSelectableStructureSections,
} from "@/lib/scene-structure-selection";

test("isSelectableStructureStartLabel covers podcast and chapter markers", () => {
  assert.equal(isSelectableStructureStartLabel("INTRO"), true);
  assert.equal(isSelectableStructureStartLabel("PART 1 - Saying Your Name"), true);
  assert.equal(isSelectableStructureStartLabel("CHAPTER 2 — Title"), true);
  assert.equal(isSelectableStructureStartLabel("CLOSING"), true);
  assert.equal(isSelectableStructureStartLabel("EMMA"), false);
  assert.equal(isSelectableStructureStartLabel("PAUSE: 3s"), false);
});

test("splitScriptIntoSelectableStructureSections finds podcast spine", () => {
  const sections = splitScriptIntoSelectableStructureSections(`[INTRO]
Hello.

[LESSON]
Lesson body.

[PART 1 - SAYING YOUR NAME]
Practice.

[CLOSING]
Bye.

[FINAL]
Thanks.`);

  assert.deepEqual(
    sections.map((section) => section.label),
    ["INTRO", "LESSON", "PART 1 - SAYING YOUR NAME", "CLOSING", "FINAL"],
  );
});

test("groupScenesBySelectableStructure selects by part and section clips", () => {
  const script = `[INTRO]
Welcome.

[PART 1 - NAMES]
My name is Emma.

[PART 2 - WORK]
I work here.

[CLOSING]
See you.`;

  const { groups } = groupScenesBySelectableStructure({
    script,
    scenes: [
      {
        id: "intro-clip",
        sortOrder: 1,
        scriptText: "",
        visualIdea: "SECTION_CLIP | INTRO: episode intro bumper",
      },
      {
        id: "intro-line",
        sortOrder: 2,
        scriptText: "Welcome.",
        visualIdea: "TEACHER_EMMA | greeting",
      },
      {
        id: "part1-cover",
        sortOrder: 3,
        scriptText: "Part 1. Saying your name.",
        visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — NAMES",
      },
      {
        id: "part1-line",
        sortOrder: 4,
        scriptText: "My name is Emma.",
        visualIdea: "TEACHER_EMMA | model",
      },
      {
        id: "part2-line",
        sortOrder: 5,
        scriptText: "I work here.",
        visualIdea: "STUDENT_LEO | answer",
      },
      {
        id: "closing-line",
        sortOrder: 6,
        scriptText: "See you.",
        visualIdea: "TEACHER_EMMA | bye",
      },
    ],
  });

  const byLabel = Object.fromEntries(
    groups.map((group) => [group.label, group.sceneIds]),
  );

  assert.deepEqual(byLabel.INTRO, ["intro-clip", "intro-line"]);
  assert.deepEqual(byLabel["PART 1 - NAMES"], ["part1-cover", "part1-line"]);
  assert.deepEqual(byLabel["PART 2 - WORK"], ["part2-line"]);
  assert.deepEqual(byLabel.CLOSING, ["closing-line"]);
});
