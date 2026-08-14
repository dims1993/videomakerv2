import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { BIBLE_ONE_YEAR_CATEGORY_ID } from "@/lib/the-bible-in-one-year-shared";
import {
  extractDayNumberFromTopicTitle,
  serializeBibleOneYearTopicNotes,
  type BibleOneYearTopicDayPayload,
} from "@/lib/the-bible-in-one-year-topic-batch";
import { maybeAssertPodcastTopicBatchAvoidsPromptExamples } from "@/lib/podcast-english-lessons-topic-validate";

const chapterSchema = z.object({
  bookName: z.string().min(1),
  bookNameUppercase: z.string().optional().nullable(),
  chapterNumber: z.union([z.number(), z.string()]),
});

export const topicBatchItemSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  angle: z.string().optional().nullable(),
  uniqueMechanism: z.string().optional().nullable(),
  scriptureAnchor: z.string().optional().nullable(),
  centralQuestion: z.string().optional().nullable(),
  commonMisunderstanding: z.string().optional().nullable(),
  spiritualTurn: z.string().optional().nullable(),
  trigger: z.string().optional().nullable(),
  promise: z.string().optional().nullable(),
  visualHook: z.string().optional().nullable(),
  thumbnailIdea: z.string().optional().nullable(),
  repetitionRisk: z.string().optional().nullable(),
  dayNumber: z.union([z.number(), z.string()]).optional().nullable(),
  todayReadingDisplay: z.string().optional().nullable(),
  nextReadingDisplay: z.string().optional().nullable(),
  listeningFocus: z.string().optional().nullable(),
  chapters: z.array(chapterSchema).optional().nullable(),
  reflectionMainThought: z.string().optional().nullable(),
  reflectionApplication: z.string().optional().nullable(),
  prayerPoints: z.array(z.string()).optional().nullable(),
});

export const topicBatchSchema = z.object({
  topics: z.array(topicBatchItemSchema).min(1),
});

export type NormalizedTopicBatchItem = {
  category: string;
  title: string;
  topic: string;
  angle: string | null;
  uniqueMechanism: string | null;
  scriptureAnchor: string | null;
  centralQuestion: string | null;
  commonMisunderstanding: string | null;
  spiritualTurn: string | null;
  trigger: string | null;
  promise: string | null;
  visualHook: string | null;
  thumbnailIdea: string | null;
  repetitionRisk: string | null;
  notes: string | null;
};

function textOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
}

function normalizeBibleOneYearPayload(
  item: z.infer<typeof topicBatchItemSchema>,
): BibleOneYearTopicDayPayload | null {
  const dayNumber =
    positiveInt(item.dayNumber) ??
    extractDayNumberFromTopicTitle(item.title);
  if (!dayNumber) {
    return null;
  }

  const todayReadingDisplay =
    textOrNull(item.todayReadingDisplay) ||
    textOrNull(item.topic) ||
    item.title.replace(/^Day\s+\d+\s*[—\-–]\s*/i, "").trim();
  const chapters = (item.chapters ?? [])
    .map((chapter) => {
      const bookName = chapter.bookName.trim();
      const chapterNumber = positiveInt(chapter.chapterNumber);
      if (!bookName || !chapterNumber) {
        return null;
      }
      return {
        bookName,
        bookNameUppercase:
          textOrNull(chapter.bookNameUppercase) || bookName.toUpperCase(),
        chapterNumber,
      };
    })
    .filter(
      (
        chapter,
      ): chapter is BibleOneYearTopicDayPayload["chapters"][number] =>
        chapter != null,
    );

  return {
    dayNumber,
    todayReadingDisplay,
    nextReadingDisplay: textOrNull(item.nextReadingDisplay) || "",
    listeningFocus:
      textOrNull(item.listeningFocus) || textOrNull(item.angle) || "",
    chapters,
    reflectionMainThought:
      textOrNull(item.reflectionMainThought) ||
      textOrNull(item.uniqueMechanism) ||
      "",
    reflectionApplication:
      textOrNull(item.reflectionApplication) ||
      textOrNull(item.promise) ||
      "",
    prayerPoints: Array.isArray(item.prayerPoints)
      ? item.prayerPoints.map((point) => point.trim()).filter(Boolean)
      : [],
  };
}

