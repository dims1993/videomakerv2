/**
 * Split a channel script into structural sections for section-chunked
 * Visual Plan generation (ChatGPT still segments inside each section).
 */

export type StructuralScriptSection = {
  /** Stable id for checkpoints, e.g. "section-3". */
  id: string;
  /** 0-based index in the split list. */
  index: number;
  /** Marker label without brackets, or "PREAMBLE". */
  label: string;
  /** Full section text including the opening marker line when present. */
  text: string;
  /** True when this section should start with a chapter/final cover. */
  expectsCover: boolean;
};

const BRACKET_LINE = /^\[([^\]]+)\]\s*$/;

/** [CHAPTER 1 - Title] / [CHAPTER 01 — TITLE] / etc. */
const CHAPTER_SECTION_PATTERN =
  /^CHAPTER\s+(\d+)\s*[—–\-]\s*(.+)$/i;

const FINAL_SECTION_PATTERN = /^FINAL\s*[—–\-]\s*(.+)$/i;
const CHAPTER_COVER_PATTERN = /^CHAPTER\s+COVER\b/i;

const KNOWN_SECTION_LABELS = new Set([
  "HOOK",
  "END HOOK",
  "ENDHOOK",
  "INTRODUCTION",
  "REFLECTION AND PRAYER",
  "CLOSING",
  "CONCLUSION",
]);

export function normalizeStructuralSectionLabel(label: string) {
  return label.trim().replace(/\s+/g, " ");
}

export function isChapterSectionLabel(label: string) {
  return CHAPTER_SECTION_PATTERN.test(normalizeStructuralSectionLabel(label));
}

export function isFinalSectionLabel(label: string) {
  return FINAL_SECTION_PATTERN.test(normalizeStructuralSectionLabel(label));
}

export function isStructuralSectionStartLabel(label: string) {
  const normalized = normalizeStructuralSectionLabel(label);
  const upper = normalized.toUpperCase();

  if (KNOWN_SECTION_LABELS.has(upper)) {
    return upper !== "END HOOK" && upper !== "ENDHOOK";
  }
  if (isChapterSectionLabel(normalized) || isFinalSectionLabel(normalized)) {
    return true;
  }
  if (CHAPTER_COVER_PATTERN.test(normalized)) {
    return true;
  }
  return false;
}

export function sectionExpectsCover(label: string) {
  const normalized = normalizeStructuralSectionLabel(label);
  return (
    isChapterSectionLabel(normalized) ||
    isFinalSectionLabel(normalized) ||
    CHAPTER_COVER_PATTERN.test(normalized) ||
    normalized.toUpperCase() === "INTRODUCTION"
  );
}

/**
 * Split script on top-level structural markers.
 * `[HOOK]…[END HOOK]` stays as a single section.
 */
/** True when the script has real structural markers (not only preamble). */
export function scriptHasStructuralVisualPlanSections(script: string) {
  return splitScriptIntoStructuralSections(script).some(
    (section) => section.label.toUpperCase() !== "PREAMBLE",
  );
}

export function splitScriptIntoStructuralSections(
  script: string,
): StructuralScriptSection[] {
  const lines = script.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ label: string; lines: string[] }> = [];
  let currentIndex = -1;
  let inHook = false;

  const startSection = (label: string, firstLine: string | null) => {
    sections.push({
      label,
      lines: firstLine != null ? [firstLine] : [],
    });
    currentIndex = sections.length - 1;
  };

  const pushLine = (line: string) => {
    if (currentIndex < 0) {
      startSection("PREAMBLE", line);
      return;
    }
    sections[currentIndex]!.lines.push(line);
  };

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    const bracket = trimmed.match(BRACKET_LINE);
    const label = bracket?.[1]
      ? normalizeStructuralSectionLabel(bracket[1])
      : null;
    const upper = label?.toUpperCase() ?? "";

    if (label && upper === "HOOK") {
      inHook = true;
      startSection(label, line);
      continue;
    }

    if (label && (upper === "END HOOK" || upper === "ENDHOOK")) {
      if (currentIndex < 0) {
        startSection("HOOK", null);
      }
      sections[currentIndex]!.lines.push(line);
      inHook = false;
      currentIndex = -1;
      continue;
    }

    if (label && !inHook && isStructuralSectionStartLabel(label)) {
      startSection(label, line);
      continue;
    }

    pushLine(line);
  }

  return sections
    .map((section, index) => {
      const text = section.lines.join("\n").trim();
      return {
        id: `section-${index + 1}`,
        index,
        label: section.label,
        text,
        expectsCover:
          section.label.toUpperCase() === "PREAMBLE"
            ? false
            : sectionExpectsCover(section.label),
      };
    })
    .filter((section) => section.text.length > 0);
}

export type SectionSceneTypeMix = {
  avatar: number;
  insert: number;
  space: number;
  total: number;
};

