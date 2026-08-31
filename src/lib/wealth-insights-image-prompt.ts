/**
 * Fixed Wealth Insights imagePrompt template.
 * Host + style locks are app-owned for consistency; ChatGPT only supplies variable beats.
 *
 * Copyright / Flow safety: never ask Flow to reproduce a pre-existing IP, brand mascot,
 * celebrity likeness, or "shared character universe". Describe every person as an
 * original fictional cartoon design for this educational video.
 */

import {
  parseWealthStoryVisualIdea,
  type WealthEpisodeCastLock,
} from "@/lib/wealth-insights-episode-cast";

/** Compact scene host lock — cartoon identity without biometric detail. */
export const WEALTH_INSIGHTS_AVATAR_LOCK =
  "original cartoon finance educator: woman in deep burgundy blazer and white blouse, soft dark wavy bob, clean 2D vector style, same character every scene";

/**
 * Canonical host line pasted into host-on-screen imagePrompts.
 * Framed as an original fictional design — not a shared universe / IP reuse request.
 */
export const WEALTH_INSIGHTS_MAIN_HOST_LOCK = WEALTH_INSIGHTS_AVATAR_LOCK;

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
  "Clean 2D vector cartoon style, thick clean outlines, smooth flat colors, subtle shading, polished original educational finance cartoon aesthetic.",
  "",
  "Soft cream and warm beige circular background glow. Square 1:1 composition, head and shoulders, face large and readable inside a circular profile crop.",
  "",
  "Original fictional character only. No text, no logo, no icons, no charts, no props, no extra characters, no photorealism, no 3D, no anime, no celebrity likeness, no trademarked character.",
].join("\n");

export const WEALTH_INSIGHTS_STYLE_LOCK =
  "Clean 2D vector finance explainer cartoon. Thick outlines, flat colors, soft neutral background, few large readable elements, 16:9. Original fictional cartoon only.";

export const WEALTH_INSIGHTS_CREATE_LOCK =
  "Clean 2D original finance explainer cartoon image.";

export const WEALTH_INSIGHTS_AVOID_LOCK =
  "clutter; generic dashboards; random icons; inventing named people outside the episode cast; photorealism; 3D; anime; subtitles/captions/long readable paragraphs; real brand logos.";

const SECTION_LABELS =
  "Educational beat|Voiceover context|Narrative meaning|Create|Must show|Style rules|Avoid";

/** Flow-safe vocabulary for image prompts (not scriptText). */
const FLOW_SOFT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bfinancial pressure\b/gi, "tight monthly budget"],
  [/\bpressure\b/gi, "budget squeeze"],
  [/\bstress(?:ed|ful)?\b/gi, "concerned"],
  [/\bfear(?:ful|ed)?\b/gi, "uncertainty"],
  [/\bdanger(?:ous)?\b/gi, "risky path"],
  [/\btrap(?:ped|s)?\b/gi, "hidden cost"],
  [/\bcrush(?:ing|ed|es)?\b/gi, "weighing down"],
  [/\bpanic(?:king|ked)?\b/gi, "surprised"],
  [/\bdesperate(?:ly)?\b/gi, "worried"],
  [/\burgent(?:ly)?\b/gi, "time-sensitive"],
  [/\bblocked\b/gi, "closed"],
  [/\bheavy red weight pressing down\b/gi, "large stack of monthly papers"],
  [/\bpressing down on\b/gi, "stacked on top of"],
];

export function softenWealthInsightsFlowPhrasing(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FLOW_SOFT_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

/** One calm educational line for Flow — never the raw voiceover script. */
export function buildWealthInsightsEducationalBeat(opts: {
  narrativeMeaning?: string | null;
  visualPurpose?: string | null;
  scriptText?: string | null;
}): string {
  const fromMeaning =
    opts.narrativeMeaning?.trim() ||
    opts.visualPurpose?.trim() ||
    "";
  if (fromMeaning) {
    return softenWealthInsightsFlowPhrasing(fromMeaning);
  }
  const script = opts.scriptText?.trim() ?? "";
  if (!script) {
    return "Illustrate one clear finance mechanism with a simple cartoon visual.";
  }
  const firstSentence = script.split(/(?<=[.!?])\s+/)[0]?.trim() ?? script;
  const clipped =
    firstSentence.length > 120
      ? `${firstSentence.slice(0, 117).trim()}…`
      : firstSentence;
  return softenWealthInsightsFlowPhrasing(clipped);
}

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
    lower.includes("original fictional finance educator character") ||
    lower.includes("original cartoon finance educator") ||
    lower.includes("main recurring finance host") ||
    lower.includes("shared wealth insights character universe") ||
    lower.includes("elegant young black businesswoman") ||
    lower.includes("dark-skinned young businesswoman") ||
    lower.includes("deep burgundy tailored blazer") ||
    lower.includes("deep burgundy blazer") ||
    lower.includes("charcoal gray business suit") ||
    lower.includes("soft wavy bob") ||
    lower.includes("soft dark wavy bob") ||
    lower.includes("neat low bun") ||
    lower.includes("small silver hoop") ||
    lower.includes("same character every scene") ||
    ((lower.includes("burgundy") || lower.includes("charcoal")) &&
      lower.includes("blouse") &&
      (lower.includes("businesswoman") || lower.includes("finance educator")))
  );
}

