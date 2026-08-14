import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";

export { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY };

/** Exact episode spine labels (not spoken). Shared by both podcast series formats. */
export const PODCAST_SPINE_LABELS = [
  "INTRO",
  "LESSON",
  "CLOSING",
  "FINAL",
] as const;

export type PodcastSpineLabel = (typeof PODCAST_SPINE_LABELS)[number];

/**
 * Podcast English Lessons supports two series formats on one channel.
 * - emma_leo_lesson: teacher/student speaking-challenge episodes
 * - max_sara_conversation: Natural Daily English Conversations with Max & Sara
 */
export type PodcastEpisodeFormat =
  | "emma_leo_lesson"
  | "max_sara_conversation";

/** Acting tags allowed in Podcast English Lessons scripts. */
export const PODCAST_ACTING_TAG_WHITELIST = [
  "laughs",
  "sighs",
  "hungry",
  "confused",
  "nervous",
  "excited",
  "proud",
  "whispers",
] as const;

export type PodcastActingTag = (typeof PODCAST_ACTING_TAG_WHITELIST)[number];

export const PODCAST_ACTING_TAG_ALIASES: Record<string, PodcastActingTag> = {
  laugh: "laughs",
  laughs: "laughs",
  laughing: "laughs",
  chuckle: "laughs",
  chuckles: "laughs",
  sigh: "sighs",
  sighs: "sighs",
  hungry: "hungry",
  confused: "confused",
  nervous: "nervous",
  excited: "excited",
  proud: "proud",
  whisper: "whispers",
  whispers: "whispers",
};

/** Practice modes for Emma / Leo dialogue. */
export const PODCAST_PRACTICE_MODES = {
  listen: {
    id: "listen",
    label: "Listen",
    rule: "Emma and Leo converse with no pauses. Pure comprehension model.",
  },
  listenAndRepeat: {
    id: "listen_and_repeat",
    label: "Listen and Repeat",
    rule:
      "Emma says the model once, then a pause appears. Leo does NOT echo the model.",
  },
  yourTurn: {
    id: "your_turn",
    label: "Your Turn",
    rule:
      "Emma asks a question, a pause appears for the learner, then Leo gives one possible answer.",
  },
  buildYourOwn: {
    id: "build_your_own",
    label: "Build Your Own",
    rule:
      "Give 4–6 seconds per original learner response and 10–15 seconds for the complete result.",
  },
} as const;

/**
 * Gold-standard targets for Emma & Leo speaking-challenge episodes.
 * Depth reference: Day 1 progression. Practice/rhythm reference: Day 3.
 */
export const PODCAST_ENGLISH_GOLD_STANDARD = {
  spokenWordMin: 2800,
  spokenWordMax: 3300,
  /** Target runtime at voiceover speed 0.9 (minutes). */
  durationMinAtSpeed09: 18,
  durationMaxAtSpeed09: 22,
  partCountMin: 11,
  partCountMax: 13,
  thematicBlockMin: 5,
  thematicBlockMax: 7,
  requiredPracticeBeats: [
    "complete conversation",
    "Listen and Repeat",
    "Your Turn",
    "Build Your Own",
    "Quick Speaking Quiz",
    "Today's Mission",
    "recap",
    "CTA",
    "next-day preview",
  ] as const,
  characterRules: {
    emma: "Emma teaches, models, and corrects.",
    leo: "Leo asks questions, makes realistic mistakes, reacts, and adds humor. Leo must not mechanically echo Emma's lines.",
  },
  depthReference: "Day 1 — Introduce Yourself (progression and thematic depth)",
  practiceReference:
    "Day 3 — Order Food (practice system and pause rhythm). When Day 1 and Day 3 conflict on repetitions, follow Day 3.",
  spineOrder:
    "[INTRO] → cold open → [LESSON] → [PART N - TITLE]… → [CLOSING] → recap → thanks ([LEO] then [EMMA]) → [FINAL]",
  noMusicCues: true,
} as const;

/**
 * Gold-standard targets for Natural Daily English Conversations with Max & Sara.
 * Learning by listening (comprehensible input), not active speaking drills.
 */
