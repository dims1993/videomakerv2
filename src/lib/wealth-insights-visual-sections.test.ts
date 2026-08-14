import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WEALTH_BODY_SCENE_HARD_MAX_SEC,
  WEALTH_HOOK_TARGET_MIN_SEC,
  assembleVisualPlanSections,
  buildWealthInsightsVisualElementLibraryCompact,
  buildWealthVisualContinuityState,
  detectWealthInsightsHookBoundary,
  estimateWealthNarrationSeconds,
  sectionsReconstructScript,
  splitWealthInsightsScriptIntoVisualPlanSections,
  validateFullVisualPlanScriptCoverage,
  validateSequentialSceneOrders,
  validateWealthSceneDurations,
} from "./wealth-insights-visual-sections";
import { buildWealthInsightsSectionHybridContext } from "./wealth-insights-visual-brief";
import {
  buildSectionVisualPlanChunkPrompt,
  summarizeSectionSceneTypeMix,
} from "./visual-plan-script-sections";
import {
  channelUsesSectionHybridVisualPlan,
  resolveVisualPlanSectionsForChannel,
} from "./visual-plan-section-routing";
import { buildVisualPlanSectionChunkRepairPrompt } from "./visual-plan-validate";
import { segmentHookNarration, stripStructuralMarkers } from "./visual-plan-script";

/** ~2+ minutes of spoken narration at Wealth WPM (~130–145). */
function longHookNarration(minutes = 2.1) {
  const targetWords = Math.ceil(minutes * 138);
  const sentence =
    "The moving truck is already gone, the keys are on the counter, and the new apartment looks like a win. ";
  let text = "";
  while (text.split(/\s+/).filter(Boolean).length < targetWords) {
    text += sentence;
  }
  return text.trim();
}

function sampleMarkedWealthScript(options?: { shortHook?: boolean }) {
  const hook = options?.shortHook
    ? [
        "The moving truck is already gone, the keys are on the counter, and the new apartment looks like a win.",
        "The bedroom is bigger. There is finally a real dining area. Maybe even a spare corner for a desk.",
        "On paper, the upgrade made sense. So where did the leftover money go?",
      ].join(" ")
    : longHookNarration(2.15);

  const bodyParagraphs = [
    "Because before signing the lease, most people already do the obvious math. They compare the old rent with the new rent.",
    "They add the deposit, the moving fee, the application fee, the first month, the last month, whatever the landlord requires.",
    "They stare at the monthly difference and ask, can I handle this? And sometimes the honest answer is yes.",
    "The strange part is what happens after the obvious math is finished.",
    "A bigger apartment creates possibility. And possibility feels good.",
    "You stand in the living room and notice that the old couch now looks slightly lost.",
    "The wall behind it feels too empty. The rug is suddenly too small.",
    "That is the first trick of extra square footage. It often feels like a quiet request to complete the space.",
    "Then the next purchase arrives, and the next one after that, until the leftover money feels mysteriously thinner.",
    "The spreadsheet still looks neat. The bank account does not.",
  ];
  // Ensure enough body remains after a short marked hook is extended to 2 minutes.
  while (options?.shortHook && bodyParagraphs.join(" ").split(/\s+/).length < 420) {
    bodyParagraphs.push(
      "Another quiet cost appears in the background, and another choice starts looking inevitable even though nobody planned for it.",
    );
  }
  const body = bodyParagraphs.join("\n\n");

  return `[HOOK]\n${hook}\n[END HOOK]\n\n${body}`;
}

