/**
 * Cross-channel voiceover continuity.
 *
 * Problem: visual planners split dense narration across scenes, then TTS
 * generates each clip cold. Joins sound cut-off or re-intoned.
 *
 * Architecture (C + B):
 * 1. Prefer clause/comma splits in the visual plan (avoid mid-connective cuts).
 * 2. Continuity Groups (`voiceover-continuity-groups`): one TTS take for a
 *    bridge chain → forced-align → slice at word boundaries into scene files.
 * 3. Incomplete→continuation joins use a near-zero stitch gap inside a group.
 */

import { stripStructuralMarkers } from "@/lib/visual-plan-script";

/** Hard join between incomplete beat and its continuation (ms). */
export const VOICEOVER_PAUSE_CONTINUATION_MS = 0;

/** Max chars of neighbor text sent to TTS for prosody stitching. */
export const TTS_STITCH_CONTEXT_MAX_CHARS = 320;

function normalizedSpoken(scriptText: string) {
  return stripStructuralMarkers(scriptText ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function endingWithoutTrailingQuotes(scriptText: string) {
  return normalizedSpoken(scriptText).replace(/["'”’)\]]+$/g, "");
}

/**
 * True when the beat does not finish a sentence (mid-split / trailing comma).
 */
export function endsIncompleteForProsody(scriptText: string): boolean {
  const ending = endingWithoutTrailingQuotes(scriptText);
  if (!ending) {
    return false;
  }
  return !/[.?!…]$/.test(ending);
}

/**
 * True when the next beat looks like a continuation of the previous thought.
 */
export function looksLikeContinuationStart(scriptText: string): boolean {
  const text = normalizedSpoken(scriptText);
  if (!text) {
    return false;
  }
  if (
    /^(and|but|or|so|because|when|while|which|that|with|from|into|after|before|yet|as|if|nor|though|although)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  const firstLetter = text.match(/[A-Za-z]/)?.[0];
  return Boolean(firstLetter && firstLetter === firstLetter.toLowerCase());
}

/**
 * Bridge when current beat is incomplete — next clip should continue prosody.
 * Strong sentence / paragraph endings never bridge.
 */
export function shouldBridgeProsody(
  currentScriptText: string,
  nextScriptText?: string | null,
): boolean {
  if (!nextScriptText?.trim()) {
    return false;
  }
  if (!endsIncompleteForProsody(currentScriptText)) {
    return false;
  }
  // Incomplete current + any following spoken beat → treat as continuation.
  // (Planner mid-splits often capitalize the right half, so we don't require
  // looksLikeContinuationStart.)
  return normalizedSpoken(nextScriptText).length > 0;
}

/**
 * Pause after current scene, continuity-aware.
 * Incomplete→next beats get a hard join; otherwise use the punctuation pause.
 */
export function suggestContinuityAwarePauseAfterMs(opts: {
  scriptText: string;
  nextScriptText?: string | null;
  /** Base punctuation (or wealth) pause before continuity override. */
  basePauseAfterMs: number;
}): number {
  if (shouldBridgeProsody(opts.scriptText, opts.nextScriptText)) {
    return VOICEOVER_PAUSE_CONTINUATION_MS;
  }
  return Math.max(0, Math.round(opts.basePauseAfterMs));
}

export function truncateTtsStitchContext(
  text: string,
  maxChars = TTS_STITCH_CONTEXT_MAX_CHARS,
): string {
  const clean = normalizedSpoken(text);
  if (clean.length <= maxChars) {
    return clean;
  }
  // Prefer keeping the end of previous / start of next for local prosody.
  return clean.slice(-maxChars).replace(/^\S*\s+/, "").trim();
}

export function truncateTtsNextContext(
  text: string,
  maxChars = TTS_STITCH_CONTEXT_MAX_CHARS,
): string {
  const clean = normalizedSpoken(text);
  if (clean.length <= maxChars) {
    return clean;
  }
  return clean.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
}

export type TtsStitchContext = {
  previousText?: string;
  nextText?: string;
};

/**
 * Build neighbor text context for TTS request stitching (same voice only).
 */
export function buildTtsStitchContext(opts: {
  previousSpokenText?: string | null;
  nextSpokenText?: string | null;
  /** When false (speaker change), omit context. */
  sameVoiceAsPrevious?: boolean;
  sameVoiceAsNext?: boolean;
}): TtsStitchContext {
  const previousText =
    opts.sameVoiceAsPrevious !== false && opts.previousSpokenText?.trim()
      ? truncateTtsStitchContext(opts.previousSpokenText)
      : undefined;
  const nextText =
    opts.sameVoiceAsNext !== false && opts.nextSpokenText?.trim()
      ? truncateTtsNextContext(opts.nextSpokenText)
      : undefined;
  return {
    ...(previousText ? { previousText } : {}),
    ...(nextText ? { nextText } : {}),
  };
}
