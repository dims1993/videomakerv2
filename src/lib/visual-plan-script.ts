/**
 * Hook markers, hook beat segmentation, script coverage, and visualIdea format prefixes
 * for Visual Planner QA — without changing the scenes JSON schema.
 */

export const VISUAL_IDEA_PREFIXES = [
  "Narrative scene:",
  "Object/detail insert:",
  "Chapter cover:",
  "Concept card:",
  "Scripture/reference card:",
  "Comparison card:",
  "Simple diagram:",
  "Question card:",
  "Word-study card:",
  "Atmosphere/space:",
] as const;

export type VisualIdeaPrefix = (typeof VISUAL_IDEA_PREFIXES)[number];

/** Podcast English Lessons speaker / bed prefixes (with optional COMP presets). */
export const PODCAST_VISUAL_IDEA_PREFIXES = [
  "TEACHER_EMMA",
  "STUDENT_LEO",
  "MUSIC_BED",
  "PART_COVER",
  "SECTION_CLIP",
  "DUO_EMMA_LEO",
] as const;

const PODCAST_VISUAL_IDEA_PREFIX_PATTERN =
  /^(TEACHER_EMMA|STUDENT_LEO|MUSIC_BED|PART_COVER|SECTION_CLIP|DUO_EMMA_LEO)(\s*\||:)/i;

const STRUCTURAL_TOKEN =
  /\[(?:HOOK|END\s*HOOK|INTRODUCTION|REFLECTION AND PRAYER|INTRO|LESSON|CLOSING|CONCLUSION|FINAL|COLD\s+OPEN|CHAPTER COVER\s*[—\-:.][^\]]*|CHAPTER\s+\d+\s*[—\-:.][^\]]*|FINAL\s*[—\-:.][^\]]*|PART\s+\d+\s*[—\-:.][^\]]*|EMMA|LEO|MAX|SARA|TEACHER|STUDENT|HOST|GUEST|PAUSE(?::[^\]]*)?|LONG\s+PAUSE(?::[^\]]*)?|MUSIC(?::[^\]]*)?|LAUGHS?|SIGHS?)\]/gi;

const STRUCTURAL_LINE =
  /^\[(?:HOOK|END\s*HOOK|INTRODUCTION|REFLECTION AND PRAYER|INTRO|LESSON|CLOSING|CONCLUSION|FINAL|COLD\s+OPEN|CHAPTER COVER\s*[—\-:.][^\]]*|CHAPTER\s+\d+\s*[—\-:.][^\]]*|FINAL\s*[—\-:.][^\]]*|PART\s+\d+\s*[—\-:.][^\]]*|EMMA|LEO|MAX|SARA|TEACHER|STUDENT|HOST|GUEST|PAUSE(?::[^\]]*)?|LONG\s+PAUSE(?::[^\]]*)?|MUSIC(?::[^\]]*)?|LAUGHS?|SIGHS?)\]$/i;

/**
 * Remove planner structural markers so they are not treated as spoken narration
 * and never reach voiceover.
 */
export function stripStructuralMarkers(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(STRUCTURAL_TOKEN, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length === 0 || !STRUCTURAL_LINE.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findStructuralMarkersInScriptText(text: string): string[] {
  // Fresh regex each call — avoid lastIndex bugs from a shared /g pattern.
  const matches = text.match(
    /\[(?:HOOK|END\s*HOOK|INTRODUCTION|REFLECTION AND PRAYER|INTRO|LESSON|CLOSING|CONCLUSION|FINAL|COLD\s+OPEN|CHAPTER COVER\s*[—\-:.][^\]]*|CHAPTER\s+\d+\s*[—\-:.][^\]]*|FINAL\s*[—\-:.][^\]]*|PART\s+\d+\s*[—\-:.][^\]]*|EMMA|LEO|MAX|SARA|TEACHER|STUDENT|HOST|GUEST|PAUSE(?::[^\]]*)?|LONG\s+PAUSE(?::[^\]]*)?|MUSIC(?::[^\]]*)?|LAUGHS?|SIGHS?)\]/gi,
  );
  return matches ?? [];
}

export function scriptTextContainsStructuralMarkers(text: string): boolean {
  return findStructuralMarkersInScriptText(text).length > 0;
}

const CLAUSE_SPLIT =
  /\s+(?=(?:but|yet|whether|where|whereas|although|though|because|so that)\b)/i;

