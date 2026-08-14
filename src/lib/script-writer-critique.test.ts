import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SCRIPT_WRITER_PASS_SCORE,
  buildScriptWriterRevisionPrompt,
  buildWealthPolishDepthRules,
  considerScriptWriterBestDraft,
  escalateStalledPolishDecision,
  extractScriptScore,
  getScriptWriterMaxDrafts,
  getScriptWriterScorePrompt,
  looksLikeScriptScoreResponse,
  resolveScriptWriterRevisionDecision,
  shouldRequestScriptRevision,
  shouldReviseScriptForDecision,
} from "@/lib/script-writer-critique";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-english-lessons-script-shared";

test("extractScriptScore maps wealth mainWeakness/mainStrength fields", () => {
  const result = extractScriptScore(`{
  "score": 8.4,
  "decision": "polish",
  "dimensionScores": {"hook": 8.2, "mechanism": 8.8, "retention": 7.9, "voiceover": 8.7},
  "mainStrength": "Clear hidden mechanism.",
  "mainWeakness": "Hook reveals the thesis too early.",
  "mustFix": ["Rewrite opening as incomplete micro-story"],
  "rewritePriority": ["opening"]
}`);
  assert.equal(result.score, 8.4);
  assert.equal(result.decision, "polish");
  assert.equal(result.briefReason, "Hook reveals the thesis too early.");
  assert.deepEqual(result.strengths, ["Clear hidden mechanism."]);
  assert.deepEqual(result.mustFix, ["Rewrite opening as incomplete micro-story"]);
  assert.deepEqual(result.rewritePriority, ["opening"]);
});

test("extractScriptScore reads JSON score", () => {
  const result = extractScriptScore(`{
  "score": 8.4,
  "briefReason": "Hook arrives late."
}`);

  assert.equal(result.score, 8.4);
  assert.match(result.briefReason ?? "", /Hook arrives late/);
});

test("extractScriptScore reads rich podcast critique fields", () => {
  const result = extractScriptScore(`{
  "score": 8.1,
  "briefReason": "Practice system is thin.",
  "dimensionScores": {"hook": 8.5, "practice": 6.5},
  "strengths": ["Clear cold open"],
  "mustFix": ["Add Listen and Repeat without Leo echo"],
  "rewritePriority": ["Expand practice PARTs"]
}`);
  assert.equal(result.score, 8.1);
  assert.equal(result.dimensionScores?.practice, 6.5);
  assert.deepEqual(result.mustFix, ["Add Listen and Repeat without Leo echo"]);
  assert.deepEqual(result.rewritePriority, ["Expand practice PARTs"]);
});

test("extractScriptScore reads prose score with comma decimal", () => {
  const result = extractScriptScore("Score: 9,5/10 — strong pacing.");
  assert.equal(result.score, 9.5);
});

test("extractScriptScore reads compact 9.3 JSON", () => {
  const result = extractScriptScore(
    '{"score":9.3,"briefReason":"The revision is tightly paced, clearly explains distraction as the mechanism, and reads naturally, though a few later lines still echo earlier ideas."}',
  );
  assert.equal(result.score, 9.3);
  assert.equal(shouldRequestScriptRevision(result.score), false);
});

test("looksLikeScriptScoreResponse accepts score JSON even with chrome", () => {
  const raw = `Editar
{"score":9.3,"briefReason":"Tight pacing."}
Copiar`;
  assert.equal(looksLikeScriptScoreResponse(raw), true);
});

test("looksLikeScriptScoreResponse detects short score replies", () => {
  assert.equal(looksLikeScriptScoreResponse('{"score": 9.3, "briefReason": "ok"}'), true);
  assert.equal(looksLikeScriptScoreResponse("Editar\n9.3/10\nCopiar"), true);
  assert.equal(
    looksLikeScriptScoreResponse("There is a quiet moment most people overlook when they think about mercy and the long path of patience in ordinary days."),
    false,
  );
});

