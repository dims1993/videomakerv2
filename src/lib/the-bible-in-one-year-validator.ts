/**
 * Shared Bible in One Year validation helpers.
 * Prompt builder and validator use the same authorized-title + lock rules.
 */

import {
  BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_LISTENER_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_STYLE_LOCK_COVER,
  BIBLE_ONE_YEAR_STYLE_LOCK_EPISODE_COVER,
  BIBLE_ONE_YEAR_VISIBLE_TEXT_PHRASE_PREFIX,
} from "@/lib/the-bible-in-one-year-final-image-prompt-contract";
import {
  buildBibleOneYearAuthorizedTitles,
  countIndependentVisualActions,
  extractBibleOneYearDeterministicBeats,
  type BibleOneYearDeterministicBeat,
} from "@/lib/the-bible-in-one-year-compact-script";

const FRAMING_RE =
  /\b(close view|overhead|medium(?:-wide)? view|rear three-quarter|side profile|ground-level|low-horizon|aerial|elevated|expansive landscape|waist-up|medium view|wide (?:low-horizon )?view)\b/i;

const OBSERVABLE_ACTION_RE =
  /\b(holding|reaching|taking|eating|giving|sewing|bowing|lifting|standing|sitting|opening|closing|placing|writing|walking|looking|observing|presenting|inviting|resting|pausing|thanking|reading|turning|moving)\b/i;

const ABSTRACT_ONLY_RE =
  /\b(symbolic|representing|illustrating|communicating|symbolizing)\b/i;

const SEQUENCE_IN_ONE_FRAME_RE =
  /\b(then (she|he|they)|after (that|this)|next (she|he|they)|sequence of|several moments|one after another)\b/i;

