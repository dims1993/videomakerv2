import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findStructuralMarkersInScriptText,
  normalizeForScriptCoverage,
  scriptTextContainsStructuralMarkers,
  stripStructuralMarkers,
} from "@/lib/visual-plan-script";
import { normalizeSceneVoiceoverText } from "@/lib/voiceover-scenes";
import { parseAndValidateHandoffResponse } from "@/lib/chatgpt-scene-handoff";

test("stripStructuralMarkers removes Bible in One Year and hook labels", () => {
  const raw = `[INTRODUCTION]

Welcome to day one.

[CHAPTER COVER — GENESIS 1]

In the beginning God created the heavens and the earth.

[REFLECTION AND PRAYER]

Lord, help us receive Your Word.

[CLOSING]

See you tomorrow.

[HOOK]
What if Scripture is waiting for you?
[END HOOK]`;

  const stripped = stripStructuralMarkers(raw);

  assert.equal(scriptTextContainsStructuralMarkers(stripped), false);
  assert.equal(findStructuralMarkersInScriptText(raw).length >= 6, true);
  assert.match(stripped, /Welcome to day one/);
  assert.match(stripped, /In the beginning/);
  assert.doesNotMatch(stripped, /\[INTRODUCTION\]/i);
  assert.doesNotMatch(stripped, /CHAPTER COVER/i);
  assert.doesNotMatch(stripped, /\[HOOK\]/i);
});

test("scriptTextContainsStructuralMarkers does not flip-flop via lastIndex", () => {
  const text = "[INTRODUCTION]\nHello";
  assert.equal(scriptTextContainsStructuralMarkers(text), true);
  assert.equal(scriptTextContainsStructuralMarkers(text), true);
  assert.equal(scriptTextContainsStructuralMarkers("Hello only"), false);
});

test("normalizeSceneVoiceoverText strips labels before speech", () => {
  const spoken = normalizeSceneVoiceoverText(
    "[CHAPTER COVER — GENESIS 1]\n\nIn the beginning God created.",
  );
  assert.equal(spoken, "In the beginning God created.");
});

test("handoff import strips labels and keeps spoken cover narration", () => {
  const validation = parseAndValidateHandoffResponse(
    JSON.stringify([
      {
        scriptText: "[INTRODUCTION]\nThe Bible in One Year — Day 1.",
        sceneType: "insert",
        visualPurpose: "Open the day with the series title",
        visualIdea: "Chapter cover: The Bible in One Year — Day 1, with soft morning light",
        duration: 4,
        imagePrompt:
          "Warm watercolor title card for day one bible reading with soft morning light. Use only this exact visible text: THE BIBLE IN ONE YEAR — DAY 1. No other words.",
        status: "planned",
      },
      {
        scriptText: "Welcome to day one of reading Scripture together.",
        sceneType: "avatar",
        visualPurpose: "Welcome the listener",
        visualIdea: "Narrative scene: An older listener opens a Bible calmly",
        duration: 6,
        imagePrompt:
          "Watercolor of an older listener opening a Bible at a quiet table. No visible text, captions, letters, or words.",
        status: "planned",
      },
    ]),
  );

  assert.equal(validation.errors.length, 0);
  assert.equal(validation.scenes[0]?.scriptText, "The Bible in One Year — Day 1.");
  assert.equal(
    validation.scenes[1]?.scriptText,
    "Welcome to day one of reading Scripture together.",
  );
  assert.ok(
    validation.warnings.some((warning) => /structural marker/i.test(warning)),
  );
});

test("handoff warns when a cover is left silent after stripping labels", () => {
  const validation = parseAndValidateHandoffResponse(
    JSON.stringify([
      {
        scriptText: "[CHAPTER COVER — GENESIS 1]",
        sceneType: "insert",
        visualPurpose: "Open Genesis chapter 1 title card",
        visualIdea: "Chapter cover: Genesis 1, with restrained morning light",
        duration: 4,
        imagePrompt:
          "Warm watercolor title card. Use only this exact visible text: GENESIS 1. No other words.",
        status: "planned",
      },
      {
        scriptText: "Genesis, chapter 1.",
        sceneType: "insert",
        visualPurpose: "Announce the chapter",
        visualIdea: "Object/detail insert: An open Bible on Genesis 1",
        duration: 5,
        imagePrompt:
          "Watercolor of an open Bible. No visible text, captions, letters, or words.",
        status: "planned",
      },
    ]),
  );

  assert.equal(validation.errors.length, 0);
  assert.equal(validation.scenes[0]?.scriptText, "");
  assert.ok(
    validation.warnings.some((warning) =>
      /prefer pairing the cover with the spoken title/i.test(warning),
    ),
  );
});

test("coverage ignores structural labels on both sides", () => {
  const source = `[HOOK]\nHello friend.\n[END HOOK]\n\nBody line.`;
  const scenes = ["Hello friend.", "Body line."];
  assert.equal(
    normalizeForScriptCoverage(source),
    normalizeForScriptCoverage(scenes.join(" ")),
  );
});