test("shouldRequestScriptRevision uses strict threshold above 9.2", () => {
  assert.equal(SCRIPT_WRITER_PASS_SCORE, 9.2);
  assert.equal(shouldRequestScriptRevision(9.2), true);
  assert.equal(shouldRequestScriptRevision(9.3), false);
  assert.equal(shouldRequestScriptRevision(8.1), true);
  assert.equal(shouldRequestScriptRevision(null), true);
});

test("wealth revision decisions follow scorer decision bands", () => {
  assert.equal(
    resolveScriptWriterRevisionDecision({
      decision: "pass",
      score: 8.0,
      channelKey: "wealth-insights",
    }),
    "polish",
  );
  assert.equal(
    resolveScriptWriterRevisionDecision({
      decision: "pass",
      score: 9.2,
      channelKey: "wealth-insights",
    }),
    "polish",
  );
  assert.equal(
    shouldReviseScriptForDecision(
      resolveScriptWriterRevisionDecision({
        decision: "pass",
        score: 9.5,
        channelKey: "wealth-insights",
      }),
    ),
    false,
  );
  assert.equal(
    shouldReviseScriptForDecision(
      resolveScriptWriterRevisionDecision({
        decision: "polish",
        score: 8.4,
        channelKey: "wealth-insights",
      }),
    ),
    true,
  );
  assert.equal(
    resolveScriptWriterRevisionDecision({
      score: 9.0,
      channelKey: "wealth-insights",
    }),
    "polish",
  );
  assert.equal(
    resolveScriptWriterRevisionDecision({
      score: 9.3,
      channelKey: "wealth-insights",
    }),
    "pass",
  );
  assert.equal(
    resolveScriptWriterRevisionDecision({
      score: 8.4,
      channelKey: "wealth-insights",
    }),
    "polish",
  );
  assert.equal(
    resolveScriptWriterRevisionDecision({
      score: 7.2,
      channelKey: "wealth-insights",
    }),
    "rewrite",
  );
  assert.equal(
    resolveScriptWriterRevisionDecision({
      score: 6.1,
      channelKey: "wealth-insights",
    }),
    "regenerate",
  );
});

test("stalled polish escalates to rewrite after two flat scores", () => {
  const first = escalateStalledPolishDecision({
    decision: "polish",
    score: 8.6,
    previousScore: null,
    stalledPolishCount: 0,
  });
  assert.equal(first.decision, "polish");
  assert.equal(first.stalledPolishCount, 0);
  assert.equal(first.escalated, false);

  const second = escalateStalledPolishDecision({
    decision: "polish",
    score: 8.6,
    previousScore: 8.6,
    stalledPolishCount: first.stalledPolishCount,
  });
  assert.equal(second.decision, "polish");
  assert.equal(second.stalledPolishCount, 1);
  assert.equal(second.escalated, false);

  const third = escalateStalledPolishDecision({
    decision: "polish",
    score: 8.6,
    previousScore: 8.6,
    stalledPolishCount: second.stalledPolishCount,
  });
  assert.equal(third.decision, "rewrite");
  assert.equal(third.stalledPolishCount, 2);
  assert.equal(third.escalated, true);

  const gained = escalateStalledPolishDecision({
    decision: "polish",
    score: 9.0,
    previousScore: 8.6,
    stalledPolishCount: 1,
  });
  assert.equal(gained.decision, "polish");
  assert.equal(gained.stalledPolishCount, 0);
  assert.equal(gained.escalated, false);
});

