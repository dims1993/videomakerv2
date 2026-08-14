import { extractJsonPayload, extractScoreJsonObject } from "@/lib/browser-automation/types";
import { stripChatGptUiChrome } from "@/lib/script-writer-extract";

/** Pass when overallScore is greater than or equal to this value. */
export const VISUAL_PLAN_PASS_SCORE = 9.2;

/** Maximum REVISE_VISUAL_PLAN calls after the initial GENERATE. */
export const VISUAL_PLAN_MAX_REVISIONS = 2;

/**
 * Maximum scored drafts in the app-controlled loop:
 * GENERATE (V1) + up to VISUAL_PLAN_MAX_REVISIONS revisions.
 */
export const VISUAL_PLAN_MAX_DRAFTS = 1 + VISUAL_PLAN_MAX_REVISIONS;

/** Explicit call types controlled by the orchestrator — never by the model. */
export const VISUAL_PLAN_CALL = {
  GENERATE: "GENERATE_VISUAL_PLAN",
  EVALUATE: "EVALUATE_VISUAL_PLAN",
  REVISE: "REVISE_VISUAL_PLAN",
} as const;

export type VisualPlanCallType =
  (typeof VISUAL_PLAN_CALL)[keyof typeof VISUAL_PLAN_CALL];

export type VisualPlanAcceptanceOutcome =
  | "accepted"
  | "accept_after_max_revisions";

export type VisualPlanLoopDecision =
  | "accept"
  | "revise"
  | "accept_after_max_revisions";

/**
 * Deterministic next-step decision. The model never chooses this.
 */
export function decideVisualPlanLoopNextStep({
  score,
  revisionsUsed,
  maxRevisions = VISUAL_PLAN_MAX_REVISIONS,
}: {
  score: number | null;
  revisionsUsed: number;
  maxRevisions?: number;
}): VisualPlanLoopDecision {
  if (isVisualPlanPassScore(score)) {
    return "accept";
  }
  if (revisionsUsed < maxRevisions) {
    return "revise";
  }
  return "accept_after_max_revisions";
}

/** Weighted rubric categories (productionReadiness is scored but not weighted). */
const SCORE_WEIGHTS = {
  durationAndSegmentation: 0.15,
  scriptTextPreservation: 0.1,
  narrationVisualAlignment: 0.2,
  visualSpecificity: 0.15,
  styleConsistency: 0.1,
  characterConsistency: 0.1,
  compositionSimplicity: 0.1,
  flowSafety: 0.05,
  schemaValidity: 0.05,
} as const;

export type VisualPlanCategoryScores = {
  durationAndSegmentation: number;
  scriptTextPreservation: number;
  narrationVisualAlignment: number;
  visualSpecificity: number;
  styleConsistency: number;
  characterConsistency: number;
  compositionSimplicity: number;
  flowSafety: number;
  schemaValidity: number;
  /** Scored for reporting; not included in overallScore weight. */
  productionReadiness?: number;
};

/** @deprecated Use VisualPlanCategoryScores. */
export type VisualPlanBlockScores = VisualPlanCategoryScores;

export type VisualPlanSceneIssue = {
  order: number;
  issueType: string;
  severity: string;
  problem: string;
  repairInstruction: string;
};

function resolveEvaluatorChannelName(channelKey?: string | null) {
  if (channelKey === "wealth-insights") {
    return "Wealth Insights";
  }
  if (channelKey === "the-gods-word") {
    return "The God's Word";
  }
  return "VideoMaker";
}

export type VisualPlanVerdict =
  | "keep"
  | "keep_and_refine"
  | "targeted_rework"
  | "structural_rework";

export type VisualPlanPreserveStrength = {
  sceneOrders: number[];
  reason: string;
};

export type VisualPlanGlobalFinding = {
  findingId: string;
  category: string;
  severity: string;
  diagnosis: string;
  affectedSceneOrders: number[];
  revisionRule: string;
};

export type VisualPlanSceneFinding = {
  findingId: string;
  sceneOrders: number[];
  severity: string;
  category: string;
  action: string;
  diagnosis: string;
  exactFix: string;
  mustPreserve: string[];
};

export type VisualPlanSequenceFinding = {
  findingId: string;
  sceneOrders: number[];
  severity: string;
  action: string;
  diagnosis: string;
  exactFix: string;
};

export type VisualPlanResolvedFinding = {
  previousFinding: string;
  sceneOrders: number[];
  resolution: string;
};

export type VisualPlanRegression = {
  sceneOrders: number[];
  category: string;
  diagnosis: string;
  action: string;
  exactFix: string;
};

export type VisualPlanLedgerEntry = {
  iteration: number;
  findingId: string;
  sourceSceneOrders: number[];
  actionApplied: string;
  result: string;
  status: "applied" | "resolved" | "open" | "regressed";
};

/**
 * EVALUATE_VISUAL_PLAN prompt. Passes every input explicitly so ChatGPT
 * does not rely on conversational memory. Loop control stays in the app.
 */
