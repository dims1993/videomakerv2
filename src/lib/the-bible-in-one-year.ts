import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import {
  BIBLE_ONE_YEAR_CATEGORY_ID,
  buildBibleOneYearDayConfigFromPlan,
  extractBibleOneYearDayConfig,
  fillBibleOneYearMasterTemplate,
  formatBibleOneYearChapterBlocksForPrompt,
  isBibleOneYearCategory,
  normalizeBibleOneYearDayConfig,
  type BibleOneYearChapterBlock,
  type BibleOneYearDayConfig,
  type BibleOneYearJourneyState,
  type BibleOneYearPlanDay,
} from "@/lib/the-bible-in-one-year-shared";

export {
  BIBLE_ONE_YEAR_CATEGORY_ID,
  buildBibleOneYearDayConfigFromPlan,
  extractBibleOneYearDayConfig,
  fillBibleOneYearMasterTemplate,
  formatBibleOneYearChapterBlocksForPrompt,
  isBibleOneYearCategory,
  normalizeBibleOneYearDayConfig,
};
export type {
  BibleOneYearChapterBlock,
  BibleOneYearDayConfig,
  BibleOneYearJourneyState,
  BibleOneYearPlanDay,
};

const MASTER_TEMPLATE_PATH =
  "prompts/channels/the-gods-word/categories/the-bible-in-one-year/script-master.md";
const READING_PLAN_PATH = "data/the-bible-in-one-year/reading-plan.json";

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

export async function readBibleOneYearMasterTemplate() {
  return readFile(path.join(process.cwd(), MASTER_TEMPLATE_PATH), "utf8");
}

let cachedReadingPlan: { days: BibleOneYearPlanDay[] } | null = null;

export async function readBibleOneYearReadingPlan() {
  if (cachedReadingPlan) {
    return cachedReadingPlan;
  }

  const raw = await readFile(path.join(process.cwd(), READING_PLAN_PATH), "utf8");
  const parsed = JSON.parse(raw) as { days?: unknown };
  const days = Array.isArray(parsed.days)
    ? parsed.days
        .map((day) => {
          if (!isObject(day)) {
            return null;
          }
          const dayNumber = positiveInt(day.dayNumber);
          if (!dayNumber) {
            return null;
          }
          return {
            dayNumber,
            todayReadingDisplay: textValue(day.todayReadingDisplay),
            nextReadingDisplay: textValue(day.nextReadingDisplay),
            listeningFocus: textValue(day.listeningFocus),
            chapters: Array.isArray(day.chapters)
              ? day.chapters
                  .map((chapter) => {
                    if (!isObject(chapter)) {
                      return null;
                    }
                    const bookName = textValue(chapter.bookName);
                    const chapterNumber = positiveInt(chapter.chapterNumber);
                    if (!bookName || !chapterNumber) {
                      return null;
                    }
                    return {
                      bookName,
                      bookNameUppercase:
                        textValue(chapter.bookNameUppercase) ||
                        bookName.toUpperCase(),
                      chapterNumber,
                    };
                  })
                  .filter(
                    (
                      chapter,
                    ): chapter is BibleOneYearPlanDay["chapters"][number] =>
                      chapter != null,
                  )
              : [],
            reflectionMainThought: textValue(day.reflectionMainThought),
            reflectionApplication: textValue(day.reflectionApplication),
            prayerPoints: Array.isArray(day.prayerPoints)
              ? day.prayerPoints
                  .map((point) => textValue(point))
                  .filter(Boolean)
              : [],
          } satisfies BibleOneYearPlanDay;
        })
        .filter((day): day is BibleOneYearPlanDay => day != null)
        .sort((a, b) => a.dayNumber - b.dayNumber)
    : [];

  cachedReadingPlan = { days };
  return cachedReadingPlan;
}

export async function getBibleOneYearPlanDay(dayNumber: number) {
  const plan = await readBibleOneYearReadingPlan();
  return plan.days.find((day) => day.dayNumber === dayNumber) ?? null;
}

function parseIdeaJson(raw: string | null | undefined) {
  if (!raw?.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function getBibleOneYearJourneyState(
  channelKey = "the-gods-word",
): Promise<BibleOneYearJourneyState> {
  const videos = await prisma.video.findMany({
    where: {
      channelKey,
      topicCategory: BIBLE_ONE_YEAR_CATEGORY_ID,
    },
    select: {
      id: true,
      status: true,
      ideaJson: true,
      script: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const completedDays: number[] = [];
  const inProgressDays: number[] = [];

  for (const video of videos) {
    const config = extractBibleOneYearDayConfig(parseIdeaJson(video.ideaJson));
    if (!config?.dayNumber) {
      continue;
    }

    const hasScript = Boolean(video.script?.trim());
    const isComplete =
      hasScript &&
      ["script_ready", "scenes_ready", "voiceover_ready", "render_ready", "published"].includes(
        video.status,
      );

    if (isComplete) {
      completedDays.push(config.dayNumber);
    } else {
      inProgressDays.push(config.dayNumber);
    }
  }

  const uniqueCompleted = [...new Set(completedDays)].sort((a, b) => a - b);
  const lastCompletedDay =
    uniqueCompleted.length > 0 ? uniqueCompleted[uniqueCompleted.length - 1]! : 0;

  return {
    lastCompletedDay,
    nextDayNumber: lastCompletedDay + 1,
    completedDays: uniqueCompleted,
    inProgressDays: [...new Set(inProgressDays)].sort((a, b) => a - b),
  };
}

export async function buildBibleOneYearScriptWriterPrompt(
  config: BibleOneYearDayConfig,
) {
  const [template, journey] = await Promise.all([
    readBibleOneYearMasterTemplate(),
    getBibleOneYearJourneyState(),
  ]);

  const missingWebusChapters = config.chapterBlocks.filter(
    (block) => !block.webusText.trim(),
  );
  const suppliedWebusCount = config.chapterBlocks.length - missingWebusChapters.length;

  const continuity = [
    "Journey continuity:",
    `- Last completed day: ${journey.lastCompletedDay || "none yet"}`,
    `- This episode day: ${config.dayNumber}`,
    `- Next planned day after this episode: ${config.dayNumber + 1}`,
    journey.completedDays.length > 0
      ? `- Completed days so far: ${journey.completedDays.join(", ")}`
      : "- Completed days so far: none",
    journey.inProgressDays.length > 0
      ? `- In-progress days: ${journey.inProgressDays.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const scriptureSourceRules = [
    "Scripture source rules (non-negotiable):",
    `- Chapter blocks with supplied WEBUS text: ${suppliedWebusCount}`,
    `- Chapter blocks needing authentic WEBUS lookup: ${missingWebusChapters.length}`,
    missingWebusChapters.length > 0
      ? `- For empty WEBUS_TEXT chapters, use only the authentic World English Bible, American English Edition for: ${missingWebusChapters
          .map((block) => `${block.bookName} ${block.chapterNumber}`)
          .join("; ")}.`
      : "- All chapter WEBUS text was supplied. Use it exactly.",
    "- Do not invent, paraphrase, summarize, modernize, or mix another Bible translation.",
    "- Do not add chapters beyond CHAPTER_BLOCKS.",
  ].join("\n");

  return [
    fillBibleOneYearMasterTemplate(template, config),
    "",
    continuity,
    "",
    scriptureSourceRules,
    "",
    "Return only the finished script. Follow the master template exactly.",
  ].join("\n");
}
