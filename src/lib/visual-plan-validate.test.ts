import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVisualPlanEvaluationRepairPrompt,
  buildVisualPlanScenesRepairPrompt,
  validateVisualPlanEvaluationResponse,
  validateVisualPlanScenesResponse,
} from "@/lib/visual-plan-validate";

const VALID_SCENE = {
  order: 1,
  scriptText: "Hello world.",
  sceneType: "avatar",
  visualPurpose: "hook",
  visualIdea: "MAIN HOST speaks to camera.",
  duration: 4,
  imagePrompt: "Close portrait of host.",
  status: "planned",
};

test("scenes validator accepts a valid JSON array", () => {
  const result = validateVisualPlanScenesResponse(JSON.stringify([VALID_SCENE]));
  assert.equal(result.ok, true);
  assert.ok(result.scenesJson);
  assert.equal(result.errors.length, 0);
});

test("scenes validator rejects top-level object wrapper", () => {
  const result = validateVisualPlanScenesResponse(
    JSON.stringify({ scenes: [VALID_SCENE] }),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /JSON array/i);
});

test("scenes validator rejects missing fields, bad sceneType, empty scriptText", () => {
  const result = validateVisualPlanScenesResponse(
    JSON.stringify([
      {
        order: 1,
        scriptText: "   ",
        sceneType: "b-roll",
        visualPurpose: "x",
        duration: 4,
        imagePrompt: "y",
        status: "planned",
      },
    ]),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /scriptText/);
  assert.match(result.errors.join(" "), /sceneType/);
  assert.match(result.errors.join(" "), /visualIdea/);
});

test("scenes validator rejects unparseable JSON", () => {
  const result = validateVisualPlanScenesResponse("not json at all");
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /parseable JSON/i);
});

test("scenes validator repairs unescaped quotes inside imagePrompt", () => {
  const broken = `[
  {
    "order": 1,
    "scriptText": "The moving truck is already gone,",
    "sceneType": "avatar",
    "visualPurpose": "Open with the aftermath of moving.",
    "visualIdea": "MAIN HOST: the host stands beside an emptied doorway.",
    "duration": 2.8,
    "imagePrompt": "Voiceover context:\\n"The moving truck is already gone,"\\n\\nNarrative meaning:\\n"The move is already complete."\\n\\nCreate:\\nClean 2D image.",
    "status": "planned"
  }
]`;

  assert.throws(() => JSON.parse(broken));
  const result = validateVisualPlanScenesResponse(broken);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.ok(result.scenesJson);
});

test("evaluation validator accepts overallScore + passesThreshold + revisionPriorities", () => {
  const result = validateVisualPlanEvaluationResponse(
    JSON.stringify({
      overallScore: 8.5,
      passesThreshold: false,
      threshold: 9.2,
      recommendedAction: "revise",
      criticalIssues: [],
      systemicIssues: [],
      sceneIssues: [],
      revisionPriorities: ["Fix scene 2"],
      doNotChange: [],
      summary: "Needs polish.",
      categoryScores: {
        durationAndSegmentation: 8,
        scriptTextPreservation: 9,
        narrationVisualAlignment: 8,
        visualSpecificity: 8,
        styleConsistency: 8,
        characterConsistency: 8,
        compositionSimplicity: 8,
        flowSafety: 8,
        schemaValidity: 9,
        productionReadiness: 8,
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.critique?.score, 8.5);
  assert.equal(result.critique?.passes, false);
});

test("evaluation validator rejects missing overallScore / passesThreshold / revisionPriorities", () => {
  const result = validateVisualPlanEvaluationResponse(
    JSON.stringify({
      score: 8.5,
      passes: false,
      summary: "legacy shape",
    }),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /overallScore/);
  assert.match(result.errors.join(" "), /passesThreshold/);
  assert.match(result.errors.join(" "), /revisionPriorities/);
});

test("repair prompts are strict and include validation errors", () => {
  const scenesRepair = buildVisualPlanScenesRepairPrompt({
    callType: "GENERATE_VISUAL_PLAN",
    draftNumber: 1,
    validationErrors: ["Response must be a JSON array of scenes."],
    invalidResponse: '{"scenes":[]}',
  });
  assert.match(scenesRepair, /GENERATE_VISUAL_PLAN_REPAIR/);
  assert.match(scenesRepair, /STRICT REPAIR/);
  assert.match(scenesRepair, /JSON array of scenes/);

  const evalRepair = buildVisualPlanEvaluationRepairPrompt({
    draftNumber: 2,
    validationErrors: ["overallScore must be a number."],
    invalidResponse: '{"passesThreshold":true}',
  });
  assert.match(evalRepair, /EVALUATE_VISUAL_PLAN_REPAIR/);
  assert.match(evalRepair, /overallScore must be a number/);
  assert.match(evalRepair, /Do not revise scenes/);
});