/** Collapse whitespace for exact spoken-script coverage compares. */
export function normalizeForScriptCoverage(text: string): string {
  return stripStructuralMarkers(text).replace(/\s+/g, " ").trim();
}

export function validateScriptCoverage(
  originalSection: string,
  sceneScriptTexts: string[],
): { ok: true } | { ok: false; reason: string } {
  const expected = normalizeForScriptCoverage(originalSection);
  const actual = normalizeForScriptCoverage(sceneScriptTexts.join(" "));

  if (!expected) {
    return { ok: false, reason: "Original section text is empty after stripping markers." };
  }

  if (actual === expected) {
    return { ok: true };
  }

  if (actual.length < expected.length) {
    return {
      ok: false,
      reason: "Concatenated scriptText is shorter than the original section (likely omitted words).",
    };
  }

  if (actual.length > expected.length) {
    return {
      ok: false,
      reason: "Concatenated scriptText is longer than the original section (likely duplicated or added words).",
    };
  }

  return {
    ok: false,
    reason: "Concatenated scriptText does not match the original section (order, paraphrase, or wording drift).",
  };
}

export function hasVisualIdeaPrefix(visualIdea: string): boolean {
  const trimmed = visualIdea.trim();
  if (VISUAL_IDEA_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return true;
  }
  return PODCAST_VISUAL_IDEA_PREFIX_PATTERN.test(trimmed);
}

export function validateVisualIdeaPrefixes(
  scenes: Array<{ visualIdea: string; order?: number }>,
): string[] {
  const errors: string[] = [];

  for (const [index, scene] of scenes.entries()) {
    const idea = scene.visualIdea?.trim() ?? "";
    if (!idea) {
      continue;
    }
    if (!hasVisualIdeaPrefix(idea)) {
      const label =
        typeof scene.order === "number" && Number.isFinite(scene.order)
          ? `scene ${scene.order}`
          : `scene at index ${index}`;
      errors.push(
        `${label}.visualIdea: must start with one of: ${[
          ...VISUAL_IDEA_PREFIXES,
          ...PODCAST_VISUAL_IDEA_PREFIXES,
        ].join(" | ")}`,
      );
    }
  }

  return errors;
}

/**
 * Ensure [HOOK]…[END HOOK] delimiters exist for the planner.
 * Does not alter spoken narration text — only inserts structural markers.
 */
export function ensureHookMarkersInScript(
  script: string,
  options?: { ideaHook?: string | null },
): { script: string; usedFallback: boolean; alreadyMarked: boolean } {
  const trimmed = script.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return { script: trimmed, usedFallback: false, alreadyMarked: false };
  }

  if (/\[HOOK\]/i.test(trimmed)) {
    if (/\[END\s*HOOK\]/i.test(trimmed)) {
      return { script: trimmed, usedFallback: false, alreadyMarked: true };
    }

    const hookStart = trimmed.search(/\[HOOK\]/i);
    const afterHook = trimmed.slice(hookStart);
    const chapterIdx = afterHook.search(/\n\[(?:CHAPTER\s+\d+|FINAL\b)/i);
    if (chapterIdx > 0) {
      const absolute = hookStart + chapterIdx;
      const withEnd =
        `${trimmed.slice(0, absolute).trimEnd()}\n\n[END HOOK]\n\n${trimmed.slice(absolute).trimStart()}`;
      return { script: withEnd, usedFallback: false, alreadyMarked: true };
    }

    return {
      script: `${trimmed.trimEnd()}\n\n[END HOOK]`,
      usedFallback: false,
      alreadyMarked: true,
    };
  }

  const ideaHook = options?.ideaHook?.trim();
  if (ideaHook) {
    const spoken = stripStructuralMarkers(trimmed);
    if (normalizeForScriptCoverage(spoken).startsWith(normalizeForScriptCoverage(ideaHook))) {
      const rest = spoken.slice(ideaHook.length).replace(/^\s+/, "");
      const wrapped = rest
        ? `[HOOK]\n\n${ideaHook}\n\n[END HOOK]\n\n${rest}`
        : `[HOOK]\n\n${ideaHook}\n\n[END HOOK]`;
      return { script: wrapped, usedFallback: false, alreadyMarked: false };
    }
  }

  const chapterMatch = trimmed.search(/\n\[(?:CHAPTER\s+\d+|FINAL\b)/i);
  if (chapterMatch > 0) {
    const hookPart = trimmed.slice(0, chapterMatch).trim();
    const rest = trimmed.slice(chapterMatch).trim();
    return {
      script: `[HOOK]\n\n${hookPart}\n\n[END HOOK]\n\n${rest}`,
      usedFallback: true,
      alreadyMarked: false,
    };
  }

  // Fallback: opening retention block — first consecutive short/medium paragraphs
  // until a long body-like paragraph or ~1200 characters at a paragraph boundary.
  const spoken = stripStructuralMarkers(trimmed);
  const paragraphs = spoken.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    return { script: trimmed, usedFallback: true, alreadyMarked: false };
  }

  let hookEnd = 0;
  let chars = 0;
  for (let i = 0; i < paragraphs.length; i += 1) {
    const para = paragraphs[i]!;
    const nextChars = chars + para.length + (i > 0 ? 2 : 0);
    const isLongBodyPara = para.length > 280 && i >= 2;
    if (i > 0 && (nextChars > 1200 || isLongBodyPara)) {
      break;
    }
    hookEnd = i + 1;
    chars = nextChars;
    if (chars >= 450 && i >= 3) {
      break;
    }
  }

  if (hookEnd <= 0) {
    hookEnd = 1;
  }

  const hookPart = paragraphs.slice(0, hookEnd).join("\n\n");
  const rest = paragraphs.slice(hookEnd).join("\n\n");
  const wrapped = rest
    ? `[HOOK]\n\n${hookPart}\n\n[END HOOK]\n\n${rest}`
    : `[HOOK]\n\n${hookPart}\n\n[END HOOK]`;

  return { script: wrapped, usedFallback: true, alreadyMarked: false };
}