function normalizeTitle(value: string) {
  return value
    .replace(/[—–−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

const VISIBLE_TITLE_PHRASE_PATTERN =
  /visible text limited to:\s*([^.\n]+)\.?/i;

export function extractExactVisibleTitlePhrase(
  imagePrompt: string | null | undefined,
): string | null {
  const match = normalizeText(imagePrompt).match(VISIBLE_TITLE_PHRASE_PATTERN);
  const title = match?.[1]?.trim();
  return title ? title.replace(/\s+/g, " ") : null;
}

export function hasExactVisibleTextLimitedToPhrase(
  imagePrompt: string,
): boolean {
  return new RegExp(
    `${BIBLE_ONE_YEAR_VISIBLE_TEXT_PHRASE_PREFIX}\\s+[^.\\n]+\\.`,
    "i",
  ).test(imagePrompt);
}

export function promptMentionsModernCharacter(imagePrompt: string): boolean {
  const text = imagePrompt.toLowerCase();
  return (
    text.includes("recurring american pastor host") ||
    text.includes("recurring older listener") ||
    text.includes("pastor host") ||
    /cardigan|dusty-blue cotton shirt|knit sweater/.test(text)
  );
}

export function promptHasForbiddenModernExclusion(
  imagePrompt: string,
): boolean {
  return (
    promptMentionsModernCharacter(imagePrompt) &&
    /\bno modern (clothing|objects)\b/i.test(imagePrompt)
  );
}

export function promptHasOptionalCharacterTraits(imagePrompt: string): boolean {
  return (
    /\boptional beard\b/i.test(imagePrompt) ||
    (/\bage\s+\d{2}\s*[–-]\s*\d{2}\b/i.test(imagePrompt) &&
      !imagePrompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK) &&
      /\b(65–75|65-75|warm medium complexion)\b/i.test(imagePrompt))
  );
}

export function looksLikeParchmentCover(imagePrompt: string): boolean {
  const text = imagePrompt.toLowerCase();
  return (
    text.includes("parchment") ||
    text.includes("bookplate") ||
    imagePrompt.includes(BIBLE_ONE_YEAR_STYLE_LOCK_COVER.slice(0, 60)) ||
    imagePrompt.includes(BIBLE_ONE_YEAR_STYLE_LOCK_EPISODE_COVER.slice(0, 60))
  );
}

export function findDeterministicBeatForScriptText(
  scriptText: string,
  beats: BibleOneYearDeterministicBeat[],
): BibleOneYearDeterministicBeat | undefined {
  const normalized = normalizeText(scriptText).toLowerCase();
  return beats.find((beat) => {
    const spoken = normalizeText(beat.spokenLine).toLowerCase();
    return (
      spoken === normalized ||
      normalized.startsWith(spoken) ||
      spoken.startsWith(normalized)
    );
  });
}

export type BibleOneYearPromptValidationInput = {
  imagePrompt: string;
  scriptText?: string;
  sceneType?: string;
  visualIdea?: string | null;
  authorizedTitle?: string | null;
  authorizedTitles?: string[];
  sourceScript?: string;
  deterministicBeat?: BibleOneYearDeterministicBeat | null;
};

/**
 * Heuristic validation for review. Does not rewrite prompts.
 */
export function validateBibleOneYearImagePrompt(
  input: BibleOneYearPromptValidationInput,
): string[] {
  const errors: string[] = [];
  const prompt = input.imagePrompt ?? "";
  const scriptText = normalizeText(input.scriptText);
  const sceneType = (input.sceneType ?? "").toLowerCase();

  const beats = input.sourceScript
    ? extractBibleOneYearDeterministicBeats(input.sourceScript)
    : [];
  const beat =
    input.deterministicBeat ??
    (scriptText
      ? findDeterministicBeatForScriptText(scriptText, beats)
      : undefined);

  const authorizedTitles = new Set(
    (
      input.authorizedTitles ??
      (input.sourceScript
        ? buildBibleOneYearAuthorizedTitles(input.sourceScript)
        : [])
    ).map(normalizeTitle),
  );
  if (input.authorizedTitle) {
    authorizedTitles.add(normalizeTitle(input.authorizedTitle));
  }
  if (beat?.visibleTitle) {
    authorizedTitles.add(normalizeTitle(beat.visibleTitle));
  }

  const visibleTitle = extractExactVisibleTitlePhrase(prompt);
  if (visibleTitle) {
    if (!hasExactVisibleTextLimitedToPhrase(prompt)) {
      errors.push(
        `Visible text must use the exact phrase "${BIBLE_ONE_YEAR_VISIBLE_TEXT_PHRASE_PREFIX} TITLE."`,
      );
    }
    const normalizedVisible = normalizeTitle(visibleTitle);
    if (
      authorizedTitles.size > 0 &&
      !authorizedTitles.has(normalizedVisible)
    ) {
      errors.push(
        `Unauthorized visible title "${visibleTitle}". Allowed: ${[...authorizedTitles].join(", ") || "(none)"}`,
      );
    }
    if (normalizedVisible === "CLOSING") {
      errors.push("CLOSING is not an authorized on-screen title.");
    }
    if (normalizedVisible === "REFLECTION AND PRAYER") {
      errors.push(
        'Use "REFLECT AND PRAY" instead of "REFLECTION AND PRAYER".',
      );
    }
  } else if (beat?.visibleTitle) {
    errors.push(
      `Missing authorized title phrase for deterministic beat ${beat.kind}: visible text limited to: ${beat.visibleTitle}.`,
    );
  }

  if (beat?.kind === "thank_you") {
    if (
      sceneType === "insert" &&
      /chapter cover:/i.test(input.visualIdea ?? "")
    ) {
      errors.push(
        "Closing thank-you must be an avatar scene, never a CLOSING/Chapter cover.",
      );
    }
  }

  if (
    beat?.requiresPastorLock &&
    !prompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK)
  ) {
    errors.push(
      `Deterministic beat ${beat.kind} requires the exact American pastor host lock.`,
    );
  }

  if (
    beat?.requiresListenerLock &&
    !prompt.includes(BIBLE_ONE_YEAR_LISTENER_CHARACTER_LOCK)
  ) {
    errors.push(
      `Deterministic beat ${beat.kind} requires the exact older listener lock.`,
    );
  }

  if (
    beat &&
    [
      "episode_cover",
      "chapter_cover",
      "reading_preview",
      "reflection_cover",
    ].includes(beat.kind)
  ) {
    if (!looksLikeParchmentCover(prompt)) {
      errors.push(
        `Cover beat ${beat.kind} must use the parchment bookplate style.`,
      );
    }
    if (
      beat.kind === "chapter_cover" &&
      prompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK)
    ) {
      errors.push("Chapter covers must not include the pastor by default.");
    }
  }

  if (promptHasForbiddenModernExclusion(prompt)) {
    errors.push(
      "Do not use “no modern clothing” / “no modern objects” when a modern pastor or listener appears.",
    );
  }

  if (promptHasOptionalCharacterTraits(prompt)) {
    errors.push(
      "Do not use optional or alternative physical traits inside a recurring character description.",
    );
  }

  if (ABSTRACT_ONLY_RE.test(prompt) && !OBSERVABLE_ACTION_RE.test(prompt)) {
    errors.push(
      "Abstract-only wording (symbolic/representing/illustrating/communicating) without a concrete observable action.",
    );
  }

  if (!FRAMING_RE.test(prompt) && prompt.length > 40) {
    errors.push("Prompt is missing a framing or point of view.");
  }

  if (!OBSERVABLE_ACTION_RE.test(prompt) && prompt.length > 40) {
    errors.push("Prompt is missing an observable visual verb or action.");
  }

  if (SEQUENCE_IN_ONE_FRAME_RE.test(prompt)) {
    errors.push(
      "Prompt appears to narrate a full sequence inside a single frame.",
    );
  }

  if (scriptText && countIndependentVisualActions(scriptText) >= 4) {
    errors.push(
      "scriptText appears to contain several independent visual actions; split into multiple scenes.",
    );
  }

  if (
    /\b(bible|page|journal|note|handwriting)\b/i.test(prompt) &&
    /\b(readable verse|legible text|clearly readable wording)\b/i.test(prompt)
  ) {
    errors.push("Bible pages and notes must remain unreadable.");
  }

  if (
    beat &&
    [
      "episode_cover",
      "chapter_cover",
      "reflection_cover",
      "reading_preview",
    ].includes(beat.kind) &&
    /\b(title card|ui panel|poster|slide|modern advertising)\b/i.test(prompt)
  ) {
    errors.push("Cover uses a disallowed title-card / UI / poster layout.");
  }

  return errors;
}