export function buildVisualPlanScorePrompt({
  draftNumber,
  scenesJson,
  originalScript,
  ideaJson,
  visualPlannerSpec,
  channelKey,
  previousScenesJson,
  previousReviewJson,
  revisionLedger,
}: {
  draftNumber: number;
  scenesJson: string;
  originalScript?: string | null;
  ideaJson?: unknown;
  visualPlannerSpec?: string | null;
  channelKey?: string | null;
  previousScenesJson?: string | null;
  previousReviewJson?: string | null;
  revisionLedger?: VisualPlanLedgerEntry[] | null;
}) {
  const iteration = Math.max(1, draftNumber);
  const draftLabel = `V${iteration}`;
  const json = scenesJson.trim() || "[]";
  const script =
    originalScript?.trim() ||
    "(Original script unavailable — score script coverage from the scenes JSON alone.)";
  const spec =
    visualPlannerSpec?.trim() ||
    "Use only avatar/insert/space. Integer durations. Preserve exact spoken script. Do not invent visible text.";
  const channelName = resolveEvaluatorChannelName(channelKey);
  const ideaJsonText =
    ideaJson == null
      ? "(ideaJson unavailable)"
      : typeof ideaJson === "string"
        ? ideaJson.trim() || "(ideaJson unavailable)"
        : JSON.stringify(ideaJson, null, 2);
  const previousScenes = previousScenesJson?.trim() || "";
  const previousReview = previousReviewJson?.trim() || "";
  const ledgerJson = JSON.stringify(
    { revisionLedger: revisionLedger ?? [] },
    null,
    2,
  );
  const threshold = VISUAL_PLAN_PASS_SCORE.toFixed(1);

  return `${VISUAL_PLAN_CALL.EVALUATE}
You are the Visual Plan Quality Evaluator for ${channelName}.

Evaluate the provided scenes JSON against the current script, ideaJson, channel rules, category visual mode, duration rules, schema rules, and Flow-readability requirements.

This is EVALUATE_VISUAL_PLAN for ${draftLabel} (iteration ${iteration}).
Return a JSON object only.

Do not return markdown.
Do not return the revised scenes.
Do not include commentary outside JSON.
Do not revise the plan in this step.
Only evaluate it.

Do not decide whether another revision will run. Fill recommendedAction for reporting only; the application orchestrator alone controls accept / revise / accept_after_max_revisions.

Do not rely on conversational memory. Use only the explicit inputs in this request.

Score the visual plan from 0 to 10.

Use this scoring rubric:

{
  "durationAndSegmentation": 0-10,
  "scriptTextPreservation": 0-10,
  "narrationVisualAlignment": 0-10,
  "visualSpecificity": 0-10,
  "styleConsistency": 0-10,
  "characterConsistency": 0-10,
  "compositionSimplicity": 0-10,
  "flowSafety": 0-10,
  "schemaValidity": 0-10,
  "productionReadiness": 0-10
}

Calculate overallScore as a weighted score:

- durationAndSegmentation: 15%
- scriptTextPreservation: 10%
- narrationVisualAlignment: 20%
- visualSpecificity: 15%
- styleConsistency: 10%
- characterConsistency: 10%
- compositionSimplicity: 10%
- flowSafety: 5%
- schemaValidity: 5%

productionReadiness is scored for reporting but is not part of the weighted overallScore.

Return exactly this JSON shape:

{
  "overallScore": 0,
  "passesThreshold": false,
  "threshold": ${threshold},
  "recommendedAction": "accept | revise | accept_after_max_revisions",
  "criticalIssues": [],
  "systemicIssues": [],
  "sceneIssues": [
    {
      "order": 1,
      "issueType": "duration | alignment | style | character | simplicity | flowSafety | schema | duplicate | genericPrompt",
      "severity": "low | medium | high | critical",
      "problem": "",
      "repairInstruction": ""
    }
  ],
  "revisionPriorities": [
    ""
  ],
  "doNotChange": [
    ""
  ],
  "summary": "",
  "categoryScores": {
    "durationAndSegmentation": 0,
    "scriptTextPreservation": 0,
    "narrationVisualAlignment": 0,
    "visualSpecificity": 0,
    "styleConsistency": 0,
    "characterConsistency": 0,
    "compositionSimplicity": 0,
    "flowSafety": 0,
    "schemaValidity": 0,
    "productionReadiness": 0
  }
}

Evaluation rules:

- Be strict.
- A score of ${threshold}+ means the plan is production-ready.
- Set passesThreshold to true only when overallScore >= ${threshold}.
- Set passesThreshold to false when overallScore < ${threshold}.
- Do not give ${threshold}+ if there are systemic alignment problems.
- Do not give ${threshold}+ if prompts are generic.
- Do not give ${threshold}+ if character consistency is weak.
- Do not give ${threshold}+ if many scenes are visually crowded.
- Do not give ${threshold}+ if duration validation is questionable.
- Do not give ${threshold}+ if scriptText is not preserved exactly.
- Do not give ${threshold}+ if the JSON schema is invalid.
- If the plan is good but not excellent, score between 8.4 and 9.1.
- If it needs serious repair, score below 8.4.

Do not revise the plan in this step.
Only evaluate it.

# Inputs

## Original script

${script}

## ideaJson

${ideaJsonText}

## Current Visual Planner specification / category visual mode

${spec}

## Iteration

${iteration}

## Latest scenes JSON (${draftLabel})

${json}

## Previous scenes JSON

${previousScenes || "(none — this is the first evaluation)"}

## Previous evaluation JSON

${previousReview || "(none — this is the first evaluation)"}

## Revision ledger

${ledgerJson}`;
}

