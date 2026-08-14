/**
 * Deterministic section splitting + continuity helpers for Wealth Insights
 * Visual Plan section-chunk generation (no spoken-text mutation).
 */

import {
  type StructuralScriptSection,
} from "@/lib/visual-plan-script-sections";
import {
  extractMarkedHookText,
  normalizeForScriptCoverage,
  stripStructuralMarkers,
  validateScriptCoverage,
} from "@/lib/visual-plan-script";

/** Target spoken words per Wealth visual-plan BODY chunk (not HOOK). */
export const WEALTH_VISUAL_SECTION_TARGET_WORDS = 180;
export const WEALTH_VISUAL_SECTION_MAX_WORDS = 280;
export const WEALTH_VISUAL_SECTION_MIN_WORDS = 70;

/** Editorial hook duration target (source of truth): first ~2+ minutes. */
export const WEALTH_HOOK_TARGET_MIN_SEC = 120;
/** Soft upper for timing fallback when markers are missing/short. */
export const WEALTH_HOOK_TARGET_MAX_SEC = 150;
/** Absolute ceiling for a single HOOK scene (estimated narration). */
export const WEALTH_HOOK_SCENE_HARD_MAX_SEC = 5.5;
/** Absolute ceiling for a single BODY/CLOSING scene (estimated narration). */
export const WEALTH_BODY_SCENE_HARD_MAX_SEC = 8;

export type WealthVisualContinuityState = {
  completedScenes: number;
  nextSceneOrder: number;
  sceneTypeCounts: {
    avatar: number;
    insert: number;
    space: number;
  };
  lastSceneType: string | null;
  lastVisualIdea: string | null;
  lastDominantElement: string | null;
  recentVisualIdeas: string[];
  recentDominantElements: string[];
  recentMotifs: string[];
};

export type WealthHookBoundary = {
  /** Exclusive end offset inside spoken script (markers already stripped). */
  hookEndOffset: number;
  hookText: string;
  /** Remainder of spoken script after hookEndOffset (may start with whitespace). */
  bodyText: string;
  source: "markers" | "timing";
  estimatedHookSeconds: number;
};

function wordCount(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function spokenWealthScript(script: string) {
  return stripStructuralMarkers(script).replace(/\r\n/g, "\n").trim();
}

export function isWealthHookSectionLabel(label: string) {
  return label.trim().toUpperCase() === "HOOK";
}

/**
 * Sentence-end offsets (exclusive end index of each sentence) within `text`.
 * Does not drop or rewrite characters — only finds split candidates.
 */
export function findSentenceEndOffsets(text: string): number[] {
  const ends: number[] = [];
  const pattern = /[.!?]+(?:["')\]]+)?(?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) != null) {
    ends.push(match.index + match[0].length);
  }
  if (ends.length === 0 || ends[ends.length - 1] !== text.length) {
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "\n" && text[index + 1] === "\n") {
        let end = index;
        while (end < text.length && text[end] === "\n") {
          end += 1;
        }
        if (!ends.includes(end)) {
          ends.push(end);
        }
      }
    }
    ends.sort((a, b) => a - b);
  }
  if (ends.length === 0 || ends[ends.length - 1] !== text.length) {
    ends.push(text.length);
  }
  return ends;
}

type OffsetToken = { word: string; start: number; end: number };

