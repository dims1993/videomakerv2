import {
  BIBLE_ONE_YEAR_CATEGORY_ID,
  type BibleOneYearDayConfig,
} from "@/lib/the-bible-in-one-year-shared";
import type { RecentTopicContext } from "@/lib/topic-batch-prompt";

/** ChatGPT stays reliable around this size; full year = ~13 sections. */
export const BIBLE_ONE_YEAR_SECTION_MAX_DAYS = 30;
export const BIBLE_ONE_YEAR_TOTAL_DAYS = 365;

export type BibleOneYearSectionRange = {
  startDay: number;
  endDay: number;
};

export type BibleOneYearSectionPreset = BibleOneYearSectionRange & {
  id: string;
  label: string;
};

export type BibleOneYearTopicDayPayload = {
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

function clampDay(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(BIBLE_ONE_YEAR_TOTAL_DAYS, Math.round(value)));
}

export function normalizeBibleOneYearSectionRange(
  startDay: number,
  endDay: number,
): BibleOneYearSectionRange {
  const start = clampDay(startDay, 1);
  let end = clampDay(endDay, start);
  if (end < start) {
    end = start;
  }
  if (end - start + 1 > BIBLE_ONE_YEAR_SECTION_MAX_DAYS) {
    end = start + BIBLE_ONE_YEAR_SECTION_MAX_DAYS - 1;
  }
  if (end > BIBLE_ONE_YEAR_TOTAL_DAYS) {
    end = BIBLE_ONE_YEAR_TOTAL_DAYS;
  }
  return { startDay: start, endDay: end };
}

export function bibleOneYearSectionDayCount(range: BibleOneYearSectionRange) {
  return range.endDay - range.startDay + 1;
}

export function buildBibleOneYearSectionPresets(): BibleOneYearSectionPreset[] {
  const presets: BibleOneYearSectionPreset[] = [];
  for (
    let start = 1;
    start <= BIBLE_ONE_YEAR_TOTAL_DAYS;
    start += BIBLE_ONE_YEAR_SECTION_MAX_DAYS
  ) {
    const end = Math.min(
      start + BIBLE_ONE_YEAR_SECTION_MAX_DAYS - 1,
      BIBLE_ONE_YEAR_TOTAL_DAYS,
    );
    presets.push({
      id: `days-${start}-${end}`,
      label: `Days ${start}–${end}`,
      startDay: start,
      endDay: end,
    });
  }
  return presets;
}

export function suggestNextBibleOneYearSection(
  coveredDays: number[],
): BibleOneYearSectionRange {
  const covered = new Set(coveredDays.filter((day) => day >= 1 && day <= 365));
  let next = 1;
  while (covered.has(next) && next <= BIBLE_ONE_YEAR_TOTAL_DAYS) {
    next += 1;
  }
  if (next > BIBLE_ONE_YEAR_TOTAL_DAYS) {
    return { startDay: 1, endDay: Math.min(30, BIBLE_ONE_YEAR_TOTAL_DAYS) };
  }
  return normalizeBibleOneYearSectionRange(
    next,
    next + BIBLE_ONE_YEAR_SECTION_MAX_DAYS - 1,
  );
}

export function extractDayNumberFromTopicTitle(title: string): number | null {
  const match = title.trim().match(/^Day\s+(\d+)\b/i);
  if (!match?.[1]) {
    return null;
  }
  const day = Number(match[1]);
  return Number.isFinite(day) && day > 0 ? Math.round(day) : null;
}

export function collectCoveredBibleOneYearDays(
  recentTopics: RecentTopicContext[],
  queueTitles: string[] = [],
) {
  const days = new Set<number>();
  for (const topic of recentTopics) {
    if (topic.category !== BIBLE_ONE_YEAR_CATEGORY_ID) {
      continue;
    }
    const fromTitle = extractDayNumberFromTopicTitle(topic.title);
    if (fromTitle) {
      days.add(fromTitle);
    }
  }
  for (const title of queueTitles) {
    const fromTitle = extractDayNumberFromTopicTitle(title);
    if (fromTitle) {
      days.add(fromTitle);
    }
  }
  return [...days].sort((a, b) => a - b);
}

