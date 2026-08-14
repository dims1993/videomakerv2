/**
 * Client-safe Bible in One Year helpers (no Node/fs/prisma).
 * Keep browser-imported code on this module only.
 */

export const BIBLE_ONE_YEAR_CATEGORY_ID = "the_bible_in_one_year";

export type BibleOneYearChapterBlock = {
  bookName: string;
  bookNameUppercase: string;
  chapterNumber: number;
  webusText: string;
};

export type BibleOneYearDayConfig = {
  dayNumber: number;
  journeyAction: "begin" | "continue";
  todayReadingDisplay: string;
  nextReadingDisplay: string;
  listeningFocus: string;
  chapterBlocks: BibleOneYearChapterBlock[];
  reflectionMainThought: string;
  reflectionApplication: string;
  prayerPoints: string[];
};

export type BibleOneYearPlanDay = {
  dayNumber: number;
  todayReadingDisplay: string;
  nextReadingDisplay: string;
  listeningFocus: string;
  chapters: Array<{
    bookName: string;
    bookNameUppercase: string;
    chapterNumber: number;
  }>;
  reflectionMainThought: string;
  reflectionApplication: string;
  prayerPoints: string[];
};

export type BibleOneYearJourneyState = {
  lastCompletedDay: number;
  nextDayNumber: number;
  completedDays: number[];
  inProgressDays: number[];
};

export function isBibleOneYearCategory(
  topicCategory: string | null | undefined,
): boolean {
  return topicCategory?.trim() === BIBLE_ONE_YEAR_CATEGORY_ID;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function positiveInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function normalizeChapterBlock(value: unknown): BibleOneYearChapterBlock | null {
  if (!isObject(value)) {
    return null;
  }

  const bookName = textValue(value.bookName);
  const bookNameUppercase =
    textValue(value.bookNameUppercase) || bookName.toUpperCase();
  const chapterNumber = positiveInt(value.chapterNumber);
  const webusText = textValue(value.webusText);

  if (!bookName || !chapterNumber) {
    return null;
  }

  return {
    bookName,
    bookNameUppercase,
    chapterNumber,
    webusText,
  };
}

export function normalizeBibleOneYearDayConfig(
  value: unknown,
): BibleOneYearDayConfig | null {
  if (!isObject(value)) {
    return null;
  }

  const dayNumber = positiveInt(value.dayNumber);
  if (!dayNumber) {
    return null;
  }

  const journeyAction =
    value.journeyAction === "begin" ? "begin" : "continue";
  const chapterBlocks = Array.isArray(value.chapterBlocks)
    ? value.chapterBlocks
        .map(normalizeChapterBlock)
        .filter((block): block is BibleOneYearChapterBlock => block != null)
    : [];

  return {
    dayNumber,
    journeyAction,
    todayReadingDisplay: textValue(value.todayReadingDisplay),
    nextReadingDisplay: textValue(value.nextReadingDisplay),
    listeningFocus: textValue(value.listeningFocus),
    chapterBlocks,
    reflectionMainThought: textValue(value.reflectionMainThought),
    reflectionApplication: textValue(value.reflectionApplication),
    prayerPoints: Array.isArray(value.prayerPoints)
      ? value.prayerPoints
          .map((point) => textValue(point))
          .filter(Boolean)
          .slice(0, 8)
      : [],
  };
}

export function extractBibleOneYearDayConfig(
  ideaJson: unknown,
): BibleOneYearDayConfig | null {
  if (!isObject(ideaJson)) {
    return null;
  }

  return normalizeBibleOneYearDayConfig(ideaJson.bibleOneYear);
}

export function buildBibleOneYearDayConfigFromPlan(
  planDay: BibleOneYearPlanDay,
  options?: {
    journeyAction?: "begin" | "continue";
    chapterWebusTexts?: Record<string, string>;
  },
): BibleOneYearDayConfig {
  const chapterWebusTexts = options?.chapterWebusTexts ?? {};

  return {
    dayNumber: planDay.dayNumber,
    journeyAction:
      options?.journeyAction ??
      (planDay.dayNumber === 1 ? "begin" : "continue"),
    todayReadingDisplay: planDay.todayReadingDisplay,
    nextReadingDisplay: planDay.nextReadingDisplay,
    listeningFocus: planDay.listeningFocus,
    chapterBlocks: planDay.chapters.map((chapter) => {
      const key = `${chapter.bookNameUppercase}:${chapter.chapterNumber}`;
      return {
        bookName: chapter.bookName,
        bookNameUppercase: chapter.bookNameUppercase,
        chapterNumber: chapter.chapterNumber,
        webusText: chapterWebusTexts[key] ?? "",
      };
    }),
    reflectionMainThought: planDay.reflectionMainThought,
    reflectionApplication: planDay.reflectionApplication,
    prayerPoints: planDay.prayerPoints,
  };
}

export function formatBibleOneYearChapterBlocksForPrompt(
  chapterBlocks: BibleOneYearChapterBlock[],
) {
  return JSON.stringify(
    chapterBlocks.map((block) => ({
      BOOK_NAME: block.bookName,
      BOOK_NAME_UPPERCASE: block.bookNameUppercase,
      CHAPTER_NUMBER: block.chapterNumber,
      WEBUS_TEXT: block.webusText,
    })),
    null,
    2,
  );
}

export function fillBibleOneYearMasterTemplate(
  template: string,
  config: BibleOneYearDayConfig,
) {
  const replacements: Record<string, string> = {
    DAY_NUMBER: String(config.dayNumber),
    JOURNEY_ACTION: config.journeyAction,
    TODAY_READING_DISPLAY: config.todayReadingDisplay,
    NEXT_READING_DISPLAY: config.nextReadingDisplay,
    LISTENING_FOCUS: config.listeningFocus,
    CHAPTER_BLOCKS: formatBibleOneYearChapterBlocksForPrompt(
      config.chapterBlocks,
    ),
    REFLECTION_MAIN_THOUGHT: config.reflectionMainThought,
    REFLECTION_APPLICATION: config.reflectionApplication,
    PRAYER_POINTS: config.prayerPoints.map((point) => `- ${point}`).join("\n"),
  };

  let filled = template;
  for (const [key, value] of Object.entries(replacements)) {
    filled = filled.replaceAll(`{{${key}}}`, value);
  }
  return filled;
}