export const PODCAST_MAX_SARA_GOLD_STANDARD = {
  spokenWordMin: 2800,
  spokenWordTargetMin: 3200,
  spokenWordMax: 4000,
  durationMinMinutes: 20,
  durationMaxMinutes: 30,
  partCountMin: 8,
  partCountMax: 11,
  forbiddenPracticeBeats: [
    "listen and repeat",
    "your turn",
    "build your own",
    "quick speaking quiz",
    "today's mission",
    "repeat after me",
    "shadowing",
  ] as const,
  requiredEditorialBeats: [
    "cold open",
    "catch-up",
    "uniqueMechanism exploration",
    "personal examples from both hosts",
    "useful phrases / chunks",
    "recap",
    "comment question",
    "goodbye",
  ] as const,
  characterRules: {
    max: "Max is a friendly adult co-host. He may ask, explain, misunderstand, joke, or tell a story.",
    sara: "Sara is a friendly adult co-host. She may ask, explain, misunderstand, joke, or tell a story.",
  },
  spineOrder:
    "[INTRO] → cold open + welcome → [LESSON] → conversational [PART N - TITLE]… → [CLOSING] → recap / phrases / comment question → thanks ([MAX] then [SARA]) → [FINAL]",
  noMusicCues: true,
  noLearnerPauses: true,
} as const;

/** Exact brand line required as the last spoken thanks turn (first of the two closing hosts). */
export const PODCAST_FORCED_THANKS_LINE =
  "Thank you for listening to Podcast English Lessons.";

/**
 * Required hope-line stem for the second closing host.
 * The topic tail after "for" should adapt to the episode (e.g. mistakes, apologies…).
 */
export const PODCAST_FORCED_HOPE_LINE_STEM =
  "We hope this conversation helped you feel understood and learn useful natural English for";

export function buildPodcastForcedEndingBlock(
  format: PodcastEpisodeFormat,
): string {
  const first = format === "max_sara_conversation" ? "MAX" : "LEO";
  const second = format === "max_sara_conversation" ? "SARA" : "EMMA";
  return [
    "HARD ENDING (non-negotiable — the script MUST end exactly like this pattern):",
    "",
    "After CLOSING recap / CTA / comment question, the LAST spoken dialogue must be:",
    "",
    `[${first}]`,
    PODCAST_FORCED_THANKS_LINE,
    "",
    `[${second}]`,
    `${PODCAST_FORCED_HOPE_LINE_STEM} <short topic-specific list adapted to this episode>.`,
    "",
    "[FINAL]",
    "",
    "Rules:",
    `- [${first}] speaks the exact thank-you line above (do not paraphrase).`,
    `- [${second}] speaks the hope line starting with the exact stem above; only adapt the words after "for" to this episode's themes.`,
    "- [FINAL] must be the VERY LAST label in the script. Nothing after [FINAL] — no more dialogue, no more speakers, no extra labels.",
    "- Do not put [FINAL] before the thank-you / hope turns.",
  ].join("\n");
}

/** Podcast script-writer batch: V1 → V2 directed → V3 only if still needed. */
/** Podcast Script Writer Batch is single-pass (no ChatGPT score/revision loop). */
export const PODCAST_SCRIPT_WRITER_MAX_DRAFTS = 1;

/** Kept for critique helpers; Podcast batch no longer runs the score loop. */
export const PODCAST_SCRIPT_WRITER_PASS_SCORE = 9.2;

export function isPodcastActingTagAllowed(label: string) {
  const normalized = label.trim().replace(/\s+/g, " ").toLowerCase();
  return Boolean(PODCAST_ACTING_TAG_ALIASES[normalized]);
}

export function canonicalizePodcastActingTag(
  label: string,
): PodcastActingTag | null {
  const normalized = label.trim().replace(/\s+/g, " ").toLowerCase();
  return PODCAST_ACTING_TAG_ALIASES[normalized] ?? null;
}

