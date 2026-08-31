/**
 * Post-generation checks for narration blocks (provider-agnostic).
 *
 * Duration vs. script estimate is intentionally NOT a gate — WPM varies widely
 * by voice, provider speed, and delivery style. Alignment + slice integrity only.
 */

import type { NarrationBlockPlan } from "@/lib/narration-planner";
import { tokenizeContinuityText } from "@/lib/tts-continuity-synth";
import { estimateBeatNarrationSeconds } from "@/lib/visual-plan-dense-beats";

export type NarrationBlockSliceLike = {
  sceneId: string;
  durationSec: number;
  startTimeSec: number;
  endTimeSec: number;
};

export type NarrationBlockValidationIssue = {
  code: string;
  message: string;
};

export type NarrationBlockValidationResult = {
  ok: boolean;
  issues: NarrationBlockValidationIssue[];
  confidence: number | null;
};

const MIN_SLICE_SEC = 0.05;
const MIN_ALIGNMENT_CONFIDENCE = 0.35;

export function validateNarrationBlockGeneration(opts: {
  block: NarrationBlockPlan;
  slices: NarrationBlockSliceLike[];
  totalDurationSec: number;
  alignmentConfidence?: number | null;
}): NarrationBlockValidationResult {
  const issues: NarrationBlockValidationIssue[] = [];

  if (opts.slices.length !== opts.block.scenes.length) {
    issues.push({
      code: "slice_count_mismatch",
      message: `Expected ${opts.block.scenes.length} slices, got ${opts.slices.length}.`,
    });
  }

  if (!(opts.totalDurationSec > MIN_SLICE_SEC)) {
    issues.push({
      code: "empty_block_audio",
      message: "Block audio duration is too short or zero.",
    });
  }

  for (const slice of opts.slices) {
    if (!(slice.durationSec > MIN_SLICE_SEC)) {
      issues.push({
        code: "empty_slice",
        message: `Scene ${slice.sceneId} slice duration is too short.`,
      });
    }
  }

  const wordCount = tokenizeContinuityText(opts.block.fullText).length;
  const expectedWords = opts.block.scenes.reduce(
    (sum, scene) => sum + tokenizeContinuityText(scene.ttsText).length,
    0,
  );
  let confidence = opts.alignmentConfidence ?? null;
  if (confidence == null && expectedWords > 0 && wordCount > 0) {
    const ratio = wordCount / expectedWords;
    confidence = Math.max(0, Math.min(1, 1 - Math.abs(1 - ratio) * 0.75));
  }

  if (confidence != null && confidence < MIN_ALIGNMENT_CONFIDENCE) {
    issues.push({
      code: "low_alignment_confidence",
      message: `Alignment confidence ${confidence.toFixed(2)} is below threshold.`,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    confidence,
  };
}

export function estimateBlockDurationSec(block: NarrationBlockPlan): number {
  return estimateBeatNarrationSeconds(block.fullText);
}