function looksLikeCastLockLine(line: string) {
  const lower = line.toLowerCase();
  return (
    lower.includes("app-owned identity lock") ||
    lower.includes("original fictional cartoon character named") ||
    lower.includes("episode-consistent original design") ||
    lower.includes("recurring story character named") ||
    lower.includes("[app_fills_cast_lock]") ||
    lower.includes("app_fills_cast_lock") ||
    (lower.includes("keep this exact") && lower.includes("outfit")) ||
    (lower.includes("do not change clothes") && lower.includes("hairstyle"))
  );
}

/** Strip planner/IP phrasing that must never reach Flow image prompts. */
export function scrubWealthInsightsFlowIpPhrasing(text: string): string {
  return text
    .replace(/\bshared\s+Wealth\s+Insights\s+character\s+universe\b/gi, "original educational cartoon")
    .replace(/\bWealth\s+Insights\s+character\s+universe\b/gi, "original educational cartoon")
    .replace(/\bshared\s+character\s+universe\b/gi, "original educational cartoon")
    .replace(/\brecurring\s+(?:finance\s+)?host\b/gi, "finance educator character")
    .replace(/\brecurring\s+story\s+character\b/gi, "original fictional cartoon character")
    .replace(/\bAPP-OWNED\s+IDENTITY\s+LOCK\b/gi, "episode-consistent original design")
    .replace(/\bAPP-OWNED\s+locks?\b/gi, "episode-consistent original designs")
    .replace(/\bcopy\s+verbatim\b/gi, "keep exactly as described")
    .replace(/\bdo\s+not\s+redesign\b/gi, "keep this original design")
    .trim();
}

function looksLikeStyleRulesJunk(line: string) {
  const lower = line.toLowerCase();
  return (
    lower.includes("[app_fills_style_lock]") ||
    lower.includes("app_fills_style_lock") ||
    lower === "style:" ||
    lower.startsWith("style rules:") ||
    lower.startsWith("style:") ||
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
    (line) =>
      !looksLikeHostLockLine(line) &&
      !looksLikeCastLockLine(line) &&
      !looksLikeStyleRulesJunk(line),
  );

  if (candidates.length > 0) {
    return candidates.join("\n- ");
  }

  const visualIdea = opts.visualIdea?.trim() ?? "";
  if (visualIdea) {
    const parsed = parseWealthStoryVisualIdea(visualIdea);
    if (parsed.kind !== "other" && parsed.rest) {
      return parsed.rest;
    }
    return visualIdea
      .replace(/^MAIN\s+HOST\s*\+\s*STORY:\s*/i, "")
      .replace(/^STORY_CHARACTER:\s*/i, "")
      .replace(/^STORY_PAIR:\s*/i, "")
      .replace(/^MAIN\s+HOST:\s*/i, "")
      .trim();
  }

  const visualPurpose = opts.visualPurpose?.trim() ?? "";
  if (visualPurpose) {
    return visualPurpose;
  }

  return "one dominant explanatory element connected to the host action";
}

