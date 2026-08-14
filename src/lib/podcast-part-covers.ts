/**
 * Podcast English Lessons — PART N cover headings.
 * Lines like "PART 1 — SAYING YOUR NAME" become narrated title-card inserts.
 */

export type PodcastPartHeading = {
  partNumber: number;
  /** Title segment as written after the dash. */
  title: string;
  /** On-image title, e.g. PART 1 — SAYING YOUR NAME */
  displayTitle: string;
  /** Spoken narration for voiceover / scriptText. */
  spokenText: string;
  raw: string;
};

const PART_HEADING_PATTERN =
  /^#{0,6}\s*\[?\s*PART\s+(\d+)\s*[—–\-]\s*(.+?)\s*\]?\s*$/i;

/** Trailing PART N — TITLE glued onto the previous spoken turn (common planner leak). */
const TRAILING_PART_HEADING_PATTERN =
  /(?:^|\s+)#{0,6}\s*\[?\s*PART\s+\d+\s*[—–\-]\s+.+?\]?\s*$/i;

/** Bare / bracket section labels that must never be spoken. */
const TRAILING_SECTION_LABEL_PATTERN =
  /(?:^|\s+)#{0,6}\s*\[?\s*(?:INTRO|LESSON|CLOSING|FINAL|COLD\s+OPEN|INTRODUCTION)\s*\]?\s*$/i;

const SECTION_LABEL_ONLY_PATTERN =
  /^#{0,6}\s*\[?\s*(?:INTRO|LESSON|CLOSING|FINAL|COLD\s+OPEN|INTRODUCTION)\s*\]?\s*$/i;

export function isPartCoverVisualIdea(visualIdea: string | null | undefined) {
  const normalized = (visualIdea ?? "").trim().toUpperCase();
  return (
    normalized.startsWith("PART_COVER:") ||
    normalized.startsWith("PART_COVER |") ||
    normalized.includes("COMP_PART_COVER")
  );
}

export function isPodcastStandaloneSectionLabel(line: string): boolean {
  return SECTION_LABEL_ONLY_PATTERN.test(line.trim());
}

/**
 * Remove a trailing `PART N — TITLE` / `PART N - TITLE` heading from spoken
 * avatar scriptText. That heading belongs only on the PART_COVER insert scene.
 */
export function stripTrailingPodcastPartHeading(scriptText: string): string {
  const text = scriptText.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return "";
  }

  // Whole-line heading with no other dialogue → empty (cover owns the speech).
  if (parsePodcastPartHeading(text)) {
    return "";
  }

  const withoutTrailing = text.replace(TRAILING_PART_HEADING_PATTERN, "").trim();
  if (withoutTrailing !== text.trim()) {
    return withoutTrailing.replace(/\s+/g, " ").trim();
  }

  // Multiline: drop a final line that is only the PART heading.
  const lines = text.split("\n");
  if (lines.length > 1) {
    const last = lines[lines.length - 1]?.trim() ?? "";
    if (parsePodcastPartHeading(last)) {
      return lines
        .slice(0, -1)
        .join("\n")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Remove trailing bare/bracket section labels
 * (`[CLOSING]`, `INTRO`, `COLD OPEN`, …) from avatar turns.
 */
export function stripTrailingPodcastSectionLabel(scriptText: string): string {
  const text = scriptText.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return "";
  }

  if (isPodcastStandaloneSectionLabel(text)) {
    return "";
  }

  const withoutTrailing = text.replace(TRAILING_SECTION_LABEL_PATTERN, "").trim();
  if (withoutTrailing !== text.trim()) {
    return withoutTrailing.replace(/\s+/g, " ").trim();
  }

  const lines = text.split("\n");
  if (lines.length > 1) {
    const last = lines[lines.length - 1]?.trim() ?? "";
    if (isPodcastStandaloneSectionLabel(last)) {
      return lines
        .slice(0, -1)
        .join("\n")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return text.replace(/\s+/g, " ").trim();
}

/** Full avatar scriptText sanitize: PART headings + CLOSING/COLD OPEN labels. */
export function sanitizePodcastAvatarScriptText(scriptText: string): string {
  return stripTrailingPodcastSectionLabel(
    stripTrailingPodcastPartHeading(scriptText),
  );
}

export function parsePodcastPartHeading(line: string): PodcastPartHeading | null {
  const raw = line.trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(PART_HEADING_PATTERN);
  if (!match) {
    return null;
  }
  const partNumber = Number(match[1]);
  const title = (match[2] ?? "").trim().replace(/\s+/g, " ");
  if (!Number.isFinite(partNumber) || partNumber < 1 || !title) {
    return null;
  }

  const displayTitle = `PART ${partNumber} — ${title.toUpperCase()}`;
  return {
    partNumber,
    title,
    displayTitle,
    spokenText: toSpokenPartCoverText(partNumber, title),
    raw,
  };
}

/**
 * Convert "SAYING YOUR NAME" → "Part 1. Saying your name."
 */
export function toSpokenPartCoverText(partNumber: number, title: string): string {
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return `Part ${partNumber}.`;
  }
  const sentenceCase = cleaned
    .toLowerCase()
    .replace(/^\p{L}/u, (char) => char.toUpperCase())
    .replace(/\.$/, "");
  return `Part ${partNumber}. ${sentenceCase}.`;
}

export function extractPartCoverDisplayTitle(opts: {
  visualIdea?: string | null;
  scriptText?: string | null;
  imagePrompt?: string | null;
}): string | null {
  const idea = opts.visualIdea?.trim() ?? "";
  const fromIdea = idea.match(
    /PART_COVER\s*\|\s*COMP_PART_COVER\s*:\s*(.+)$/i,
  );
  if (fromIdea?.[1]?.trim()) {
    return fromIdea[1].trim().replace(/\s+/g, " ");
  }

  const fromVisible = (opts.imagePrompt ?? "").match(
    /visible text (?:must be )?limited (?:exactly )?to:\s*\n?"?([^"\n.]+)"?/i,
  );
  if (fromVisible?.[1]?.trim()) {
    return fromVisible[1].trim().replace(/\s+/g, " ");
  }

  const fromQuotedTitle = (opts.imagePrompt ?? "").match(
    /place the title text exactly:\s*\n?"([^"]+)"/i,
  );
  if (fromQuotedTitle?.[1]?.trim()) {
    return fromQuotedTitle[1].trim().replace(/\s+/g, " ");
  }

  const spoken = opts.scriptText?.trim() ?? "";
  const spokenMatch = spoken.match(/^Part\s+(\d+)\.\s*(.+)$/i);
  if (spokenMatch) {
    const n = Number(spokenMatch[1]);
    const rest = (spokenMatch[2] ?? "").replace(/\.$/, "").trim();
    if (Number.isFinite(n) && rest) {
      return `PART ${n} — ${rest.toUpperCase()}`;
    }
  }

  return null;
}