function textFromUnknown(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Resolve which Podcast English Lessons series format to use for a video.
 * Defaults to Max & Sara when the channel topic engine is conversational_podcast.
 */
export function resolvePodcastEpisodeFormat(input: {
  channelKey?: string | null;
  ideaJson?: unknown;
  topicEngine?: string | null;
  title?: string | null;
  topic?: string | null;
}): PodcastEpisodeFormat {
  const idea =
    typeof input.ideaJson === "string"
      ? (() => {
          try {
            return recordFromUnknown(JSON.parse(input.ideaJson));
          } catch {
            return null;
          }
        })()
      : recordFromUnknown(input.ideaJson);

  const explicit = textFromUnknown(
    idea?.podcastEpisodeFormat ??
      idea?.episodeFormat ??
      idea?.seriesFormat ??
      idea?.podcastFormat,
  )
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    explicit === "emma_leo_lesson" ||
    explicit === "emma_leo" ||
    explicit === "challenge" ||
    explicit === "english_in_action"
  ) {
    return "emma_leo_lesson";
  }
  if (
    explicit === "max_sara_conversation" ||
    explicit === "max_sara" ||
    explicit === "natural_daily" ||
    explicit === "conversational"
  ) {
    return "max_sara_conversation";
  }

  const seriesBlob = [
    textFromUnknown(idea?.seriesConcept),
    textFromUnknown(idea?.series),
    textFromUnknown(idea?.niche),
    textFromUnknown(idea?.workingTitle),
    textFromUnknown(input.title),
    textFromUnknown(input.topic),
  ]
    .filter(Boolean)
    .join(" ");

  if (
    /max\s*(?:and|&)\s*sara|natural daily english conversations/i.test(
      seriesBlob,
    )
  ) {
    return "max_sara_conversation";
  }

  if (
    /emma\s*(?:and|&)\s*leo|english in action|speaking challenge|listen and repeat/i.test(
      seriesBlob,
    )
  ) {
    return "emma_leo_lesson";
  }

  if (input.topicEngine === "conversational_podcast") {
    return "max_sara_conversation";
  }

  if (input.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    // Channel default after Max & Sara series launch.
    return "max_sara_conversation";
  }

  return "emma_leo_lesson";
}

export function buildPodcastGoldStandardPromptBlock() {
  const g = PODCAST_ENGLISH_GOLD_STANDARD;
  return [
    "PODCAST_ENGLISH_GOLD_STANDARD (match Day 1 depth + Day 3 practice rhythm):",
    `- Spoken words: ${g.spokenWordMin}–${g.spokenWordMax}`,
    `- Target duration at voiceover speed 0.9: ${g.durationMinAtSpeed09}–${g.durationMaxAtSpeed09} minutes`,
    `- PART covers: normally ${g.partCountMin}–${g.partCountMax}`,
    `- Thematic teaching blocks: ${g.thematicBlockMin}–${g.thematicBlockMax} before dedicated practice PARTs`,
    `- Must include: ${g.requiredPracticeBeats.join("; ")}`,
    `- Spine: ${g.spineOrder}`,
    `- Forced ending: [LEO] thank-you → [EMMA] hope line → [FINAL] last`,
    `- No music cues of any kind (no [MUSIC: …])`,
    `- Emma: ${g.characterRules.emma}`,
    `- Leo: ${g.characterRules.leo}`,
    `- Depth reference: ${g.depthReference}`,
    `- Practice reference: ${g.practiceReference}`,
    "",
    "Practice modes:",
    `- Listen: ${PODCAST_PRACTICE_MODES.listen.rule}`,
    `- Listen and Repeat: ${PODCAST_PRACTICE_MODES.listenAndRepeat.rule}`,
    `- Your Turn: ${PODCAST_PRACTICE_MODES.yourTurn.rule}`,
    `- Build Your Own: ${PODCAST_PRACTICE_MODES.buildYourOwn.rule}`,
    "",
    `Acting tags whitelist only: ${PODCAST_ACTING_TAG_WHITELIST.map((t) => `[${t}]`).join(", ")}`,
  ].join("\n");
}

