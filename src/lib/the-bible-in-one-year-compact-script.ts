/**
 * Compact-script preparation and deterministic beat directives
 * for The Bible in One Year Visual Planner requests.
 */

import { stripStructuralMarkers } from "@/lib/visual-plan-script";
import { BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK } from "@/lib/the-bible-in-one-year-final-image-prompt-contract";

const SECTION_MARKER_RE =
  /\[(?:INTRODUCTION|REFLECTION AND PRAYER|CLOSING|CHAPTER COVER\s*[—\-:.][^\]]*|HOOK|END\s*HOOK)\]/gi;

export const BIBLE_ONE_YEAR_REFLECTION_OPENER =
  "You've completed today's reading. Well done. Now let's take a little time to reflect and pray.";

export const BIBLE_ONE_YEAR_REFLECTION_OPENER_RE =
  /^you'?ve completed today'?s reading\.\s*well done\.\s*now let'?s take a little time to reflect and pray\.?$/i;

export type BibleOneYearCoverKind =
  | "introduction"
  | "chapter"
  | "reflection"
  | "progress"
  | "next_reading"
  | "reading_preview";

export type BibleOneYearDeterministicBeatKind =
  | "episode_cover"
  | "chapter_cover"
  | "reading_preview"
  | "reflection_cover"
  | "welcome_pastor"
  | "worthwhile_pause"
  | "pray_with_me"
  | "amen"
  | "thank_you"
  | "progress"
  | "share"
  | "next_reading"
  | "final_blessing";

export type BibleOneYearCoverBeat = {
  kind: BibleOneYearCoverKind;
  spokenLine: string;
  visibleTitle: string;
  visualIdeaPrefix: "Chapter cover:";
  sceneType: "insert";
  durationHint: string;
};

export type BibleOneYearDeterministicBeat = {
  kind: BibleOneYearDeterministicBeatKind;
  spokenLine: string;
  sceneType: "avatar" | "insert" | "space";
  visualIdeaPrefix?:
    | "Chapter cover:"
    | "Narrative scene:"
    | "Object/detail insert:"
    | "Atmosphere/space:";
  visibleTitle?: string | null;
  durationHint: string;
  requiresPastorLock: boolean;
  requiresListenerLock: boolean;
  notes: string[];
};

function normalizeNewlines(script: string) {
  return script.replace(/\r\n/g, "\n").trim();
}

function firstSentence(paragraph: string): string {
  const trimmed = paragraph.trim();
  if (!trimmed) {
    return "";
  }
  const match = trimmed.match(/^[\s\S]*?[.!?…](?=\s|$)/);
  return (match?.[0] ?? trimmed.split("\n")[0] ?? trimmed).trim();
}

function fullParagraphSpoken(block: string): string {
  return stripStructuralMarkers(block).replace(/\s+/g, " ").trim();
}

/** Welcome to Day N of The Bible in One Year. → THE BIBLE IN ONE YEAR — DAY N */
export function coverTitleFromWelcomeLine(line: string): string | null {
  const match = line
    .trim()
    .match(/^welcome to day\s+(\d+)\s+of\s+the bible in one year\.?$/i);
  if (!match) {
    return null;
  }
  return `THE BIBLE IN ONE YEAR — DAY ${match[1]}`;
}

/** The Bible in One Year — Day N. → THE BIBLE IN ONE YEAR — DAY N */
export function coverTitleFromSeriesTitleLine(line: string): string | null {
  const match = line
    .trim()
    .match(/^the bible in one year\s*[—\-]\s*day\s+(\d+)\.?$/i);
  if (!match) {
    return null;
  }
  return `THE BIBLE IN ONE YEAR — DAY ${match[1]}`;
}

/** Genesis, chapter 1. → GENESIS 1 */
export function coverTitleFromChapterAnnouncement(line: string): string | null {
  const match = line
    .trim()
    .match(/^([A-Za-z][A-Za-z0-9\s]+?),\s*chapter\s+(\d+)\.?$/i);
  if (!match) {
    return null;
  }
  const book = match[1]!.trim().toUpperCase().replace(/\s+/g, " ");
  return `${book} ${match[2]}`;
}

