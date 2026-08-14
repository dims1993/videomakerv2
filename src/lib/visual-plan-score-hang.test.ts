import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractEmbeddedScoreJson,
} from "@/lib/script-writer-critique";
import {
  VISUAL_PLAN_PASS_SCORE,
  extractVisualPlanScore,
  shouldRequestVisualPlanRevision,
} from "@/lib/visual-plan-critique";

const SAMPLE_SCORE = `{
  "iteration": 1,
  "evaluatedVersion": "V1",
  "score": 9.0,
  "passes": false,
  "briefReason": "The plan is clear, varied, and technically complete, but several symbolic scenes remain less immediately readable than the literal narration.",
  "sceneFindings": [
    {
      "findingId": "S1",
      "sceneOrders": [7],
      "severity": "medium",
      "category": "compositionClarity",
      "action": "revise_visual",
      "diagnosis": "Scene 7 still less readable than the narration.",
      "exactFix": "Replace the doubled empty chair with one restrained memory cue.",
      "mustPreserve": ["scriptText"]
    }
  ],
  "blockScores": {
    "semanticAlignment": 8.5,
    "segmentationComplexity": 9.4,
    "promptQuality": 9.1,
    "compositionClarity": 9.0,
    "varietyRepetition": 8.9,
    "rhythmDuration": 9.3,
    "continuityEmotionalImpact": 8.5
  }
}`;

test("extractEmbeddedScoreJson accepts visual-plan score payloads", () => {
  const embedded = extractEmbeddedScoreJson(SAMPLE_SCORE);
  assert.ok(embedded);
  assert.match(embedded!, /"score"\s*:\s*9/);
});

test("score 9.0 does not pass visual-plan threshold (must be >= 9.2)", () => {
  assert.equal(VISUAL_PLAN_PASS_SCORE, 9.2);
  const result = extractVisualPlanScore(SAMPLE_SCORE);
  assert.equal(result.score, 9.0);
  assert.equal(result.passes, false);
  assert.equal(shouldRequestVisualPlanRevision(result.score), true);
  assert.equal(shouldRequestVisualPlanRevision(8.9), true);
  assert.equal(shouldRequestVisualPlanRevision(9.2), false);
});

test("score 8.3 keep_and_refine must request V2", () => {
  const review = `{
    "iteration": 1,
    "evaluatedVersion": "V1",
    "score": 8.3,
    "passes": false,
    "verdict": "keep_and_refine",
    "briefReason": "Pacing is slow and a few scenes need clarity.",
    "preserveStrengths": [{"sceneOrders":[1,2],"reason":"Hook is strong."}],
    "resolvedSincePrevious": [],
    "regressions": [],
    "globalFindings": [],
    "sceneFindings": [{
      "findingId": "S1",
      "sceneOrders": [24],
      "severity": "high",
      "category": "segmentationComplexity",
      "action": "split",
      "diagnosis": "Two claims in one scene.",
      "exactFix": "Split after the first sentence.",
      "mustPreserve": ["scriptText"]
    }],
    "sequenceFindings": [],
    "revisionConstraints": ["Keep hook scenes."],
    "blockScores": {
      "semanticAlignment": 8.9,
      "segmentationComplexity": 8.5,
      "promptQuality": 8.6,
      "compositionClarity": 8.3,
      "varietyRepetition": 7.8,
      "rhythmDuration": 7.4,
      "continuityEmotionalImpact": 8.8
    }
  }`;
  const result = extractVisualPlanScore(review);
  assert.equal(result.score, 8.3);
  assert.equal(result.passes, false);
  assert.equal(shouldRequestVisualPlanRevision(result.score), true);
});
