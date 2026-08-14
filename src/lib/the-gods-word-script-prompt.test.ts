import assert from "node:assert/strict";
import test from "node:test";

import {
  GODS_WORD_SCRIPT_WRITER_PASS_SCORE,
  GODS_WORD_STRUCTURAL_MARKERS_RECOMMENDATION,
  buildGodsWordApplyRecommendationPrompt,
  buildGodsWordTopicIdeaScriptPrompt,
  godsWordScriptHasStructuralMarkers,
  godsWordScriptPassed,
  parseGodsWordScriptBatchResponse,
  parseGodsWordValoracionScore,
} from "@/lib/the-gods-word-script-prompt";

test("gods word topic script prompt asks for valuation JSON and markers", () => {
  const prompt = buildGodsWordTopicIdeaScriptPrompt({
    ideaJson: JSON.stringify({
      title: "Why David waited",
      topic: "patience",
      angle: "delay is formation",
    }),
    title: "Why David waited",
    topic: "patience",
  });

  assert.match(prompt, /"script"/);
  assert.match(prompt, /"valoracion"/);
  assert.match(prompt, /"recomendacion"/);
  assert.match(prompt, /Working title: Why David waited/);
  assert.match(prompt, /Topic: patience/);
  assert.match(prompt, /\[HOOK\]/);
  assert.match(prompt, /\[END HOOK\]/);
  assert.match(prompt, /\[CHAPTER N — TITLE\]/);
  assert.match(prompt, /\[FINAL —/);
  assert.match(prompt, /structural markers/i);
  assert.match(prompt, new RegExp(String(GODS_WORD_SCRIPT_WRITER_PASS_SCORE)));
  assert.doesNotMatch(prompt, /Project Bible/i);
});

test("parseGodsWordValoracionScore reads n/10", () => {
  assert.equal(parseGodsWordValoracionScore("Valoración: 8.7/10"), 8.7);
  assert.equal(parseGodsWordValoracionScore("Valoracion: 9,3/10"), 9.3);
  assert.equal(godsWordScriptPassed(9.3), true);
  assert.equal(godsWordScriptPassed(9.2), false);
});

test("godsWordScriptHasStructuralMarkers requires hook and chapter", () => {
  assert.equal(godsWordScriptHasStructuralMarkers("plain prose only"), false);
  assert.equal(
    godsWordScriptHasStructuralMarkers(
      ["[HOOK]", "Tension.", "[END HOOK]", "Still no chapter."].join("\n"),
    ),
    false,
  );
  assert.equal(
    godsWordScriptHasStructuralMarkers(
      [
        "[HOOK]",
        "Tension.",
        "[END HOOK]",
        "[CHAPTER 1 — THE DELAY]",
        "Body.",
        "[FINAL — HOPE]",
        "Close.",
      ].join("\n"),
    ),
    true,
  );
});

test("parseGodsWordScriptBatchResponse extracts three keys", () => {
  const parsed = parseGodsWordScriptBatchResponse(
    JSON.stringify({
      script:
        "Jesus waited. The tomb stayed sealed while love chose glory over speed. ".repeat(
          2,
        ),
      valoracion: "Valoración: 8.4/10",
      recomendacion: "Open with the delay itself, not a generic lesson on trust.",
    }),
  );

  assert.match(parsed.script, /Jesus waited/);
  assert.equal(parsed.score, 8.4);
  assert.match(parsed.recomendacion, /Open with the delay/);
});

test("apply recommendation prompt keeps marker constraints", () => {
  const prompt = buildGodsWordApplyRecommendationPrompt(
    "Tighten the biblical tension in the opening.",
  );
  assert.match(prompt, /Toma la recomendación/i);
  assert.match(prompt, /Tighten the biblical tension/);
  assert.match(prompt, /"script"/);
  assert.match(prompt, /"valoracion"/);
  assert.match(prompt, /"recomendacion"/);
  assert.match(prompt, /\[HOOK\]/);
  assert.match(prompt, /structural markers/i);
  assert.match(GODS_WORD_STRUCTURAL_MARKERS_RECOMMENDATION, /\[HOOK\]/);
});
