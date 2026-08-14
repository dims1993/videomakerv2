import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyManualSectionRanges,
  classifyScriptSectionLabel,
  detectVoiceoverGroupingMode,
  filterVoiceoverGroupsForMode,
  groupScenesByScriptSection,
  parseScriptSections,
  summarizeSceneSections,
} from "@/lib/script-sections";

const SAMPLE_SCRIPT = `[INTRODUCTION]

Welcome to Day 1.

[CHAPTER COVER — GENESIS 1]

Genesis, chapter 1.

In the beginning God created the heavens and the earth.

[REFLECTION AND PRAYER]

Let's reflect before we pray.

Pray with me.

[CLOSING]

May God's Word remain with you.`;

test("parseScriptSections detects bible-in-one-year labels", () => {
  const sections = parseScriptSections(SAMPLE_SCRIPT);
  assert.equal(sections.length, 4);
  assert.equal(sections[0]?.kind, "introduction");
  assert.equal(sections[1]?.kind, "lecture");
  assert.equal(sections[2]?.kind, "reflection_prayer");
  assert.equal(sections[3]?.kind, "closing");
});

test("parseScriptSections detects podcast teacher/student turns and skips cues", () => {
  const script = `## COLD OPEN

[MUSIC: begin]

[EMMA]
You understand simple English.

[PAUSE: 2s]

[LEO]
My mind goes completely blank.

[EMMA]
[laughs]
Today, that changes.

[MUSIC: fade]
`;

  const sections = parseScriptSections(script);
  assert.equal(sections.length, 3);
  assert.equal(sections[0]?.label, "EMMA");
  assert.equal(sections[0]?.kind, "teacher");
  assert.equal(sections[1]?.label, "LEO");
  assert.equal(sections[1]?.kind, "student");
  assert.equal(sections[2]?.label, "EMMA");
  assert.equal(sections[2]?.kind, "teacher");
});

test("classifyScriptSectionLabel maps podcast speaker aliases", () => {
  assert.equal(classifyScriptSectionLabel("TEACHER"), "teacher");
  assert.equal(classifyScriptSectionLabel("HOST"), "teacher");
  assert.equal(classifyScriptSectionLabel("STUDENT"), "student");
  assert.equal(classifyScriptSectionLabel("GUEST"), "student");
});

test("groupScenesByScriptSection maps podcast dialogue to teacher/student", () => {
  const script = `[EMMA]
Hello everyone.

[LEO]
Hello Emma.

[EMMA]
Let's begin.
`;

  const assignments = groupScenesByScriptSection({
    script,
    scenes: [
      { sortOrder: 1, scriptText: "Hello everyone." },
      { sortOrder: 2, scriptText: "Hello Emma." },
      { sortOrder: 3, scriptText: "Let's begin." },
    ],
  });

  assert.deepEqual(
    assignments.map((assignment) => assignment.sectionKind),
    ["teacher", "student", "teacher"],
  );
});

test("groupScenesByScriptSection maps scenes to section kinds", () => {
  const assignments = groupScenesByScriptSection({
    script: SAMPLE_SCRIPT,
    scenes: [
      { sortOrder: 1, scriptText: "Welcome to Day 1." },
      { sortOrder: 2, scriptText: "Genesis, chapter 1." },
      { sortOrder: 3, scriptText: "In the beginning God created the heavens and the earth." },
      { sortOrder: 4, scriptText: "Let's reflect before we pray." },
      { sortOrder: 5, scriptText: "May God's Word remain with you." },
    ],
  });

  assert.deepEqual(
    assignments.map((assignment) => assignment.sectionKind),
    ["introduction", "lecture", "lecture", "reflection_prayer", "closing"],
  );
});

test("applyManualSectionRanges extends introduction when user overrides end scene", () => {
  const auto = groupScenesByScriptSection({
    script: SAMPLE_SCRIPT,
    scenes: [
      { sortOrder: 1, scriptText: "Welcome to Day 1." },
      { sortOrder: 2, scriptText: "Genesis, chapter 1." },
      { sortOrder: 3, scriptText: "In the beginning God created the heavens and the earth." },
      { sortOrder: 4, scriptText: "Let's reflect before we pray." },
      { sortOrder: 5, scriptText: "May God's Word remain with you." },
    ],
  });

  const manual = applyManualSectionRanges({
    autoAssignments: auto,
    ranges: {
      introduction: { startSortOrder: 1, endSortOrder: 2 },
      lecture: { startSortOrder: 3, endSortOrder: 3 },
    },
  });

  assert.deepEqual(
    manual.map((assignment) => assignment.sectionKind),
    ["introduction", "introduction", "lecture", "reflection_prayer", "closing"],
  );
});

