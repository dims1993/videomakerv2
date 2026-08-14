/**
 * Gods Word visual-plan pacing validation (P1).
 * Complements prompt rules: body ~15–25 words / 5–8s; never one-word scenes.
 */

export const GODS_WORD_BODY_DURATION_SOFT_MIN_SEC = 5;
export const GODS_WORD_BODY_DURATION_SOFT_MAX_SEC = 8;
export const GODS_WORD_BODY_WORD_SOFT_MIN = 12;
export const GODS_WORD_HOOK_DURATION_SOFT_MIN_SEC = 3;
export const GODS_WORD_HOOK_DURATION_SOFT_MAX_SEC = 6;
export const GODS_WORD_HOOK_WORD_SOFT_MIN = 4;

export function countNarratedWords(scriptText: string | null | undefined): number {
  const text = (scriptText ?? "").trim();
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

export function isGodsWordExemptPacingScene(scene: {
  scriptText?: string | null;
  visualIdea?: string | null;
}): boolean {
  const idea = (scene.visualIdea ?? "").trim();
  const text = (scene.scriptText ?? "").trim();

  if (!text) {
    // Empty script bumpers (e.g. SECTION_CLIP | FINAL) are duration-from-library.
    return true;
  }
  if (/^Chapter cover:/i.test(idea)) {
    return true;
  }
  if (/SECTION_CLIP\s*\|\s*FINAL/i.test(idea)) {
    return true;
  }
  return false;
}

/** Allow 1–3 words only for exact short quotes / deliberate word-study emphasis. */
export function isGodsWordAllowedShortEmphasis(scene: {
  scriptText?: string | null;
  visualIdea?: string | null;
}): boolean {
  const text = (scene.scriptText ?? "").trim();
  const idea = (scene.visualIdea ?? "").trim();
  const words = countNarratedWords(text);
  if (words < 1 || words > 3) {
    return false;
  }
  if (/^Word-study card:/i.test(idea)) {
    return true;
  }
  if (/^["“'`]/.test(text) || /["”'`]$/.test(text)) {
    return true;
  }
  // All-caps micro emphasis (e.g. "FOLLOW ME") — still must not be a single letter/token abuse.
  if (words >= 2 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return true;
  }
  return false;
}

export function validateGodsWordSceneDurations(
  scenes: Array<{
    scriptText: string;
    duration: number;
    visualIdea?: string | null;
  }>,
  options?: { isHookSection?: boolean },
): string[] {
  const isHookSection = options?.isHookSection === true;
  const errors: string[] = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]!;
    const label = `Scene ${index + 1}`;
    const duration = Number(scene.duration);
    const words = countNarratedWords(scene.scriptText);
    const exempt = isGodsWordExemptPacingScene(scene);

    if (!Number.isFinite(duration) || duration <= 0) {
      if (!exempt) {
        errors.push(`${label}: duration must be a positive number.`);
      }
      continue;
    }

    if (exempt) {
      continue;
    }

    // Global: never a single-word scene.
    if (words === 1) {
      errors.push(
        `${label}: single-word scriptText is forbidden ("${scene.scriptText.trim()}"). Merge with the neighboring clause of the same claim.`,
      );
      continue;
    }

    // Global: 1–3 words only for quote / word-study emphasis.
    if (words >= 2 && words <= 3 && !isGodsWordAllowedShortEmphasis(scene)) {
      errors.push(
        `${label}: ${words}-word scriptText is too short unless it is an exact short quote or word-study emphasis. Merge with the adjacent clause (target hook ≥${GODS_WORD_HOOK_WORD_SOFT_MIN} words, body ≥${GODS_WORD_BODY_WORD_SOFT_MIN}).`,
      );
    }

    if (isHookSection) {
      if (duration > GODS_WORD_HOOK_DURATION_SOFT_MAX_SEC) {
        errors.push(
          `${label}: hook duration ${duration}s exceeds soft max ${GODS_WORD_HOOK_DURATION_SOFT_MAX_SEC}s — split the beat; do not keep body-length hook scenes.`,
        );
      }
      if (words > 0 && words < GODS_WORD_HOOK_WORD_SOFT_MIN && !isGodsWordAllowedShortEmphasis(scene)) {
        errors.push(
          `${label}: hook has only ${words} words — merge micro-beats (soft min ~${GODS_WORD_HOOK_WORD_SOFT_MIN} words; never one-word scenes).`,
        );
      }
      continue;
    }

    // BODY / CHAPTER
    if (duration < GODS_WORD_BODY_DURATION_SOFT_MIN_SEC) {
      errors.push(
        `${label}: body duration ${duration}s is below soft floor ${GODS_WORD_BODY_DURATION_SOFT_MIN_SEC}s. Merge same-claim clauses; target 5–8s and ~15–25 words.`,
      );
    }
    if (duration > GODS_WORD_BODY_DURATION_SOFT_MAX_SEC) {
      errors.push(
        `${label}: body duration ${duration}s exceeds soft ceiling ${GODS_WORD_BODY_DURATION_SOFT_MAX_SEC}s. Split only if claims need different visuals; otherwise keep ≤${GODS_WORD_BODY_DURATION_SOFT_MAX_SEC}s.`,
      );
    }
    if (words > 0 && words < GODS_WORD_BODY_WORD_SOFT_MIN) {
      errors.push(
        `${label}: body has only ${words} words (soft min ${GODS_WORD_BODY_WORD_SOFT_MIN}; target 15–25). Do NOT apply hard-hook micro-splitting — merge neighboring same-claim clauses.`,
      );
    }
  }

  return errors;
}