test("keeps the highest-scoring draft and rejects regressions", () => {
  const first = considerScriptWriterBestDraft(null, {
    draftNumber: 1,
    script: "Draft one narration.",
    score: 9.0,
    briefReason: "Strong hook",
    mustFix: ["Tighten ending"],
    rewritePriority: ["ending"],
  });
  assert.equal(first.accepted, true);
  assert.equal(first.rejectedAsRegression, false);
  assert.equal(first.best?.score, 9.0);

  const worse = considerScriptWriterBestDraft(first.best, {
    draftNumber: 2,
    script: "Draft two narration is weaker.",
    score: 8.4,
    briefReason: "Lost momentum",
    mustFix: ["Restore hook"],
  });
  assert.equal(worse.accepted, false);
  assert.equal(worse.rejectedAsRegression, true);
  assert.equal(worse.best?.draftNumber, 1);
  assert.equal(worse.best?.script, "Draft one narration.");

  const better = considerScriptWriterBestDraft(first.best, {
    draftNumber: 3,
    script: "Draft three narration.",
    score: 9.4,
    briefReason: "Ready",
  });
  assert.equal(better.accepted, true);
  assert.equal(better.best?.draftNumber, 3);
  assert.equal(better.best?.score, 9.4);

  const tie = considerScriptWriterBestDraft(first.best, {
    draftNumber: 4,
    script: "Different wording same score.",
    score: 9.0,
    briefReason: "Tie",
  });
  assert.equal(tie.accepted, true);
  assert.equal(tie.rejectedAsRegression, false);
  assert.equal(tie.best?.draftNumber, 1);
});

test("wealth polish depth lock is surgical; rewrite keeps structural checklist", () => {
  assert.match(
    buildWealthPolishDepthRules("polish") ?? "",
    /surgical polish/i,
  );
  assert.match(
    buildWealthPolishDepthRules("polish") ?? "",
    /Do NOT restructure/i,
  );
  assert.match(
    buildWealthPolishDepthRules("rewrite") ?? "",
    /Anti-repetition/i,
  );
});