test("applyManualSectionRanges does not smear interleaved teacher/student roles", () => {
  const auto = groupScenesByScriptSection({
    script: `[EMMA]
Hello everyone.

[LEO]
Hello Emma.

[EMMA]
Let's begin.
`,
    scenes: [
      { sortOrder: 1, scriptText: "Hello everyone." },
      { sortOrder: 2, scriptText: "Hello Emma." },
      { sortOrder: 3, scriptText: "Let's begin." },
    ],
  });

  // Contiguous ranges that would previously overwrite Leo with Emma's voice.
  const manual = applyManualSectionRanges({
    autoAssignments: auto,
    ranges: {
      teacher: { startSortOrder: 1, endSortOrder: 3 },
      student: { startSortOrder: 2, endSortOrder: 2 },
    },
  });

  assert.deepEqual(
    manual.map((assignment) => assignment.sectionKind),
    ["teacher", "student", "teacher"],
  );
});

test("groupScenesByScriptSection uses visualIdea when scriptText is empty music bed", () => {
  const assignments = groupScenesByScriptSection({
    script: `[MUSIC: begin]

[EMMA]
Hello.

[LEO]
Hi.
`,
    scenes: [
      {
        sortOrder: 1,
        scriptText: "",
        visualIdea: "MUSIC_BED | COMP_MUSIC_BED: studio insert",
      },
      {
        sortOrder: 2,
        scriptText: "Hello.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: greeting",
      },
      {
        sortOrder: 3,
        scriptText: "Hi.",
        visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT: reply",
      },
    ],
  });

  assert.deepEqual(
    assignments.map((assignment) => assignment.sectionKind),
    ["other", "teacher", "student"],
  );
});

test("parseScriptSections keeps CRLF indexes aligned with script text", () => {
  const script = [
    "[LEO]",
    "Not next week?",
    "[EMMA]",
    "No.",
    "[LEO]",
    "Not tomorrow?",
    "[EMMA]",
    "No, Leo.",
    "Today.",
  ].join("\r\n");

  const sections = parseScriptSections(script);
  const needle = "Not tomorrow?";
  const index = script.indexOf(needle);
  const section = sections.find(
    (entry) => index >= entry.startIndex && index < entry.endIndex,
  );

  assert.equal(section?.label, "LEO");
  assert.equal(section?.kind, "student");
});

test("groupScenesByScriptSection prefers visualIdea speaker over drifted script match", () => {
  const script = [
    "[LEO]",
    "Not next week?",
    "[EMMA]",
    "No.",
    "[LEO]",
    "Not tomorrow?",
    "[EMMA]",
    "No, Leo.",
    "Today.",
  ].join("\r\n");

  const assignments = groupScenesByScriptSection({
    script,
    scenes: [
      {
        sortOrder: 7,
        scriptText: "Not next week?",
        visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT: ask",
      },
      {
        sortOrder: 8,
        scriptText: "No.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: answer",
      },
      {
        sortOrder: 9,
        scriptText: "Not tomorrow?",
        visualIdea: "STUDENT_LEO | COMP_LEO_STUDENT: ask again",
      },
      {
        sortOrder: 10,
        scriptText: "No, Leo. Today.",
        visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: close",
      },
    ],
  });

  assert.deepEqual(
    assignments.map((assignment) => assignment.sectionKind),
    ["student", "teacher", "student", "teacher"],
  );
});

test("detectVoiceoverGroupingMode switches on speaker kinds", () => {
  assert.equal(
    detectVoiceoverGroupingMode([
      {
        sortOrder: 1,
        sectionId: "a",
        sectionLabel: "EMMA",
        sectionKind: "teacher",
      },
    ]),
    "speakers",
  );
  assert.equal(
    detectVoiceoverGroupingMode([
      {
        sortOrder: 1,
        sectionId: "a",
        sectionLabel: "INTRODUCTION",
        sectionKind: "introduction",
      },
    ]),
    "sections",
  );
});

test("summarizeSceneSections hides empty bible sections", () => {
  const summary = summarizeSceneSections([
    {
      sortOrder: 1,
      sectionId: "a",
      sectionLabel: "EMMA",
      sectionKind: "teacher",
    },
    {
      sortOrder: 2,
      sectionId: "b",
      sectionLabel: "LEO",
      sectionKind: "student",
    },
  ]);

  assert.deepEqual(
    summary.map((group) => group.kind),
    ["teacher", "student"],
  );
});

test("filterVoiceoverGroupsForMode keeps only speakers in speakers mode", () => {
  const summary = summarizeSceneSections([
    {
      sortOrder: 1,
      sectionId: "a",
      sectionLabel: "EMMA",
      sectionKind: "teacher",
    },
    {
      sortOrder: 2,
      sectionId: "b",
      sectionLabel: "Music / cue",
      sectionKind: "other",
    },
  ]);

  assert.deepEqual(
    filterVoiceoverGroupsForMode(summary, "speakers").map((group) => group.kind),
    ["teacher"],
  );
  assert.deepEqual(
    filterVoiceoverGroupsForMode(summary, "sections").map((group) => group.kind),
    ["teacher", "other"],
  );
});

test("classifyScriptSectionLabel handles chapter cover variants", () => {
  assert.equal(
    classifyScriptSectionLabel("CHAPTER COVER — GENESIS 1"),
    "lecture",
  );
});
