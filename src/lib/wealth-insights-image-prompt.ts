/**
 * Fixed Wealth Insights imagePrompt template.
 * MAIN HOST + style locks are app-owned; ChatGPT only supplies variable beats.
 */

/** Scene identity lock (no portrait crop / profile framing). */
export const WEALTH_INSIGHTS_AVATAR_LOCK =
  "elegant young Black businesswoman, late 20s to early 30s, warm brown skin, oval face, large expressive dark brown eyes, defined eyebrows, medium-full lips, smooth skin, bright confident smile, dark brown shoulder-length hair styled in a soft wavy bob with a side part, elegant volume, polished feminine styling, small silver hoop earrings, wearing a deep burgundy tailored blazer over a soft white blouse, sophisticated modern professional finance educator appearance, clean 2D vector cartoon style, thick clean outlines, smooth flat colors, subtle shading, polished YouTube finance branding aesthetic";

/** Canonical host line pasted into every default-mode imagePrompt. */
export const WEALTH_INSIGHTS_MAIN_HOST_LOCK =
  `main recurring finance host from the shared Wealth Insights character universe: ${WEALTH_INSIGHTS_AVATAR_LOCK}`;

/**
 * Full portrait / profile-reference prompt (1:1 circular crop).
 * Not injected into scene imagePrompts — scene locks use WEALTH_INSIGHTS_MAIN_HOST_LOCK.
 */
export const WEALTH_INSIGHTS_MAIN_HOST_PORTRAIT_PROMPT = [
  "Create a clean 2D vector portrait of an elegant young Black businesswoman, late 20s to early 30s, with warm brown skin, an oval face, large expressive dark brown eyes, defined eyebrows, medium-full lips, smooth skin, and a bright confident smile.",
  "",
  "She has dark brown shoulder-length hair styled in a soft wavy bob with a side part, elegant volume, and polished feminine styling. Small silver hoop earrings.",
  "",
  "She wears a deep burgundy tailored blazer over a soft white blouse. Sophisticated, modern, professional finance educator appearance.",
  "",
  "Natural three-quarter pose, shoulders slightly turned, head gently angled toward the viewer, subtle head tilt, relaxed confident expression. Not perfectly frontal.",
  "",
  "Clean 2D vector cartoon style, thick clean outlines, smooth flat colors, subtle shading, polished YouTube finance branding aesthetic.",
  "",
  "Soft cream and warm beige circular background glow. Square 1:1 composition, head and shoulders, face large and readable inside a circular YouTube profile crop.",
  "",
  "No text, no logo, no icons, no charts, no props, no extra characters, no photorealism, no 3D, no anime.",
].join("\n");

export const WEALTH_INSIGHTS_STYLE_LOCK =
  "Clean 2D vector Wealth Insights finance explainer image. Thick clean outlines; smooth flat colors; simple shading; soft neutral background; simple readable composition; few large elements; no subtitles/captions/narration/long text; no photorealism/3D/anime; 16:9.";

export const WEALTH_INSIGHTS_CREATE_LOCK =
  "Clean 2D Wealth Insights finance explainer image.";

export const WEALTH_INSIGHTS_AVOID_LOCK =
  "clutter; generic dashboards; random icons; extra characters unless needed; photorealism; 3D; anime; subtitles/captions/long text.";

const SECTION_LABELS =
  "Voiceover context|Narrative meaning|Create|Must show|Style rules|Avoid";

function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function extractLabeledSection(text: string, label: string): string | null {
  const pattern = new RegExp(
    `${label}\\s*:\\s*([\\s\\S]*?)(?=(?:\\n\\s*)?(?:${SECTION_LABELS})\\s*:|$)`,
    "i",
  );
  const match = text.match(pattern);
  if (!match?.[1]) {
    return null;
  }
  return stripOuterQuotes(match[1].replace(/\r\n/g, "\n").trim());
}

function looksLikeHostLockLine(line: string) {
  const lower = line.toLowerCase();
  return (
    lower.includes("[app_fills_main_host_lock]") ||
    lower.includes("app_fills_main_host_lock") ||
    lower.includes("main recurring finance host") ||
    lower.includes("elegant young black businesswoman") ||
    lower.includes("dark-skinned young businesswoman") ||
    lower.includes("deep burgundy tailored blazer") ||
    lower.includes("charcoal gray business suit") ||
    lower.includes("soft wavy bob") ||
    lower.includes("neat low bun") ||
    lower.includes("small silver hoop") ||
    ((lower.includes("burgundy") || lower.includes("charcoal")) &&
      lower.includes("blouse") &&
      lower.includes("businesswoman"))
  );
}

function looksLikeStyleRulesJunk(line: string) {
  const lower = line.toLowerCase();
  return (
    lower.includes("[app_fills_style_lock]") ||
    lower.includes("app_fills_style_lock") ||
    lower.includes("style rules:") ||
    lower.startsWith("clean 2d vector") ||
    lower.includes("no photorealism")
  );
}

