/**
 * Wealth Insights visual mode resolver + Narrative Economics Stories override.
 * Default mode remains MAIN HOST + BIG EXPLANATORY ELEMENTS.
 */

export const WEALTH_INSIGHTS_DEFAULT_CATEGORIES = [
  "housing",
  "savings",
  "debt",
  "investing",
  "income",
  "cost_of_living",
  "psychology",
] as const;

export const WEALTH_INSIGHTS_NARRATIVE_ECONOMICS_CATEGORY =
  "narrative_economics_stories" as const;

export type WealthInsightsVisualMode =
  | "default"
  | "narrative_economics_stories";

export const WEALTH_INSIGHTS_NARRATIVE_VISUAL_IDEA_PREFIXES = [
  "CHARACTER_A:",
  "CHARACTER_B:",
  "CHARACTER_C:",
  "CHARACTER_D:",
  "MECHANISM:",
  "EDITORIAL BOARD:",
  "OBJECT DETAIL:",
  "LOCATION BEAT:",
  "SUPPORTING_CHARACTER:",
] as const;

export const WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK =
  "clean 2D editorial business-history storyboard panel, oversized caricature heads, thick clean outlines, flat colors, minimal soft shading, muted era-appropriate palette, simple geometric backgrounds. Every scene must feel like the same clean editorial cartoon universe, not a movie still. No cinematic realism, no detailed environments, no texture-heavy illustration, no photorealism, no 3D.";

const NARRATIVE_IDEA_SIGNALS = [
  "business history",
  "company history",
  "founder story",
  "entrepreneur story",
  "economic history",
  "hidden business model",
  "hidden business machine",
  "business mechanism",
  "platform story",
  "narrative economics",
  "money machine",
  "hidden mechanism",
  "business model story",
];

function textBlob(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isNarrativeEconomicsStoriesCategory(
  topicCategory: string | null | undefined,
): boolean {
  return (
    topicCategory?.trim().toLowerCase() ===
    WEALTH_INSIGHTS_NARRATIVE_ECONOMICS_CATEGORY
  );
}

export function isDefaultWealthInsightsCategory(
  topicCategory: string | null | undefined,
): boolean {
  const id = topicCategory?.trim().toLowerCase() ?? "";
  return (WEALTH_INSIGHTS_DEFAULT_CATEGORIES as readonly string[]).includes(id);
}

/**
 * Detect Narrative Economics Stories Mode from category and/or ideaJson / brief.
 */
export function resolveWealthInsightsVisualMode({
  topicCategory,
  ideaJson,
}: {
  topicCategory?: string | null;
  ideaJson?: unknown;
}): WealthInsightsVisualMode {
  if (isNarrativeEconomicsStoriesCategory(topicCategory)) {
    return "narrative_economics_stories";
  }

  const blob = textBlob(ideaJson).toLowerCase();
  if (!blob.trim()) {
    return "default";
  }

  if (NARRATIVE_IDEA_SIGNALS.some((signal) => blob.includes(signal))) {
    return "narrative_economics_stories";
  }

  // Structured ideaJson may set an explicit mode / format field.
  if (ideaJson && typeof ideaJson === "object" && !Array.isArray(ideaJson)) {
    const record = ideaJson as Record<string, unknown>;
    const explicit = textBlob(
      record.visualMode ??
        record.visualSystem ??
        record.storyFormat ??
        record.format,
    ).toLowerCase();
    if (
      explicit.includes("narrative_economics") ||
      explicit.includes("narrative economics") ||
      explicit.includes("business history") ||
      explicit.includes("company history")
    ) {
      return "narrative_economics_stories";
    }
  }

  return "default";
}

export function hasAllowedWealthInsightsVisualIdeaPrefix(
  visualIdea: string,
  mode: WealthInsightsVisualMode = "default",
): boolean {
  const trimmed = visualIdea.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("MAIN HOST:")) {
    return true;
  }

  if (mode === "narrative_economics_stories") {
    return WEALTH_INSIGHTS_NARRATIVE_VISUAL_IDEA_PREFIXES.some((prefix) =>
      trimmed.startsWith(prefix),
    );
  }

  return false;
}

/**
 * Full Narrative Economics Stories visual rules injected when that mode is active.
 * Episode-specific vocabulary must come from the current script / ideaJson only.
 */
