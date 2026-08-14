/**
 * Compact Wealth Insights Visual Plan context for section-chunk hybrid mode.
 * Preserves Wealth creative rules; does not import TheGodsWord style.
 */

import {
  WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK,
  buildNarrativeEconomicsStoriesVisualBrief,
  type WealthInsightsVisualMode,
} from "@/lib/wealth-insights-visual-mode";
import {
  WEALTH_INSIGHTS_AVOID_LOCK,
  WEALTH_INSIGHTS_CREATE_LOCK,
  WEALTH_INSIGHTS_MAIN_HOST_LOCK,
  WEALTH_INSIGHTS_STYLE_LOCK,
} from "@/lib/wealth-insights-image-prompt";

export const WEALTH_INSIGHTS_MAIN_HOST_DESCRIPTOR = WEALTH_INSIGHTS_MAIN_HOST_LOCK;

export const WEALTH_INSIGHTS_SUPPORTING_CHARACTER_DESCRIPTOR =
  "supporting background/side character from the same Wealth Insights character universe: diverse adult in their 20s to 40s, varied skin tone/ethnicity/hairstyle/facial features as needed, friendly relatable everyday professional or smart-casual appearance, modern simple clothing (office wear, blazer, shirt, sweater, blouse, neutral pants, clean everyday shoes), natural clear readable expression (curious, concerned, surprised, thoughtful, happy, or attentive), slightly stylized cartoon-friendly proportions, clean facial structure, approachable body language, drawn in the same clean 2D vector cartoon style as the main host, thick clean outlines, smooth flat colors, simple shading, polished educational thumbnail aesthetic";

export const WEALTH_INSIGHTS_DEFAULT_STYLE_LOCK = WEALTH_INSIGHTS_STYLE_LOCK;

export function buildWealthInsightsTimingRules() {
  return [
    "## Timing Rules (Wealth Insights — mandatory)",
    "",
    "Mandatory three-stage process for THIS section:",
    "1. Scene boundary planning (meaning-first)",
    "2. Duration validation and repair",
    "3. Image prompt generation (only after durations pass)",
    "",
    "Voice profile baseline:",
    "- about 130–145 spoken words per minute",
    "- add pauses for commas, periods, questions, and list rhythm",
    "- do not assume fast narration",
    "",
    "HOOK section (Section label [HOOK] — unambiguous):",
    "- the HOOK section covers at least the first ~2 minutes of spoken narration (editorial minimum)",
    "- normal target: approximately 2–4 seconds per scene inside that section",
    "- 4–5 seconds only when genuinely one indivisible visual beat",
    "- 5.5 seconds estimated narration is the absolute ceiling per scene (not a target)",
    "- estimated narration is authoritative; never bypass by lowering duration",
    "- Hard Hook Segmentation Override beats body consolidation",
    "",
    "Body / CLOSING sections:",
    "- target 5–8 seconds per scene",
    "- 8 seconds estimated narration is the absolute ceiling (not soft)",
    "",
    "Hard limits: HOOK scenes ≤ 5.5s estimated; BODY/CLOSING scenes ≤ 8s estimated.",
    "duration must never be shorter than the narration time required by scriptText.",
    "If a coherent beat is too long, split into sub-beats BEFORE writing imagePrompts.",
    "Do not fix long narration by only raising or lowering duration.",
  ].join("\n");
}

/**
 * Timing guidance for fill-hybrid: skeleton already owns scriptText + duration.
 * ChatGPT must not re-segment or invent new scene boundaries.
 */
export function buildWealthInsightsFillTimingRules() {
  return [
    "## Timing guidance (fill-hybrid — informational)",
    "",
    "The app already built scene boundaries and durations locally.",
    "Do NOT re-segment the script.",
    "Do NOT invent, merge, or omit scenes.",
    "Keep each imagePrompt / visualIdea matched to the provided scriptText only.",
    "",
    "Voice profile baseline (for visual pacing feel only):",
    "- about 130–145 spoken words per minute",
    "",
    "Typical skeleton targets (already applied by the app):",
    "- HOOK beats: short (~2–4s; hard ceiling ~5.5s estimated narration)",
    "- BODY / CLOSING beats: ~5–8s (hard ceiling 8s estimated narration)",
    "",
    "If a skeleton duration looks slightly off, you may nudge duration a little,",
    "but never rewrite scriptText to force a timing fix.",
  ].join("\n");
}

