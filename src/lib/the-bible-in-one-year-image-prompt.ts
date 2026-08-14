/**
 * Bible in One Year image-prompt handling.
 *
 * Source of truth: the Visual Planner / editor `imagePrompt`.
 * The app stores and sends that prompt unchanged.
 * imagePrompt is free-form: no style-lock, title, or legacy gates block generation.
 */

import {
  coverTitleFromChapterAnnouncement,
  coverTitleFromReadingPreview,
  coverTitleFromSeriesTitleLine,
  coverTitleFromWelcomeLine,
  isReflectionOpenerLine,
  progressVisibleTitle,
  thankYouVisibleTitle,
  nextReadingVisibleTitle,
} from "@/lib/the-bible-in-one-year-compact-script";
import { validateBibleOneYearImagePrompt } from "@/lib/the-bible-in-one-year-validator";

/** Reference style wording for Visual Planner guidance (not enforced at runtime). */
export const BIBLE_ONE_YEAR_STYLE_LOCK_BASE =
  "16:9 horizontal hand-painted watercolor and ink Bible-study illustration on warm off-white textured paper, with soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber, and gentle parchment light.";

export {
  BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_LISTENER_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_ADAM_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_EVE_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR,
  BIBLE_ONE_YEAR_STYLE_LOCK_INSERT,
  BIBLE_ONE_YEAR_STYLE_LOCK_LANDSCAPE,
  BIBLE_ONE_YEAR_STYLE_LOCK_INTERIOR,
  BIBLE_ONE_YEAR_STYLE_LOCK_COVER,
  BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT,
  BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE,
  BIBLE_ONE_YEAR_OPEN_BIBLE_PAGE_GUARD,
} from "@/lib/the-bible-in-one-year-final-image-prompt-contract";

import {
  BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT,
  BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR,
  BIBLE_ONE_YEAR_STYLE_LOCK_COVER,
  BIBLE_ONE_YEAR_STYLE_LOCK_INSERT,
  BIBLE_ONE_YEAR_STYLE_LOCK_INTERIOR,
  BIBLE_ONE_YEAR_STYLE_LOCK_LANDSCAPE,
  BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE,
} from "@/lib/the-bible-in-one-year-final-image-prompt-contract";

export const BIBLE_ONE_YEAR_NEGATIVE_NO_TEXT = `${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE} ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`;

export const BIBLE_ONE_YEAR_NEGATIVE_WITH_TITLE = `No other readable writing, captions, letters, numbers, logos, or words. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`;

export const BIBLE_ONE_YEAR_OPEN_BIBLE_TEXT_GUARD =
  "The page layout and line structure may be suggested, but all printed or handwritten wording must remain indistinct and unreadable.";

/** @deprecated Reference only — prompts are not compiled at runtime. */
export const BIBLE_ONE_YEAR_VISUAL_STYLE_LOCK = BIBLE_ONE_YEAR_STYLE_LOCK_BASE;
/** @deprecated Reference only — prompts are not compiled at runtime. */
export const BIBLE_ONE_YEAR_SCRIPT_FIDELITY_LOCK =
  "Remain faithful to the planned scene concept and the exact spoken moment. Do not invent unsupported figures or later events.";

/** @deprecated Legacy marker message; free-form prompts are no longer blocked. */
export const BIBLE_ONE_YEAR_LEGACY_PROMPT_ERROR =
  "Legacy short imagePrompt (missing production-ready 16:9 watercolor-and-ink lock). Regenerate this scene via a new Visual Planner request; the app will not rewrite legacy prompts.";

export type BibleOneYearWorldState = {
  isModernDevotional: boolean;
  isCreationNarrative: boolean;
  lightExists: boolean;
  expanseExists: boolean;
  dryLandExists: boolean;
  vegetationExists: boolean;
  celestialBodiesExist: boolean;
  seaCreaturesExist: boolean;
  birdsExist: boolean;
  landAnimalsExist: boolean;
  humansExist: boolean;
};

export type BibleOneYearImagePromptInput = {
  scriptText: string;
  sceneType?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
  precedingScriptText?: string;
  originalImagePrompt?: string | null;
};

export type BibleOneYearImagePromptResult = {
  /** Always equal to the input prompt — never rewritten. */
  imagePrompt: string;
  isLegacy: boolean;
  usedConservativeInterpretation: boolean;
  worldState: BibleOneYearWorldState;
  forbiddenElements: string[];
  authorizedTitle: string | null;
  validationErrors: string[];
};