/** Today, we will read Genesis 1–2. → GENESIS 1–2 */
export function coverTitleFromReadingPreview(line: string): string | null {
  const match = line.trim().match(/^today,?\s+we will read\s+(.+?)\.?$/i);
  if (!match) {
    return null;
  }
  return match[1]!.trim().toUpperCase();
}

/** Thank you for joining Day N... → THANK YOU (avatar text, not a cover) */
export function thankYouVisibleTitle(line: string): string | null {
  if (
    /^thank you for joining day\s+\d+\s+of\s+the bible in one year\.?$/i.test(
      line.trim(),
    )
  ) {
    return "THANK YOU";
  }
  return null;
}

/** comment "Day N complete" → DAY N COMPLETE */
export function progressVisibleTitle(line: string): string | null {
  const match = line.match(/day\s+(\d+)\s+complete/i);
  if (!match) {
    return null;
  }
  if (!/comment/i.test(line) && !/mark your progress/i.test(line)) {
    return null;
  }
  return `DAY ${match[1]} COMPLETE`;
}

/** We will continue with Genesis 6–8. → NEXT — GENESIS 6–8 */
export function nextReadingVisibleTitle(line: string): string | null {
  const match = line.trim().match(/^we will continue with\s+(.+?)\.?$/i);
  if (!match) {
    return null;
  }
  return `NEXT — ${match[1]!.trim().toUpperCase()}`;
}

export function coverTitleFromSpokenOpener(line: string): string | null {
  return (
    coverTitleFromSeriesTitleLine(line) ||
    coverTitleFromWelcomeLine(line) ||
    coverTitleFromChapterAnnouncement(line) ||
    null
  );
}

export function isReflectionOpenerLine(line: string): boolean {
  return BIBLE_ONE_YEAR_REFLECTION_OPENER_RE.test(line.trim());
}

export function isPrayWithMeLine(line: string): boolean {
  return /^pray with me\.?$/i.test(line.trim());
}

export function isAmenLine(line: string): boolean {
  return /in jesus'? name,?\s*amen\.?$/i.test(line.trim());
}

export function isWorthwhilePauseLine(line: string): boolean {
  return /then the time we have spent together will already have been worthwhile\.?$/i.test(
    line.trim(),
  );
}

export function isFinalBlessingLine(line: string): boolean {
  return /^may god'?s word remain with you\.?$/i.test(line.trim());
}

export function isShareThoughtLine(line: string): boolean {
  return /if one verse or thought stayed with you/i.test(line.trim());
}