/** @deprecated Prefer buildVisualPlanScorePrompt with explicit inputs. */
export const VISUAL_PLAN_SCORE_PROMPT = buildVisualPlanScorePrompt({
  draftNumber: 1,
  scenesJson: "{{V1_SCENES_JSON}}",
});

export type VisualPlanScoreResult = {
  score: number | null;
  passes: boolean | null;
  threshold: number;
  recommendedAction: VisualPlanLoopDecision | null;
  criticalIssues: string[];
  systemicIssues: string[];
  sceneIssues: VisualPlanSceneIssue[];
  revisionPriorities: string[];
  doNotChange: string[];
  summary: string | null;
  categoryScores: Partial<VisualPlanCategoryScores> | null;
  iteration: number | null;
  evaluatedVersion: string | null;
  briefReason: string | null;
  topFixes: string[];
  verdict: VisualPlanVerdict | null;
  preserveStrengths: VisualPlanPreserveStrength[];
  resolvedSincePrevious: VisualPlanResolvedFinding[];
  regressions: VisualPlanRegression[];
  globalFindings: VisualPlanGlobalFinding[];
  sceneFindings: VisualPlanSceneFinding[];
  sequenceFindings: VisualPlanSequenceFinding[];
  revisionConstraints: string[];
  /** @deprecated Prefer categoryScores. */
  blockScores: Partial<VisualPlanCategoryScores> | null;
  rawText: string;
};

export function serializeVisualPlanReviewJson(
  critique: Pick<
    VisualPlanScoreResult,
    | "score"
    | "passes"
    | "threshold"
    | "recommendedAction"
    | "criticalIssues"
    | "systemicIssues"
    | "sceneIssues"
    | "revisionPriorities"
    | "doNotChange"
    | "summary"
    | "categoryScores"
    | "iteration"
    | "evaluatedVersion"
    | "verdict"
    | "briefReason"
    | "preserveStrengths"
    | "resolvedSincePrevious"
    | "regressions"
    | "globalFindings"
    | "sceneFindings"
    | "sequenceFindings"
    | "revisionConstraints"
    | "blockScores"
    | "topFixes"
  >,
): string {
  const categoryScores = critique.categoryScores ?? critique.blockScores;
  return JSON.stringify(
    {
      overallScore: critique.score,
      passesThreshold: critique.passes,
      threshold: critique.threshold ?? VISUAL_PLAN_PASS_SCORE,
      recommendedAction: critique.recommendedAction,
      criticalIssues: critique.criticalIssues,
      systemicIssues: critique.systemicIssues,
      sceneIssues: critique.sceneIssues,
      revisionPriorities: critique.revisionPriorities,
      doNotChange: critique.doNotChange,
      summary: critique.summary ?? critique.briefReason,
      categoryScores,
      // Compatibility fields for surgical revision prompts.
      iteration: critique.iteration,
      evaluatedVersion: critique.evaluatedVersion,
      score: critique.score,
      passes: critique.passes,
      verdict: critique.verdict,
      briefReason: critique.briefReason ?? critique.summary,
      preserveStrengths: critique.preserveStrengths,
      resolvedSincePrevious: critique.resolvedSincePrevious,
      regressions: critique.regressions,
      globalFindings: critique.globalFindings,
      sceneFindings: critique.sceneFindings,
      sequenceFindings: critique.sequenceFindings,
      revisionConstraints: critique.revisionConstraints,
      blockScores: categoryScores,
      topFixes: critique.topFixes,
    },
    null,
    2,
  );
}