export function summarizeSectionSceneTypeMix(
  scenes: Array<{ sceneType: string }>,
): SectionSceneTypeMix {
  const mix: SectionSceneTypeMix = {
    avatar: 0,
    insert: 0,
    space: 0,
    total: scenes.length,
  };
  for (const scene of scenes) {
    if (scene.sceneType === "avatar") mix.avatar += 1;
    else if (scene.sceneType === "insert") mix.insert += 1;
    else if (scene.sceneType === "space") mix.space += 1;
  }
  return mix;
}

export type SectionSceneTypeMixMode =
  | "soft-balance"
  | "avatar-default"
  | "stats-only";

function formatSceneTypeMixBlock(
  mix: SectionSceneTypeMix,
  mode: SectionSceneTypeMixMode = "soft-balance",
): string {
  const pct = (count: number) =>
    mix.total === 0 ? 0 : Math.round((count / mix.total) * 100);

  if (mode === "avatar-default" || mode === "stats-only") {
    return [
      "## Full-video scene-type mix so far (continuity / QA only)",
      "",
      `Completed scenes: ${mix.total}`,
      `- avatar: ${mix.avatar} (${pct(mix.avatar)}%)`,
      `- insert: ${mix.insert} (${pct(mix.insert)}%)`,
      `- space: ${mix.space} (${pct(mix.space)}%)`,
      "",
      mode === "avatar-default"
        ? "Wealth Insights default remains avatar-led (MAIN HOST + explanatory element). Do NOT chase TheGodsWord 30/40/20 bands."
        : "These counts are informational only.",
      "Semantic alignment always overrides mix statistics.",
      "Use insert/space only when the channel planner rules truly require them.",
    ].join("\n");
  }

  return [
    "## Full-video scene-type mix so far (authoritative progress)",
    "",
    `Completed scenes: ${mix.total}`,
    `- avatar: ${mix.avatar} (${pct(mix.avatar)}%) — soft target 30–40%`,
    `- insert: ${mix.insert} (${pct(mix.insert)}%) — soft target 35–50%`,
    `- space: ${mix.space} (${pct(mix.space)}%) — soft target 10–25%`,
    "",
    "Choose sceneTypes for THIS section so the running full-video mix stays near those bands.",
    "Semantic alignment still overrides distribution when a line clearly needs avatar, insert, or space.",
    "Do not dump all remaining inserts (or avatars) into one section just to 'catch up' in a single step — nudge gradually.",
    "Hook sections should favor short avatar/insert beats and avoid body-length pacing.",
  ].join("\n");
}

export type SectionChunkContinuityExtras = {
  nextSceneOrder: number;
  completedScenes: number;
  lastSceneType?: string | null;
  lastVisualIdea?: string | null;
  lastDominantElement?: string | null;
  recentVisualIdeas?: string[];
  recentDominantElements?: string[];
  recentMotifs?: string[];
};

