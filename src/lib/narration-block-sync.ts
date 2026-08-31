/**
 * Audio-first pause plan for narration blocks.
 * Intra-block: 0 ms (prosody from single TTS take).
 * Inter-block: soft gap at natural boundaries.
 */

import type { NarrationBlockPlan } from "@/lib/narration-planner";
import { suggestPunctuationPauseAfterMs } from "@/lib/voiceover-punctuation-pause";

/** No stitch silence between scenes inside the same block take. */
export const NARRATION_INTRA_BLOCK_PAUSE_MS = 0;

/** Minimum gap between separate block takes (same or different voice). */
export const NARRATION_INTER_BLOCK_PAUSE_MS = 80;

export type NarrationBlockPausePlanInput = {
  blocks: NarrationBlockPlan[];
  /** blockId values that were successfully generated and sliced. */
  successfulBlockIds: Set<string>;
  /** Last sortOrder in the full video (for end-of-video punctuation). */
  lastSortOrder: number;
};

export function interBlockPauseAfterMs(scriptText: string): number {
  const punctuation = suggestPunctuationPauseAfterMs(scriptText);
  return Math.max(NARRATION_INTER_BLOCK_PAUSE_MS, punctuation);
}

/**
 * Scene pauseAfterMs when narration blocks succeeded.
 * Scenes not in a successful multi-scene block are omitted from the map.
 */
export function buildNarrationBlockPausePlan(
  input: NarrationBlockPausePlanInput,
): Map<string, number> {
  const plan = new Map<string, number>();
  const blockBySceneId = new Map<string, NarrationBlockPlan>();

  for (const block of input.blocks) {
    if (!input.successfulBlockIds.has(block.blockId)) {
      continue;
    }
    if (block.scenes.length < 2) {
      continue;
    }
    for (const scene of block.scenes) {
      blockBySceneId.set(scene.sceneId, block);
    }
  }

  for (const block of input.blocks) {
    if (!input.successfulBlockIds.has(block.blockId) || block.scenes.length < 2) {
      continue;
    }

    for (let i = 0; i < block.scenes.length; i += 1) {
      const scene = block.scenes[i]!;
      const isLastInBlock = i === block.scenes.length - 1;
      if (!isLastInBlock) {
        plan.set(scene.sceneId, NARRATION_INTRA_BLOCK_PAUSE_MS);
        continue;
      }

      const isLastInVideo = scene.sortOrder >= input.lastSortOrder;
      if (isLastInVideo) {
        plan.set(scene.sceneId, suggestPunctuationPauseAfterMs(scene.scriptText));
        continue;
      }

      plan.set(scene.sceneId, interBlockPauseAfterMs(scene.scriptText));
    }
  }

  return plan;
}

export function sceneIsInSuccessfulNarrationBlock(
  sceneId: string,
  input: NarrationBlockPausePlanInput,
): boolean {
  return buildNarrationBlockPausePlan(input).has(sceneId);
}