export function buildVisualPlanRevisionPrompt({
  draftNumber,
  score,
  originalScript,
  ideaJson,
  scenesJson,
  reviewJson,
  visualPlannerSpec,
  channelKey,
  revisionLedger,
  briefReason,
  topFixes,
  verdict,
  preserveStrengths,
  globalFindings,
  sceneFindings,
  sequenceFindings,
  revisionConstraints,
}: {
  draftNumber: number;
  score: number | null;
  originalScript?: string | null;
  ideaJson?: unknown;
  scenesJson?: string | null;
  reviewJson?: string | null;
  visualPlannerSpec?: string | null;
  channelKey?: string | null;
  revisionLedger?: VisualPlanLedgerEntry[] | null;
  briefReason?: string | null;
  topFixes?: string[];
  verdict?: VisualPlanVerdict | null;
  preserveStrengths?: VisualPlanPreserveStrength[];
  globalFindings?: VisualPlanGlobalFinding[];
  sceneFindings?: VisualPlanSceneFinding[];
  sequenceFindings?: VisualPlanSequenceFinding[];
  revisionConstraints?: string[];
}) {
  const nextDraft = draftNumber + 1;
  const channelName = resolveEvaluatorChannelName(channelKey);
  const scoreLabel =
    typeof score === "number" && Number.isFinite(score)
      ? score.toFixed(1)
      : "below the bar";

  const resolvedReviewJson =
    reviewJson?.trim() ||
    serializeVisualPlanReviewJson({
      score,
      passes: isVisualPlanPassScore(score),
      threshold: VISUAL_PLAN_PASS_SCORE,
      recommendedAction: null,
      criticalIssues: [],
      systemicIssues: [],
      sceneIssues: [],
      revisionPriorities: topFixes ?? [],
      doNotChange: [],
      summary: briefReason ?? null,
      categoryScores: null,
      iteration: draftNumber,
      evaluatedVersion: `V${draftNumber}`,
      verdict: verdict ?? null,
      briefReason: briefReason ?? null,
      preserveStrengths: preserveStrengths ?? [],
      resolvedSincePrevious: [],
      regressions: [],
      globalFindings: globalFindings ?? [],
      sceneFindings: sceneFindings ?? [],
      sequenceFindings: sequenceFindings ?? [],
      revisionConstraints: revisionConstraints ?? [],
      blockScores: null,
      topFixes: topFixes ?? [],
    });

  const resolvedScenesJson = scenesJson?.trim() || "[]";
  const resolvedScript =
    originalScript?.trim() ||
    "(Original script unavailable — preserve every scriptText from the latest version exactly.)";
  const resolvedSpec =
    visualPlannerSpec?.trim() ||
    [
      "Use only sceneType values: avatar, insert, space.",
      "Duration must be an integer.",
      "visualIdea must start with an allowed format prefix.",
      "Preserve exact spoken script coverage and order.",
      "Do not invent visible text.",
      "Hook stays faster than Body; do not merge distinct hook beats.",
    ].join("\n");
  const ideaJsonText =
    ideaJson == null
      ? "(ideaJson unavailable)"
      : typeof ideaJson === "string"
        ? ideaJson.trim() || "(ideaJson unavailable)"
        : JSON.stringify(ideaJson, null, 2);
  const ledgerJson = JSON.stringify(
    { revisionLedger: revisionLedger ?? [] },
    null,
    2,
  );

  return `${VISUAL_PLAN_CALL.REVISE}
You are revising a ${channelName} visual plan.

This is REVISE_VISUAL_PLAN (Draft V${draftNumber} → V${nextDraft}), controlled by the application orchestrator.
Draft V${draftNumber} scored ${scoreLabel}. Pass requires overallScore >= ${VISUAL_PLAN_PASS_SCORE.toFixed(1)}.
A lower review score is not permission to rewrite every scene.

Input:
- original script
- ideaJson
- category visual rules
- previous scenes JSON
- evaluation report JSON

Your task:
Return a revised scenes JSON array only.

Do not return markdown.
Do not return explanations.
Do not return a review report.
Do not wrap inside an object.
Do not add metadata.
Do not add new fields.

Hard requirements:

- Preserve exact scriptText from the original script.
- Keep the existing schema exactly:
  order, scriptText, sceneType, visualPurpose, visualIdea, duration, imagePrompt, status.
- Use only sceneType: avatar, insert, space.
- status must be planned.
- Fix all high and critical issues from the evaluation report.
- Improve medium issues when possible.
- Do not rewrite scenes that the evaluation report says are working unless needed for consistency.
- Do not introduce new systemic style changes unless the evaluation report asks for them.
- Keep durations realistic.
- Keep prompts specific to the exact narration beat.
- Keep composition readable in under one second.
- Avoid generic fallback prompts.
- Avoid crowded scenes.
- Avoid duplicate visualIdeas unless intentionally recurring.
- For Narrative Economics Stories, preserve fictionalized character locks and Flow-safe style.
- For default Wealth Insights videos, preserve the main-host visual system.

Revision priority order:

1. Schema validity
2. Exact scriptText preservation
3. Duration validity
4. Narration-to-visual alignment
5. Visual specificity
6. Character/style consistency
7. Composition simplicity
8. Flow safety
9. Production polish

Return only the revised scenes JSON array.

# Inputs

## Original script

${resolvedScript}

## ideaJson

${ideaJsonText}

## Category visual rules

${resolvedSpec}

## Previous scenes JSON (V${draftNumber})

${resolvedScenesJson}

## Evaluation report JSON

${resolvedReviewJson}

## Revision ledger

${ledgerJson}

# Silent final validation

Before returning V${nextDraft}, verify:

* every original spoken word appears exactly once and in order;
* high and critical evaluation issues were addressed;
* doNotChange / working scenes were not unnecessarily rewritten;
* schema fields are exactly order, scriptText, sceneType, visualPurpose, visualIdea, duration, imagePrompt, status;
* sceneType is only avatar, insert, or space;
* status is planned;
* durations are realistic integers;
* the result is one valid JSON array with no markdown or commentary.`;
}

