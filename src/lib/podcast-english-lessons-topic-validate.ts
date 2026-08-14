import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";

/**
 * Prompt-example titles that must never be returned as topic outputs.
 * SEO channel suffixes are intentionally excluded — they may recur.
 */
export const FORBIDDEN_PODCAST_EXAMPLE_TITLES = [
  "Job Interview Questions And Answers",
  "Stop Wasting Time",
  "How To Make Small Talk",
  "Talking About Your Weekend",
  "How To Stop Overthinking",
  "How To Talk About Yourself",
  "How To Stay Motivated",
  "Making Friends As An Adult",
  "Living Alone",
  "How To Say No Politely",
  "How To Handle A Bad Day",
  "Morning Habits",
  "Working From Home",
  "Phone Addiction",
  "Saving Money",
  "Changing Jobs",
  "Feeling Tired All The Time",
  "Being Shy",
  "Making Plans With Friends",
  "Why Weekends Feel Too Short",
  "What Makes A Good Friend?",
  "Why We Keep Checking Our Phones",
  "Is It Better To Live Alone?",
] as const;

/** Recurring SEO phrases — not treated as editorial cores. */
export const PODCAST_TOPIC_SEO_PHRASES = [
  "English Podcast For Learning English",
  "Easy English Podcast",
  "English Listening Practice",
  "Natural English Conversation",
  "Easy English Conversation",
] as const;

export function normalizePodcastTopicTitleCore(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FORBIDDEN_NORMALIZED = new Set(
  FORBIDDEN_PODCAST_EXAMPLE_TITLES.map(normalizePodcastTopicTitleCore),
);

const SEO_NORMALIZED = new Set(
  PODCAST_TOPIC_SEO_PHRASES.map(normalizePodcastTopicTitleCore),
);

/**
 * Editorial cores from a YouTube title: pipe segments that are not SEO suffixes.
 * Also includes the first segment (even if empty after SEO strip) via full-title fallback.
 */
export function extractPodcastEditorialTitleCores(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) {
    return [];
  }

  const segments = trimmed
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const cores = segments.filter(
    (segment) => !SEO_NORMALIZED.has(normalizePodcastTopicTitleCore(segment)),
  );

  if (cores.length > 0) {
    return cores;
  }

  // Entire title was SEO-only (unlikely) — keep full title for comparison.
  return [trimmed];
}

export function findForbiddenPodcastExampleTitle(
  title: string,
): string | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [
    trimmed,
    ...extractPodcastEditorialTitleCores(trimmed),
  ];

  for (const candidate of candidates) {
    const normalized = normalizePodcastTopicTitleCore(candidate);
    if (!normalized || SEO_NORMALIZED.has(normalized)) {
      continue;
    }
    if (FORBIDDEN_NORMALIZED.has(normalized)) {
      return candidate;
    }
  }

  return null;
}

export function assertPodcastTopicBatchAvoidsPromptExamples(
  topics: Array<{ title: string }>,
) {
  const hits: string[] = [];
  for (const topic of topics) {
    const hit = findForbiddenPodcastExampleTitle(topic.title);
    if (hit) {
      hits.push(`"${topic.title}" (matched example "${hit}")`);
    }
  }

  if (hits.length > 0) {
    throw new Error(
      `Podcast topic batch reused forbidden prompt-example title(s): ${hits.join("; ")}. Examples are format references only — regenerate with different topics.`,
    );
  }
}

export function maybeAssertPodcastTopicBatchAvoidsPromptExamples(
  channelKey: string | null | undefined,
  topics: Array<{ title: string }>,
) {
  if (channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    return;
  }
  assertPodcastTopicBatchAvoidsPromptExamples(topics);
}