export function buildWealthInsightsSegmentationRules() {
  return [
    "## Meaning-first segmentation (Wealth Insights)",
    "",
    "scriptText is the director of every scene.",
    "Each scene must show the mechanism, consequence, decision, pressure, contradiction,",
    "emotional shift, or cause-and-effect of THAT exact fragment — not a generic topic symbol.",
    "",
    "Pipeline per scene:",
    "scriptText -> visible mechanism/consequence -> dominant explanatory element -> host relationship",
    "",
    "One scene = one coherent visual beat.",
    "Split when the dominant visual object, emotional beat, mechanism, consequence, example,",
    "cost, pressure, contrast, reveal, math example, character comparison, story→explanation,",
    "explanation→math, math→consequence, trap/rule/step/framework, metaphor, or mental image changes.",
    "",
    "Do not merge two different beats only to reduce scene count.",
    "Long lists must be split.",
    "Math examples usually split into: setup / numbers / comparison / consequence.",
    "Character comparisons usually split into: introduction / decision / behavior / consequence / contrast.",
  ].join("\n");
}

export function buildWealthInsightsDefaultVisualSystemRules() {
  return [
    "## Visual system: MAIN HOST + BIG EXPLANATORY ELEMENTS",
    "",
    "Default mode requires the recurring Wealth Insights main host in almost every scene.",
    "Host identity and art style are APP-OWNED locks. Do NOT rewrite the host face, hair, outfit, or style paragraph.",
    "Describe only the host's action / pose / emotion relative to the explanatory element.",
    `Supporting character (when needed, short cue only): "${WEALTH_INSIGHTS_SUPPORTING_CHARACTER_DESCRIPTOR}"`,
    "",
    "Composition:",
    "- host + one dominant explanatory element",
    "- host must be visually connected to that element (points, holds, reacts, steadies, reveals)",
    "- few large elements; readable in under one second",
    "- no generic AI finance posters, random stock characters, or IP-adjacent references",
    "- no photorealism, no 3D, no anime",
    "",
    "visualIdea usually starts with: MAIN HOST:",
    "",
    "sceneType guidance (NOT TheGodsWord mix targets):",
    '- "avatar" is the normal default when the main host appears with an explanatory element',
    '- "insert" only for true object/detail beats under current Wealth rules',
    '- "space" only for environment/transition beats when truly appropriate',
    "Semantic alignment always wins over distribution statistics.",
  ].join("\n");
}

export function buildWealthInsightsImagePromptRules(mode: WealthInsightsVisualMode) {
  if (mode === "narrative_economics_stories") {
    return [
      "## imagePrompt shape (Narrative Economics Stories)",
      "",
      "Generate imagePrompt ONLY after boundaries + durations are valid.",
      "Begin with:",
      `VISUAL STYLE LOCK: ${WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK}`,
      "",
      "Then include concrete voiceover context, narrative meaning, must-show elements,",
      "character/mechanism relationship, style rules, and avoid rules.",
      "No vague prompts like generic financial pressure / relevant visual metaphor.",
      "",
      "JSON escaping: escape inner quotes inside imagePrompt as \\\".",
    ].join("\n");
  }

  return [
    "## imagePrompt shape (Default Wealth Insights — variable beats only)",
    "",
    "Generate imagePrompt ONLY after boundaries + durations are valid.",
    "Use this structure. The app injects fixed MAIN HOST + Style locks after you respond.",
    "Do NOT paste the full host appearance paragraph or the Style rules paragraph.",
    "",
    "Voiceover context:",
    '"[exact scriptText for this scene]"',
    "",
    "Narrative meaning:",
    '"[one sentence — YOU invent this]"',
    "",
    "Create:",
    WEALTH_INSIGHTS_CREATE_LOCK,
    "",
    "Must show:",
    "- [APP_FILLS_MAIN_HOST_LOCK]",
    "- [YOU invent: one dominant big explanatory element]",
    "- [YOU invent: host action / pose / emotion connected to that element]",
    "",
    "Style rules:",
    "[APP_FILLS_STYLE_LOCK]",
    "",
    `Avoid: ${WEALTH_INSIGHTS_AVOID_LOCK}`,
    "",
    "You ONLY decide: Narrative meaning, big explanatory element(s), and host action/emotion/pose.",
    "Leave host identity and style wording to the app placeholders above.",
    "",
    "Prefer concrete drawable beats, e.g.:",
    "Must show:",
    "- [APP_FILLS_MAIN_HOST_LOCK]",
    "- a giant rent notice labeled RENT pressing down on a glass savings jar labeled SAVINGS",
    "- the host reacts with tense concern, one hand bracing the jar",
    "",
    "JSON escaping: escape inner quotes inside imagePrompt as \\\".",
  ].join("\n");
}