export function buildNarrativeEconomicsStoriesVisualBrief() {
  return [
    "## Narrative Economics Stories Visual Rules",
    "",
    "Active visual mode: narrative_economics_stories",
    "Visual system: EPISODE PROTAGONIST + STORY MOMENT / ECONOMIC MECHANISM",
    "",
    "This is a category-specific override for Wealth Insights.",
    "It does not replace Default Mode for housing, savings, debt, investing, income, cost_of_living, or psychology.",
    "",
    "CORE PRINCIPLE",
    "",
    "Narrative Economics Stories are not standard finance explainers.",
    "They should feel like business/economic history narrated as a mystery.",
    'The viewer should feel: "There was a hidden business machine inside a story I thought I already understood."',
    "",
    "Visuals should be:",
    "- simple",
    "- readable in under one second",
    "- character-led when the narration is story-driven",
    "- mechanism-led when the narration explains the business model",
    "- Flow-safe",
    "- consistent across the episode",
    "- not crowded",
    "- not photorealistic",
    "- not a historical movie still",
    "- not generic corporate stock art",
    "",
    "CHARACTER ANCHOR OVERRIDE",
    "",
    "Ignore the Default Mode requirement that every image includes the Wealth Insights main host.",
    "The recurring finance host is NOT required by default.",
    "Do not use the recurring finance host unless the user explicitly asks for a host-led explainer version.",
    "",
    "Main visual question:",
    '"What does the episode protagonist see, discover, compare, build, control, or realize in this narration beat?"',
    "",
    "Internal character roles (may appear only inside visualIdea and imagePrompt — never as new JSON fields):",
    "- CHARACTER_A: main episode protagonist",
    "- CHARACTER_B: secondary operator / founder / inventor / builder",
    "- CHARACTER_C: financial architect / strategist / investor / scaler",
    "- CHARACTER_D: competitor / regulator / banker / partner / antagonist / additional recurring role if needed",
    "- SUPPORTING_CHARACTER: customers, workers, users, franchisees, employees, drivers, investors, etc.",
    "",
    "CHARACTER LOCK SYSTEM",
    "",
    "Before generating scenes, create an internal Character Lock Library from the current script and ideaJson.",
    "Do not export this library.",
    "",
    "For every important real person in the story, create a fictionalized business-role character.",
    "Do not describe the character as the real person.",
    "Do not request a realistic likeness.",
    "Do not use celebrity likeness language.",
    'Do not use "looks like [real person]".',
    "Do not ask for a photorealistic founder portrait.",
    "",
    "Each Character Lock should include:",
    "- fictionalized role",
    "- approximate era",
    "- caricature design",
    "- head shape",
    "- face shape",
    "- eyes",
    "- hair shape",
    "- clothing",
    "- recurring prop if useful",
    "- emotional range",
    "- same cartoon universe rules",
    '- explicit note: "Not a real-person likeness."',
    "",
    "Example format:",
    "CHARACTER_A:",
    "fictionalized [era] [business role], caricature style, oversized head, [clear face shape], [eye style], [hair shape], [era-appropriate clothing], [recurring prop if useful], clean 2D editorial business-history storyboard style. Not a real-person likeness.",
    "",
    "Use the same character descriptor every time that character appears.",
    "",
    "Keep all characters in the same cartoon family:",
    "- oversized caricature heads",
    "- simple expressive faces",
    "- clean outlines",
    "- flat colors",
    "- light soft shading",
    "- simple readable silhouettes",
    "- no photorealism",
    "- no 3D",
    "- no anime",
    "",
    "EPISODE VISUAL LIBRARY",
    "",
    "Before generating scenes, build an internal Episode Visual Library from the current ideaJson and script.",
    "Do not export this library.",
    "",
    "Extract only what the current episode supports:",
    "- visible product or public-facing business",
    "- hidden business mechanism",
    "- main protagonist role",
    "- secondary business roles",
    "- recurring objects",
    "- era-specific environment",
    "- master visual motif",
    "- recurring mechanism symbols",
    "- key business objects",
    "- emotional beats",
    "- contrast pairs",
    "",
    "Do not hardcode company-specific vocabulary from past episodes.",
    "Derive EPISODE_PROTAGONIST, SECONDARY_CHARACTERS, ERA, VISIBLE_PRODUCT, HIDDEN_MECHANISM, MASTER_MOTIF, BUSINESS_OBJECTS, and FLOW_SAFE_VISUAL_LANGUAGE from the current script and ideaJson.",
    "The scriptText always wins.",
    "",
    "FLOW-SAFE REAL COMPANY / REAL PERSON RULE",
    "",
    "scriptText may preserve real company names, real founder names, real products, and historical facts.",
    "visualPurpose, visualIdea, and imagePrompt must avoid requesting:",
    "- exact real-person likeness",
    "- realistic portrait of a living or historical public figure",
    "- celebrity likeness",
    "- exact corporate logos",
    "- exact trademarked signage",
    "- protected mascot characters",
    "- exact uniforms",
    "- exact packaging",
    "- exact product names in the image",
    "- copied brand color-layout combinations",
    "- photorealistic depictions of real people",
    "- trademarked product design when avoidable",
    "",
    "Use fictionalized, role-based, generic, caricatured visual language.",
    "",
    "Allowed prompt language examples (only when supported by the current episode):",
    "- fictionalized mid-century business salesman",
    "- fictionalized online commerce founder",
    "- fictionalized garage-era product visionary",
    "- fictionalized restaurant-operator brothers",
    "- fictionalized financial architect",
    "- generic roadside burger stand",
    "- generic online storefront",
    "- generic prototype device",
    "- simple package icon",
    "- plain service window",
    "- simple warehouse shelf",
    "- generic office desk",
    "- hidden logistics network",
    "- hidden ecosystem machine",
    "- hidden contract machine",
    "",
    "Avoid in imagePrompt:",
    "- exact founder name",
    "- exact company logo",
    "- exact brand signage",
    "- exact protected product name",
    "- exact product design",
    "- exact mascot",
    "- realistic likeness",
    "- photorealistic portrait",
    "",
    "VISUAL STYLE LOCK",
    "",
    "Every imagePrompt in this mode must begin with:",
    "",
    "VISUAL STYLE LOCK:",
    WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK,
    "",
    "This category should look like an editorial business-history storyboard.",
    "Not: AI-generated historical movie still, documentary reenactment, corporate stock illustration, realistic founder portrait, busy historical scene, luxury business magazine photo, or complex infographic dashboard.",
    "",
    "COMPOSITION RULE",
    "",
    "Every image should be readable in under one second.",
    "",
    "Default composition:",
    "- one recurring protagonist OR one dominant business mechanism",
    "- one dominant object, action, or clue",
    "- zero to three supporting figures only if necessary",
    "- minimal background",
    "- simple geometric space",
    "- no crowded environments",
    "- no full historical reenactments by default",
    "- no object lists",
    "- no detailed restaurant, factory, office, street, warehouse, garage, store, or crowd unless absolutely required by the exact scriptText",
    "",
    "Maximum normal complexity:",
    "1 recurring protagonist + 1 dominant visual idea + up to 3 supporting figures or objects.",
    "If the scene needs more than that, simplify.",
    "",
    "If the narration includes many things in a list, either:",
    "1. split the list into separate scenes, or",
    "2. convert the list into a clean editorial board.",
    "",
    "Editorial board example:",
    'ScriptText: "Cars pulled in. Workers rushed around. Orders got confused. Food took too long. Customers waited."',
    "Better: CHARACTER_A stands beside a clean four-box chaos board: 1. cars arriving 2. one rushing worker 3. crossed order tickets 4. waiting customers.",
    "",
    "STORY-TO-VISUAL RULE",
    "",
    "For every scriptText, silently ask:",
    "1. Who is the visual anchor in this beat?",
    "2. What does the character see, discover, compare, realize, build, control, lose, misunderstand, or reframe?",
    "3. What visible action proves the narration?",
    "4. What is the one dominant clue, object, or mechanism?",
    "5. Can this be shown with one simple action instead of a crowded historical scene?",
    "6. Is this a story action, mechanism explanation, contrast, reveal, consequence, proof, or final lesson?",
    "",
    "Do not choose a purely abstract icon if the narration describes a human action.",
    "",
    "SCENE BOUNDARY RULES",
    "",
    "Keep the mandatory three-stage process unchanged:",
    "1. Scene boundary planning",
    "2. Duration validation and repair",
    "3. Image prompt generation",
    "",
    "Do not generate final image prompts until scene boundaries and durations are valid.",
    "",
    "Split scenes by story discovery and mechanism progression, not only by sentence.",
    "",
    "Use shorter scenes when the hook introduces:",
    "- a strange clue",
    "- a protagonist investigating",
    "- a first arrival",
    "- a normal expectation",
    "- a contrast",
    "- a concrete discovery",
    "- a realization",
    "- a hidden mechanism",
    '- a "not what it seemed" reveal',
    "- a title payoff",
    "",
    "Recommended hook progression when relevant:",
    "1. strange clue",
    "2. protagonist investigates",
    "3. normal expectation",
    "4. contrast with what the protagonist actually sees",
    "5. concrete discovery",
    "6. first mechanism reveal",
    "7. mini-payoff connected to the title",
    "",
    "Do not spend too many scenes on generic background before reaching the mystery.",
    "Do not merge a mystery setup with the reveal if they need different images.",
    "Do not split a unified list into tiny meaningless fragments if one clean editorial board can represent the whole list.",
    "Do not keep a long list in one scene unless it becomes a clean editorial board and the estimated duration still passes validation.",
    "Preserve exact script wording in every scriptText.",
    "",
    "DURATION RULES",
    "",
    "Keep existing duration validation rules.",
    "Additionally:",
    "- Hook section: at least the first ~2 minutes of spoken narration; inside it, prefer 2 to 4 seconds per scene; 4–5 seconds only if indivisible; 5.5 estimated seconds is the absolute ceiling per scene; if a hook sentence introduces two different visual ideas, split it",
    "- Body scenes: 5 to 8 seconds per scene; 8 estimated seconds is the absolute ceiling; never allow 12, 20, or 30 second narration scenes",
    "- Closing: split final thesis, callback, lesson, disclaimer, and CTA into separate beats",
    "Do not fix long narration by only increasing duration. If the scene is too long, split it first.",
    "",
    "visualIdea PREFIX",
    "",
    "visualIdea should usually begin with one of:",
    "- CHARACTER_A:",
    "- CHARACTER_B:",
    "- CHARACTER_C:",
    "- CHARACTER_D:",
    "- MECHANISM:",
    "- EDITORIAL BOARD:",
    "- OBJECT DETAIL:",
    "- LOCATION BEAT:",
    "",
    'Do not use "MAIN HOST:" unless the recurring Wealth Insights host is actually in the scene.',
    "",
    "IMAGE PROMPT SHAPE",
    "",
    "imagePrompt must be in English and should use this structured shape:",
    "",
    "VISUAL STYLE LOCK:",
    WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK,
    "",
    'Voiceover context:',
    '"[exact scriptText for this scene]"',
    "",
    "Narrative meaning:",
    '"[one sentence explaining what the beat means in the story]"',
    "",
    "Use recurring character:",
    '"[CHARACTER_A / CHARACTER_B / CHARACTER_C descriptor if a recurring character appears]"',
    "",
    "Must show:",
    "- [the fictionalized character or mechanism]",
    "- [one dominant object / action / clue]",
    "- [how the character connects to it]",
    "- [0 to 3 supporting elements only if needed]",
    "",
    "Composition:",
    "- one clear visual idea",
    "- minimal background",
    "- few large elements",
    "- readable in under one second",
    "- no crowded reenactment",
    "- no object list",
    "- no detailed environment unless essential",
    "",
    "Style rules:",
    "- same clean editorial cartoon universe",
    "- oversized caricature heads for humans",
    "- thick clean outlines",
    "- flat colors",
    "- light soft shading",
    "- muted era-appropriate palette",
    "- 16:9 composition",
    "",
    "Avoid:",
    "- exact real-person likeness",
    "- real founder names inside imagePrompt",
    "- exact corporate logos",
    "- trademarked signage",
    "- exact product names",
    "- protected product designs",
    "- real company packaging",
    "- readable brand text",
    "- subtitles",
    "- captions",
    "- narration text",
    "- long readable text",
    "- photorealism",
    "- 3D",
    "- anime",
    "- crowded environments",
    "- generic corporate stock art",
    "",
    "Let Flow decide: exact camera angle, small background balance, gesture nuance, facial nuance, minor object placement.",
    "Do not let Flow decide: whether the recurring character appears, the dominant object, the core mechanism, the style, whether logos are allowed, whether photorealism is allowed, or the number of main visual elements.",
    "",
    "SCENE TYPES",
    "",
    "Keep the existing schema unchanged. Use only:",
    '- "avatar" for most scenes with protagonists, business characters, workers, customers, founders, operators, executives, or human reaction',
    '- "insert" only for object/detail scenes such as a contract, order slip, device, package, lease, map, document, product, chart, or clue object',
    '- "space" only for simple location or transition beats',
    "",
    "Do not invent sceneType values.",
    "",
    "SCHEMA COMPATIBILITY",
    "",
    "Do not add new fields.",
    "Character IDs such as CHARACTER_A may appear only inside visualIdea and imagePrompt.",
    "",
    "Exact scene schema:",
    "{",
    '  "order": 1,',
    '  "scriptText": "",',
    '  "sceneType": "avatar",',
    '  "visualPurpose": "",',
    '  "visualIdea": "",',
    '  "duration": 4,',
    '  "imagePrompt": "",',
    '  "status": "planned"',
    "}",
    "",
    "Return JSON array only.",
    "Do not wrap inside a top-level object.",
    "Do not add metadata.",
    "Do not include markdown or explanations in the generated output.",
    'Do not include a top-level "scenes" key.',
    "",
    "INTERNAL QUALITY GATE",
    "",
    "Before returning JSON, verify:",
    "- the correct visual mode was selected",
    "- the recurring Wealth Insights main host is not used by default",
    "- the episode protagonist or mechanism is the visual anchor",
    "- every important real person was converted into a fictionalized role-based character",
    "- no imagePrompt asks for exact real-person likeness, exact logos, trademarked signage, photorealism, or 3D",
    "- every recurring character uses a consistent descriptor",
    "- every scene has one coherent visual beat and passes duration validation",
    "- no hook scene exceeds allowed hook pacing unless absolutely unavoidable",
    "- no body scene exceeds 9 seconds",
    "- no scene exceeds 10 seconds",
    "- long lists are split or converted into a clean editorial board",
    "- every visualIdea and imagePrompt is specific to the exact scriptText",
    "- no visual is only a decorative symbol",
    "- human-action narration is represented as simple human action when possible",
    "- mechanism narration is represented as a simple business mechanism",
    "- every scene is readable in under one second",
    "- no scene is a crowded historical reenactment unless the script absolutely requires it",
    "- schema is exact; no extra fields; sceneType is avatar, insert, or space",
    "- imagePrompt is in English",
    "- image prompts were generated only after scene boundaries and durations passed validation",
    "",
    "If any scene fails the quality gate, repair it before returning JSON.",
  ].join("\n");
}

