import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BIBLE_ONE_YEAR_VISUAL_BRIEF_MARKERS,
  buildBibleOneYearGenerationModeInstructions,
  buildBibleOneYearOutputRequirementsSection,
  buildBibleOneYearTimingRules,
  buildBibleOneYearVisualBrief,
} from "@/lib/the-bible-in-one-year-visual-brief";

test("Bible in One Year brief includes the compact-flow contract markers", () => {
  const brief = buildBibleOneYearVisualBrief();

  for (const marker of BIBLE_ONE_YEAR_VISUAL_BRIEF_MARKERS) {
    assert.ok(brief.includes(marker), `missing marker: ${marker}`);
  }

  assert.equal(brief.includes("Create one chapter-cover insert for every exact"), false);
  assert.match(brief, /\\u0022/);
  assert.match(brief, /Do not begin with: card, source card/);
  assert.match(brief, /COVER AND TITLE TEXT RULE/);
  assert.match(brief, /FINAL IMAGE PROMPT CONTRACT — FIRST-PASS PRODUCTION OUTPUT/);
  assert.match(brief, /16:9 horizontal hand-painted watercolor and ink/);
  assert.match(brief, /Recurring American pastor host:/);
  assert.match(brief, /Adam as a dignified first man:/);
  assert.match(brief, /visible text limited to: TITLE/);
  assert.match(brief, /Chapter cover: is a schema label/);
  assert.match(brief, /VISUAL-BEAT SEGMENTATION/);
  assert.match(brief, /REFLECT AND PRAY/);
  assert.match(brief, /\[CLOSING\] is segmentation only/);
  assert.doesNotMatch(brief, /\n- CLOSING\n/);
});

test("Bible in One Year output requirements use a voiced cover example", () => {
  const section = buildBibleOneYearOutputRequirementsSection();
  assert.match(section, /Genesis, chapter 1\./);
  assert.match(section, /visible text limited to: GENESIS 1/);
  assert.match(section, /parchment/);
  assert.match(section, /restrained parchment bookplate composition/);
  assert.match(section, /FINAL IMAGE PROMPT CONTRACT/);
  assert.match(section, /not a table title card/);
  assert.doesNotMatch(section, /"scriptText": ""/);
  assert.match(section, /\\u0022/);
});

test("Bible in One Year generation mode does not require CHAPTER N markers", () => {
  const full = buildBibleOneYearGenerationModeInstructions("FULL_VIDEO");
  assert.match(full, /Bible in One Year/);
  assert.match(full, /Do not invent \[CHAPTER N - TITLE\]/);
  assert.match(full, /Deterministic Visual Beats/);
  assert.match(full, /\[CLOSING\] is segmentation only/);
  assert.match(full, /visual-beat segmentation/);
  assert.doesNotMatch(
    full,
    /Create one chapter-cover insert for every exact \[CHAPTER N/,
  );
});

test("Bible in One Year timing rules stay category-specific", () => {
  const timing = buildBibleOneYearTimingRules();
  assert.match(timing, /Cover \/ chapter announcement openers/);
  assert.match(timing, /3 to 7/);
  assert.match(timing, /visual-beat segmentation/);
  assert.doesNotMatch(timing, /Hard hook beat segmentation/);
});