const EMPTY_WORLD: BibleOneYearWorldState = {
  isModernDevotional: false,
  isCreationNarrative: false,
  lightExists: false,
  expanseExists: false,
  dryLandExists: false,
  vegetationExists: false,
  celestialBodiesExist: false,
  seaCreaturesExist: false,
  birdsExist: false,
  landAnimalsExist: false,
  humansExist: false,
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Informational only — never used to block generation.
 * imagePrompt is free-form.
 */
export function isProductionReadyBibleOneYearImagePrompt(
  prompt: string | null | undefined,
): boolean {
  const text = prompt ?? "";
  return /16:9/.test(text) && /watercolor(?:\s+|-)and(?:\s+|-)ink/i.test(text);
}

/** Informational only — never used to block generation. */
export function isLegacyBibleOneYearImagePrompt(
  prompt: string | null | undefined,
): boolean {
  const text = (prompt ?? "").trim();
  if (!text) {
    return true;
  }
  return !isProductionReadyBibleOneYearImagePrompt(text);
}

/** @deprecated Prefer isProductionReadyBibleOneYearImagePrompt */
export function isCompiledBibleOneYearImagePrompt(prompt: string): boolean {
  return isProductionReadyBibleOneYearImagePrompt(prompt);
}

function normalizeTitleForCompare(value: string) {
  return value
    .replace(/[—–−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const VISIBLE_TITLE_PHRASE_PATTERN =
  /(?:visible text(?:\s+must be clearly rendered and)?\s+limited to|exact readable visible title)\s*:\s*([^.,;\n]+)/i;

export function extractVisibleTitleFromImagePrompt(
  imagePrompt: string | null | undefined,
): string | null {
  const match = normalizeText(imagePrompt).match(VISIBLE_TITLE_PHRASE_PATTERN);
  const title = match?.[1]?.trim();
  return title ? title.toUpperCase().replace(/\s+/g, " ") : null;
}

export function imagePromptContainsAuthorizedTitle(
  imagePrompt: string,
  authorizedTitle: string,
): boolean {
  const match = imagePrompt.match(VISIBLE_TITLE_PHRASE_PATTERN);
  if (!match?.[1]) {
    return false;
  }
  return (
    normalizeTitleForCompare(match[1]) ===
    normalizeTitleForCompare(authorizedTitle)
  );
}

export function extractAuthorizedVisibleTitle(
  scriptText: string,
  visualIdea?: string | null,
  originalImagePrompt?: string | null,
): string | null {
  const idea = normalizeText(visualIdea);
  if (idea.toLowerCase().startsWith("chapter cover:")) {
    const rest = idea.slice("chapter cover:".length).trim();
    const title = rest.split(",")[0]?.trim();
    if (title) {
      const upper = title.toUpperCase();
      if (upper === "CLOSING" || upper === "REFLECTION AND PRAYER") {
        // Prefer deterministic titles from spoken lines below.
      } else {
        return upper;
      }
    }
  }

  const fromPrompt = extractVisibleTitleFromImagePrompt(originalImagePrompt);
  if (
    fromPrompt &&
    fromPrompt !== "CLOSING" &&
    fromPrompt !== "REFLECTION AND PRAYER"
  ) {
    return fromPrompt;
  }

  const script = normalizeText(scriptText);
  return (
    coverTitleFromSeriesTitleLine(script) ||
    coverTitleFromWelcomeLine(script) ||
    coverTitleFromChapterAnnouncement(script) ||
    coverTitleFromReadingPreview(script) ||
    (isReflectionOpenerLine(script) ? "REFLECT AND PRAY" : null) ||
    thankYouVisibleTitle(script) ||
    progressVisibleTitle(script) ||
    nextReadingVisibleTitle(script) ||
    (/in jesus'? name,?\s*amen\.?$/i.test(script) ? "AMEN" : null) ||
    null
  );
}

/** Reference helper for Visual Planner wording — not applied at runtime. */
export function getBibleOneYearStyleLock(
  sceneType: string | null | undefined,
  authorizedTitle: string | null,
): string {
  const type = (sceneType ?? "insert").toLowerCase();
  if (authorizedTitle) {
    return BIBLE_ONE_YEAR_STYLE_LOCK_COVER;
  }
  if (type === "avatar") {
    return BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR;
  }
  if (type === "space") {
    return BIBLE_ONE_YEAR_STYLE_LOCK_LANDSCAPE;
  }
  if (type === "insert") {
    return BIBLE_ONE_YEAR_STYLE_LOCK_INSERT;
  }
  return BIBLE_ONE_YEAR_STYLE_LOCK_INTERIOR;
}

/** Reference helper for Visual Planner wording — not applied at runtime. */
export function getBibleOneYearNegativeLock(
  authorizedTitle: string | null,
): string {
  if (authorizedTitle) {
    return `visible text limited to: ${authorizedTitle}. ${BIBLE_ONE_YEAR_NEGATIVE_WITH_TITLE}`;
  }
  return BIBLE_ONE_YEAR_NEGATIVE_NO_TEXT;
}

/**
 * Soft advisory checks for review. Never rewrites imagePrompt.
 */
export function validateCompiledBibleOneYearImagePrompt(input: {
  imagePrompt: string;
  authorizedTitle: string | null;
  sceneType: string;
  scriptText?: string;
  visualIdea?: string | null;
  sourceScript?: string;
  mentionsOpenBible?: boolean;
}): string[] {
  return validateBibleOneYearImagePrompt({
    imagePrompt: input.imagePrompt,
    authorizedTitle: input.authorizedTitle,
    sceneType: input.sceneType,
    scriptText: input.scriptText,
    visualIdea: input.visualIdea,
    sourceScript: input.sourceScript,
  });
}

/**
 * Passthrough. Never modifies imagePrompt. Never blocks.
 */
export function compileBibleOneYearImagePrompt(
  input: BibleOneYearImagePromptInput,
): BibleOneYearImagePromptResult {
  const imagePrompt = input.originalImagePrompt ?? "";
  const authorizedTitle = extractAuthorizedVisibleTitle(
    input.scriptText ?? "",
    input.visualIdea,
    imagePrompt,
  );

  return {
    imagePrompt,
    isLegacy: false,
    usedConservativeInterpretation: false,
    worldState: EMPTY_WORLD,
    forbiddenElements: [],
    authorizedTitle,
    validationErrors: validateCompiledBibleOneYearImagePrompt({
      imagePrompt,
      authorizedTitle,
      sceneType: input.sceneType ?? "insert",
      scriptText: input.scriptText,
      visualIdea: input.visualIdea,
    }),
  };
}

/** @deprecated Prefer compileBibleOneYearImagePrompt (passthrough). */
export function buildBibleOneYearImagePrompt(
  input: BibleOneYearImagePromptInput,
): BibleOneYearImagePromptResult {
  return compileBibleOneYearImagePrompt(input);
}

/**
 * Import path: store prompts exactly as received.
 */
export function compileBibleOneYearImportedScenes<
  T extends {
    scriptText: string;
    sceneType: string;
    visualPurpose: string | null;
    visualIdea: string | null;
    imagePrompt: string | null;
    duration: number;
    status?: string;
    sortOrder?: number;
  },
>(scenes: T[]): T[] {
  return scenes.map((scene) => ({ ...scene }));
}

export function compileBibleOneYearSceneImagePrompt<
  T extends {
    scriptText: string;
    sceneType: string;
    visualPurpose?: string | null;
    visualIdea?: string | null;
    imagePrompt?: string | null;
    duration?: number | null;
    status?: string;
    order?: number;
    sortOrder?: number;
  },
>(
  scene: T,
  _options?: { precedingScriptText?: string },
): T & { imagePrompt: string } {
  const result = compileBibleOneYearImagePrompt({
    scriptText: scene.scriptText,
    sceneType: scene.sceneType,
    visualPurpose: scene.visualPurpose,
    visualIdea: scene.visualIdea,
    originalImagePrompt: scene.imagePrompt,
  });

  return {
    ...scene,
    imagePrompt: result.imagePrompt,
  };
}

/**
 * Batch path: return stored prompts unchanged.
 */
export function buildBibleOneYearImagePromptsForScenes(
  scenes: Array<{
    id: string;
    sortOrder: number;
    scriptText: string;
    sceneType?: string | null;
    visualIdea?: string | null;
    visualPurpose?: string | null;
    imagePrompt?: string | null;
  }>,
  targetSceneIds?: Set<string>,
) {
  const results = new Map<
    string,
    BibleOneYearImagePromptResult & { sceneId: string; sceneOrder: number }
  >();

  for (const scene of scenes) {
    if (targetSceneIds && !targetSceneIds.has(scene.id)) {
      continue;
    }

    const built = compileBibleOneYearImagePrompt({
      scriptText: scene.scriptText,
      sceneType: scene.sceneType,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
      originalImagePrompt: scene.imagePrompt,
    });

    results.set(scene.id, {
      ...built,
      sceneId: scene.id,
      sceneOrder: scene.sortOrder,
    });
  }

  return results;
}