export function buildWealthInsightsVisualModeSection(
  mode: WealthInsightsVisualMode,
) {
  if (mode === "narrative_economics_stories") {
    return [
      "## Active Wealth Insights Visual Mode",
      "",
      "Mode: narrative_economics_stories",
      "Visual system: EPISODE PROTAGONIST + STORY MOMENT / ECONOMIC MECHANISM",
      "Recurring Wealth Insights main host: NOT required by default.",
      "",
      buildNarrativeEconomicsStoriesVisualBrief(),
    ].join("\n");
  }

  return [
    "## Active Wealth Insights Visual Mode",
    "",
    "Mode: default",
    "Visual system: MAIN HOST + BIG EXPLANATORY ELEMENTS",
    "Recurring Wealth Insights main host: required by default.",
    "Obey the standard Wealth Insights Visual Planner host and explanatory-element rules.",
  ].join("\n");
}

/** Markers that must appear in the narrative brief (for tests). */
export const NARRATIVE_ECONOMICS_VISUAL_BRIEF_MARKERS = [
  "Active visual mode: narrative_economics_stories",
  "EPISODE PROTAGONIST + STORY MOMENT / ECONOMIC MECHANISM",
  "CHARACTER ANCHOR OVERRIDE",
  "CHARACTER LOCK SYSTEM",
  "EPISODE VISUAL LIBRARY",
  "FLOW-SAFE REAL COMPANY / REAL PERSON RULE",
  "VISUAL STYLE LOCK",
  WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK,
  "COMPOSITION RULE",
  "STORY-TO-VISUAL RULE",
  "SCENE BOUNDARY RULES",
  "DURATION RULES",
  "visualIdea PREFIX",
  "CHARACTER_A:",
  "MECHANISM:",
  "EDITORIAL BOARD:",
  "INTERNAL QUALITY GATE",
  "Do not hardcode company-specific vocabulary from past episodes.",
  "The scriptText always wins.",
] as const;
