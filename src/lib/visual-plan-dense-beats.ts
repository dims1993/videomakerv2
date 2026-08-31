/**
 * Shared force-split for dense narration beats that exceed word/time ceilings.
 * Prefer clause / comma boundaries only (no mid-connective last resort).
 */

import { splitLongHookSentence } from "@/lib/visual-plan-script";

export type ForceSplitOversizedBeatOptions = {
  maxWords: number;
  maxEstimatedSec: number;
  /** Defaults to a conservative ~137.5 wpm estimate with light pause padding. */
  estimateSeconds?: (text: string) => number;
};

function wordCount(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Conservative narration duration estimate (seconds). */
export function estimateBeatNarrationSeconds(scriptText: string): number {
  const text = scriptText.trim();
  if (!text) {
    return 0;
  }
  const words = wordCount(text);
  const commas = (text.match(/,/g) ?? []).length;
  const stops = (text.match(/[.!?]/g) ?? []).length;
  const base = (words / 137.5) * 60;
  const pauses = commas * 0.12 + stops * 0.22;
  return Math.max(0, base + pauses);
}

function beatFits(
  text: string,
  maxWords: number,
  maxEstimatedSec: number,
  estimateSeconds: (text: string) => number,
) {
  return (
    wordCount(text) <= maxWords &&
    estimateSeconds(text) <= maxEstimatedSec
  );
}

/**
 * Force-split narration beats that still exceed word/time ceilings.
 * Prefer clause/comma splits. Mid-connective halves are disabled.
 */
export function forceSplitOversizedBeat(
  text: string,
  options: ForceSplitOversizedBeatOptions,
  depth = 0,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const estimateSeconds =
    options.estimateSeconds ?? estimateBeatNarrationSeconds;
  const { maxWords, maxEstimatedSec } = options;

  if (
    beatFits(trimmed, maxWords, maxEstimatedSec, estimateSeconds) ||
    depth > 6
  ) {
    return [trimmed];
  }

  const clauseParts = splitLongHookSentence(trimmed);
  if (clauseParts.length > 1) {
    return clauseParts.flatMap((part) =>
      forceSplitOversizedBeat(part, options, depth + 1),
    );
  }

  if (/,/.test(trimmed)) {
    const commaParts = trimmed
      .split(/(?<=,)\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (commaParts.length >= 2) {
      return commaParts.flatMap((part) =>
        forceSplitOversizedBeat(part, options, depth + 1),
      );
    }
  }

  // Prefer clause/comma boundaries only. Mid-connective splits ("than|the")
  // create fragile continuity joins — leave mildly-long beats whole.
  return [trimmed];
}