/** imagePrompt rules for fill-hybrid (boundaries already owned by the app). */
export function buildWealthInsightsFillImagePromptRules(
  mode: WealthInsightsVisualMode,
) {
  if (mode === "narrative_economics_stories") {
    return [
      "## imagePrompt shape (Narrative Economics Stories — fill)",
      "",
      "scriptText and duration are already fixed by the app.",
      "Write imagePrompt for each listed order only.",
      "Begin with:",
      `VISUAL STYLE LOCK: ${WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK}`,
      "",
      "Then include concrete voiceover context, narrative meaning, must-show elements,",
      "character/mechanism relationship, style rules, and avoid rules.",
      "No vague prompts like generic financial pressure / relevant visual metaphor.",
      "",
      "JSON escaping: escape inner quotes inside imagePrompt as \\\".",
    ].join("\n");
  }

  return [
    "## imagePrompt shape (Default Wealth Insights — fill, variable beats only)",
    "",
    "scriptText and duration are already fixed by the app.",
    "Write imagePrompt for each listed order only.",
    "Use this structure. The app injects fixed MAIN HOST + Style locks after you respond.",
    "Do NOT paste the full host appearance paragraph or the Style rules paragraph.",
    "",
    "Voiceover context:",
    '"[exact scriptText for this scene]"',
    "",
    "Narrative meaning:",
    '"[one sentence — YOU invent this]"',
    "",
    "Create:",
    WEALTH_INSIGHTS_CREATE_LOCK,
    "",
    "Must show:",
    "- [APP_FILLS_MAIN_HOST_LOCK]",
    "- [YOU invent: one dominant big explanatory element]",
    "- [YOU invent: host action / pose / emotion connected to that element]",
    "",
    "Style rules:",
    "[APP_FILLS_STYLE_LOCK]",
    "",
    `Avoid: ${WEALTH_INSIGHTS_AVOID_LOCK}`,
    "",
    "You ONLY decide: Narrative meaning, big explanatory element(s), and host action/emotion/pose.",
    "Leave host identity and style wording to the app placeholders above.",
    "",
    "Prefer concrete drawable beats, e.g.:",
    "Must show:",
    "- [APP_FILLS_MAIN_HOST_LOCK]",
    "- a giant rent notice labeled RENT pressing down on a glass savings jar labeled SAVINGS",
    "- the host reacts with tense concern, one hand bracing the jar",
    "",
    "JSON escaping: escape inner quotes inside imagePrompt as \\\".",
  ].join("\n");
}

export function buildWealthInsightsHardHookSegmentationRules() {
  return [
    "## Hard Hook Segmentation Override (HOOK section only)",
    "",
    "This request is the HOOK section. You already know that — do not infer hook vs body.",
    "Hook segmentation is intentionally more aggressive than body segmentation.",
    "Do NOT merge clauses merely because they share the same broad concept.",
    "A new camera-worthy visual moment normally means a new scene.",
    "Body consolidation examples do NOT justify combining hook beats.",
    "Estimated narration > 5.5s for any hook scene is invalid even if duration is set lower.",
  ].join("\n");
}

export function buildWealthInsightsDuplicateVisualControlRules() {
  return [
    "## Duplicate visual control",
    "",
    "Do not repeat the previous section's final composition at the start of this section.",
    "Do not re-explain the same mechanism with the same giant object / host pose.",
    "If narration advanced, create a new beat-specific visual.",
    "Merge consecutive near-identical beats only when they are truly one semantic beat AND timing still passes.",
    "Recurring motifs are valid only with a new narrative function.",
  ].join("\n");
}

export function buildWealthInsightsFillDuplicateVisualControlRules() {
  return [
    "## Duplicate visual control (fill-hybrid)",
    "",
    "Do not repeat the previous chunk's final composition at the start of this chunk.",
    "Do not re-explain the same mechanism with the same giant object / host pose.",
    "If narration advanced, create a new beat-specific visual.",
    "Recurring motifs are valid only with a new narrative function.",
  ].join("\n");
}