export function buildMaxSaraGoldStandardPromptBlock() {
  const g = PODCAST_MAX_SARA_GOLD_STANDARD;
  return [
    "PODCAST_MAX_SARA_GOLD_STANDARD (Natural Daily English Conversations):",
    `- Spoken words: target ${g.spokenWordTargetMin}–${g.spokenWordMax} (soft floor ${g.spokenWordMin})`,
    `- Feel: about ${g.durationMinMinutes}–${g.durationMaxMinutes} minutes of listening`,
    `- PART covers: normally ${g.partCountMin}–${g.partCountMax} conversational beats`,
    `- Editorial beats: ${g.requiredEditorialBeats.join("; ")}`,
    `- Catch-up: ~8–16 natural turns after welcome before main explanation (real podcast moment, not lesson setup)`,
    `- Vocabulary/chunks: organic phrase collection from the conversation — never a dictionary list or “today we will study vocabulary”`,
    `- Only one explicit phrase-collection section; a later section may apply phrases in context (not a second phrase list)`,
    `- Recap mentions ~3–5 key phrases briefly — does not re-teach the full phrase section`,
    `- Spine: ${g.spineOrder}`,
    `- Forced ending: [MAX] thank-you → [SARA] hope line → [FINAL] last`,
    `- No music cues`,
    `- No learner pauses / Listen and Repeat / Your Turn / Quiz / Mission`,
    `- Max: ${g.characterRules.max}`,
    `- Sara: ${g.characterRules.sara}`,
    `- Forbidden practice language: ${g.forbiddenPracticeBeats.join("; ")}`,
    "",
    `Acting tags whitelist only: ${PODCAST_ACTING_TAG_WHITELIST.map((t) => `[${t}]`).join(", ")}`,
  ].join("\n");
}

export function buildPodcastEpisodeSkeletonBlock(
  format: PodcastEpisodeFormat,
): string {
  if (format === "max_sara_conversation") {
    return [
      "Use bracket labels exactly:",
      "[INTRO] → cold open + short welcome + episode promise",
      "[LESSON] → main Max & Sara conversation begins (structural only; never say the word lesson just because of the label)",
      "[PART N - TITLE] → sequential conversation beats (NOT practice blocks)",
      "[CLOSING] → conversational recap, useful phrases/chunks, comment question, soft CTA",
      "Then the forced thank-you / hope dialogue (see HARD ENDING block)",
      "[FINAL] → MUST be the last label in the script (end bumper after spoken thanks)",
      "",
      "No music cues.",
      "No learner pauses.",
      "No listen-and-repeat / Your Turn / Quiz / Mission.",
      "No Emma / Leo.",
      "No teacher/student dynamic.",
      "",
      "Gold standard for this series:",
      "- natural long-form conversation",
      "- 3,200–4,000 spoken words",
      "- 8–11 parts",
      "- comprehensible input",
      "- repeated useful phrases in context",
      "- personal examples and mini-stories",
      "- light humor",
      "- brief natural catch-up (~8–16 turns) before main explanation",
      "- useful vocabulary/chunks as organic phrase collection (not a classroom list)",
      "- recap + one comment question",
      "",
      buildPodcastForcedEndingBlock("max_sara_conversation"),
    ].join("\n");
  }

  return [
    "Use bracket labels exactly:",
    "[INTRO] → cold open dialogue",
    "[LESSON] → then sequential [PART N - TITLE] covers + lesson/practice dialogue",
    "[CLOSING] → recap / CTA / next-day preview",
    "Then the forced thank-you / hope dialogue (see HARD ENDING block)",
    "[FINAL] → MUST be the last label in the script (end bumper after spoken thanks)",
    "Labels are not spoken. No music cues of any kind.",
    "Acting tags whitelist only: [laughs], [sighs], [hungry], [confused], [nervous], [excited], [proud], [whispers].",
    "Listen and Repeat = Emma models once + pause; Leo does not echo.",
    "Gold standard: 2800–3300 spoken words, 11–13 PARTs, 18–22 min at speed 0.9.",
    "Before returning: silent plan + self-audit (do not print them).",
    "",
    buildPodcastForcedEndingBlock("emma_leo_lesson"),
  ].join("\n");
}
