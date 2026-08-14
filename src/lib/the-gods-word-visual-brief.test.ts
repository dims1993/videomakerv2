import assert from "node:assert/strict";

import {
  buildTheGodsWordFlowVisualBrief,
  buildTheGodsWordGenerationModeInstructions,
  buildTheGodsWordSectionHybridContext,
  THE_GODS_WORD_INSERT_CONTRACT_MARKERS,
  THE_GODS_WORD_REMOVED_INSERT_MARKERS,
} from "@/lib/the-gods-word-visual-brief";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

const brief = buildTheGodsWordFlowVisualBrief();
const fullVideoMode = buildTheGodsWordGenerationModeInstructions("FULL_VIDEO");
const hookMode = buildTheGodsWordGenerationModeInstructions("HOOK_TEST");
const sampleRequest = [
  "## TheGodsWord Flow Visual Brief",
  brief,
  fullVideoMode,
].join("\n\n");

test("brief contains TheGodsWord Flow Visual Brief heading", () => {
  assert.match(brief, /## TheGodsWord Flow Visual Brief/);
});

test("brief contains required insert contract markers", () => {
  for (const marker of THE_GODS_WORD_INSERT_CONTRACT_MARKERS) {
    assert.ok(
      brief.includes(marker) || fullVideoMode.includes(marker),
      `missing marker: ${marker}`,
    );
  }
});

test("brief no longer contains removed insert instructions", () => {
  for (const marker of THE_GODS_WORD_REMOVED_INSERT_MARKERS) {
    assert.equal(
      brief.includes(marker),
      false,
      `old instruction still present: ${marker}`,
    );
    assert.equal(
      fullVideoMode.includes(marker),
      false,
      `old instruction still present in FULL_VIDEO mode: ${marker}`,
    );
  }
});

test("FULL_VIDEO requires chapter covers for CHAPTER and FINAL", () => {
  assert.match(
    fullVideoMode,
    /Create one chapter-cover insert for every exact \[CHAPTER N - TITLE\] marker\./,
  );
  assert.match(
    fullVideoMode,
    /Create one final-cover insert for \[FINAL — TITLE\]\./,
  );
  assert.match(fullVideoMode, /\[HOOK\] does not create a cover\./);
});

test("HOOK_TEST excludes chapter covers from hook", () => {
  assert.match(hookMode, /\[HOOK\] does not create a cover\./);
  assert.match(hookMode, /Do not force chapter covers in the hook\./);
});

test("sample request includes dense-list and negation examples", () => {
  assert.match(sampleRequest, /Dense-list split example/);
  assert.match(sampleRequest, /RELEASE \/ REFUSE \/ SEEK/);
  assert.match(sampleRequest, /Negation\/correction rule/);
  assert.match(sampleRequest, /DESTROY YOURSELF/);
  assert.match(sampleRequest, /FOLLOW ME/);
});

test("sample request includes complexity budget and QA gate", () => {
  assert.match(sampleRequest, /Complexity budget by duration/);
  assert.match(sampleRequest, /Insert-specific QA gate/);
  assert.match(sampleRequest, /Visible-text policy \(per format\)/);
  assert.match(sampleRequest, /Hard hook segmentation \(HOOK ONLY\)/);
  assert.match(sampleRequest, /Moderate body segmentation/);
  assert.match(sampleRequest, /15 to 25 narrated words/);
  assert.match(sampleRequest, /Never create a single-word scene/);
  assert.match(sampleRequest, /visualIdea format prefixes \(required\)/);
});

test("timing rules use body 5–8s ceiling not 11s", () => {
  const sectionContext = buildTheGodsWordSectionHybridContext();
  assert.match(sectionContext, /Body scenes \(CHAPTER \/ body \/ FINAL spoken\): usually 5 to 8 seconds/);
  assert.match(sectionContext, /Do not plan 9–11s body scenes|soft ceiling: 8 seconds/i);
  assert.doesNotMatch(sectionContext, /Body scenes: 6 to 11 seconds/);
});

test("avatar and space guidance remain present", () => {
  assert.match(brief, /`avatar`: use when Jesus, disciples, angels/);
  assert.match(brief, /viewer application lines/);
  assert.match(brief, /`space`: use for concrete places, transitions, silence/);
  assert.match(brief, /Space does not mean abstract symbolism/);
});

test("section hybrid context is body-only (no full style lock paste) and keeps soft distribution", () => {
  const sectionContext = buildTheGodsWordSectionHybridContext();
  assert.doesNotMatch(sectionContext, /burnt umber soil, gentle parchment light/);
  assert.doesNotMatch(
    sectionContext,
    /Every imagePrompt MUST begin with this exact lock/,
  );
  assert.match(sectionContext, /imagePrompt body-only contract/);
  assert.match(sectionContext, /30 to 40 percent/);
  assert.match(sectionContext, /Section-chunk mode notes/);
  assert.match(sectionContext, /BODY ONLY/);
});

console.log("\nAll the-gods-word visual brief tests passed.");