/**
 * Keep only the variable Must-show content: big elements + host action/emotion/pose.
 */
export function extractWealthInsightsVisualBeat(opts: {
  imagePrompt?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
}): string {
  const imagePrompt = opts.imagePrompt?.trim() ?? "";
  const mustShow = extractLabeledSection(imagePrompt, "Must show");
  const rawParts = mustShow
    ? mustShow
        .split(/\n+|;\s*/)
        .map((line) =>
          line
            .replace(/^\s*[-•*]\s*/, "")
            .replace(/\s*Style rules:[\s\S]*$/i, "")
            .trim(),
        )
        .filter(Boolean)
    : [];
  const candidates = rawParts.filter(
    (line) => !looksLikeHostLockLine(line) && !looksLikeStyleRulesJunk(line),
  );

  if (candidates.length > 0) {
    return candidates.join("\n- ");
  }

  const visualIdea = opts.visualIdea?.trim() ?? "";
  if (visualIdea) {
    return visualIdea.replace(/^MAIN\s+HOST:\s*/i, "").trim();
  }

  const visualPurpose = opts.visualPurpose?.trim() ?? "";
  if (visualPurpose) {
    return visualPurpose;
  }

  return "one dominant explanatory element connected to the host action";
}

export function assembleWealthInsightsImagePrompt(opts: {
  voiceoverContext: string;
  narrativeMeaning: string;
  visualBeat: string;
}): string {
  const voiceover = stripOuterQuotes(opts.voiceoverContext.trim());
  const meaning = stripOuterQuotes(opts.narrativeMeaning.trim());
  const beat = opts.visualBeat
    .trim()
    .replace(/^\s*[-•*]\s*/gm, "")
    .trim();
  const beatLines = beat
    ? beat
        .split(/\n+/)
        .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
        .filter(
          (line) =>
            Boolean(line) &&
            !looksLikeHostLockLine(line) &&
            !looksLikeStyleRulesJunk(line),
        )
    : [];
  const safeBeatLines =
    beatLines.length > 0
      ? beatLines
      : ["one dominant explanatory element connected to the host action"];

  return [
    "Voiceover context:",
    `"${voiceover}"`,
    "",
    "Narrative meaning:",
    `"${meaning}"`,
    "",
    "Create:",
    WEALTH_INSIGHTS_CREATE_LOCK,
    "",
    "Must show:",
    `- ${WEALTH_INSIGHTS_MAIN_HOST_LOCK}`,
    ...safeBeatLines.map((line) => `- ${line}`),
    "",
    "Style rules:",
    WEALTH_INSIGHTS_STYLE_LOCK,
    "",
    `Avoid: ${WEALTH_INSIGHTS_AVOID_LOCK}`,
  ].join("\n");
}

/** Exactly one host lock and one style lock section expected after normalize. */
export function wealthImagePromptLockCounts(imagePrompt: string) {
  const hostMatches = imagePrompt.split(WEALTH_INSIGHTS_MAIN_HOST_LOCK).length - 1;
  const styleMatches = imagePrompt.split(WEALTH_INSIGHTS_STYLE_LOCK).length - 1;
  const styleSectionMatches = (
    imagePrompt.match(/(?:^|\n)\s*Style rules:\s*/gi) ?? []
  ).length;
  return {
    hostLockCount: hostMatches,
    styleLockCount: styleMatches,
    styleSectionCount: styleSectionMatches,
  };
}

/**
 * Rebuild imagePrompt with fixed host + style locks.
 * Preserves/derives variable voiceover, meaning, and visual beat.
 */
export function normalizeWealthInsightsImagePrompt(opts: {
  imagePrompt?: string | null;
  scriptText?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
}): string {
  const existing = opts.imagePrompt?.trim() ?? "";
  const voiceover =
    extractLabeledSection(existing, "Voiceover context") ||
    opts.scriptText?.trim() ||
    "";
  const narrativeMeaning =
    extractLabeledSection(existing, "Narrative meaning") ||
    opts.visualPurpose?.trim() ||
    "Illustrate the narration beat with one clear visual mechanism.";
  const visualBeat = extractWealthInsightsVisualBeat(opts);

  return assembleWealthInsightsImagePrompt({
    voiceoverContext: voiceover || " ",
    narrativeMeaning,
    visualBeat,
  });
}

export function normalizeWealthInsightsScenes<
  T extends {
    imagePrompt: string;
    scriptText?: string;
    visualIdea?: string;
    visualPurpose?: string;
  },
>(scenes: T[]): T[] {
  return scenes.map((scene) => ({
    ...scene,
    imagePrompt: normalizeWealthInsightsImagePrompt({
      imagePrompt: scene.imagePrompt,
      scriptText: scene.scriptText,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
    }),
  }));
}