export function validateBibleOneYearScenePlan(input: {
  sourceScript: string;
  scenes: Array<{
    scriptText: string;
    sceneType: string;
    visualIdea?: string | null;
    imagePrompt: string;
    duration?: number;
  }>;
  joinedCoverageOk: boolean;
}): string[] {
  const errors: string[] = [];
  const beats = extractBibleOneYearDeterministicBeats(input.sourceScript);
  const authorizedTitles = buildBibleOneYearAuthorizedTitles(
    input.sourceScript,
  );

  if (!input.joinedCoverageOk) {
    errors.push(
      "Joined scriptText does not reproduce the source narration exactly once.",
    );
  }

  for (const beat of beats) {
    const match = input.scenes.find((scene) =>
      normalizeText(scene.scriptText)
        .toLowerCase()
        .includes(normalizeText(beat.spokenLine).toLowerCase().slice(0, 40)),
    );
    if (!match) {
      errors.push(
        `Missing deterministic beat ${beat.kind} for: ${beat.spokenLine}`,
      );
      continue;
    }
    if (match.sceneType !== beat.sceneType) {
      errors.push(
        `Beat ${beat.kind} expected sceneType ${beat.sceneType}, got ${match.sceneType}.`,
      );
    }
    errors.push(
      ...validateBibleOneYearImagePrompt({
        imagePrompt: match.imagePrompt,
        scriptText: match.scriptText,
        sceneType: match.sceneType,
        visualIdea: match.visualIdea,
        authorizedTitles,
        sourceScript: input.sourceScript,
        deterministicBeat: beat,
      }),
    );
  }

  return errors;
}