export function extractMarkedHookText(script: string): string | null {
  const match = script.match(/\[HOOK\]([\s\S]*?)\[END\s*HOOK\]/i);
  if (!match) {
    return null;
  }
  return stripStructuralMarkers(match[1] ?? "").trim() || null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isQuestion(text: string): boolean {
  return /\?\s*$/.test(text.trim());
}

function isMicroBeat(text: string): boolean {
  const words = wordCount(text);
  return words > 0 && words <= 5 && /[.!?]\s*$/.test(text.trim());
}

function isParallelYouBeat(text: string): boolean {
  return /^You\s+\w+/i.test(text.trim()) && /[.!?]\s*$/.test(text.trim());
}

/** Split a long sentence into clause-level beats without cutting noun phrases mid-way. */
export function splitLongHookSentence(sentence: string): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return [];
  }

  if (wordCount(trimmed) <= 16 && !/\bbut\b|\bwhether\b|\bwhere\b/i.test(trimmed)) {
    return [trimmed];
  }

  // Prefer explicit contrast / consequence / relative clause boundaries.
  const parts: string[] = [];
  let remaining = trimmed;

  const pushSplit = (before: string, after: string) => {
    const left = before.trim();
    const right = after.trim();
    if (left) {
      parts.push(left);
    }
    remaining = right;
  };

  // Iteratively split at but / whether / where when both sides carry distinct functions.
  while (remaining) {
    const match = remaining.match(CLAUSE_SPLIT);
    if (!match || match.index == null) {
      parts.push(remaining.trim());
      break;
    }

    const left = remaining.slice(0, match.index).trim();
    const right = remaining.slice(match.index).trim();

    // Keep tiny left fragments attached.
    if (wordCount(left) <= 2) {
      parts.push(remaining.trim());
      break;
    }

    // "where conviction, comfort, and change begin" is its own beat after a location clause.
    pushSplit(left, right);
    if (wordCount(remaining) <= 12 && !CLAUSE_SPLIT.test(` ${remaining}`)) {
      parts.push(remaining.trim());
      break;
    }
  }

  // Secondary: split after a comma when left is a short setup clause ("The words enter your ears,")
  // and right starts with but/where already handled; also split comma+consequence for dense lines.
  const refined: string[] = [];
  for (const part of parts) {
    if (
      wordCount(part) > 16 &&
      /,/.test(part) &&
      !isQuestion(part)
    ) {
      const commaParts = part.split(/(?<=,)\s+/);
      if (commaParts.length >= 2 && wordCount(commaParts[0]!) <= 8) {
        refined.push(commaParts[0]!.trim());
        refined.push(commaParts.slice(1).join(" ").trim());
        continue;
      }
    }
    refined.push(part);
  }

  return refined.map((p) => p.trim()).filter(Boolean);
}