function emptyScoreResult(rawText: string): VisualPlanScoreResult {
  return {
    score: null,
    passes: null,
    threshold: VISUAL_PLAN_PASS_SCORE,
    recommendedAction: null,
    criticalIssues: [],
    systemicIssues: [],
    sceneIssues: [],
    revisionPriorities: [],
    doNotChange: [],
    summary: null,
    categoryScores: null,
    iteration: null,
    evaluatedVersion: null,
    briefReason: null,
    topFixes: [],
    verdict: null,
    preserveStrengths: [],
    resolvedSincePrevious: [],
    regressions: [],
    globalFindings: [],
    sceneFindings: [],
    sequenceFindings: [],
    revisionConstraints: [],
    blockScores: null,
    rawText,
  };
}

export function extractVisualPlanScore(rawResponse: string): VisualPlanScoreResult {
  const rawText = rawResponse.trim();
  const cleaned = stripChatGptUiChrome(rawText);
  if (!cleaned) {
    return emptyScoreResult(rawText);
  }

  const jsonText =
    extractScoreJsonObject(cleaned) ?? extractJsonPayload(cleaned);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as {
        overallScore?: unknown;
        score?: unknown;
        passesThreshold?: unknown;
        passes?: unknown;
        threshold?: unknown;
        recommendedAction?: unknown;
        criticalIssues?: unknown;
        systemicIssues?: unknown;
        sceneIssues?: unknown;
        revisionPriorities?: unknown;
        doNotChange?: unknown;
        summary?: unknown;
        categoryScores?: Partial<Record<keyof VisualPlanCategoryScores, unknown>>;
        iteration?: unknown;
        evaluatedVersion?: unknown;
        briefReason?: unknown;
        reason?: unknown;
        topFixes?: unknown;
        fixes?: unknown;
        verdict?: unknown;
        preserveStrengths?: unknown;
        resolvedSincePrevious?: unknown;
        regressions?: unknown;
        globalFindings?: unknown;
        sceneFindings?: unknown;
        sequenceFindings?: unknown;
        revisionConstraints?: unknown;
        blockScores?: Partial<Record<keyof VisualPlanCategoryScores, unknown>>;
      };

      const categoryScores =
        normalizeCategoryScores(parsed.categoryScores) ??
        normalizeCategoryScores(parsed.blockScores);
      const weighted =
        categoryScores != null ? computeWeightedScore(categoryScores) : null;
      const explicit = normalizeScore(parsed.overallScore ?? parsed.score);
      const score = explicit ?? weighted;

      const summary =
        typeof parsed.summary === "string"
          ? parsed.summary.trim()
          : typeof parsed.briefReason === "string"
            ? parsed.briefReason.trim()
            : typeof parsed.reason === "string"
              ? parsed.reason.trim()
              : null;

      const criticalIssues = normalizeStringList(parsed.criticalIssues, 20);
      const systemicIssues = normalizeStringList(parsed.systemicIssues, 20);
      const sceneIssues = normalizeSceneIssues(parsed.sceneIssues);
      const revisionPriorities = normalizeStringList(parsed.revisionPriorities, 12);
      const doNotChange = normalizeStringList(parsed.doNotChange, 20);
      const recommendedAction = normalizeRecommendedAction(
        parsed.recommendedAction,
      );
      const threshold =
        normalizeScore(parsed.threshold) ?? VISUAL_PLAN_PASS_SCORE;

      const verdict = normalizeVerdict(parsed.verdict);
      const preserveStrengths =
        normalizePreserveStrengths(parsed.preserveStrengths).length > 0
          ? normalizePreserveStrengths(parsed.preserveStrengths)
          : doNotChange.map((reason) => ({ sceneOrders: [] as number[], reason }));
      const resolvedSincePrevious = normalizeResolvedFindings(
        parsed.resolvedSincePrevious,
      );
      const regressions = normalizeRegressions(parsed.regressions);
      const globalFindings =
        normalizeGlobalFindings(parsed.globalFindings).length > 0
          ? normalizeGlobalFindings(parsed.globalFindings)
          : systemicIssues.map((diagnosis, index) => ({
              findingId: `SYS${index + 1}`,
              category: "systemic",
              severity: "high",
              diagnosis,
              affectedSceneOrders: [] as number[],
              revisionRule: diagnosis,
            }));
      const sceneFindings =
        normalizeSceneFindings(parsed.sceneFindings).length > 0
          ? normalizeSceneFindings(parsed.sceneFindings)
          : sceneIssues.map((issue, index) => ({
              findingId: `SI${index + 1}`,
              sceneOrders: [issue.order],
              severity: issue.severity,
              category: issue.issueType,
              action: "revise_visual",
              diagnosis: issue.problem,
              exactFix: issue.repairInstruction,
              mustPreserve: ["scriptText"],
            }));
      const sequenceFindings = normalizeSequenceFindings(parsed.sequenceFindings);
      const revisionConstraints =
        normalizeStringList(parsed.revisionConstraints, 12).length > 0
          ? normalizeStringList(parsed.revisionConstraints, 12)
          : doNotChange;
      const iteration =
        typeof parsed.iteration === "number" && Number.isFinite(parsed.iteration)
          ? Math.round(parsed.iteration)
          : null;
      const evaluatedVersion =
        typeof parsed.evaluatedVersion === "string"
          ? parsed.evaluatedVersion.trim()
          : null;

      const derivedFixes = deriveTopFixes({
        sceneFindings,
        globalFindings,
        sequenceFindings,
        regressions,
      });
      const topFixes =
        revisionPriorities.length > 0
          ? revisionPriorities
          : derivedFixes.length > 0
            ? derivedFixes
            : [
                ...criticalIssues,
                ...normalizeFixes(parsed.topFixes ?? parsed.fixes),
              ].filter(Boolean).slice(0, 8);

      const reportedPasses =
        typeof parsed.passesThreshold === "boolean"
          ? parsed.passesThreshold
          : typeof parsed.passes === "boolean"
            ? parsed.passes
            : null;
      const expectedPasses = isVisualPlanPassScore(score);
      const passes =
        reportedPasses == null
          ? expectedPasses
          : evaluationPassesAgreesWithScore(score, reportedPasses)
            ? reportedPasses
            : null;

      if (score != null) {
        return {
          score,
          passes,
          threshold,
          recommendedAction,
          criticalIssues,
          systemicIssues,
          sceneIssues,
          revisionPriorities,
          doNotChange,
          summary,
          categoryScores,
          iteration,
          evaluatedVersion,
          briefReason: summary,
          topFixes,
          verdict,
          preserveStrengths,
          resolvedSincePrevious,
          regressions,
          globalFindings,
          sceneFindings,
          sequenceFindings,
          revisionConstraints,
          blockScores: categoryScores,
          rawText,
        };
      }
    } catch {
      // fall through
    }
  }

  const labeled = cleaned.match(
    /(?:overall\s*score|score|rating|nota|puntuaci[oó]n)\s*[:=]?\s*(\d{1,2}(?:[.,]\d)?)\s*(?:\/\s*10)?/i,
  );
  if (labeled?.[1]) {
    const score = normalizeScore(labeled[1].replace(",", "."));
    return {
      ...emptyScoreResult(rawText),
      score,
      passes: isVisualPlanPassScore(score),
    };
  }

  return emptyScoreResult(rawText);
}