test("wealth revision prompt stays short and same-thread (no bible/script re-attach)", async () => {
  const revision = await buildScriptWriterRevisionPrompt({
    draftNumber: 1,
    score: 8.2,
    briefReason: "Hook reveals the thesis too early.",
    channelKey: "wealth-insights",
    script: "THIS_SCRIPT_SHOULD_NOT_APPEAR",
    mustFix: ["Fix the opening"],
    rewritePriority: ["opening"],
    dimensionScores: { hook: 7.0 },
    decision: "polish",
    projectBible: "PROJECT_BIBLE_MARK",
    currentIdeaJson: { workingTitle: "Test Title", uniqueMechanism: "X" },
    episodeContext: {
      channelKey: "wealth-insights",
      channelName: "Wealth Insights",
      videoTitle: "Test Title",
      topic: "Test",
      topicCategory: "savings",
      topicCategoryLabel: "Saving",
      topicCategoryDescription: "Savings",
      episodeMode: "personal_finance_explainer",
    },
  });
  assert.match(revision, /Revise the Wealth Insights narration script/i);
  assert.match(revision, /Hook reveals the thesis too early/);
  assert.match(revision, /Fix the opening/);
  assert.match(revision, /Score: 8\.2/);
  assert.match(revision, /Revision depth hint: polish/);
  assert.doesNotMatch(revision, /PROJECT_BIBLE_MARK/);
  assert.doesNotMatch(revision, /THIS_SCRIPT_SHOULD_NOT_APPEAR/);
  assert.doesNotMatch(revision, /# Project Bible/);
  assert.doesNotMatch(revision, /# Previous Script/);
  assert.doesNotMatch(revision, /# Score JSON/);
  assert.ok(revision.length < 4000);
});

test("podcast max drafts is 3; wealth max drafts is 2", () => {
  assert.equal(getScriptWriterMaxDrafts(PODCAST_ENGLISH_LESSONS_CHANNEL_KEY), 3);
  assert.equal(getScriptWriterMaxDrafts("wealth-insights"), 2);
});

test("wealth score prompt uses preceding-assistant rules without re-attaching script", async () => {
  const scorePrompt = await getScriptWriterScorePrompt("wealth-insights", {
    script: "THIS_SHOULD_NOT_APPEAR_IN_SCORE_PROMPT",
    projectBible: "PROJECT_BIBLE_SCORE",
    currentIdeaJson: {
      workingTitle: "List Title",
      topicCategory: "narrative_economics_stories",
    },
    episodeContext: {
      channelKey: "wealth-insights",
      channelName: "Wealth Insights",
      videoTitle: "List Title",
      topic: "Costco",
      topicCategory: "narrative_economics_stories",
      topicCategoryLabel: "Narrative Economics Stories",
      topicCategoryDescription: "Business stories",
      episodeMode: "narrative_economics_stories",
    },
  });
  assert.match(scorePrompt, /# Script Writer Score Prompt/);
  assert.match(scorePrompt, /# Scoring Rules/);
  assert.match(
    scorePrompt,
    /Evaluate the complete narration script contained in the immediately preceding assistant message/,
  );
  assert.match(scorePrompt, /strictly above 9\.2/i);
  assert.doesNotMatch(scorePrompt, /PROJECT_BIBLE_SCORE/);
  assert.doesNotMatch(scorePrompt, /THIS_SHOULD_NOT_APPEAR_IN_SCORE_PROMPT/);
  assert.doesNotMatch(scorePrompt, /# Script To Evaluate/);
  assert.doesNotMatch(scorePrompt, /# Project Bible/);
});

test("podcast score/revision prompts protect the bracket spine", async () => {
  const scorePrompt = await getScriptWriterScorePrompt(
    PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
    { script: "[INTRO]\n[EMMA]\nHi.\n" },
  );
  assert.match(scorePrompt, /\[INTRO\]/);
  assert.match(scorePrompt, /\[PART N - TITLE\]/);
  assert.match(
    scorePrompt,
    /Evaluate the complete narration script contained in the immediately preceding assistant message/,
  );
  assert.doesNotMatch(scorePrompt, /SCRIPT TO SCORE/);
  assert.doesNotMatch(scorePrompt, /\[EMMA\]\nHi\./);
  assert.match(scorePrompt, /Do NOT artificially limit early drafts/i);
  assert.match(scorePrompt, /mustFix/);
  assert.match(
    await getScriptWriterScorePrompt("the-gods-word"),
    /Score THAT LATEST script honestly/,
  );
  assert.doesNotMatch(
    await getScriptWriterScorePrompt("the-gods-word", { script: "NOPE" }),
    /SCRIPT TO SCORE/,
  );

  const revision = await buildScriptWriterRevisionPrompt({
    draftNumber: 1,
    score: 9.0,
    briefReason:
      "Strong structure and format compliance, but the lesson is a bit overlong and occasionally too meta for smooth audio retention.",
    channelKey: PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
    script: "[INTRO]\n[EMMA]\nHello.\n",
    mustFix: ["Add Your Turn with pause before Leo answer"],
    rewritePriority: ["Expand practice via role-play, not echoes"],
  });
  assert.match(revision, /Hard structure rules/);
  assert.match(revision, /\[FINAL\] comes BEFORE the goodbye/);
  assert.match(revision, /Never drop or rename the required bracket labels/);
  assert.match(revision, /\[hungry\]/);
  assert.match(revision, /MUST FIX/);
  assert.match(revision, /REWRITE PRIORITY/);
  assert.match(revision, /Critique JSON from the scorer/);
  assert.match(revision, /overlong and occasionally too meta/);
  assert.match(revision, /CURRENT DRAFT V1/);
  assert.match(revision, /\[INTRO\]/);
  assert.match(revision, /Do NOT wrap the script in JSON/);
  assert.match(revision, /NEVER via mechanical echoes/);
});

test("extractScriptScore recovers score JSON wrapped in ChatGPT chrome", () => {
  const result = extractScriptScore(`Editar
{"score":9.0,"briefReason":"Strong structure and format compliance, but the lesson is a bit overlong and occasionally too meta for smooth audio retention."}
Copiar`);
  assert.equal(result.score, 9.0);
  assert.match(result.briefReason ?? "", /overlong and occasionally too meta/);
});