export function buildBibleOneYearTopicBatchPrompt({
  channelName,
  section,
  coveredDays,
  recentTopics,
}: {
  channelName: string;
  section: BibleOneYearSectionRange;
  coveredDays?: number[];
  recentTopics?: RecentTopicContext[];
}) {
  const dayCount = bibleOneYearSectionDayCount(section);
  const covered = (coveredDays ?? []).filter(
    (day) => day >= 1 && day <= BIBLE_ONE_YEAR_TOTAL_DAYS,
  );
  const recentSameCategory = (recentTopics ?? [])
    .filter((topic) => topic.category === BIBLE_ONE_YEAR_CATEGORY_ID)
    .slice(0, 20)
    .map((topic) => ({
      title: topic.title,
      angle: topic.angle,
      uniqueMechanism: topic.uniqueMechanism,
    }));

  return `Generate a sectioned reading-plan batch for ${channelName} — The Bible in One Year.

This is NOT a generic idea brainstorm.
You are building consecutive daily Bible reading episodes for a one-year plan.

## SERIES GOAL

Help listeners complete the Bible in one year through simple, manageable daily readings.
Audience: American listeners over 65.
Tone: warm, peaceful, encouraging, easy to follow.
Bible text version for later episodes: World English Bible, American English Edition (WEBUS).
Do NOT invent or paste full chapter WEBUS text in this batch. Only plan the readings.

## THIS SECTION

Generate exactly ${dayCount} ordered daily topics.

Day range:
- startDay: ${section.startDay}
- endDay: ${section.endDay}

Number of topics requested:
${dayCount}

Rules for this section:
1. Create one topic per day from ${section.startDay} through ${section.endDay} inclusive.
2. Keep strict chronological day order.
3. Cover consecutive Bible chapters in canonical book order across the year.
4. Typical daily load: about 2–4 chapters, adjusted for chapter length. Prefer manageable listening sessions for older adults.
5. Do not skip books. Do not jump randomly around Scripture.
6. Do not invent non-canonical books or chapters.
7. todayReadingDisplay must be human-readable, e.g. "Genesis 1–2" or "Psalm 1–5" or "Matthew 5".
8. nextReadingDisplay must match the following day's reading (for day ${section.endDay}, estimate the next day after this section).
9. listeningFocus must be one short pastoral focus sentence for that day's reading.
10. reflectionMainThought must be one central truth from that day's reading.
11. reflectionApplication must be one simple life application.
12. prayerPoints must be 2–4 short prayer ideas arising from the reading.
13. chapters must list every chapter included that day with bookName, bookNameUppercase, and chapterNumber.
14. Continuity: if earlier days already exist, continue the reading plan from where those days left off. Do not restart Genesis unless this section includes Day 1.

Already covered days in the queue (do not regenerate these day numbers):
${covered.length > 0 ? covered.join(", ") : "none yet"}

Recent The Bible in One Year queue items for continuity:
${recentSameCategory.length > 0 ? JSON.stringify(recentSameCategory, null, 2) : "[]"}

## OUTPUT CONTRACT

Return valid JSON only. No markdown, prose, comments, or code fences.

JSON string rules:
- Never put raw double quotes inside a string value.
- Escape required double quotes as \\"

Return exactly this JSON shape:
{
  "topics": [
    {
      "category": "${BIBLE_ONE_YEAR_CATEGORY_ID}",
      "dayNumber": ${section.startDay},
      "title": "Day ${section.startDay} — Genesis 1–2",
      "topic": "Genesis 1–2",
      "todayReadingDisplay": "Genesis 1–2",
      "nextReadingDisplay": "Genesis 3–4",
      "listeningFocus": "notice how God brings order, life, and rest into creation",
      "chapters": [
        {
          "bookName": "Genesis",
          "bookNameUppercase": "GENESIS",
          "chapterNumber": 1
        },
        {
          "bookName": "Genesis",
          "bookNameUppercase": "GENESIS",
          "chapterNumber": 2
        }
      ],
      "reflectionMainThought": "God creates with purpose and invites humanity into relationship.",
      "reflectionApplication": "Where do you need to trust that God is bringing order into something unfinished?",
      "prayerPoints": [
        "thank God for creating life",
        "ask for trust in His design"
      ],
      "angle": "A calm daily reading that helps the listener receive one clear thought from Genesis 1–2.",
      "uniqueMechanism": "God creates with purpose and invites humanity into relationship.",
      "trigger": "peaceful encouragement to begin or continue the one-year Bible journey",
      "promise": "A manageable daily reading and one applicable thought to carry into life.",
      "visualHook": "An open Bible on Genesis 1–2 with warm morning light and a quiet listening chair.",
      "thumbnailIdea": "Open Bible with soft light and short on-image text: 'DAY ${section.startDay}'",
      "repetitionRisk": "low"
    }
  ]
}

Every topic must:
- use category exactly "${BIBLE_ONE_YEAR_CATEGORY_ID}"
- include dayNumber matching its position in the requested range
- use title format exactly: Day {N} — {todayReadingDisplay}
- keep topic equal to todayReadingDisplay
- remain ordered from day ${section.startDay} to day ${section.endDay}

Do not include WEBUS chapter text.
Do not include introduction/reflection/prayer full scripts.
Return only the topics JSON for this section.`;
}

export function bibleOneYearDayPayloadToConfig(
  payload: BibleOneYearTopicDayPayload,
  journeyAction: "begin" | "continue" = "continue",
): BibleOneYearDayConfig {
  return {
    dayNumber: payload.dayNumber,
    journeyAction:
      payload.dayNumber === 1 ? "begin" : journeyAction,
    todayReadingDisplay: payload.todayReadingDisplay,
    nextReadingDisplay: payload.nextReadingDisplay,
    listeningFocus: payload.listeningFocus,
    chapterBlocks: payload.chapters.map((chapter) => ({
      bookName: chapter.bookName,
      bookNameUppercase: chapter.bookNameUppercase,
      chapterNumber: chapter.chapterNumber,
      webusText: "",
    })),
    reflectionMainThought: payload.reflectionMainThought,
    reflectionApplication: payload.reflectionApplication,
    prayerPoints: payload.prayerPoints,
  };
}

export function serializeBibleOneYearTopicNotes(
  payload: BibleOneYearTopicDayPayload,
) {
  return JSON.stringify(
    {
      kind: "the_bible_in_one_year_day",
      dayNumber: payload.dayNumber,
      bibleOneYear: bibleOneYearDayPayloadToConfig(payload),
    },
    null,
    2,
  );
}

export function parseBibleOneYearTopicNotes(notes: string | null | undefined) {
  if (!notes?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(notes) as {
      kind?: unknown;
      dayNumber?: unknown;
      bibleOneYear?: unknown;
    };
    if (parsed.kind !== "the_bible_in_one_year_day") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