export function buildWealthInsightsSectionHybridContext(options: {
  mode: WealthInsightsVisualMode;
  visualElementLibraryCompact?: string | null;
}) {
  const { mode, visualElementLibraryCompact } = options;

  if (mode === "narrative_economics_stories") {
    return [
      buildNarrativeEconomicsStoriesVisualBrief(),
      buildWealthInsightsTimingRules(),
      buildWealthInsightsSegmentationRules(),
      buildWealthInsightsHardHookSegmentationRules(),
      buildWealthInsightsDuplicateVisualControlRules(),
      buildWealthInsightsImagePromptRules(mode),
      visualElementLibraryCompact?.trim() || null,
      [
        "## Section-chunk mode notes",
        "",
        "This request plans ONE script section only.",
        "Preserve every spoken word from this section exactly once and in order.",
        "Never put structural labels into scriptText.",
        "Continue scene order from continuity.nextSceneOrder.",
        "Do not restart the visual narrative as if this were a new video.",
        "If Section label is [HOOK], apply Hard Hook Segmentation Override.",
      ].join("\n"),
    ]
      .filter((block): block is string => Boolean(block?.trim()))
      .join("\n\n");
  }

  return [
    buildWealthInsightsDefaultVisualSystemRules(),
    buildWealthInsightsTimingRules(),
    buildWealthInsightsSegmentationRules(),
    buildWealthInsightsHardHookSegmentationRules(),
    buildWealthInsightsDuplicateVisualControlRules(),
    buildWealthInsightsImagePromptRules(mode),
    visualElementLibraryCompact?.trim() || null,
    [
      "## Section-chunk mode notes",
      "",
      "This request plans ONE script section only.",
      "Preserve every spoken word from this section exactly once and in order.",
      "Never put structural labels into scriptText.",
      "Continue scene order from continuity.nextSceneOrder.",
      "Do not restart the visual narrative as if this were a new video.",
      "If Section label is [HOOK], apply Hard Hook Segmentation Override.",
      "sceneType stats are continuity/QA only — do not force TheGodsWord 30/40/20 mix.",
    ].join("\n"),
  ]
    .filter((block): block is string => Boolean(block?.trim()))
    .join("\n\n");
}

/** Compact Wealth context for platform fill-hybrid (local skeleton owns scriptText). */
export function buildWealthInsightsFillHybridContext(options: {
  mode: WealthInsightsVisualMode;
  visualElementLibraryCompact?: string | null;
}) {
  const { mode, visualElementLibraryCompact } = options;
  const fillNotes = [
    "## Fill-chunk mode notes",
    "",
    "The scene skeleton was built locally (scriptText + duration are authoritative).",
    "Fill ONLY visualPurpose, visualIdea, imagePrompt, and sceneType for listed orders.",
    "Do NOT rewrite scriptText, invent scenes, or omit orders.",
    "Do NOT run scene-boundary planning or hard-hook segmentation — the app already did that.",
    "HOOK beats are already short — keep visuals punchy and beat-specific.",
    "visualIdea usually starts with: MAIN HOST:",
    "Do not restart the visual narrative mid-video; continue identity locks from Continuity.",
    mode === "narrative_economics_stories"
      ? null
      : "sceneType stats are continuity/QA only — do not force TheGodsWord 30/40/20 mix.",
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  if (mode === "narrative_economics_stories") {
    return [
      buildNarrativeEconomicsStoriesVisualBrief(),
      buildWealthInsightsFillTimingRules(),
      buildWealthInsightsFillDuplicateVisualControlRules(),
      buildWealthInsightsFillImagePromptRules(mode),
      visualElementLibraryCompact?.trim() || null,
      fillNotes,
    ]
      .filter((block): block is string => Boolean(block?.trim()))
      .join("\n\n");
  }

  return [
    buildWealthInsightsDefaultVisualSystemRules(),
    buildWealthInsightsFillTimingRules(),
    buildWealthInsightsFillDuplicateVisualControlRules(),
    buildWealthInsightsFillImagePromptRules(mode),
    visualElementLibraryCompact?.trim() || null,
    fillNotes,
  ]
    .filter((block): block is string => Boolean(block?.trim()))
    .join("\n\n");
}
