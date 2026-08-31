import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContinuityGroups,
  planContinuityGroupSlices,
} from "./voiceover-continuity-groups";

test("buildContinuityGroups chains incomplete→continuation with same voice", () => {
  const groups = buildContinuityGroups([
    {
      id: "1",
      scriptText: "Few sentences create more tension than",
      spokenText: "Few sentences create more tension than",
      voiceKey: "v1",
    },
    {
      id: "2",
      scriptText: "the one James writes near the middle.",
      spokenText: "the one James writes near the middle.",
      voiceKey: "v1",
    },
    {
      id: "3",
      scriptText: "That is the whole question.",
      spokenText: "That is the whole question.",
      voiceKey: "v1",
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups[0]!.scenes.map((s) => s.id),
    ["1", "2"],
  );
  assert.deepEqual(
    groups[1]!.scenes.map((s) => s.id),
    ["3"],
  );
});

test("buildContinuityGroups breaks on voice change", () => {
  const groups = buildContinuityGroups([
    {
      id: "1",
      scriptText: "Paul says we are saved by grace through faith,",
      spokenText: "Paul says we are saved by grace through faith,",
      voiceKey: "a",
    },
    {
      id: "2",
      scriptText: "and this is not our own doing.",
      spokenText: "and this is not our own doing.",
      voiceKey: "b",
    },
  ]);
  assert.equal(groups.length, 2);
});

test("planContinuityGroupSlices gives B the full gap so next-word onset is not in A", () => {
  const words = [
    { word: "few", start: 0.0, end: 0.3 },
    { word: "sentences", start: 0.3, end: 0.8 },
    { word: "than", start: 0.8, end: 1.1 },
    { word: "the", start: 1.4, end: 1.55 },
    { word: "one", start: 1.55, end: 1.8 },
    { word: "james", start: 1.8, end: 2.2 },
  ];
  const slices = planContinuityGroupSlices({
    words,
    scenes: [
      { id: "a", spokenText: "few sentences than" },
      { id: "b", spokenText: "the one james" },
    ],
    totalDurationSec: 2.4,
  });
  assert.ok(slices);
  assert.equal(slices!.length, 2);
  assert.equal(slices![0]!.startSec, 0);
  // Wide gap (1.1 → 1.4): cut at prev.end so A has no slice of "the".
  assert.ok(Math.abs(slices![1]!.startSec - 1.1) < 0.001);
  assert.ok(
    Math.abs(slices![0]!.durationSec - 1.1) < 0.001,
    "A must end at previous word end, not bleed into B onset",
  );
});

test("planContinuityGroupSlices on tiny gap cuts at previous word end", () => {
  const words = [
    { word: "than", start: 0.0, end: 0.3 },
    { word: "the", start: 0.32, end: 0.4 },
    { word: "one", start: 0.4, end: 0.55 },
  ];
  const slices = planContinuityGroupSlices({
    words,
    scenes: [
      { id: "a", spokenText: "than" },
      { id: "b", spokenText: "the one" },
    ],
    totalDurationSec: 0.6,
  });
  assert.ok(slices);
  // 20ms gap → cut at prev.end so B keeps the full "the" attack.
  assert.ok(Math.abs(slices![1]!.startSec - 0.3) < 0.001);
});

test("planContinuityGroupSlices on overlapping stamps does not put B body into A", () => {
  const words = [
    { word: "than", start: 0.0, end: 0.45 },
    { word: "the", start: 0.4, end: 0.55 },
    { word: "one", start: 0.55, end: 0.7 },
  ];
  const slices = planContinuityGroupSlices({
    words,
    scenes: [
      { id: "a", spokenText: "than" },
      { id: "b", spokenText: "the one" },
    ],
    totalDurationSec: 0.75,
  });
  assert.ok(slices);
  // prevEnd (0.45) > bStart (0.4) → cut at bStart, not prevEnd.
  assert.ok(Math.abs(slices![1]!.startSec - 0.4) < 0.001);
  assert.ok(slices![0]!.durationSec <= 0.4 + 0.001);
});

test("planContinuityGroupSlices returns null on garbage alignment", () => {
  const slices = planContinuityGroupSlices({
    words: [{ word: "nope", start: 0, end: 0.2 }],
    scenes: [
      { id: "a", spokenText: "few sentences than" },
      { id: "b", spokenText: "the one james" },
    ],
    totalDurationSec: 2,
  });
  assert.equal(slices, null);
});