/** True when score >= VISUAL_PLAN_PASS_SCORE (9.2). */
export function isVisualPlanPassScore(score: number | null | undefined) {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= VISUAL_PLAN_PASS_SCORE
  );
}

export function evaluationPassesAgreesWithScore(
  score: number | null,
  passes: boolean | null,
) {
  if (score == null || passes == null) {
    return false;
  }
  return passes === (score >= VISUAL_PLAN_PASS_SCORE);
}

export function shouldRequestVisualPlanRevision(score: number | null) {
  if (score == null || !Number.isFinite(score)) {
    return true;
  }
  // Pass when score >= 9.2; revise when below.
  return score < VISUAL_PLAN_PASS_SCORE;
}

export function buildRevisionLedgerEntries(
  critique: VisualPlanScoreResult,
  iteration: number,
): VisualPlanLedgerEntry[] {
  const entries: VisualPlanLedgerEntry[] = [];

  for (const issue of critique.sceneIssues) {
    entries.push({
      iteration,
      findingId: `SI${entries.length + 1}`,
      sourceSceneOrders: [issue.order],
      actionApplied: issue.issueType || "revise_visual",
      result: issue.repairInstruction || issue.problem,
      status: "applied",
    });
  }

  for (const finding of critique.sceneFindings) {
    if (
      critique.sceneIssues.some(
        (issue) =>
          finding.sceneOrders.includes(issue.order) &&
          (finding.diagnosis === issue.problem ||
            finding.exactFix === issue.repairInstruction),
      )
    ) {
      continue;
    }
    entries.push({
      iteration,
      findingId: finding.findingId || `S${entries.length + 1}`,
      sourceSceneOrders: finding.sceneOrders,
      actionApplied: finding.action,
      result: finding.exactFix || finding.diagnosis,
      status: "applied",
    });
  }

  for (const finding of critique.globalFindings) {
    if (finding.affectedSceneOrders.length === 0) {
      continue;
    }
    entries.push({
      iteration,
      findingId: finding.findingId || `G${entries.length + 1}`,
      sourceSceneOrders: finding.affectedSceneOrders,
      actionApplied: "global_revision",
      result: finding.revisionRule || finding.diagnosis,
      status: "applied",
    });
  }

  for (const finding of critique.regressions) {
    entries.push({
      iteration,
      findingId: `R${entries.length + 1}`,
      sourceSceneOrders: finding.sceneOrders,
      actionApplied: finding.action || "restore_previous",
      result: finding.exactFix || finding.diagnosis,
      status: "regressed",
    });
  }

  return entries;
}

