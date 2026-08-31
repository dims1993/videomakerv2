/**
 * Continuity Groups (architecture B).
 *
 * Instead of per-scene speak-and-trim (fragile cuts), we:
 * 1. Chain scenes that shouldBridgeProsody with the same voice
 * 2. Synthesize the concatenated text once
 * 3. Forced-align once
 * 4. Slice at word boundaries so each scene file is a contiguous extract
 *    of the same take (no previous-tail bleed, no eaten first words)
 *
 * Default OFF: WhisperX/ElevenLabs word timestamps are not reliable enough for
 * production cuts (next-phoneme bleed, overlaps, eaten attacks). Cold per-scene
 * TTS is preferred until we have a better join strategy.
 */

/** Kill-switch for one-take → align → slice grouping in generateVoiceoverForScenes. */
export const ENABLE_VOICEOVER_CONTINUITY_GROUPS = false;

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getAudioDurationSec, sliceMp3Buffer } from "@/lib/audio";
import type { AlignedWord } from "@/lib/subtitle-alignment";
import {
  alignContinuityAudioDetailed,
  normalizeContinuityToken,
  tokenizeContinuityText,
} from "@/lib/tts-continuity-synth";
import { shouldBridgeProsody } from "@/lib/voiceover-continuity";

/** Soft cap for one TTS request covering a whole continuity group. */
export const CONTINUITY_GROUP_MAX_CHARS = 2800;

export type ContinuityGroupScene = {
  /** Stable id (scene id or sort order key). */
  id: string;
  scriptText: string;
  spokenText: string;
  /** Voice identity — group breaks when this changes. */
  voiceKey: string;
};

export type ContinuityGroup = {
  scenes: ContinuityGroupScene[];
  fullText: string;
};

export type ContinuitySceneSlice = {
  id: string;
  startSec: number;
  durationSec: number;
  wordCount: number;
};

function tokensLooselyEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

/**
 * Partition ordered scenes into continuity groups.
 * A new group starts when voice changes, bridge breaks, or char budget overflows.
 */
export function buildContinuityGroups(
  scenes: ContinuityGroupScene[],
  options?: { maxChars?: number },
): ContinuityGroup[] {
  const maxChars = options?.maxChars ?? CONTINUITY_GROUP_MAX_CHARS;
  const groups: ContinuityGroup[] = [];
  let current: ContinuityGroupScene[] = [];

  const flush = () => {
    if (current.length === 0) return;
    groups.push({
      scenes: current,
      fullText: current
        .map((scene) => scene.spokenText.trim())
        .filter(Boolean)
        .join(" ")
        .trim(),
    });
    current = [];
  };

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i]!;
    if (!scene.spokenText.trim()) {
      flush();
      continue;
    }

    if (current.length === 0) {
      current.push(scene);
      continue;
    }

    const prev = current[current.length - 1]!;
    const canBridge =
      prev.voiceKey === scene.voiceKey &&
      shouldBridgeProsody(prev.scriptText, scene.scriptText);
    const joined = `${current.map((s) => s.spokenText.trim()).join(" ")} ${scene.spokenText.trim()}`.trim();

    if (!canBridge || joined.length > maxChars) {
      flush();
      current.push(scene);
      continue;
    }

    current.push(scene);
  }

  flush();
  return groups;
}

function computeAlignmentConfidence(opts: {
  words: AlignedWord[];
  scenes: Array<{ spokenText: string }>;
}): number | null {
  const expected = opts.scenes.reduce(
    (sum, scene) => sum + tokenizeContinuityText(scene.spokenText).length,
    0,
  );
  if (expected === 0) {
    return null;
  }
  const aligned = opts.words.filter(
    (word) => normalizeContinuityToken(word.word).length > 0,
  ).length;
  const ratio = aligned / expected;
  if (ratio < 0.7 || ratio > 1.35) {
    return Math.max(0, Math.min(1, 1 - Math.abs(1 - ratio)));
  }
  return Math.max(0.5, Math.min(1, 1 - Math.abs(1 - ratio) * 0.5));
}

/**
 * Map aligned words onto scene spoken texts.
 * Returns null when the alignment cannot be trusted for slicing.
 */