function paragraphBlocks(script: string): string[] {
  return normalizeNewlines(script)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * Restore missing Bible section markers from spoken openers without altering
 * spoken narration.
 */
export function ensureBibleOneYearSectionMarkers(script: string): string {
  let text = normalizeNewlines(script);
  if (!text) {
    return text;
  }

  const hasIntroduction = /\[INTRODUCTION\]/i.test(text);
  if (!hasIntroduction) {
    const spokenStart = stripStructuralMarkers(text);
    const opener = firstSentence(spokenStart);
    if (
      coverTitleFromWelcomeLine(opener) ||
      coverTitleFromSeriesTitleLine(opener)
    ) {
      const blocks = paragraphBlocks(text);
      const openerIndex = blocks.findIndex((block) => {
        const line = firstSentence(stripStructuralMarkers(block));
        return (
          coverTitleFromWelcomeLine(line) ||
          coverTitleFromSeriesTitleLine(line)
        );
      });
      if (openerIndex >= 0) {
        blocks.splice(openerIndex, 0, "[INTRODUCTION]");
        text = blocks.join("\n\n");
      } else {
        text = `[INTRODUCTION]\n\n${text}`;
      }
    }
  }

  text = insertMarkerBeforeSpokenPattern(
    text,
    /\[REFLECTION AND PRAYER\]/i,
    BIBLE_ONE_YEAR_REFLECTION_OPENER_RE,
    "[REFLECTION AND PRAYER]",
  );

  text = insertMarkerBeforeSpokenPattern(
    text,
    /\[CLOSING\]/i,
    /^thank you for joining day\s+\d+\s+of\s+the bible in one year\.?$/i,
    "[CLOSING]",
  );

  text = ensureChapterCoverMarkers(text);

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function insertMarkerBeforeSpokenPattern(
  script: string,
  existingMarker: RegExp,
  spokenPattern: RegExp,
  markerToInsert: string,
): string {
  if (existingMarker.test(script)) {
    return script;
  }

  const blocks = paragraphBlocks(script);
  const index = blocks.findIndex((block) =>
    spokenPattern.test(firstSentence(stripStructuralMarkers(block))),
  );
  if (index < 0) {
    return script;
  }

  blocks.splice(index, 0, markerToInsert);
  return blocks.join("\n\n");
}

function ensureChapterCoverMarkers(script: string): string {
  const blocks = paragraphBlocks(script);
  const result: string[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const spoken = firstSentence(stripStructuralMarkers(block));
    const chapterTitle = coverTitleFromChapterAnnouncement(spoken);
    const previous = result[result.length - 1] ?? "";
    const previousIsChapterCover = /\[CHAPTER COVER\s*[—\-:.]/i.test(previous);

    if (chapterTitle && !previousIsChapterCover) {
      result.push(`[CHAPTER COVER — ${chapterTitle}]`);
    }

    result.push(block);
  }

  return result.join("\n\n");
}

export function prepareBibleOneYearCompactScript(
  script: string,
  _options?: { ideaHook?: string | null },
): string {
  const normalized = normalizeNewlines(script);
  if (!normalized) {
    return normalized;
  }

  return ensureBibleOneYearSectionMarkers(normalized);
}

export function listPreservedBibleMarkers(script: string): string[] {
  return script.match(SECTION_MARKER_RE) ?? [];
}

/**
 * Cover-only beats (parchment inserts). CLOSING is never a cover.
 */
export function extractBibleOneYearCoverBeats(
  script: string,
): BibleOneYearCoverBeat[] {
  return extractBibleOneYearDeterministicBeats(script)
    .filter((beat) =>
      [
        "episode_cover",
        "chapter_cover",
        "reading_preview",
        "reflection_cover",
      ].includes(beat.kind),
    )
    .map((beat) => ({
      kind:
        beat.kind === "episode_cover"
          ? ("introduction" as const)
          : beat.kind === "chapter_cover"
            ? ("chapter" as const)
            : beat.kind === "reflection_cover"
              ? ("reflection" as const)
              : ("reading_preview" as const),
      spokenLine: beat.spokenLine,
      visibleTitle: beat.visibleTitle ?? "",
      visualIdeaPrefix: "Chapter cover:" as const,
      sceneType: "insert" as const,
      durationHint: beat.durationHint,
    }));
}

/**
 * All deterministic visual beats derived from spoken lines + section markers.
 * No hardcoded scene numbers.
 */
export function extractBibleOneYearDeterministicBeats(
  script: string,
): BibleOneYearDeterministicBeat[] {
  const prepared = prepareBibleOneYearCompactScript(script);
  const beats: BibleOneYearDeterministicBeat[] = [];
  const blocks = paragraphBlocks(prepared);
  let pendingSection:
    | "introduction"
    | "chapter"
    | "reflection"
    | "closing"
    | null = null;
  let introductionSpokenIndex = 0;
  let sawEpisodeCover = false;

  const pushUnique = (beat: BibleOneYearDeterministicBeat) => {
    if (
      beats.some(
        (existing) =>
          existing.kind === beat.kind &&
          existing.spokenLine === beat.spokenLine,
      )
    ) {
      return;
    }
    beats.push(beat);
  };

  for (const block of blocks) {
    if (/^\[INTRODUCTION\]$/i.test(block)) {
      pendingSection = "introduction";
      introductionSpokenIndex = 0;
      continue;
    }
    if (/^\[CHAPTER COVER/i.test(block)) {
      pendingSection = "chapter";
      continue;
    }
    if (/^\[REFLECTION AND PRAYER\]$/i.test(block)) {
      pendingSection = "reflection";
      continue;
    }
    if (/^\[CLOSING\]$/i.test(block)) {
      pendingSection = "closing";
      continue;
    }
    if (/^\[(?:HOOK|END\s*HOOK)\]$/i.test(block)) {
      continue;
    }

    const spokenLine = firstSentence(stripStructuralMarkers(block));
    const spokenFull = fullParagraphSpoken(block);
    if (!spokenLine) {
      pendingSection = null;
      continue;
    }

    if (pendingSection === "introduction") {
      introductionSpokenIndex += 1;
      const title =
        coverTitleFromSpokenOpener(spokenLine) ||
        coverTitleFromWelcomeLine(spokenLine) ||
        coverTitleFromSeriesTitleLine(spokenLine);

      if (title && !sawEpisodeCover) {
        pushUnique({
          kind: "episode_cover",
          spokenLine,
          sceneType: "insert",
          visualIdeaPrefix: "Chapter cover:",
          visibleTitle: title,
          durationHint: "5-7",
          requiresPastorLock: true,
          requiresListenerLock: false,
          notes: [
            "Parchment episode cover with pastor presenting the title with one open hand.",
            "Do not block or superimpose the title.",
            `visible text limited to: ${title}`,
            `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
          ],
        });
        sawEpisodeCover = true;
        continue;
      }

      if (
        coverTitleFromWelcomeLine(spokenLine) ||
        (/^i'?m truly glad you are here/i.test(spokenLine) &&
          introductionSpokenIndex <= 3)
      ) {
        pushUnique({
          kind: "welcome_pastor",
          spokenLine,
          sceneType: "avatar",
          visualIdeaPrefix: "Narrative scene:",
          visibleTitle: null,
          durationHint: "4-7",
          requiresPastorLock: true,
          requiresListenerLock: false,
          notes: [
            "First personal welcome after the episode cover.",
            "Pastor beside an open Bible, gently inviting the listener toward an empty chair.",
            `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
          ],
        });
      }

      const readingPreview = coverTitleFromReadingPreview(spokenLine);
      if (readingPreview) {
        pushUnique({
          kind: "reading_preview",
          spokenLine,
          sceneType: "insert",
          visualIdeaPrefix: "Chapter cover:",
          visibleTitle: readingPreview,
          durationHint: "4-6",
          requiresPastorLock: false,
          requiresListenerLock: false,
          notes: [
            "Parchment reading-preview cover.",
            `visible text limited to: ${readingPreview}`,
          ],
        });
      }

      if (
        isWorthwhilePauseLine(spokenFull) ||
        isWorthwhilePauseLine(spokenLine)
      ) {
        pushUnique({
          kind: "worthwhile_pause",
          spokenLine: spokenFull || spokenLine,
          sceneType: "avatar",
          visualIdeaPrefix: "Narrative scene:",
          visibleTitle: null,
          durationHint: "5-8",
          requiresPastorLock: true,
          requiresListenerLock: true,
          notes: [
            "Pastor and older listener sharing a quiet reflective pause.",
            "No applause or celebratory gesture.",
            `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
          ],
        });
      }

      continue;
    }

    if (pendingSection === "chapter") {
      const title =
        coverTitleFromChapterAnnouncement(spokenLine) ||
        coverTitleFromSpokenOpener(spokenLine);
      if (title) {
        pushUnique({
          kind: "chapter_cover",
          spokenLine,
          sceneType: "insert",
          visualIdeaPrefix: "Chapter cover:",
          visibleTitle: title,
          durationHint: "4-6",
          requiresPastorLock: false,
          requiresListenerLock: false,
          notes: [
            "Parchment chapter cover. No pastor by default.",
            `visible text limited to: ${title}`,
          ],
        });
      }
      pendingSection = null;
      continue;
    }

    if (pendingSection === "reflection") {
      pushUnique({
        kind: "reflection_cover",
        spokenLine: spokenFull || spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Chapter cover:",
        visibleTitle: "REFLECT AND PRAY",
        durationHint: "6-8",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Parchment reflection cover.",
          "visualIdea must start with: Chapter cover:",
          "visible text limited to: REFLECT AND PRAY",
        ],
      });
      pendingSection = null;
      continue;
    }

    if (pendingSection === "closing") {
      // Segmentation only — never auto-create a cover.
      pendingSection = null;
    }

    const chapterTitle = coverTitleFromChapterAnnouncement(spokenLine);
    if (chapterTitle) {
      pushUnique({
        kind: "chapter_cover",
        spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Chapter cover:",
        visibleTitle: chapterTitle,
        durationHint: "4-6",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Parchment chapter cover. No pastor by default.",
          `visible text limited to: ${chapterTitle}`,
        ],
      });
    }

    const introTitle =
      coverTitleFromWelcomeLine(spokenLine) ||
      coverTitleFromSeriesTitleLine(spokenLine);
    if (introTitle && !sawEpisodeCover) {
      pushUnique({
        kind: "episode_cover",
        spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Chapter cover:",
        visibleTitle: introTitle,
        durationHint: "5-7",
        requiresPastorLock: true,
        requiresListenerLock: false,
        notes: [
          "Parchment episode cover with pastor.",
          `visible text limited to: ${introTitle}`,
          `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
        ],
      });
      sawEpisodeCover = true;
    }

    const readingPreview = coverTitleFromReadingPreview(spokenLine);
    if (readingPreview) {
      pushUnique({
        kind: "reading_preview",
        spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Chapter cover:",
        visibleTitle: readingPreview,
        durationHint: "4-6",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Parchment reading-preview cover.",
          `visible text limited to: ${readingPreview}`,
        ],
      });
    }

    if (
      isReflectionOpenerLine(spokenFull) ||
      isReflectionOpenerLine(spokenLine)
    ) {
      pushUnique({
        kind: "reflection_cover",
        spokenLine: spokenFull || spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Chapter cover:",
        visibleTitle: "REFLECT AND PRAY",
        durationHint: "6-8",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Parchment reflection cover for the completion transition.",
          "visible text limited to: REFLECT AND PRAY",
        ],
      });
    }

    if (
      isWorthwhilePauseLine(spokenFull) ||
      isWorthwhilePauseLine(spokenLine)
    ) {
      pushUnique({
        kind: "worthwhile_pause",
        spokenLine: spokenFull || spokenLine,
        sceneType: "avatar",
        visualIdeaPrefix: "Narrative scene:",
        visibleTitle: null,
        durationHint: "5-8",
        requiresPastorLock: true,
        requiresListenerLock: true,
        notes: [
          "Pastor and older listener sharing a quiet reflective pause.",
          "No applause or celebratory gesture.",
        ],
      });
    }

    if (isPrayWithMeLine(spokenLine)) {
      pushUnique({
        kind: "pray_with_me",
        spokenLine,
        sceneType: "avatar",
        visualIdeaPrefix: "Narrative scene:",
        visibleTitle: null,
        durationHint: "4-7",
        requiresPastorLock: true,
        requiresListenerLock: false,
        notes: [
          "Pastor bows beside the open Bible.",
          "Empty chair may remain visible to include the listener.",
          `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
        ],
      });
    }

    if (isAmenLine(spokenFull) || isAmenLine(spokenLine)) {
      pushUnique({
        kind: "amen",
        spokenLine: spokenFull || spokenLine,
        sceneType: "avatar",
        visualIdeaPrefix: "Narrative scene:",
        visibleTitle: "AMEN",
        durationHint: "3-6",
        requiresPastorLock: true,
        requiresListenerLock: false,
        notes: [
          "Pastor lifts his head slightly after prayer with a peaceful expression.",
          "visible text limited to: AMEN",
          `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
        ],
      });
    }

    if (thankYouVisibleTitle(spokenLine)) {
      pushUnique({
        kind: "thank_you",
        spokenLine,
        sceneType: "avatar",
        visualIdeaPrefix: "Narrative scene:",
        visibleTitle: "THANK YOU",
        durationHint: "4-7",
        requiresPastorLock: true,
        requiresListenerLock: false,
        notes: [
          "Closing thank-you avatar — never a CLOSING cover.",
          "Pastor thanks the listener beside a closed Bible with ribbon visible.",
          "visible text limited to: THANK YOU",
          `Include pastor lock verbatim: ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK}`,
        ],
      });
    }

    const progressTitle = progressVisibleTitle(spokenFull || spokenLine);
    if (progressTitle) {
      pushUnique({
        kind: "progress",
        spokenLine: spokenFull || spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Object/detail insert:",
        visibleTitle: progressTitle,
        durationHint: "4-6",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Object-detail or parchment-like progress insert.",
          `visible text limited to: ${progressTitle}`,
        ],
      });
    }

    if (isShareThoughtLine(spokenFull) || isShareThoughtLine(spokenLine)) {
      pushUnique({
        kind: "share",
        spokenLine: spokenFull || spokenLine,
        sceneType: "avatar",
        visualIdeaPrefix: "Narrative scene:",
        visibleTitle: null,
        durationHint: "4-7",
        requiresPastorLock: false,
        requiresListenerLock: true,
        notes: [
          "Listener writing one short reflection.",
          "Handwriting intentionally illegible.",
          "No additional visible text.",
        ],
      });
    }

    const nextTitle = nextReadingVisibleTitle(spokenLine);
    if (nextTitle) {
      pushUnique({
        kind: "next_reading",
        spokenLine,
        sceneType: "insert",
        visualIdeaPrefix: "Object/detail insert:",
        visibleTitle: nextTitle,
        durationHint: "4-6",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Insert with Bible ribbon moving to the next passage.",
          `visible text limited to: ${nextTitle}`,
        ],
      });
    }

    if (isFinalBlessingLine(spokenLine)) {
      pushUnique({
        kind: "final_blessing",
        spokenLine,
        sceneType: "space",
        visualIdeaPrefix: "Atmosphere/space:",
        visibleTitle: null,
        durationHint: "4-7",
        requiresPastorLock: false,
        requiresListenerLock: false,
        notes: [
          "Quiet interior or peaceful space.",
          "Bible remains in soft light.",
          "No visible text.",
          "No pastor required unless the script calls for him.",
        ],
      });
    }
  }

  return beats;
}

/**
 * Build the authorized visible-title list dynamically from script + deterministic beats.
 * CLOSING is never authorized.
 */
export function buildBibleOneYearAuthorizedTitles(script: string): string[] {
  const titles = new Set<string>();
  const beats = extractBibleOneYearDeterministicBeats(script);

  for (const beat of beats) {
    if (beat.visibleTitle) {
      titles.add(beat.visibleTitle.toUpperCase());
    }
  }

  if (beats.some((beat) => beat.kind === "amen")) {
    titles.add("AMEN");
  }
  if (beats.some((beat) => beat.kind === "thank_you")) {
    titles.add("THANK YOU");
  }
  if (beats.some((beat) => beat.kind === "reflection_cover")) {
    titles.add("REFLECT AND PRAY");
  }

  titles.delete("CLOSING");
  titles.delete("REFLECTION AND PRAYER");
  titles.delete("PRAYER");

  return [...titles].sort();
}

export function buildBibleOneYearCoverBeatDirectives(script: string): string {
  const beats = extractBibleOneYearDeterministicBeats(script);
  const authorized = buildBibleOneYearAuthorizedTitles(script);

  if (beats.length === 0) {
    return [
      "## Deterministic Visual Beats",
      "",
      "No deterministic beats could be inferred. Still apply SECTION AND COVER RULES to the first spoken openers.",
      "[CLOSING] is segmentation only and must never create a cover.",
    ].join("\n");
  }

  return [
    "## Deterministic Visual Beats For This Script",
    "",
    "These beats are mandatory. Match by spoken line, semantic intent, and section — never by hardcoded scene numbers.",
    "Do not create an empty/silent cover before voiced openers.",
    "Do not copy structural markers into scriptText.",
    "[CLOSING] is segmentation only. It must not automatically create a cover or force sceneType insert.",
    "Keep the older-listener lock when the listener appears, but do not substitute the listener for the pastor in deterministic pastor beats.",
    "",
    "Authorized visible titles for this script:",
    ...authorized.map((title) => `- ${title}`),
    "",
    ...beats.flatMap((beat, index) => [
      `${index + 1}. kind=${beat.kind}`,
      `   spokenLine: ${beat.spokenLine}`,
      `   sceneType: ${beat.sceneType}`,
      ...(beat.visualIdeaPrefix
        ? [`   visualIdea: must start with ${beat.visualIdeaPrefix}`]
        : []),
      ...(beat.visibleTitle
        ? [`   visible text limited to: ${beat.visibleTitle}`]
        : ["   visible text: none (No readable writing...)"]),
      `   duration: ${beat.durationHint} seconds`,
      `   requiresPastorLock: ${beat.requiresPastorLock ? "yes" : "no"}`,
      `   requiresListenerLock: ${beat.requiresListenerLock ? "yes" : "no"}`,
      ...beat.notes.map((note) => `   note: ${note}`),
      "",
    ]),
  ].join("\n");
}

/** Semantic helpers used by specificity tests / brief examples. */
export function abstractBeatKind(scriptText: string): string | null {
  const text = scriptText.toLowerCase();
  if (
    /perfect|understand everything|do not need to|pressure|manageable/.test(
      text,
    )
  ) {
    return "release_pressure";
  }
  if (/listen/.test(text) && (/receive/.test(text) || /return/.test(text))) {
    return "listen_receive_return";
  }
  if (/one thought|carry with you|stayed with you|worthwhile/.test(text)) {
    return "carry_thought";
  }
  if (/webus|world english bible|american english edition/.test(text)) {
    return "translation_edition";
  }
  if (/\brest\b|quiet moment|presence|silence|fearless rest/.test(text)) {
    return "rest_stillness";
  }
  return null;
}

export function encodeBibleSpokenQuotesForJson(scriptText: string): string {
  return scriptText
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\u0022")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function parseBibleScriptTextFromJsonFragment(
  encodedInterior: string,
): string {
  return JSON.parse(`"${encodedInterior}"`) as string;
}

export function abstractBeatRequiredPromptSignals(kind: string): string[] {
  switch (kind) {
    case "release_pressure":
      return ["hand", "relax", "grip", "shoulder", "tension", "exhale"];
    case "listen_receive_return":
      return ["marker", "ribbon", "attent", "listen"];
    case "carry_thought":
      return ["note", "passage", "marker", "line"];
    case "translation_edition":
      return ["edition", "title page", "publication", "page"];
    case "rest_stillness":
      return ["chair", "cup", "light", "rest", "open hand", "still"];
    default:
      return [];
  }
}

export function looksLikeGenericSeatedBibleTemplate(
  imagePrompt: string,
): boolean {
  const text = imagePrompt.toLowerCase();
  const hasElder = /older|elder|senior|seated|sitting/.test(text);
  const hasBible = /open bible|bible open|beside an open bible/.test(text);
  const hasWarmLight =
    /warm (morning )?light|soft (morning )?light|peaceful/.test(text);
  const hasRoom = /room|chair|atmosphere/.test(text);
  const hasSpecificAction =
    /hand|finger|shoulder|marker|ribbon|edition|note|exhale|grip|window|overhead|profile|page detail/.test(
      text,
    );
  return hasElder && hasBible && hasWarmLight && hasRoom && !hasSpecificAction;
}

/**
 * Heuristic: count likely independent visual actions in a Scripture passage.
 */
export function countIndependentVisualActions(scriptText: string): number {
  const text = scriptText.trim();
  if (!text) {
    return 0;
  }

  const clauseSplits = text
    .split(
      /(?<=[.!;])\s+|(?:,\s+and\s+)|(?:\s+and\s+(?=[a-z]))|(?:\s+then\s+)/i,
    )
    .map((part) => part.trim())
    .filter((part) => part.length > 8);

  const actionVerbs =
    /\b(saw|took|ate|gave|sewed|opened|reached|looked|spoke|said|walked|hid|called|covered|made|built|offered|killed|planted|grew|fell|rose|turned|left|entered|departed)\b/gi;
  const verbHits = text.match(actionVerbs)?.length ?? 0;

  return Math.max(
    clauseSplits.length,
    Math.min(verbHits, clauseSplits.length + 2),
    1,
  );
}

export function suggestedScriptureSceneCount(scriptText: string): number {
  return Math.max(1, countIndependentVisualActions(scriptText));
}