export function mergeRevisionLedger(
  existing: VisualPlanLedgerEntry[],
  next: VisualPlanLedgerEntry[],
): VisualPlanLedgerEntry[] {
  return [...existing, ...next].slice(-60);
}

export function computeWeightedScore(
  blocks: Pick<
    VisualPlanCategoryScores,
    keyof typeof SCORE_WEIGHTS
  >,
): number {
  const total =
    blocks.durationAndSegmentation * SCORE_WEIGHTS.durationAndSegmentation +
    blocks.scriptTextPreservation * SCORE_WEIGHTS.scriptTextPreservation +
    blocks.narrationVisualAlignment * SCORE_WEIGHTS.narrationVisualAlignment +
    blocks.visualSpecificity * SCORE_WEIGHTS.visualSpecificity +
    blocks.styleConsistency * SCORE_WEIGHTS.styleConsistency +
    blocks.characterConsistency * SCORE_WEIGHTS.characterConsistency +
    blocks.compositionSimplicity * SCORE_WEIGHTS.compositionSimplicity +
    blocks.flowSafety * SCORE_WEIGHTS.flowSafety +
    blocks.schemaValidity * SCORE_WEIGHTS.schemaValidity;

  return Math.round(total * 10) / 10;
}

function normalizeCategoryScores(
  value: Partial<Record<keyof VisualPlanCategoryScores, unknown>> | undefined,
): VisualPlanCategoryScores | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const keys = Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[];
  const out = {} as VisualPlanCategoryScores;

  for (const key of keys) {
    const score = normalizeScore(value[key]);
    if (score == null) {
      return null;
    }
    out[key] = score;
  }

  const productionReadiness = normalizeScore(value.productionReadiness);
  if (productionReadiness != null) {
    out.productionReadiness = productionReadiness;
  }

  return out;
}

function normalizeSceneIssues(value: unknown): VisualPlanSceneIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const issues: VisualPlanSceneIssue[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const order =
      typeof record.order === "number" && Number.isFinite(record.order)
        ? Math.round(record.order)
        : null;
    if (order == null || order < 1) {
      continue;
    }
    issues.push({
      order,
      issueType:
        typeof record.issueType === "string" ? record.issueType.trim() : "",
      severity:
        typeof record.severity === "string" ? record.severity.trim() : "",
      problem: typeof record.problem === "string" ? record.problem.trim() : "",
      repairInstruction:
        typeof record.repairInstruction === "string"
          ? record.repairInstruction.trim()
          : "",
    });
  }
  return issues.slice(0, 40);
}

function normalizeRecommendedAction(
  value: unknown,
): VisualPlanLoopDecision | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "accept" ||
    normalized === "revise" ||
    normalized === "accept_after_max_revisions"
  ) {
    return normalized;
  }
  return null;
}

function normalizeFixes(value: unknown): string[] {
  return normalizeStringList(value, 8);
}

function normalizeStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function normalizeScore(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : NaN;

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
    return null;
  }

  return Math.round(numeric * 10) / 10;
}

function normalizeVerdict(value: unknown): VisualPlanVerdict | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "keep" ||
    normalized === "keep_and_refine" ||
    normalized === "targeted_rework" ||
    normalized === "structural_rework"
  ) {
    return normalized;
  }
  return null;
}

function normalizeSceneOrders(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.round(item));
}

function normalizePreserveStrengths(value: unknown): VisualPlanPreserveStrength[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const reason = typeof record.reason === "string" ? record.reason.trim() : "";
      const sceneOrders = normalizeSceneOrders(record.sceneOrders);
      if (!reason || sceneOrders.length === 0) {
        return null;
      }
      return { sceneOrders, reason };
    })
    .filter((item): item is VisualPlanPreserveStrength => Boolean(item))
    .slice(0, 8);
}

function normalizeGlobalFindings(value: unknown): VisualPlanGlobalFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const category =
        typeof record.category === "string" ? record.category.trim() : "";
      const severity =
        typeof record.severity === "string" ? record.severity.trim() : "";
      const diagnosis =
        typeof record.diagnosis === "string" ? record.diagnosis.trim() : "";
      const revisionRule =
        typeof record.revisionRule === "string"
          ? record.revisionRule.trim()
          : "";
      const affectedSceneOrders = normalizeSceneOrders(record.affectedSceneOrders);
      const findingId =
        typeof record.findingId === "string" && record.findingId.trim()
          ? record.findingId.trim()
          : `G${index + 1}`;
      if (!category || !diagnosis) {
        return null;
      }
      return {
        findingId,
        category,
        severity: severity || "medium",
        diagnosis,
        affectedSceneOrders,
        revisionRule,
      };
    })
    .filter((item): item is VisualPlanGlobalFinding => Boolean(item))
    .slice(0, 5);
}

