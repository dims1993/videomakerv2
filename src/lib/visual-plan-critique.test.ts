import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VISUAL_PLAN_PASS_SCORE,
  buildVisualPlanRevisionPrompt,
  buildVisualPlanScorePrompt,
  computeWeightedScore,
  evaluationPassesAgreesWithScore,
  extractVisualPlanScore,
  isVisualPlanPassScore,
  shouldRequestVisualPlanRevision,
} from "@/lib/visual-plan-critique";

test("extractVisualPlanScore prefers explicit overallScore", () => {
  const result = extractVisualPlanScore(`{
  "overallScore": 8.4,
  "passesThreshold": false,
  "threshold": 9.2,
  "recommendedAction": "revise",
  "criticalIssues": ["Crowded scene 4"],
  "systemicIssues": ["Generic prompts in body"],
  "sceneIssues": [
    {
      "order": 4,
      "issueType": "simplicity",
      "severity": "high",
      "problem": "Too many objects",
      "repairInstruction": "Keep one dominant subject"
    }
  ],
  "revisionPriorities": ["Simplify scene 4"],
  "doNotChange": ["Preserve scene 1 hook"],
  "summary": "Segmentation is dense.",
  "categoryScores": {
    "durationAndSegmentation": 8,
    "scriptTextPreservation": 9,
    "narrationVisualAlignment": 8,
    "visualSpecificity": 7,
    "styleConsistency": 8,
    "characterConsistency": 8,
    "compositionSimplicity": 7,
    "flowSafety": 8,
    "schemaValidity": 9,
    "productionReadiness": 7.5
  }
}`);

  assert.equal(result.score, 8.4);
  assert.equal(result.passes, false);
  assert.match(result.summary ?? "", /Segmentation/);
  assert.equal(result.sceneIssues[0]?.order, 4);
  assert.equal(result.revisionPriorities[0], "Simplify scene 4");
  assert.ok(result.categoryScores);
  assert.equal(
    computeWeightedScore(
      result.categoryScores as Parameters<typeof computeWeightedScore>[0],
    ),
    7.9,
  );
});

test("extractVisualPlanScore reads structured review findings with passes", () => {
  const result = extractVisualPlanScore(`{
  "overallScore": 8.2,
  "passesThreshold": false,
  "threshold": 9.2,
  "recommendedAction": "revise",
  "criticalIssues": [],
  "systemicIssues": ["Repeated believer-Bible-light template"],
  "sceneIssues": [
    {
      "order": 18,
      "issueType": "duplicate",
      "severity": "high",
      "problem": "Nearly identical to scene 12.",
      "repairInstruction": "Change viewpoint and replace the open Bible with a named object from scriptText."
    }
  ],
  "revisionPriorities": ["Revise scene 18 visual"],
  "doNotChange": ["Keep scene 1 opening", "Keep scene 3 object insert"],
  "summary": "A few scenes repeat the same believer-Bible-light template.",
  "categoryScores": {
    "durationAndSegmentation": 8.2,
    "scriptTextPreservation": 9.0,
    "narrationVisualAlignment": 8.5,
    "visualSpecificity": 8.0,
    "styleConsistency": 8.1,
    "characterConsistency": 7.5,
    "compositionSimplicity": 8.0,
    "flowSafety": 8.4,
    "schemaValidity": 9.0,
    "productionReadiness": 8.0
  }
}`);

  assert.equal(result.score, 8.2);
  assert.equal(result.passes, false);
  assert.equal(result.sceneIssues[0]?.order, 18);
  assert.match(result.topFixes[0] ?? "", /Revise scene 18/);
  assert.equal(result.sceneFindings[0]?.sceneOrders[0], 18);
});