function tokenizeWithOffsets(text: string): OffsetToken[] {
  const tokens: OffsetToken[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) != null) {
    tokens.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Map a normalized spoken prefix onto an exclusive end offset in `full`.
 */
export function findNormalizedPrefixEndOffset(
  full: string,
  prefixSpoken: string,
): number | null {
  const fullTokens = tokenizeWithOffsets(full);
  const prefixWords = normalizeForScriptCoverage(prefixSpoken)
    .split(/\s+/)
    .filter(Boolean);
  if (prefixWords.length === 0 || fullTokens.length < prefixWords.length) {
    return null;
  }
  for (let index = 0; index < prefixWords.length; index += 1) {
    if (
      fullTokens[index]!.word.replace(/[^\w']/g, "").toLowerCase() !==
      prefixWords[index]!.replace(/[^\w']/g, "").toLowerCase()
    ) {
      // Fall back to exact normalized word compare without punctuation strip mismatch
      if (
        normalizeForScriptCoverage(fullTokens[index]!.word).toLowerCase() !==
        prefixWords[index]!.toLowerCase()
      ) {
        return null;
      }
    }
  }
  return fullTokens[prefixWords.length - 1]!.end;
}

/** Conservative Wealth narration duration estimate (seconds). */
export function estimateWealthNarrationSeconds(scriptText: string): number {
  const text = scriptText.trim();
  if (!text) {
    return 0;
  }
  const words = wordCount(text);
  const commas = (text.match(/,/g) ?? []).length;
  const stops = (text.match(/[.!?]/g) ?? []).length;
  const base = (words / 137.5) * 60;
  const pauses = commas * 0.12 + stops * 0.22;
  return Math.max(0, base + pauses);
}

/**
 * Exact editorial hook boundary for Wealth Insights.
 * Prefers [HOOK]…[END HOOK] markers when they cover ≥2 minutes;
 * otherwise extends (or falls back) with timing at sentence ends to reach ≥2 minutes.
 */
export function detectWealthInsightsHookBoundary(
  script: string,
): WealthHookBoundary {
  const spoken = spokenWealthScript(script);
  if (!spoken) {
    return {
      hookEndOffset: 0,
      hookText: "",
      bodyText: "",
      source: "timing",
      estimatedHookSeconds: 0,
    };
  }

  const marked = extractMarkedHookText(script);
  if (marked) {
    const exactPrefix = spoken.startsWith(marked)
      ? marked.length
      : findNormalizedPrefixEndOffset(spoken, marked);
    if (exactPrefix != null && exactPrefix > 0) {
      const markedHookText = spoken.slice(0, exactPrefix);
      const markedSeconds = estimateWealthNarrationSeconds(markedHookText);
      if (markedSeconds >= WEALTH_HOOK_TARGET_MIN_SEC) {
        return {
          hookEndOffset: exactPrefix,
          hookText: markedHookText,
          bodyText: spoken.slice(exactPrefix),
          source: "markers",
          estimatedHookSeconds: markedSeconds,
        };
      }
      // Marker hook is shorter than the 2-minute minimum — extend by timing.
    }
  }

  const sentenceEnds = findSentenceEndOffsets(spoken);
  let chosenEnd = sentenceEnds[0] ?? spoken.length;
  let previousEnd = 0;

  for (const end of sentenceEnds) {
    const candidate = spoken.slice(0, end);
    const estimated = estimateWealthNarrationSeconds(candidate);
    if (estimated < WEALTH_HOOK_TARGET_MIN_SEC) {
      previousEnd = end;
      chosenEnd = end;
      continue;
    }
    if (estimated <= WEALTH_HOOK_TARGET_MAX_SEC) {
      chosenEnd = end;
      break;
    }
    // Overshot soft max: prefer previous sentence if it already reached the minimum.
    if (
      previousEnd > 0 &&
      estimateWealthNarrationSeconds(spoken.slice(0, previousEnd)) >=
        WEALTH_HOOK_TARGET_MIN_SEC * 0.95
    ) {
      chosenEnd = previousEnd;
    } else {
      chosenEnd = end;
    }
    break;
  }

  // If the whole script is shorter than the minimum, the whole script is the hook.
  if (
    estimateWealthNarrationSeconds(spoken.slice(0, chosenEnd)) <
      WEALTH_HOOK_TARGET_MIN_SEC &&
    chosenEnd < spoken.length
  ) {
    chosenEnd = spoken.length;
  }

  const hookText = spoken.slice(0, chosenEnd);
  return {
    hookEndOffset: chosenEnd,
    hookText,
    bodyText: spoken.slice(chosenEnd),
    source: "timing",
    estimatedHookSeconds: estimateWealthNarrationSeconds(hookText),
  };
}

function labelForWealthBodySegment(index: number, totalBody: number) {
  if (totalBody <= 1) {
    return "BODY";
  }
  if (index === totalBody - 1) {
    return "CLOSING";
  }
  return `BODY ${index + 1}`;
}

function chunkSpokenBodyIntoRanges(
  text: string,
  options: { targetWords: number; maxWords: number; minWords: number },
): Array<{ start: number; end: number }> {
  if (!text) {
    return [];
  }

  const { targetWords, maxWords, minWords } = options;
  const sentenceEnds = findSentenceEndOffsets(text);
  const ranges: Array<{ start: number; end: number }> = [];
  let sectionStart = 0;
  let cursor = 0;

  const flush = (end: number) => {
    if (end <= sectionStart) {
      return;
    }
    ranges.push({ start: sectionStart, end });
    sectionStart = end;
    cursor = end;
  };

  for (const end of sentenceEnds) {
    if (end <= sectionStart) {
      continue;
    }

    const withWords = wordCount(text.slice(sectionStart, end));
    if (withWords > maxWords && cursor > sectionStart) {
      const open = text.slice(sectionStart, cursor);
      const paraBreak = open.lastIndexOf("\n\n");
      if (paraBreak >= Math.floor(open.length * 0.35)) {
        let nextStart = sectionStart + paraBreak;
        while (nextStart < cursor && text[nextStart] === "\n") {
          nextStart += 1;
        }
        flush(nextStart);
      } else {
        flush(cursor);
      }
    }

    cursor = end;
    const openWords = wordCount(text.slice(sectionStart, cursor));
    if (openWords >= targetWords) {
      const open = text.slice(sectionStart, cursor);
      const paraBreak = open.lastIndexOf("\n\n");
      if (paraBreak >= Math.floor(open.length * 0.35)) {
        let nextStart = sectionStart + paraBreak;
        while (nextStart < cursor && text[nextStart] === "\n") {
          nextStart += 1;
        }
        if (nextStart > sectionStart && nextStart <= cursor) {
          flush(nextStart);
          continue;
        }
      }
      flush(cursor);
    }
  }

  if (sectionStart < text.length) {
    flush(text.length);
  }

  if (ranges.length === 0 && text.length > 0) {
    ranges.push({ start: 0, end: text.length });
  }

  if (ranges.length >= 2) {
    const last = ranges[ranges.length - 1]!;
    if (wordCount(text.slice(last.start, last.end)) < minWords) {
      ranges[ranges.length - 2]!.end = last.end;
      ranges.pop();
    }
  }

  return ranges;
}

/**
 * Split Wealth Insights scripts for section-chunk Visual Plan generation.
 * HOOK boundary always wins over the ~180-word body budget.
 * Section texts are spoken-only (structural markers stripped).
 */
export function splitWealthInsightsScriptIntoVisualPlanSections(
  script: string,
  options?: {
    targetWords?: number;
    maxWords?: number;
    minWords?: number;
  },
): StructuralScriptSection[] {
  const targetWords =
    options?.targetWords ?? WEALTH_VISUAL_SECTION_TARGET_WORDS;
  const maxWords = options?.maxWords ?? WEALTH_VISUAL_SECTION_MAX_WORDS;
  const minWords = options?.minWords ?? WEALTH_VISUAL_SECTION_MIN_WORDS;

  const spoken = spokenWealthScript(script);
  if (!spoken) {
    return [];
  }

  const boundary = detectWealthInsightsHookBoundary(script);
  const sections: StructuralScriptSection[] = [];

  if (boundary.hookText.trim()) {
    sections.push({
      id: "section-1",
      index: 0,
      label: "HOOK",
      text: boundary.hookText,
      expectsCover: false,
    });
  }

  // Keep leading whitespace attached to the first body slice so join("") === spoken.
  const bodyFull = boundary.bodyText;
  const bodyRanges = chunkSpokenBodyIntoRanges(bodyFull, {
    targetWords,
    maxWords,
    minWords,
  });

  const bodySections = bodyRanges.map((range, bodyIndex) => ({
    id: `section-${sections.length + bodyIndex + 1}`,
    index: sections.length + bodyIndex,
    label: labelForWealthBodySegment(bodyIndex, bodyRanges.length),
    text: bodyFull.slice(range.start, range.end),
    expectsCover: false,
  }));

  sections.push(...bodySections);

  // Re-index ids/indexes for stability.
  return sections.map((section, index) => ({
    ...section,
    id: `section-${index + 1}`,
    index,
  }));
}

/** Exact reconstruction check for Wealth / generic contiguous splitters. */
export function sectionsReconstructScript(
  script: string,
  sections: StructuralScriptSection[],
): { ok: true } | { ok: false; reason: string } {
  const expected = spokenWealthScript(script);
  const actual = sections.map((section) => section.text).join("");
  if (actual === expected) {
    return { ok: true };
  }

  const coverage = validateScriptCoverage(
    script,
    sections.map((section) => section.text),
  );
  return coverage.ok
    ? { ok: true }
    : {
        ok: false,
        reason:
          coverage.reason ||
          "Concatenated sections do not reconstruct the original spoken script exactly.",
      };
}

export function extractDominantElementHint(visualIdea: string): string | null {
  const trimmed = visualIdea.trim();
  if (!trimmed) {
    return null;
  }
  const withoutPrefix = trimmed
    .replace(
      /^(MAIN HOST|CHARACTER_[A-D]|MECHANISM|EDITORIAL BOARD|OBJECT DETAIL|LOCATION BEAT|SUPPORTING_CHARACTER|SUPPORTING CHARACTER):\s*/i,
      "",
    )
    .trim();
  if (!withoutPrefix) {
    return null;
  }
  return withoutPrefix.slice(0, 140);
}

export function buildWealthVisualContinuityState(
  scenes: Array<{
    order: number;
    scriptText: string;
    sceneType: string;
    visualPurpose: string;
    visualIdea: string;
    imagePrompt: string;
    duration: number;
  }>,
  options?: { recentWindow?: number },
): WealthVisualContinuityState {
  const recentWindow = options?.recentWindow ?? 8;
  const recent = scenes.slice(-recentWindow);
  const last = scenes[scenes.length - 1] ?? null;
  const counts = { avatar: 0, insert: 0, space: 0 };
  for (const scene of scenes) {
    if (scene.sceneType === "avatar") counts.avatar += 1;
    else if (scene.sceneType === "insert") counts.insert += 1;
    else if (scene.sceneType === "space") counts.space += 1;
  }

  const recentVisualIdeas = recent
    .map((scene) => scene.visualIdea.trim())
    .filter(Boolean);
  const recentDominantElements = recent
    .map((scene) => extractDominantElementHint(scene.visualIdea))
    .filter((value): value is string => Boolean(value));

  return {
    completedScenes: scenes.length,
    nextSceneOrder: last ? last.order + 1 : 1,
    sceneTypeCounts: counts,
    lastSceneType: last?.sceneType ?? null,
    lastVisualIdea: last?.visualIdea ?? null,
    lastDominantElement: last
      ? extractDominantElementHint(last.visualIdea)
      : null,
    recentVisualIdeas,
    recentDominantElements,
    recentMotifs: recentDominantElements.slice(-5),
  };
}

export function validateSequentialSceneOrders(
  scenes: Array<{ order: number }>,
): { ok: true } | { ok: false; reason: string } {
  if (scenes.length === 0) {
    return { ok: false, reason: "No scenes to validate." };
  }
  if (scenes[0]!.order !== 1) {
    return { ok: false, reason: `First scene order must be 1 (got ${scenes[0]!.order}).` };
  }
  for (let index = 1; index < scenes.length; index += 1) {
    const prev = scenes[index - 1]!.order;
    const current = scenes[index]!.order;
    if (current !== prev + 1) {
      return {
        ok: false,
        reason: `Scene order gap/duplicate at index ${index}: expected ${prev + 1}, got ${current}.`,
      };
    }
  }
  return { ok: true };
}

export function renumberSceneOrders<T extends { order: number }>(
  scenes: T[],
  startOrder = 1,
): T[] {
  return scenes.map((scene, index) => ({
    ...scene,
    order: startOrder + index,
  }));
}

export function assembleVisualPlanSections(
  sectionSceneArrays: Array<
    Array<{
      order: number;
      scriptText: string;
      sceneType: string;
      visualPurpose: string;
      visualIdea: string;
      duration: number;
      imagePrompt: string;
      status: string;
    }>
  >,
) {
  const flat = sectionSceneArrays.flat();
  return renumberSceneOrders(flat, 1);
}

export function validateWealthSectionScriptCoverage(
  sectionText: string,
  sceneScriptTexts: string[],
) {
  return validateScriptCoverage(sectionText, sceneScriptTexts);
}

export function validateFullVisualPlanScriptCoverage(
  fullScript: string,
  sceneScriptTexts: string[],
) {
  return validateScriptCoverage(fullScript, sceneScriptTexts);
}

/**
 * Duration validation for Wealth section chunks.
 * For HOOK: estimated narration > 5.5s fails regardless of declared duration.
 * For BODY/CLOSING: estimated narration > 8s fails (5–8s max).
 */
export function validateWealthSceneDurations(
  scenes: Array<{ scriptText: string; duration: number }>,
  options?: { isHookSection?: boolean; isOpeningSection?: boolean },
): string[] {
  const isHookSection =
    options?.isHookSection === true || options?.isOpeningSection === true;
  const errors: string[] = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]!;
    const duration = Number(scene.duration);
    const estimated = estimateWealthNarrationSeconds(scene.scriptText);
    const label = `Scene ${index + 1}`;

    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`${label}: duration must be a positive number.`);
      continue;
    }

    if (isHookSection) {
      if (estimated > WEALTH_HOOK_SCENE_HARD_MAX_SEC) {
        errors.push(
          `${label}: estimated narration ${estimated.toFixed(1)}s exceeds HOOK hard maximum ${WEALTH_HOOK_SCENE_HARD_MAX_SEC}s (declared duration ${duration}s is irrelevant for this check). Split at natural semantic/visual boundaries; do not lower duration.`,
        );
      } else if (duration + 0.5 < estimated * 0.9) {
        errors.push(
          `${label}: declared duration ${duration}s is incompatible with estimated narration ~${estimated.toFixed(1)}s. Do not bypass validation by lowering duration; split or set duration to the real narration time.`,
        );
      }
      continue;
    }

    if (duration > WEALTH_BODY_SCENE_HARD_MAX_SEC) {
      errors.push(
        `${label}: duration ${duration}s exceeds BODY hard maximum of ${WEALTH_BODY_SCENE_HARD_MAX_SEC}s.`,
      );
    }
    if (estimated > WEALTH_BODY_SCENE_HARD_MAX_SEC) {
      errors.push(
        `${label}: estimated narration ${estimated.toFixed(1)}s exceeds BODY hard maximum of ${WEALTH_BODY_SCENE_HARD_MAX_SEC}s — split before prompting.`,
      );
    }
    if (duration + 1.25 < estimated * 0.72) {
      errors.push(
        `${label}: duration ${duration}s is too short for ~${estimated.toFixed(1)}s of narration — split or raise duration.`,
      );
    }
  }

  return errors;
}

export function ideaField(ideaJson: unknown, keys: string[]): string | null {
  if (!ideaJson || typeof ideaJson !== "object" || Array.isArray(ideaJson)) {
    return null;
  }
  const record = ideaJson as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Compact Internal Visual Element Library built once for the whole video.
 * Vocabulary only — scriptText always wins.
 */
export function buildWealthInsightsVisualElementLibraryCompact(options: {
  title?: string | null;
  topicCategory?: string | null;
  ideaJson?: unknown;
  script?: string | null;
}): string {
  const title = options.title?.trim() || "Untitled";
  const topic = options.topicCategory?.trim() || "unspecified";
  const coreAngle = ideaField(options.ideaJson, [
    "coreAngle",
    "angle",
    "core_angle",
  ]);
  const uniqueMechanism = ideaField(options.ideaJson, [
    "uniqueMechanism",
    "unique_mechanism",
    "mechanism",
  ]);
  const visualAnchor = ideaField(options.ideaJson, [
    "visualAnchor",
    "visual_anchor",
    "visualHook",
    "visual_hook",
  ]);
  const thumbnailIdea = ideaField(options.ideaJson, [
    "thumbnailIdea",
    "thumbnail_idea",
  ]);
  const scriptSnippet = normalizeForScriptCoverage(options.script ?? "").slice(
    0,
    900,
  );

  return [
    "## Internal Visual Element Library (pre-built for this video — compact)",
    "",
    "Build and reuse this vocabulary for EVERY section of this video.",
    "Do not recalculate a conflicting library per section.",
    "scriptText always wins. This library is not a mandatory menu.",
    "",
    `Title: ${title}`,
    `Topic: ${topic}`,
    coreAngle ? `coreAngle: ${coreAngle}` : null,
    uniqueMechanism ? `uniqueMechanism: ${uniqueMechanism}` : null,
    visualAnchor ? `visualAnchor: ${visualAnchor}` : null,
    thumbnailIdea ? `thumbnailIdea: ${thumbnailIdea}` : null,
    "",
    "Extract and keep internally (do not export as JSON fields):",
    "1. masterMotif — one recurring visual thesis tied to the mechanism",
    "2. coreMechanismElements — concrete drawable objects for the mechanism",
    "3. supportingVisualElements — secondary objects only when needed",
    "4. emotionalVisualElements — pressure, relief, contradiction, reveal cues",
    "",
    "Prefer concrete objects readable in under one second.",
    "Usually keep 8–18 elements total across the video.",
    "Motif recurrence is allowed only with a new narrative function (intro / reveal / escalation / contrast / consequence / callback).",
    "",
    scriptSnippet
      ? ["Script fingerprint (whitespace-normalized excerpt):", scriptSnippet].join(
          "\n",
        )
      : null,
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}
