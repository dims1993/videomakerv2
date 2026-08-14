import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSectionVisualPlanChunkPrompt,
  isChapterSectionLabel,
  scriptHasStructuralVisualPlanSections,
  splitScriptIntoStructuralSections,
  summarizeSectionSceneTypeMix,
} from "./visual-plan-script-sections";
import { normalizeForScriptCoverage } from "./visual-plan-script";
import {
  buildTheGodsWordSectionHybridContext,
} from "./the-gods-word-visual-brief";

describe("visual-plan-script-sections", () => {
  it("accepts CHAPTER N with single digit and hyphen", () => {
    assert.equal(isChapterSectionLabel("CHAPTER 1 - Saying Your Name"), true);
    assert.equal(isChapterSectionLabel("CHAPTER 01 — TITLE"), true);
    assert.equal(isChapterSectionLabel("CHAPTER COVER — GENESIS 1"), false);
  });

  it("splits INTRODUCTION and CHAPTER sections; keeps HOOK block together", () => {
    const sections = splitScriptIntoStructuralSections(`
Preamble spoken line.

[HOOK]
Question one?
[END HOOK]

[INTRODUCTION]
Welcome to the teaching.

[CHAPTER 1 - First Point]
Body one.

[CHAPTER 02 — Second Point]
Body two.
`);

    assert.equal(sections[0]?.label, "PREAMBLE");
    assert.match(sections[0]?.text ?? "", /Preamble spoken line/);

    assert.equal(sections[1]?.label, "HOOK");
    assert.match(sections[1]?.text ?? "", /\[HOOK\]/);
    assert.match(sections[1]?.text ?? "", /\[END HOOK\]/);
    assert.equal(sections[1]?.expectsCover, false);

    assert.equal(sections[2]?.label, "INTRODUCTION");
    assert.equal(sections[2]?.expectsCover, true);

    assert.equal(sections[3]?.label, "CHAPTER 1 - First Point");
    assert.equal(sections[3]?.expectsCover, true);
    assert.match(sections[3]?.text ?? "", /Body one/);

    assert.equal(sections[4]?.label, "CHAPTER 02 — Second Point");
    assert.equal(sections[4]?.expectsCover, true);
  });

  it("detects structural sections vs plain narration", () => {
    assert.equal(
      scriptHasStructuralVisualPlanSections("Just a plain narration line."),
      false,
    );
    assert.equal(
      scriptHasStructuralVisualPlanSections(
        "[INTRODUCTION]\nWelcome to the teaching.",
      ),
      true,
    );
  });

  it("splits CONCLUSION into its own section and strips it from spoken coverage", () => {
    const sections = splitScriptIntoStructuralSections(`
[CHAPTER 11 — THE SELF YOU LOSE]
Chapter body line.

[CONCLUSION]
Conclusion body line.
`);
    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.label, "CHAPTER 11 — THE SELF YOU LOSE");
    assert.match(sections[0]?.text ?? "", /Chapter body line/);
    assert.doesNotMatch(sections[0]?.text ?? "", /\[CONCLUSION\]/);
    assert.equal(sections[1]?.label, "CONCLUSION");
    assert.equal(sections[1]?.expectsCover, false);
    assert.match(sections[1]?.text ?? "", /Conclusion body line/);

    const spoken = normalizeForScriptCoverage(sections[1]!.text);
    assert.equal(spoken.includes("[CONCLUSION]"), false);
    assert.match(spoken, /Conclusion body line/);
  });

  it("summarizes scene-type mix for section prompts", () => {
    const mix = summarizeSectionSceneTypeMix([
      { sceneType: "avatar" },
      { sceneType: "insert" },
      { sceneType: "insert" },
      { sceneType: "space" },
    ]);
    assert.deepEqual(mix, {
      avatar: 1,
      insert: 2,
      space: 1,
      total: 4,
    });
  });

  it("section chunk prompt uses body-only contract without pasting the full style lock", () => {
    const sections = splitScriptIntoStructuralSections(
      "[CHAPTER 1 - Point]\nBody line.",
    );
    const prompt = buildSectionVisualPlanChunkPrompt({
      contextPrompt: buildTheGodsWordSectionHybridContext(),
      section: sections[0]!,
      totalSections: 1,
      previousTail: [],
      sceneTypeMix: { avatar: 2, insert: 5, space: 1, total: 8 },
      // God's Word no longer ships the full lock on every chunk.
      styleLockReminder: null,
    });

    assert.doesNotMatch(prompt, /burnt umber soil, gentle parchment light/);
    assert.doesNotMatch(
      prompt,
      /Every imagePrompt MUST begin with this exact lock/,
    );
    assert.match(prompt, /imagePrompt body-only contract/);
    assert.match(prompt, /soft target 30–40%/);
    assert.match(prompt, /insert: 5 \(63%\)/);
    assert.match(prompt, /Soft distribution guidance/);
    assert.match(prompt, /BODY ONLY/);
  });
});