test("pass requires score greater than or equal to 9.2", () => {
  assert.equal(VISUAL_PLAN_PASS_SCORE, 9.2);
  assert.equal(isVisualPlanPassScore(9.1), false);
  assert.equal(isVisualPlanPassScore(9.2), true);
  assert.equal(isVisualPlanPassScore(9.3), true);
  assert.equal(shouldRequestVisualPlanRevision(9.1), true);
  assert.equal(shouldRequestVisualPlanRevision(9.2), false);
  assert.equal(shouldRequestVisualPlanRevision(8.2), true);
  assert.equal(evaluationPassesAgreesWithScore(9.1, false), true);
  assert.equal(evaluationPassesAgreesWithScore(9.1, true), false);
  assert.equal(evaluationPassesAgreesWithScore(9.2, true), true);
});

test("score prompt embeds Wealth Insights evaluator contract", () => {
  const prompt = buildVisualPlanScorePrompt({
    draftNumber: 2,
    scenesJson: '[{"scriptText":"Hello","sceneType":"avatar","duration":4}]',
    originalScript: "Hello world narration.",
    ideaJson: { workingTitle: "Narrative test", topicCategory: "narrative_economics_stories" },
    channelKey: "wealth-insights",
    visualPlannerSpec: "Narrative Economics Stories Mode.",
    previousScenesJson: '[{"scriptText":"Old"}]',
    previousReviewJson: '{"overallScore":8.0,"passesThreshold":false}',
    revisionLedger: [
      {
        iteration: 2,
        findingId: "SI1",
        sourceSceneOrders: [1],
        actionApplied: "simplicity",
        result: "Simplified composition.",
        status: "applied",
      },
    ],
  });

  assert.match(prompt, /EVALUATE_VISUAL_PLAN/);
  assert.match(prompt, /Visual Plan Quality Evaluator for Wealth Insights/);
  assert.match(prompt, /V2 \(iteration 2\)/);
  assert.match(prompt, /overallScore/);
  assert.match(prompt, /passesThreshold/);
  assert.match(prompt, /threshold.: 9\.2/);
  assert.match(prompt, /narrationVisualAlignment: 20%/);
  assert.match(prompt, /Do not decide whether another revision will run/);
  assert.match(prompt, /## Original script/);
  assert.match(prompt, /Hello world narration/);
  assert.match(prompt, /## ideaJson/);
  assert.match(prompt, /Narrative Economics Stories Mode/);
  assert.match(prompt, /## Revision ledger/);
  assert.match(prompt, /Do not revise the plan in this step/);
});

test("revision prompt embeds Wealth Insights revision contract", () => {
  const prompt = buildVisualPlanRevisionPrompt({
    draftNumber: 1,
    score: 9.0,
    originalScript: "What if the story is the real asset?",
    ideaJson: {
      workingTitle: "Narrative test",
      topicCategory: "narrative_economics_stories",
    },
    channelKey: "wealth-insights",
    scenesJson:
      '[{"order":1,"scriptText":"What if the story is the real asset?","sceneType":"insert","duration":4}]',
    reviewJson:
      '{"overallScore":9.0,"passesThreshold":false,"sceneIssues":[{"order":1,"issueType":"alignment","severity":"medium","problem":"clarity","repairInstruction":"sharpen claim"}]}',
    visualPlannerSpec: "Narrative Economics Stories Mode. Preserve character locks.",
    revisionLedger: [],
    briefReason: "One remaining clarity issue.",
    verdict: "keep_and_refine",
  });

  assert.match(prompt, /REVISE_VISUAL_PLAN/);
  assert.match(prompt, /You are revising a Wealth Insights visual plan/);
  assert.match(prompt, /Return a revised scenes JSON array only/);
  assert.match(prompt, /Fix all high and critical issues/);
  assert.match(prompt, /Narrative Economics Stories/);
  assert.match(prompt, /main-host visual system/);
  assert.match(prompt, /## Original script/);
  assert.match(prompt, /## ideaJson/);
  assert.match(prompt, /## Category visual rules/);
  assert.match(prompt, /## Previous scenes JSON \(V1\)/);
  assert.match(prompt, /## Evaluation report JSON/);
  assert.match(prompt, /overallScore >= 9\.2/);
  assert.match(prompt, /Do not return a review report/);
});