export function planContinuityGroupSlices(opts: {
  words: AlignedWord[];
  scenes: Array<{ id: string; spokenText: string }>;
  totalDurationSec: number;
}): ContinuitySceneSlice[] | null {
  const total = Math.max(0.05, opts.totalDurationSec);
  const aligned = opts.words
    .map((w) => ({
      start: w.start,
      end: w.end,
      tok: normalizeContinuityToken(w.word),
    }))
    .filter((w) => w.tok.length > 0 && Number.isFinite(w.start));

  if (aligned.length === 0 || opts.scenes.length === 0) {
    return null;
  }

  const sceneTokens = opts.scenes.map((scene) =>
    tokenizeContinuityText(scene.spokenText),
  );
  const totalExpected = sceneTokens.reduce((sum, t) => sum + t.length, 0);
  if (totalExpected === 0) {
    return null;
  }

  // Allow small aligner merge/split drift (±20% or ±4 words).
  if (
    aligned.length < totalExpected * 0.7 ||
    aligned.length > totalExpected * 1.35 + 4
  ) {
    return null;
  }

  let cursor = 0;
  /** Inclusive start time of each scene within the group audio. */
  const starts: number[] = [];
  /** Aligned index of each scene's first word (for boundary math). */
  const firstWordIndex: number[] = [];

  for (let s = 0; s < opts.scenes.length; s += 1) {
    const tokens = sceneTokens[s]!;
    if (tokens.length === 0) {
      return null;
    }
    if (cursor >= aligned.length) {
      return null;
    }

    // Snap to first token of this scene near the cursor.
    let found = -1;
    const searchTo = Math.min(aligned.length, cursor + 4);
    for (let i = cursor; i < searchTo; i += 1) {
      if (tokensLooselyEqual(tokens[0]!, aligned[i]!.tok)) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      // Try exact cursor if counts still line up.
      if (cursor + tokens.length <= aligned.length) {
        found = cursor;
      } else {
        return null;
      }
    }

    firstWordIndex.push(found);
    cursor = found + tokens.length;
  }

  // Boundaries: scene A ends where B begins (non-overlapping files).
  // Give B the entire inter-word gap so its consonant/vowel onset lives in B,
  // not as a stray phoneme at the end of A.
  //
  // WhisperX word.start is often late vs the real attack. Cutting at
  // bStart - 50ms left early onset in A whenever the attack started earlier
  // than that pad — the “next scene’s letter at the end of this clip” bug.
  // Prefer prevEnd when there is a gap; when stamps overlap, never push the
  // cut past bStart (that put B’s word body into A).
  starts.push(0);
  for (let s = 1; s < opts.scenes.length; s += 1) {
    const found = firstWordIndex[s]!;
    const bStart = aligned[found]!.start;
    const prevEnd =
      found > 0 && Number.isFinite(aligned[found - 1]!.end)
        ? aligned[found - 1]!.end
        : bStart;
    const gap = bStart - prevEnd;
    let cut: number;
    if (gap > 0) {
      // Clean gap: A keeps through previous word; silence + B onset → B.
      cut = prevEnd;
    } else {
      // Overlapping aligner stamps: stop A at B’s word.start (not prevEnd).
      cut = bStart;
    }
    cut = Math.max(0, Math.min(cut, bStart));
    starts.push(cut);
  }

  // Scene i occupies [starts[i], starts[i+1]) ; last → EOF.
  const slices: ContinuitySceneSlice[] = [];
  for (let s = 0; s < opts.scenes.length; s += 1) {
    const startSec = starts[s]!;
    const endSec =
      s + 1 < opts.scenes.length
        ? Math.max(startSec + 0.05, starts[s + 1]!)
        : total;
    const durationSec = Math.max(0.05, endSec - startSec);
    if (startSec >= total - 0.02) {
      return null;
    }
    slices.push({
      id: opts.scenes[s]!.id,
      startSec,
      durationSec: Math.min(durationSec, total - startSec),
      wordCount: sceneTokens[s]!.length,
    });
  }

  return slices;
}

async function sliceAudioBuffer(opts: {
  audio: Buffer;
  startSec: number;
  durationSec: number;
  label: string;
}): Promise<Buffer> {
  return sliceMp3Buffer({
    audio: opts.audio,
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    label: opts.label,
    tempPrefix: "vm-vo-group-",
  });
}

/**
 * Synthesize a continuity group once, align, and return per-scene audio buffers.
 * Returns null when alignment/slice fails — caller should cold-synth each scene.
 */
export async function synthesizeContinuityGroup(opts: {
  scenes: ContinuityGroupScene[];
  label?: string;
  language?: string;
  synthesize: (fullText: string) => Promise<Buffer>;
}): Promise<{
  fullText: string;
  alignmentProvider: "whisperx" | "elevenlabs" | null;
  alignmentConfidence: number | null;
  totalDurationSec: number;
  slices: Array<{
    id: string;
    audio: Buffer;
    durationSec: number;
    startSec: number;
    endSec: number;
  }>;
} | null> {
  const spoken = opts.scenes
    .map((scene) => scene.spokenText.trim())
    .filter(Boolean);
  if (spoken.length < 2) {
    return null;
  }

  const fullText = spoken.join(" ").trim();
  if (!fullText || fullText.length > CONTINUITY_GROUP_MAX_CHARS) {
    return null;
  }

  const audio = await opts.synthesize(fullText);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "vm-vo-group-align-"));
  const probePath = path.join(tempRoot, "group.mp3");
  try {
    await writeFile(probePath, audio);
    const totalDurationSec = (await getAudioDurationSec(probePath)) ?? 0;
    if (!(totalDurationSec > 0.15)) {
      return null;
    }

    const alignment = await alignContinuityAudioDetailed({
      audioFilePath: probePath,
      text: fullText,
      language: opts.language,
    });
    const words = alignment.words;
    const plan = planContinuityGroupSlices({
      words,
      scenes: opts.scenes.map((scene) => ({
        id: scene.id,
        spokenText: scene.spokenText,
      })),
      totalDurationSec,
    });
    if (!plan || plan.length !== opts.scenes.length) {
      return null;
    }

    const alignmentConfidence = computeAlignmentConfidence({
      words,
      scenes: opts.scenes,
    });

    const slices: Array<{
      id: string;
      audio: Buffer;
      durationSec: number;
      startSec: number;
      endSec: number;
    }> = [];
    for (const slice of plan) {
      const piece = await sliceAudioBuffer({
        audio,
        startSec: slice.startSec,
        durationSec: slice.durationSec,
        label: `${opts.label ?? "group"}-${slice.id}`.slice(0, 40),
      });
      const durationSec =
        (await getAudioDurationSec(
          await (async () => {
            const p = path.join(tempRoot, `${slice.id}.mp3`);
            await writeFile(p, piece);
            return p;
          })(),
        )) ?? slice.durationSec;
      const endSec = slice.startSec + durationSec;
      slices.push({
        id: slice.id,
        audio: piece,
        durationSec,
        startSec: slice.startSec,
        endSec,
      });
    }

    return {
      fullText,
      alignmentProvider: alignment.provider,
      alignmentConfidence,
      totalDurationSec,
      slices,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