export function assembleWealthInsightsImagePrompt(opts: {
  educationalBeat: string;
  narrativeMeaning: string;
  visualBeat: string;
  visualIdea?: string | null;
  cast?: WealthEpisodeCastLock | null;
}): string {
  const educationalBeat = softenWealthInsightsFlowPhrasing(
    stripOuterQuotes(opts.educationalBeat.trim()),
  );
  const meaning = softenWealthInsightsFlowPhrasing(
    stripOuterQuotes(opts.narrativeMeaning.trim()),
  );
  const parsed = parseWealthStoryVisualIdea(opts.visualIdea);
  const includeMainHost =
    parsed.kind === "main_host" ||
    parsed.kind === "host_plus_story" ||
    parsed.kind === "other";
  const beat = softenWealthInsightsFlowPhrasing(
    scrubWealthInsightsFlowIpPhrasing(
      opts.visualBeat.trim().replace(/^\s*[-•*]\s*/gm, "").trim(),
    ),
  );
  const beatLines = beat
    ? beat
        .split(/\n+/)
        .map((line) =>
          softenWealthInsightsFlowPhrasing(
            scrubWealthInsightsFlowIpPhrasing(
              line.replace(/^\s*[-•*]\s*/, "").trim(),
            ),
          ),
        )
        .filter(
          (line) =>
            Boolean(line) &&
            !looksLikeHostLockLine(line) &&
            !looksLikeCastLockLine(line) &&
            !looksLikeStyleRulesJunk(line),
        )
    : [];
  const namedFromIdea = new Set(parsed.names.map((name) => name.toLowerCase()));
  // Also lock cast members mentioned inside MAIN HOST / beat text.
  const ideaBlob = `${opts.visualIdea ?? ""}\n${opts.visualBeat ?? ""}`;
  for (const member of opts.cast?.characters ?? []) {
    const re = new RegExp(`\\b${member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(ideaBlob)) {
      namedFromIdea.add(member.name.toLowerCase());
    }
  }
  const castMembers = [...namedFromIdea]
    .map((needle) =>
      opts.cast?.characters.find((member) => member.name.toLowerCase() === needle),
    )
    .filter((member): member is NonNullable<typeof member> => Boolean(member));
  const castLines = castMembers.map((member) => member.descriptor);
  const fallbackBeat =
    parsed.kind === "story_character" || parsed.kind === "story_pair"
      ? "one clear story-character action connected to the narration beat"
      : "one dominant explanatory element connected to the host action";
  const safeBeatLines =
    beatLines.length > 0 || castLines.length > 0
      ? beatLines
      : [fallbackBeat];

  const mustShow = [
    ...(includeMainHost ? [`- ${WEALTH_INSIGHTS_MAIN_HOST_LOCK}`] : []),
    ...castLines.map((line) => `- ${line}`),
    ...safeBeatLines.map((line) => `- ${line}`),
  ];

  return [
    "Educational beat:",
    `"${educationalBeat}"`,
    "",
    "Narrative meaning:",
    `"${meaning}"`,
    "",
    "Create:",
    WEALTH_INSIGHTS_CREATE_LOCK,
    "",
    "Must show:",
    ...mustShow,
    "",
    "Style:",
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
    imagePrompt.match(/(?:^|\n)\s*Style(?: rules)?:\s*/gi) ?? []
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
  cast?: WealthEpisodeCastLock | null;
}): string {
  const existing = opts.imagePrompt?.trim() ?? "";
  const narrativeMeaning = softenWealthInsightsFlowPhrasing(
    scrubWealthInsightsFlowIpPhrasing(
      extractLabeledSection(existing, "Narrative meaning") ||
        opts.visualPurpose?.trim() ||
        "Illustrate the narration beat with one clear visual mechanism.",
    ),
  );
  const educationalBeat = buildWealthInsightsEducationalBeat({
    narrativeMeaning,
    visualPurpose: opts.visualPurpose,
    scriptText: opts.scriptText,
  });
  const visualBeat = softenWealthInsightsFlowPhrasing(
    scrubWealthInsightsFlowIpPhrasing(extractWealthInsightsVisualBeat(opts)),
  );

  return assembleWealthInsightsImagePrompt({
    educationalBeat,
    narrativeMeaning,
    visualBeat,
    visualIdea: opts.visualIdea,
    cast: opts.cast,
  });
}

export function normalizeWealthInsightsScenes<
  T extends {
    imagePrompt: string;
    scriptText?: string;
    visualIdea?: string;
    visualPurpose?: string;
  },
>(scenes: T[], options?: { cast?: WealthEpisodeCastLock | null }): T[] {
  return scenes.map((scene) => ({
    ...scene,
    imagePrompt: normalizeWealthInsightsImagePrompt({
      imagePrompt: scene.imagePrompt,
      scriptText: scene.scriptText,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
      cast: options?.cast,
    }),
  }));
}