function splitIntoSentences(text: string): string[] {
  const units: string[] = [];
  const pattern = /[^.!?]+[.!?]+|[^.!?]+$/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const unit = match[0]?.trim();
    if (unit) {
      units.push(unit);
    }
  }
  return units.length > 0 ? units : [text.trim()].filter(Boolean);
}

function pairMicroBeats(beats: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < beats.length) {
    const current = beats[i]!;
    const next = beats[i + 1];
    if (
      next &&
      isMicroBeat(current) &&
      isMicroBeat(next) &&
      wordCount(current) <= 4 &&
      wordCount(next) <= 5
    ) {
      out.push(`${current} ${next}`);
      i += 2;
      continue;
    }
    out.push(current);
    i += 1;
  }
  return out;
}

function segmentSentenceList(sentences: string[]): string[] {
  const expanded: string[] = [];

  for (const sentence of sentences) {
    if (isQuestion(sentence)) {
      expanded.push(sentence);
      continue;
    }
    if (isParallelYouBeat(sentence)) {
      expanded.push(sentence);
      continue;
    }
    if (isMicroBeat(sentence)) {
      expanded.push(sentence);
      continue;
    }
    expanded.push(...splitLongHookSentence(sentence));
  }

  // Pair only runs of micro-beats; keep questions / You-progressions / long clauses alone.
  const result: string[] = [];
  let microRun: string[] = [];

  const flushMicro = () => {
    if (microRun.length > 0) {
      result.push(...pairMicroBeats(microRun));
      microRun = [];
    }
  };

  for (const unit of expanded) {
    if (isMicroBeat(unit) && !isQuestion(unit) && !isParallelYouBeat(unit)) {
      microRun.push(unit);
      continue;
    }
    flushMicro();
    result.push(unit);
  }
  flushMicro();

  return result;
}

/**
 * General hook beat segmentation (rules-based, not example-hardcoded).
 * Used for QA fixtures and as a reference for planner behavior.
 */
export function segmentHookNarration(raw: string): string[] {
  const text = stripStructuralMarkers(raw).replace(/\r\n/g, "\n").trim();
  if (!text) {
    return [];
  }

  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const scenes: string[] = [];
  let pendingMicros: string[] = [];

  const flushPendingMicros = () => {
    if (pendingMicros.length > 0) {
      scenes.push(...pairMicroBeats(pendingMicros));
      pendingMicros = [];
    }
  };

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    // Separate short lines that each look like complete beats.
    if (
      lines.length > 1 &&
      lines.every(
        (line) =>
          isQuestion(line) ||
          isMicroBeat(line) ||
          isParallelYouBeat(line) ||
          /[.!?]\s*$/.test(line),
      )
    ) {
      const segmented = segmentSentenceList(lines);
      for (const unit of segmented) {
        if (isMicroBeat(unit) && !isQuestion(unit) && !isParallelYouBeat(unit)) {
          pendingMicros.push(unit);
        } else {
          flushPendingMicros();
          scenes.push(unit);
        }
      }
      continue;
    }

    const prose = lines.join(" ");
    const segmented = segmentSentenceList(splitIntoSentences(prose));
    for (const unit of segmented) {
      if (
        segmented.length === 1 &&
        isMicroBeat(unit) &&
        !isQuestion(unit) &&
        !isParallelYouBeat(unit)
      ) {
        pendingMicros.push(unit);
        continue;
      }
      flushPendingMicros();
      if (isMicroBeat(unit) && !isQuestion(unit) && !isParallelYouBeat(unit)) {
        pendingMicros.push(unit);
      } else {
        scenes.push(unit);
      }
    }
  }

  flushPendingMicros();
  return scenes.map((scene) => scene.trim()).filter(Boolean);
}

/** Suggest an integer hook duration from beat density (min 2). */
export function suggestHookDurationSeconds(scriptText: string): number {
  const words = wordCount(scriptText);
  if (words <= 3) {
    return 3;
  }
  if (isQuestion(scriptText) || words <= 8) {
    return 4;
  }
  if (words <= 12) {
    return 5;
  }
  return 6;
}

export function clampSceneDurationSeconds(value: number, options?: { min?: number }) {
  const min = options?.min ?? 2;
  if (!Number.isFinite(value)) {
    return Math.max(min, 4);
  }
  return Math.max(min, Math.round(value));
}
