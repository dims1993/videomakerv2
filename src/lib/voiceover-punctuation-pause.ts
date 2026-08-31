/**
 * Default between-scene voiceover pauses from ending punctuation.
 * Applied for all channels when Scene.pauseAfterMs is unset (and via smart apply).
 *
 * Global defaults:
 * - Comma (, —):           → 100
 * - Period (. …):          → 245
 * - Question (?):          → 280
 * - Exclamation (!):       → 260
 * - Semicolon (;):         → 175
 * - Colon (:):             → 175
 * - Paragraph break:       → 420
 * - Fallback (no cue):     → 80
 */

import { stripStructuralMarkers } from "@/lib/visual-plan-script";
import { suggestContinuityAwarePauseAfterMs } from "@/lib/voiceover-continuity";

export const VOICEOVER_PAUSE_COMMA_MS = 100;
export const VOICEOVER_PAUSE_PERIOD_MS = 245;
export const VOICEOVER_PAUSE_QUESTION_MS = 280;
export const VOICEOVER_PAUSE_EXCLAMATION_MS = 260;
export const VOICEOVER_PAUSE_SEMICOLON_MS = 175;
export const VOICEOVER_PAUSE_COLON_MS = 175;
export const VOICEOVER_PAUSE_PARAGRAPH_MS = 420;
/** Fixed breath when the beat has no clear ending cue. */
export const VOICEOVER_PAUSE_DEFAULT_MS = 80;

export type VoiceoverPunctuationPauseKind =
  | "paragraph"
  | "period"
  | "question"
  | "exclamation"
  | "semicolon"
  | "colon"
  | "comma"
  | "default";

function hasParagraphBreak(raw: string) {
  // Trailing blank line(s), or an internal paragraph break in a multi-block beat
  // that ends on a sentence terminator.
  if (/\n[ \t]*\n[ \t]*$/.test(raw)) {
    return true;
  }
  const trimmed = raw.trim();
  if (!/\n[ \t]*\n/.test(raw)) {
    return false;
  }
  return /[.?!…]["'”’)\]]*\s*$/.test(trimmed);
}

/**
 * Classify how a spoken beat ends for pause selection.
 */
export function classifyVoiceoverPunctuationPause(
  scriptText: string,
): VoiceoverPunctuationPauseKind {
  const original = scriptText ?? "";
  // Preserve trailing paragraph breaks before marker stripping/trimming.
  if (/\n[ \t]*\n[ \t]*$/.test(original)) {
    return "paragraph";
  }

  const raw = stripStructuralMarkers(original);
  if (!raw.trim()) {
    return "default";
  }

  if (hasParagraphBreak(raw)) {
    return "paragraph";
  }

  const text = raw.replace(/\s+/g, " ").trim();
  const ending = text.replace(/["'”’)\]]+$/g, "");

  if (/;$/.test(ending)) {
    return "semicolon";
  }
  if (/:$/.test(ending)) {
    return "colon";
  }
  // Em/en dashes often behave like a soft continuation (comma-class).
  if (/,$/.test(ending) || /[—–]$/.test(ending)) {
    return "comma";
  }
  if (/\?$/.test(ending)) {
    return "question";
  }
  if (/!$/.test(ending)) {
    return "exclamation";
  }
  if (/[.…]$/.test(ending)) {
    return "period";
  }

  return "default";
}

export function pauseMsForPunctuationKind(
  kind: VoiceoverPunctuationPauseKind,
): number {
  switch (kind) {
    case "paragraph":
      return VOICEOVER_PAUSE_PARAGRAPH_MS;
    case "period":
      return VOICEOVER_PAUSE_PERIOD_MS;
    case "question":
      return VOICEOVER_PAUSE_QUESTION_MS;
    case "exclamation":
      return VOICEOVER_PAUSE_EXCLAMATION_MS;
    case "semicolon":
      return VOICEOVER_PAUSE_SEMICOLON_MS;
    case "colon":
      return VOICEOVER_PAUSE_COLON_MS;
    case "comma":
      return VOICEOVER_PAUSE_COMMA_MS;
    default:
      return VOICEOVER_PAUSE_DEFAULT_MS;
  }
}

/**
 * Suggest pauseAfterMs (ms) from the ending punctuation of a scene's narration.
 */
export function suggestPunctuationPauseAfterMs(scriptText: string): number {
  return pauseMsForPunctuationKind(
    classifyVoiceoverPunctuationPause(scriptText),
  );
}

export function suggestPunctuationPausesForScenes<
  T extends { scriptText: string },
>(scenes: T[]): Array<T & { suggestedPauseAfterMs: number }> {
  return scenes.map((scene, index) => {
    const next = scenes[index + 1];
    const base = suggestPunctuationPauseAfterMs(scene.scriptText);
    return {
      ...scene,
      suggestedPauseAfterMs: suggestContinuityAwarePauseAfterMs({
        scriptText: scene.scriptText,
        nextScriptText: next?.scriptText,
        basePauseAfterMs: base,
      }),
    };
  });
}
