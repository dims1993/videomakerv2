import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContinuitySynthesisText,
  findBodyOnsetSecFromAlignment,
  narrationWeight,
  planAlignedBodyCutSec,
  planContinuityTrimWindow,
  tokenizeContinuityText,
} from "./tts-continuity-synth";

test("buildContinuitySynthesisText joins previous+body and ignores next", () => {
  const built = buildContinuitySynthesisText({
    previousText: "They see phrases about falling away,",
    bodyText: "trampling the Son of God,",
    nextText: "and they panic.",
  });
  assert.equal(built.usedContext, true);
  assert.match(built.fullText, /falling away/);
  assert.match(built.fullText, /trampling the Son/);
  assert.doesNotMatch(built.fullText, /they panic/);
  assert.equal(built.nextText, "");
});

test("buildContinuitySynthesisText drops context when over maxChars", () => {
  const built = buildContinuitySynthesisText({
    previousText: "word ".repeat(400),
    bodyText: "Short body.",
    nextText: "word ".repeat(400),
    maxChars: 80,
  });
  assert.equal(built.fullText, "Short body.");
  assert.equal(built.usedContext, false);
});

test("planContinuityTrimWindow keeps body through EOF (diagnostics only)", () => {
  const window = planContinuityTrimWindow({
    previousText: "One two three four five.",
    bodyText: "Six seven eight.",
    nextText: "Nine ten.",
    totalDurationSec: 10,
  });
  assert.ok(window.startSec > 0);
  assert.equal(window.usedNext, false);
  assert.equal(window.method, "weight_fallback");
  assert.ok(
    Math.abs(window.startSec + window.durationSec - 10) < 0.02,
    `expected EOF trim, got start=${window.startSec} dur=${window.durationSec}`,
  );
});

test("narrationWeight is positive for spoken text", () => {
  assert.ok(narrationWeight("Hello there friend.") > 0);
  assert.equal(narrationWeight("   "), 0);
});

test("planAlignedBodyCutSec uses gap lead-in with tiny bleed cap", () => {
  // Wide gap (mind … Paul): lead-in inside silence.
  const wide = planAlignedBodyCutSec({
    previousStart: 1.0,
    previousEnd: 1.4,
    bodyStart: 2.5,
    totalDurationSec: 6,
  });
  assert.ok(wide != null);
  assert.ok(wide! >= 1.4 - 0.03, "bleed cap");
  assert.ok(wide! < 2.5, "lead-in before body start");
  assert.ok(Math.abs(wide! - (2.5 - 0.12)) < 0.001);

  // Tight gap: stay in the gap, not inside previous word.
  const tight = planAlignedBodyCutSec({
    previousStart: 1.0,
    previousEnd: 1.45,
    bodyStart: 1.5,
    totalDurationSec: 4,
  });
  assert.ok(tight != null);
  assert.ok(tight! >= 1.45 - 0.03);
  assert.ok(tight! <= 1.5);

  // Overlap: at most 30ms of previous coda.
  const overlap = planAlignedBodyCutSec({
    previousStart: 1.0,
    previousEnd: 1.52,
    bodyStart: 1.48,
    totalDurationSec: 4,
  });
  assert.ok(overlap != null);
  assert.ok(overlap! >= 1.52 - 0.03);
  assert.ok(overlap! <= 1.52 + 0.01);
});

test("findBodyOnsetSecFromAlignment cuts near boundary (bleed ≤30ms)", () => {
  const previousText = "another sentence is already in the mind.";
  const bodyText = "Paul says we are saved by grace through faith,";
  const prev = tokenizeContinuityText(previousText);
  const body = tokenizeContinuityText(bodyText);
  const words = [...prev, ...body].map((tok, i) => ({
    word: tok,
    start: i * 0.4,
    end: i * 0.4 + 0.35,
  }));

  const onset = findBodyOnsetSecFromAlignment({
    words,
    previousText,
    bodyText,
    totalDurationSec: words.length * 0.4,
  });

  assert.ok(onset != null);
  const mindIndex = prev.length - 1;
  const mindEnd = mindIndex * 0.4 + 0.35;
  const bodyAlignedStart = prev.length * 0.4;
  assert.ok(
    onset! >= mindEnd - 0.03,
    `onset ${onset} must not keep >30ms of previous (end ${mindEnd})`,
  );
  assert.ok(onset! <= bodyAlignedStart + 0.02);
});

test("findBodyOnsetSecFromAlignment returns null when body cannot be found", () => {
  const onset = findBodyOnsetSecFromAlignment({
    words: [
      { word: "totally", start: 0, end: 0.3 },
      { word: "unrelated", start: 0.3, end: 0.7 },
    ],
    previousText: "another sentence is already in the mind.",
    bodyText: "Paul says we are saved",
    totalDurationSec: 2,
  });
  assert.equal(onset, null);
});
