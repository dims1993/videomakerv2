/**
 * Universal TTS continuity (all providers).
 *
 * Providers without native previous_text (Google, Fish, Speechify, Chatterbox)
 * cannot keep prosody across cold per-scene calls. The shared method:
 * 1. Synthesize previous + body as one utterance (previous only — never next)
 * 2. Forced-align the known text (WhisperX, else ElevenLabs)
 * 3. Trim at the aligned onset of the body; keep audio through EOF
 *
 * Weight-based trim is never used for production cuts — it left previous-tail
 * bleed that sounded like overlapping/repeated last words on hard joins.
 * If alignment fails, re-synthesize body alone (cold start, no echo).
 */


import { getAudioDurationSec, sliceMp3Buffer } from "@/lib/audio";
import {
  alignElevenLabsAudioWithText,
} from "@/lib/elevenlabs";
import { ensureLocalServerReady } from "@/lib/local-server-lifecycle";
import {
  normalizeElevenLabsAlignment,
  type AlignedWord,
} from "@/lib/subtitle-alignment";
import { estimateBeatNarrationSeconds } from "@/lib/visual-plan-dense-beats";
import {
  TTS_STITCH_CONTEXT_MAX_CHARS,
  truncateTtsStitchContext,
} from "@/lib/voiceover-continuity";
import {
  alignWhisperXAudioWithText,
  checkWhisperXHealth,
  normalizeWhisperXAlignment,
} from "@/lib/whisperx";

/** Soft cap so context+body stays inside typical TTS request limits. */
export const UNIVERSAL_CONTINUITY_MAX_CHARS = 2200;

/**
 * Forced-align word `start` often lands after the consonant attack.
 * Lead-in is taken only from silence after the previous word when possible.
 * Hard cap: never keep more than MAX_PREV_BLEED_SEC of the previous word
 * (that was the “repeated ending” artifact).
 */
const BODY_LEAD_IN_SEC = 0.12;
const AFTER_PREV_PAD_SEC = 0.008;
/** Absolute max of previous-word tail allowed in the body clip. */
const MAX_PREV_BLEED_SEC = 0.03;

/**
 * Choose cut time given previous-word and body-word alignment stamps.
 */
export function planAlignedBodyCutSec(opts: {
  previousStart: number;
  previousEnd: number;
  bodyStart: number;
  totalDurationSec: number;
}): number | null {
  const total = Math.max(0.05, opts.totalDurationSec);
  const clamp = (sec: number) =>
    Math.min(Math.max(0, sec), Math.max(0, total - 0.05));

  const prevEnd = Math.max(opts.previousStart, opts.previousEnd);
  const bodyStart = opts.bodyStart;
  if (!Number.isFinite(prevEnd) || !Number.isFinite(bodyStart)) {
    return null;
  }

  const gap = bodyStart - prevEnd;
  let startSec: number;

  if (gap >= BODY_LEAD_IN_SEC) {
    // Wide silence: lead-in stays inside the gap.
    startSec = bodyStart - BODY_LEAD_IN_SEC;
  } else if (gap > 0) {
    // Narrow silence: sit in the gap, closer to body for the attack.
    startSec = Math.max(
      prevEnd + AFTER_PREV_PAD_SEC,
      bodyStart - Math.min(BODY_LEAD_IN_SEC, gap * 0.7),
    );
  } else {
    // Overlapping stamps: keep body onset; allow only a tiny previous coda.
    startSec = Math.max(bodyStart - 0.02, prevEnd - MAX_PREV_BLEED_SEC);
  }

  // Never keep more than MAX_PREV_BLEED_SEC of the previous word.
  startSec = Math.max(startSec, prevEnd - MAX_PREV_BLEED_SEC);
  startSec = clamp(startSec);

  if (!(startSec > 0.015) || startSec >= total - 0.05) {
    return null;
  }
  return startSec;
}


export type ContinuityTrimWindow = {
  /** Inclusive start of the body segment (seconds). */
  startSec: number;
  /** Body duration (seconds) — always through EOF of the synth. */
  durationSec: number;
  /** Full synthesized duration used for planning. */
  totalDurationSec: number;
  usedPrevious: boolean;
  usedNext: boolean;
  /** How the cut was chosen. */
  method: "alignment" | "weight_fallback" | "none";
};

export function narrationWeight(text: string): number {
  const clean = text.trim();
  if (!clean) {
    return 0;
  }
  return Math.max(0.05, estimateBeatNarrationSeconds(clean));
}