describe("wealth-insights visual plan sections", () => {
  it("detects exact hook boundary from markers when hook is ≥2 minutes", () => {
    const script = sampleMarkedWealthScript();
    const boundary = detectWealthInsightsHookBoundary(script);
    assert.equal(boundary.source, "markers");
    assert.ok(boundary.estimatedHookSeconds >= WEALTH_HOOK_TARGET_MIN_SEC);
    assert.match(boundary.hookText, /moving truck is already gone/);
    assert.doesNotMatch(boundary.hookText, /\[HOOK\]/);
    assert.doesNotMatch(boundary.hookText, /obvious math/);
    assert.match(boundary.bodyText, /obvious math/);
  });

  it("extends short [HOOK] markers to reach the 2-minute minimum", () => {
    const script = sampleMarkedWealthScript({ shortHook: true });
    const boundary = detectWealthInsightsHookBoundary(script);
    assert.equal(boundary.source, "timing");
    assert.ok(boundary.estimatedHookSeconds >= WEALTH_HOOK_TARGET_MIN_SEC * 0.95);
    assert.match(boundary.hookText, /moving truck is already gone/);
    assert.match(boundary.hookText, /obvious math/);
  });

  it("HOOK section is separate from first BODY and covers ≥2 minutes", () => {
    const sections = splitWealthInsightsScriptIntoVisualPlanSections(
      sampleMarkedWealthScript(),
    );
    assert.equal(sections[0]?.label, "HOOK");
    assert.ok(
      estimateWealthNarrationSeconds(sections[0]!.text) >= WEALTH_HOOK_TARGET_MIN_SEC,
    );
    assert.ok(sections.length >= 2);
    assert.match(sections[1]?.label ?? "", /^BODY/);
    assert.doesNotMatch(sections.map((s) => s.label).join(","), /OPENING/);
  });

  it("splitter reconstructs exact original spoken script", () => {
    const script = sampleMarkedWealthScript();
    const sections = splitWealthInsightsScriptIntoVisualPlanSections(script);
    const reconstruct = sectionsReconstructScript(script, sections);
    assert.equal(reconstruct.ok, true);
    assert.equal(
      sections.map((section) => section.text).join(""),
      stripStructuralMarkers(script).replace(/\r\n/g, "\n").trim(),
    );
  });

  it("timing fallback still creates a HOOK section without markers", () => {
    const unmarked = stripStructuralMarkers(sampleMarkedWealthScript());
    const sections = splitWealthInsightsScriptIntoVisualPlanSections(unmarked);
    assert.equal(sections[0]?.label, "HOOK");
    assert.ok(
      estimateWealthNarrationSeconds(sections[0]!.text) >= WEALTH_HOOK_TARGET_MIN_SEC,
    );
    const reconstruct = sectionsReconstructScript(unmarked, sections);
    assert.equal(reconstruct.ok, true);
  });

  it("hook markers/metadata never enter scene.scriptText coverage inputs", () => {
    const sections = splitWealthInsightsScriptIntoVisualPlanSections(
      sampleMarkedWealthScript(),
    );
    for (const section of sections) {
      assert.doesNotMatch(section.text, /\[HOOK\]/i);
      assert.doesNotMatch(section.text, /\[END\s*HOOK\]/i);
    }
    const coverage = validateFullVisualPlanScriptCoverage(
      sampleMarkedWealthScript(),
      sections.map((section) => section.text),
    );
    assert.equal(coverage.ok, true);
  });

  it("estimated hook scene >5.5s fails regardless of declared duration", () => {
    const longHookBeat =
      "The paycheck looks the same. The expected bills are there. Nothing dramatic happened. No emergency. No reckless spending spree. No obvious mistake.";
    const estimated = estimateWealthNarrationSeconds(longHookBeat);
    assert.ok(estimated > 5.5);

    const errors = validateWealthSceneDurations(
      [{ scriptText: longHookBeat, duration: 5 }],
      { isHookSection: true },
    );
    assert.ok(errors.some((error) => /HOOK hard maximum/i.test(error)));
    assert.ok(errors.some((error) => /declared duration 5s is irrelevant/i.test(error)));
  });

  it("lowering duration cannot bypass hook validation", () => {
    const errorsLow = validateWealthSceneDurations(
      [
        {
          scriptText:
            "The paycheck looks the same. The expected bills are there. Nothing dramatic happened.",
          duration: 3,
        },
      ],
      { isHookSection: true },
    );
    assert.ok(errorsLow.length > 0);
    assert.ok(
      errorsLow.some(
        (error) =>
          /HOOK hard maximum/i.test(error) || /incompatible with estimated/i.test(error),
      ),
    );
  });

  it("body scenes hard-max at 8s estimated", () => {
    const bodyOk = validateWealthSceneDurations(
      [
        {
          scriptText: "They compare the old rent with the new rent carefully.",
          duration: 6,
        },
      ],
      { isHookSection: false },
    );
    assert.deepEqual(bodyOk, []);

    const bodyTooLong = validateWealthSceneDurations(
      [
        {
          scriptText: "word ".repeat(40).trim(),
          duration: 9,
        },
      ],
      { isHookSection: false },
    );
    assert.ok(
      bodyTooLong.some((error) =>
        new RegExp(`${WEALTH_BODY_SCENE_HARD_MAX_SEC}`).test(error),
      ),
    );
  });

  it("HOOK chunk prompt is unambiguous and can include suggested beats", () => {
    const sections = splitWealthInsightsScriptIntoVisualPlanSections(
      sampleMarkedWealthScript(),
    );
    const hook = sections[0]!;
    const suggested = segmentHookNarration(hook.text).slice(0, 8);
    const prompt = buildSectionVisualPlanChunkPrompt({
      contextPrompt: buildWealthInsightsSectionHybridContext({ mode: "default" }),
      section: hook,
      totalSections: sections.length,
      previousTail: [],
      hardHookMode: true,
      suggestedBeats: suggested,
      sceneTypeMix: summarizeSectionSceneTypeMix([]),
      sceneTypeMixMode: "avatar-default",
      includeCoverRules: false,
      continuityExtras: {
        nextSceneOrder: 1,
        completedScenes: 0,
      },
      timingHint: "HOOK: ~2–4s",
    });
    assert.match(prompt, /Section label: \[HOOK\]/);
    assert.match(prompt, /Hard Hook Segmentation Override|HOOK section \(authoritative\)/);
    assert.match(prompt, /Suggested hook micro-beats/);
    assert.doesNotMatch(prompt, /OPENING/);
  });

  it("repair prompt forbids lowering duration and includes diagnostics", () => {
    const repair = buildVisualPlanSectionChunkRepairPrompt({
      sectionIndex: 1,
      totalSections: 4,
      sectionLabel: "HOOK",
      sectionText: "The bedroom is bigger.",
      startOrder: 1,
      validationErrors: [
        "Scene 1: estimated narration 7.8s exceeds HOOK hard maximum 5.5s",
      ],
      invalidResponse: "[]",
      sceneDiagnostics: [
        {
          index: 1,
          estimatedSeconds: 7.8,
          declaredDuration: 5,
          scriptText: "The bedroom is bigger. There is finally a real dining area.",
        },
      ],
    });
    assert.match(repair, /Do NOT solve this by lowering the duration value/);
    assert.match(repair, /estimated 7\.8s/);
    assert.match(repair, /declared duration 5s/);
  });

  it("assembly remains unchanged and schema stays strict", () => {
    const assembled = assembleVisualPlanSections([
      [
        {
          order: 9,
          scriptText: "One.",
          sceneType: "avatar",
          visualPurpose: "a",
          visualIdea: "MAIN HOST: a",
          duration: 3,
          imagePrompt: "p",
          status: "planned",
        },
      ],
      [
        {
          order: 1,
          scriptText: "Two.",
          sceneType: "avatar",
          visualPurpose: "b",
          visualIdea: "MAIN HOST: b",
          duration: 4,
          imagePrompt: "p",
          status: "planned",
        },
      ],
    ]);
    assert.deepEqual(
      assembled.map((scene) => scene.order),
      [1, 2],
    );
    assert.equal(validateSequentialSceneOrders(assembled).ok, true);
    assert.deepEqual(Object.keys(assembled[0]!).sort(), [
      "duration",
      "imagePrompt",
      "order",
      "sceneType",
      "scriptText",
      "status",
      "visualIdea",
      "visualPurpose",
    ]);
  });

  it("segmentHookNarration preserves aggressive hook micro-beats for examples", () => {
    const beats = segmentHookNarration(
      "The bedroom is bigger. There is finally a real dining area. Maybe even a spare corner for a desk.",
    );
    assert.ok(beats.length >= 3);
    const coverage = validateFullVisualPlanScriptCoverage(
      "The bedroom is bigger. There is finally a real dining area. Maybe even a spare corner for a desk.",
      beats,
    );
    assert.equal(coverage.ok, true);
  });

  it("platform fill-hybrid: Wealth no longer routes to section hybrid", () => {
    assert.equal(
      channelUsesSectionHybridVisualPlan({
        channelKey: "wealth-insights",
        script: "Plain narration.",
      }),
      false,
    );
    const sections = resolveVisualPlanSectionsForChannel({
      channelKey: "wealth-insights",
      script: sampleMarkedWealthScript(),
    });
    assert.equal(sections[0]?.label, "HOOK");
  });

  it("continuity state still tracks next order", () => {
    const continuity = buildWealthVisualContinuityState([
      {
        order: 1,
        scriptText: "A",
        sceneType: "avatar",
        visualPurpose: "p",
        visualIdea: "MAIN HOST: rent tag",
        imagePrompt: "x",
        duration: 3,
      },
    ]);
    assert.equal(continuity.nextSceneOrder, 2);
    assert.ok(
      buildWealthInsightsVisualElementLibraryCompact({
        title: "Test",
        topicCategory: "housing",
      }).includes("Internal Visual Element Library"),
    );
  });
});