export function parseTopicBatchJson(rawJson: string): NormalizedTopicBatchItem[] {
  const parsed = topicBatchSchema.parse(JSON.parse(rawJson));

  return parsed.topics.map((topic) => {
    const isBibleOneYear =
      topic.category.trim() === BIBLE_ONE_YEAR_CATEGORY_ID;
    const biblePayload = isBibleOneYear
      ? normalizeBibleOneYearPayload(topic)
      : null;

    const dayNumber = biblePayload?.dayNumber ?? null;
    const todayReadingDisplay = biblePayload?.todayReadingDisplay;
    const title =
      isBibleOneYear && dayNumber && todayReadingDisplay
        ? `Day ${dayNumber} — ${todayReadingDisplay}`
        : topic.title.trim();

    return {
      category: topic.category.trim(),
      title,
      topic: (todayReadingDisplay || topic.topic).trim(),
      angle:
        textOrNull(topic.listeningFocus) ||
        textOrNull(topic.angle),
      uniqueMechanism:
        textOrNull(topic.reflectionMainThought) ||
        textOrNull(topic.uniqueMechanism),
      scriptureAnchor: textOrNull(topic.scriptureAnchor),
      centralQuestion: textOrNull(topic.centralQuestion),
      commonMisunderstanding: textOrNull(topic.commonMisunderstanding),
      spiritualTurn: textOrNull(topic.spiritualTurn),
      trigger: textOrNull(topic.trigger),
      promise:
        textOrNull(topic.reflectionApplication) ||
        textOrNull(topic.promise),
      visualHook: textOrNull(topic.visualHook),
      thumbnailIdea: textOrNull(topic.thumbnailIdea),
      repetitionRisk: textOrNull(topic.repetitionRisk),
      notes: biblePayload
        ? serializeBibleOneYearTopicNotes(biblePayload)
        : null,
    };
  });
}

export async function persistTopicBatchIdeas({
  channelKey,
  topics,
  source,
}: {
  channelKey: string;
  topics: NormalizedTopicBatchItem[];
  source: string;
}) {
  maybeAssertPodcastTopicBatchAvoidsPromptExamples(channelKey, topics);

  const titles = topics.map((topic) => topic.title);
  const duplicateTitles = await prisma.topicIdea.findMany({
    where: {
      channelKey,
      title: { in: titles },
    },
    select: { title: true },
  });
  const existingTitles = new Set(duplicateTitles.map((topic) => topic.title));
  const seenTitles = new Set<string>();
  const topicsToCreate = topics.filter((topic) => {
    if (existingTitles.has(topic.title) || seenTitles.has(topic.title)) {
      return false;
    }

    seenTitles.add(topic.title);
    return true;
  });

  // Keep Bible-in-One-Year days ordered by day number when inserting.
  topicsToCreate.sort((a, b) => {
    const dayA = extractDayNumberFromTopicTitle(a.title) ?? Number.MAX_SAFE_INTEGER;
    const dayB = extractDayNumberFromTopicTitle(b.title) ?? Number.MAX_SAFE_INTEGER;
    if (dayA !== dayB) {
      return dayA - dayB;
    }
    return a.title.localeCompare(b.title);
  });

  if (topicsToCreate.length > 0) {
    await prisma.topicIdea.createMany({
      data: topicsToCreate.map((topic) => ({
        category: topic.category,
        title: topic.title,
        topic: topic.topic,
        angle: topic.angle,
        uniqueMechanism: topic.uniqueMechanism,
        scriptureAnchor: topic.scriptureAnchor,
        centralQuestion: topic.centralQuestion,
        commonMisunderstanding: topic.commonMisunderstanding,
        spiritualTurn: topic.spiritualTurn,
        trigger: topic.trigger,
        promise: topic.promise,
        visualHook: topic.visualHook,
        thumbnailIdea: topic.thumbnailIdea,
        repetitionRisk: topic.repetitionRisk,
        notes: topic.notes,
        channelKey,
        status: "idea",
        source,
      })),
    });
  }

  return {
    importedCount: topicsToCreate.length,
    skippedCount: topics.length - topicsToCreate.length,
    totalCount: topics.length,
  };
}