export function buildSectionVisualPlanChunkPrompt(options: {
  contextPrompt: string;
  section: StructuralScriptSection;
  totalSections: number;
  previousTail: Array<{
    order: number;
    scriptText: string;
    sceneType: string;
    visualPurpose: string;
    visualIdea: string;
    imagePrompt: string;
    duration: number;
  }>;
  sceneTypeMix?: SectionSceneTypeMix;
  sceneTypeMixMode?: SectionSceneTypeMixMode;
  styleLockReminder?: string | null;
  continuityExtras?: SectionChunkContinuityExtras | null;
  includeCoverRules?: boolean;
  timingHint?: string | null;
  hardHookMode?: boolean;
  suggestedBeats?: string[] | null;
}): string {
  const {
    contextPrompt,
    section,
    totalSections,
    previousTail,
    sceneTypeMix,
    sceneTypeMixMode = "soft-balance",
    styleLockReminder,
    continuityExtras = null,
    includeCoverRules = true,
    timingHint = null,
    hardHookMode = false,
    suggestedBeats = null,
  } = options;

  const continuityStateBlock = continuityExtras
    ? [
        "## Continuity state (authoritative)",
        "",
        "```json",
        JSON.stringify(
          {
            completedScenes: continuityExtras.completedScenes,
            nextSceneOrder: continuityExtras.nextSceneOrder,
            lastSceneType: continuityExtras.lastSceneType ?? null,
            lastVisualIdea: continuityExtras.lastVisualIdea ?? null,
            lastDominantElement: continuityExtras.lastDominantElement ?? null,
            recentVisualIdeas: continuityExtras.recentVisualIdeas ?? [],
            recentDominantElements:
              continuityExtras.recentDominantElements ?? [],
            recentMotifs: continuityExtras.recentMotifs ?? [],
          },
          null,
          2,
        ),
        "```",
        "",
        `Start this section's first scene at order ${continuityExtras.nextSceneOrder}.`,
        "Do not repeat the last visualIdea / dominant element unless the narration truly continues the same beat with a new function.",
      ].join("\n")
    : null;

  const continuity =
    previousTail.length > 0
      ? [
          "## Continuity (previous section tail — do not re-emit)",
          "",
          "Match visual continuity with the previous scenes below.",
          "If a previous imagePrompt used cinematic/photoreal language, IGNORE that drift — keep the channel's illustrated Bible-study / planner style.",
          "Continue order numbering after the last order below (or from Continuity state when provided).",
          "",
          "```json",
          JSON.stringify(previousTail),
          "```",
        ].join("\n")
      : "## Continuity\n\nThis is the first section. Start scene order at 1.";

  const coverRule = section.expectsCover
    ? [
        "- This section starts with a structural marker that requires a cover/opener when the planner rules say so.",
        "- If this is a CHAPTER / FINAL / CHAPTER COVER / INTRODUCTION section, the cover or voiced opener must be the first scene of THIS section.",
        "- Never invent silent empty covers; pair cover visuals with the spoken opener line.",
      ].join("\n")
    : [
        "- This section does not require a chapter cover unless the planner rules for this marker say otherwise.",
        "- [HOOK] never creates a cover.",
      ].join("\n");

  const styleBlock = styleLockReminder?.trim()
    ? [
        "## Style lock (hard)",
        "",
        "Every imagePrompt MUST begin with this exact lock:",
        styleLockReminder.trim(),
        "",
        "Then the concrete scene description + visible-text policy + negatives.",
        "Forbidden openings: Cinematic, photoreal, 3D render, glossy digital art, film still.",
      ].join("\n")
    : null;

  const mixBlock = sceneTypeMix
    ? formatSceneTypeMixBlock(sceneTypeMix, sceneTypeMixMode)
    : null;

  const hardHookBlock = hardHookMode
    ? [
        "## HOOK section (authoritative)",
        "",
        "Section label [HOOK] means this entire request is the editorial hook.",
        "Apply Hard hook segmentation (HOOK ONLY) from the channel brief.",
        "Do not consolidate distinct camera-worthy clauses into one scene.",
        "Normal hook scene target: ~3–6s and about 4–12 narrated words.",
        "Never emit a one-word scene; merge 1–3 word orphans with an adjacent micro-beat.",
      ].join("\n")
    : null;

  const suggestedBeatsBlock =
    hardHookMode && suggestedBeats && suggestedBeats.length > 0
      ? [
          "## Suggested hook micro-beats (advisory — preserve exact words)",
          "",
          "These are non-authoritative boundary suggestions from deterministic hook segmentation.",
          "You may refine boundaries when grammar/semantics require it, but prefer aggressive hook splits.",
          "Every spoken word from the authoritative script section must still appear exactly once.",
          "",
          ...suggestedBeats.map(
            (beat, index) => `${index + 1}. ${beat}`,
          ),
        ].join("\n")
      : null;

  return [
    "GENERATE_VISUAL_PLAN_SECTION_CHUNK",
    `# Visual Plan Section ${section.index + 1}/${totalSections}`,
    `Section label: [${section.label}]`,
    [
      "## Task",
      "",
      "Process ONLY the script section below.",
      "Apply the Visual Brief rules: segment meaning-first, choose formats, set durations, write imagePrompts.",
      "Return a complete JSON array of scenes for THIS section only.",
      "Do NOT process other sections.",
      "Do NOT invent scenes outside this section's spoken narration.",
      "Preserve every spoken word from this section exactly once and in order.",
      "Never copy structural bracket labels into scriptText.",
      "Hard coverage lock: concatenating every scene.scriptText (whitespace-normalized) MUST reproduce this section's spoken script exactly.",
    ].join("\n"),
    continuity,
    ...(continuityStateBlock ? [continuityStateBlock] : []),
    ...(hardHookBlock ? [hardHookBlock] : []),
    ...(suggestedBeatsBlock ? [suggestedBeatsBlock] : []),
    ...(mixBlock ? [mixBlock] : []),
    ...(includeCoverRules
      ? [["## Cover / opener rules for this section", "", coverRule].join("\n")]
      : []),
    ...(styleBlock ? [styleBlock] : []),
    ["## Channel / planner context", "", contextPrompt.trim()].join("\n"),
    [
      "## Script section (authoritative)",
      "",
      "```text",
      section.text,
      "```",
    ].join("\n"),
    [
      "## Output Requirements",
      "",
      "Return a JSON array only (no markdown, no commentary, no wrapper object).",
      "Each object MUST include: order, scriptText, sceneType, visualPurpose, visualIdea, duration, imagePrompt, status.",
      "Do not add extra fields.",
      "sceneType must be exactly avatar, insert, or space.",
      "status must be planned.",
      "visualIdea must use an allowed channel format prefix.",
      "imagePrompt must follow the Visual Brief ImagePrompt body-only contract (app owns style lock + negatives).",
      timingHint?.trim() ||
        "Hook: 3–6s / ~4–12 words. Body: 5–8s / ~15–25 words (soft floor 5–6s). Never one-word scenes. Hard hook rules are HOOK ONLY.",
      "Paste the full JSON array inline in the assistant message.",
    ].join("\n"),
  ].join("\n\n");
}