export function normalizeContinuityToken(word: string): string {
  return word
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/[^a-z0-9']/g, "");
}

export function tokenizeContinuityText(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map(normalizeContinuityToken)
    .filter(Boolean);
}

function tokensLooselyEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // WhisperX sometimes splits/merges (e.g. "don't" vs "dont").
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

/**
 * Find where `bodyText` begins inside forced-aligned previous+body audio.
 * Returns null when the boundary cannot be trusted.
 */
export function findBodyOnsetSecFromAlignment(opts: {
  words: AlignedWord[];
  previousText: string;
  bodyText: string;
  totalDurationSec: number;
}): number | null {
  const previousTokens = tokenizeContinuityText(opts.previousText);
  const bodyTokens = tokenizeContinuityText(opts.bodyText);
  const aligned = opts.words
    .map((w) => ({
      start: w.start,
      end: w.end,
      tok: normalizeContinuityToken(w.word),
    }))
    .filter((w) => w.tok.length > 0 && Number.isFinite(w.start));

  if (
    !previousTokens.length ||
    !bodyTokens.length ||
    aligned.length < bodyTokens.length
  ) {
    return null;
  }

  const total = Math.max(0.05, opts.totalDurationSec);
  const clamp = (sec: number) =>
    Math.min(Math.max(0, sec), Math.max(0, total - 0.05));

  const bodyMatchesAt = (index: number) => {
    if (index < 0 || index + bodyTokens.length > aligned.length) {
      return false;
    }
    // Require the first 1–3 body tokens to match (enough to trust onset).
    const check = Math.min(3, bodyTokens.length);
    for (let j = 0; j < check; j += 1) {
      if (!tokensLooselyEqual(bodyTokens[j]!, aligned[index + j]!.tok)) {
        return false;
      }
    }
    return true;
  };

  const previousEndsAt = (bodyIndex: number) => {
    if (bodyIndex <= 0) return previousTokens.length === 0;
    const prevAligned = aligned[bodyIndex - 1]!;
    const lastPrev = previousTokens[previousTokens.length - 1]!;
    return tokensLooselyEqual(lastPrev, prevAligned.tok);
  };

  const expectedIndex = previousTokens.length;
  const candidates: number[] = [];
  if (bodyMatchesAt(expectedIndex)) {
    candidates.push(expectedIndex);
  }
  for (
    let i = 0;
    i <= aligned.length - bodyTokens.length;
    i += 1
  ) {
    if (i === expectedIndex) continue;
    if (!bodyMatchesAt(i)) continue;
    // Prefer boundaries near the expected previous word count.
    if (Math.abs(i - expectedIndex) <= 3 || previousEndsAt(i)) {
      candidates.push(i);
    }
  }

  if (candidates.length === 0) {
    // Last resort: first place the opening body token appears after ~40% of
    // previous words have been consumed.
    const minIndex = Math.max(0, Math.floor(previousTokens.length * 0.4));
    const firstBody = bodyTokens[0]!;
    for (let i = minIndex; i < aligned.length; i += 1) {
      if (
        tokensLooselyEqual(firstBody, aligned[i]!.tok) &&
        bodyMatchesAt(i)
      ) {
        candidates.push(i);
        break;
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(
    (a, b) => Math.abs(a - expectedIndex) - Math.abs(b - expectedIndex),
  );
  const bodyIndex = candidates[0]!;
  const bodyWord = aligned[bodyIndex]!;
  if (bodyIndex <= 0) {
    // No previous word in the alignment — keep from body onset with lead-in.
    const startSec = clamp(Math.max(0.02, bodyWord.start - BODY_LEAD_IN_SEC));
    if (startSec >= total - 0.05) return null;
    return startSec;
  }

  const prevWord = aligned[bodyIndex - 1]!;
  return planAlignedBodyCutSec({
    previousStart: prevWord.start,
    previousEnd: prevWord.end,
    bodyStart: bodyWord.start,
    totalDurationSec: total,
  });
}

/**
 * Legacy weight planner — kept for tests/diagnostics only.
 * Do not use for production continuity cuts.
 */
export function planContinuityTrimWindow(opts: {
  previousText?: string | null;
  bodyText: string;
  nextText?: string | null;
  totalDurationSec: number;
}): ContinuityTrimWindow {
  const previous = opts.previousText?.trim() ?? "";
  const body = opts.bodyText.trim();
  const totalDurationSec = Math.max(0.05, opts.totalDurationSec);

  if (!previous) {
    return {
      startSec: 0,
      durationSec: totalDurationSec,
      totalDurationSec,
      usedPrevious: false,
      usedNext: false,
      method: "none",
    };
  }

  const prevW = narrationWeight(previous);
  const bodyW = narrationWeight(body);
  const sum = Math.max(0.05, prevW + bodyW);
  const startSec = Math.min(
    (prevW / sum) * totalDurationSec,
    totalDurationSec * 0.85,
  );
  const durationSec = Math.max(0.05, totalDurationSec - startSec);

  return {
    startSec,
    durationSec,
    totalDurationSec,
    usedPrevious: true,
    usedNext: false,
    method: "weight_fallback",
  };
}

export function buildContinuitySynthesisText(opts: {
  previousText?: string | null;
  bodyText: string;
  /** Ignored — appending next caused end-trims that cut unfinished lines. */
  nextText?: string | null;
  maxChars?: number;
}): {
  fullText: string;
  previousText: string;
  bodyText: string;
  nextText: string;
  usedContext: boolean;
} {
  const maxChars = opts.maxChars ?? UNIVERSAL_CONTINUITY_MAX_CHARS;
  const bodyText = opts.bodyText.trim();
  let previousText = opts.previousText?.trim()
    ? truncateTtsStitchContext(opts.previousText, TTS_STITCH_CONTEXT_MAX_CHARS)
    : "";

  const fit = (prev: string) =>
    [prev, bodyText].filter(Boolean).join(" ").trim();

  let fullText = fit(previousText);
  if (fullText.length > maxChars && previousText) {
    previousText = "";
    fullText = bodyText;
  }
  if (fullText.length > maxChars) {
    fullText = bodyText;
    previousText = "";
  }

  return {
    fullText: fullText || bodyText,
    previousText,
    bodyText,
    nextText: "",
    usedContext: Boolean(previousText),
  };
}

async function trimAudioBufferToWindow(opts: {
  audio: Buffer;
  startSec: number;
  durationSec: number;
  label: string;
}): Promise<Buffer> {
  // Short fade-in masks any ≤30ms previous coda at hard joins.
  const fadeIn = Math.min(0.025, Math.max(0.01, opts.durationSec * 0.08));
  return sliceMp3Buffer({
    audio: opts.audio,
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    label: opts.label,
    tempPrefix: "vm-tts-cont-",
    audioFilter: `afade=t=in:st=0:d=${fadeIn.toFixed(3)}`,
  });
}

let whisperxEnsurePromise: Promise<boolean> | null = null;

async function ensureWhisperXAvailable(): Promise<boolean> {
  const health = await checkWhisperXHealth();
  if (health.ok) {
    return true;
  }
  if (!whisperxEnsurePromise) {
    whisperxEnsurePromise = ensureLocalServerReady("whisperx")
      .then(() => true)
      .catch(() => false);
  }
  return whisperxEnsurePromise;
}

export async function alignContinuityAudio(opts: {
  audioFilePath: string;
  text: string;
  language?: string;
}): Promise<AlignedWord[]> {
  const detailed = await alignContinuityAudioDetailed(opts);
  return detailed.words;
}

export async function alignContinuityAudioDetailed(opts: {
  audioFilePath: string;
  text: string;
  language?: string;
}): Promise<{
  words: AlignedWord[];
  provider: "whisperx" | "elevenlabs" | null;
}> {
  const text = opts.text.trim();
  if (!text) {
    return { words: [], provider: null };
  }

  if (await ensureWhisperXAvailable()) {
    try {
      const raw = await alignWhisperXAudioWithText({
        audioFilePath: opts.audioFilePath,
        text,
        language: opts.language,
      });
      const words = normalizeWhisperXAlignment(raw);
      if (words.length > 0) {
        return { words, provider: "whisperx" };
      }
    } catch {
      // fall through to ElevenLabs
    }
  }

  try {
    const raw = await alignElevenLabsAudioWithText({
      audioFilePath: opts.audioFilePath,
      text,
    });
    const words = normalizeElevenLabsAlignment(raw);
    return { words, provider: words.length > 0 ? "elevenlabs" : null };
  } catch {
    return { words: [], provider: null };
  }
}

/**
 * @deprecated Prefer Continuity Groups (`voiceover-continuity-groups`).
 * This function now cold-synthesizes body only (no speak-and-trim).
 * Kept so call sites compile until fully migrated.
 */
export async function synthesizeWithUniversalContinuity(opts: {
  bodyText: string;
  previousText?: string | null;
  nextText?: string | null;
  maxChars?: number;
  label?: string;
  language?: string;
  synthesize: (fullText: string) => Promise<Buffer>;
}): Promise<{
  audio: Buffer;
  usedContext: boolean;
  fullText: string;
  trimMethod: ContinuityTrimWindow["method"];
}> {
  const bodyText = opts.bodyText.trim();
  const audio = await opts.synthesize(bodyText);
  return {
    audio,
    usedContext: false,
    fullText: bodyText,
    trimMethod: "none",
  };
}