function normalizeSceneFindings(value: unknown): VisualPlanSceneFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const sceneOrders = normalizeSceneOrders(record.sceneOrders);
      const diagnosis =
        typeof record.diagnosis === "string" ? record.diagnosis.trim() : "";
      const exactFix =
        typeof record.exactFix === "string" ? record.exactFix.trim() : "";
      const action =
        typeof record.action === "string" ? record.action.trim() : "revise_visual";
      const category =
        typeof record.category === "string" ? record.category.trim() : "";
      const severity =
        typeof record.severity === "string" ? record.severity.trim() : "medium";
      const mustPreserve = normalizeStringList(record.mustPreserve, 8);
      const findingId =
        typeof record.findingId === "string" && record.findingId.trim()
          ? record.findingId.trim()
          : `S${index + 1}`;
      if (sceneOrders.length === 0 || !diagnosis) {
        return null;
      }
      return {
        findingId,
        sceneOrders,
        severity,
        category: category || "promptQuality",
        action,
        diagnosis,
        exactFix,
        mustPreserve,
      };
    })
    .filter((item): item is VisualPlanSceneFinding => Boolean(item))
    .slice(0, 40);
}

function normalizeSequenceFindings(value: unknown): VisualPlanSequenceFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const sceneOrders = normalizeSceneOrders(record.sceneOrders);
      const diagnosis =
        typeof record.diagnosis === "string" ? record.diagnosis.trim() : "";
      const exactFix =
        typeof record.exactFix === "string" ? record.exactFix.trim() : "";
      const action =
        typeof record.action === "string"
          ? record.action.trim()
          : "sequence_adjustment";
      const severity =
        typeof record.severity === "string" ? record.severity.trim() : "medium";
      const findingId =
        typeof record.findingId === "string" && record.findingId.trim()
          ? record.findingId.trim()
          : `Q${index + 1}`;
      if (sceneOrders.length === 0 || !diagnosis) {
        return null;
      }
      return { findingId, sceneOrders, severity, action, diagnosis, exactFix };
    })
    .filter((item): item is VisualPlanSequenceFinding => Boolean(item))
    .slice(0, 12);
}

function normalizeResolvedFindings(value: unknown): VisualPlanResolvedFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const previousFinding =
        typeof record.previousFinding === "string"
          ? record.previousFinding.trim()
          : "";
      const resolution =
        typeof record.resolution === "string" ? record.resolution.trim() : "";
      const sceneOrders = normalizeSceneOrders(record.sceneOrders);
      if (!previousFinding && !resolution) {
        return null;
      }
      return {
        previousFinding,
        sceneOrders,
        resolution,
      };
    })
    .filter((item): item is VisualPlanResolvedFinding => Boolean(item))
    .slice(0, 20);
}

function normalizeRegressions(value: unknown): VisualPlanRegression[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const sceneOrders = normalizeSceneOrders(record.sceneOrders);
      const diagnosis =
        typeof record.diagnosis === "string" ? record.diagnosis.trim() : "";
      const exactFix =
        typeof record.exactFix === "string" ? record.exactFix.trim() : "";
      const category =
        typeof record.category === "string" ? record.category.trim() : "";
      const action =
        typeof record.action === "string"
          ? record.action.trim()
          : "restore_previous";
      if (sceneOrders.length === 0 || !diagnosis) {
        return null;
      }
      return {
        sceneOrders,
        category: category || "semanticAlignment",
        diagnosis,
        action,
        exactFix,
      };
    })
    .filter((item): item is VisualPlanRegression => Boolean(item))
    .slice(0, 12);
}

function deriveTopFixes({
  sceneFindings,
  globalFindings,
  sequenceFindings,
  regressions = [],
}: {
  sceneFindings: VisualPlanSceneFinding[];
  globalFindings: VisualPlanGlobalFinding[];
  sequenceFindings: VisualPlanSequenceFinding[];
  regressions?: VisualPlanRegression[];
}): string[] {
  const fromScenes = sceneFindings.map((item) => {
    const orders = formatSceneOrders(item.sceneOrders);
    const fix = item.exactFix || item.diagnosis;
    return `${item.findingId} scenes ${orders} (${item.action}): ${fix}`;
  });
  const fromGlobal = globalFindings
    .filter((item) => item.affectedSceneOrders.length > 0)
    .map((item) => {
      const orders = formatSceneOrders(item.affectedSceneOrders);
      return `${item.findingId} ${item.category} scenes ${orders}: ${item.revisionRule || item.diagnosis}`;
    });
  const fromSequence = sequenceFindings.map((item) => {
    const orders = formatSceneOrders(item.sceneOrders);
    return `Sequence ${orders} (${item.action}): ${item.exactFix || item.diagnosis}`;
  });
  const fromRegressions = regressions.map((item) => {
    const orders = formatSceneOrders(item.sceneOrders);
    return `Regression scenes ${orders} (${item.action}): ${item.exactFix || item.diagnosis}`;
  });

  return [...fromRegressions, ...fromScenes, ...fromGlobal, ...fromSequence]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function formatSceneOrders(orders: number[]): string {
  if (orders.length === 0) {
    return "?";
  }
  return orders.join(", ");
}
