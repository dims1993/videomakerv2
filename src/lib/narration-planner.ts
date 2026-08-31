/**
 * Narration block planner — groups scenes into ~10–30 s TTS takes.
 * Provider-agnostic: limits come from tts-provider-limits.ts.
 */

import {
  buildTtsVoiceKey,
  getTtsProviderLimits,
  type TtsProviderLimits,
} from "@/lib/tts-provider-limits";
import type { TtsVoiceProvider } from "@/lib/tts-voices";
import { estimateBeatNarrationSeconds } from "@/lib/visual-plan-dense-beats";
import {
  endsIncompleteForProsody,
  shouldBridgeProsody,
} from "@/lib/voiceover-continuity";

export type NarrationPlannerScene = {
  sceneId: string;
  sortOrder: number;
  scriptText: string;
  /** Clean spoken text (no acting tags). */
  spokenText: string;
  /** Exact text sent to the TTS provider for this scene. */
  ttsText: string;
  provider: TtsVoiceProvider | string;
  voiceId: string;
  voiceKey: string;
  hasActingCues: boolean;
  usesFishSpeechTags: boolean;
  skipVoiceover?: boolean;
};

export type NarrationBlockSceneRef = {
  sceneId: string;
  sortOrder: number;
  scriptText: string;
  spokenText: string;
  ttsText: string;
};

export type NarrationBlockPlan = {
  index: number;
  blockId: string;
  provider: TtsVoiceProvider | string;
  voiceKey: string;
  voiceId: string;
  scenes: NarrationBlockSceneRef[];
  /** Joined ttsText for the block TTS call. */
  fullText: string;
  estimatedDurationSec: number;
  charCount: number;
};

export type NarrationPlannerOptions = {
  resolveLimits?: (provider: TtsVoiceProvider | string) => TtsProviderLimits;
};

function joinBlockTtsText(scenes: NarrationPlannerScene[]): string {
  return scenes
    .map((scene) => scene.ttsText.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function endsNaturalSpeechBreak(scriptText: string): boolean {
  return !endsIncompleteForProsody(scriptText);
}

function sceneBreaksBlock(prev: NarrationPlannerScene, next: NarrationPlannerScene) {
  if (prev.voiceKey !== next.voiceKey) {
    return true;
  }
  if (prev.provider !== next.provider) {
    return true;
  }
  if (prev.hasActingCues !== next.hasActingCues) {
    return true;
  }
  if (prev.usesFishSpeechTags !== next.usesFishSpeechTags) {
    return true;
  }
  return false;
}

function exceedsHardLimits(
  joinedText: string,
  sceneCount: number,
  limits: TtsProviderLimits,
): boolean {
  if (joinedText.length > limits.maxCharsPerRequest) {
    return true;
  }
  if (sceneCount > limits.maxScenesPerBlock) {
    return true;
  }
  if (estimateBeatNarrationSeconds(joinedText) > limits.maxEstimatedDurationSec) {
    return true;
  }
  return false;
}

function shouldFlushAtNaturalBoundary(
  current: NarrationPlannerScene[],
  next: NarrationPlannerScene,
  limits: TtsProviderLimits,
): boolean {
  if (current.length === 0) {
    return false;
  }
  const prev = current[current.length - 1]!;
  const currentText = joinBlockTtsText(current);
  const currentDuration = estimateBeatNarrationSeconds(currentText);

  if (currentDuration < limits.targetMinDurationSec) {
    return false;
  }

  if (shouldBridgeProsody(prev.scriptText, next.scriptText)) {
    return false;
  }

  if (!endsNaturalSpeechBreak(prev.scriptText)) {
    return false;
  }

  const joinedDuration = estimateBeatNarrationSeconds(
    joinBlockTtsText([...current, next]),
  );

  if (joinedDuration > limits.targetMaxDurationSec) {
    return true;
  }

  return endsNaturalSpeechBreak(prev.scriptText);
}

function toBlockPlan(
  index: number,
  scenes: NarrationPlannerScene[],
): NarrationBlockPlan {
  const first = scenes[0]!;
  const fullText = joinBlockTtsText(scenes);
  return {
    index,
    blockId: `nb_${index + 1}_${first.sceneId.slice(0, 8)}`,
    provider: first.provider,
    voiceKey: first.voiceKey,
    voiceId: first.voiceId,
    scenes: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sortOrder: scene.sortOrder,
      scriptText: scene.scriptText,
      spokenText: scene.spokenText,
      ttsText: scene.ttsText,
    })),
    fullText,
    estimatedDurationSec: estimateBeatNarrationSeconds(fullText),
    charCount: fullText.length,
  };
}

/**
 * Partition ordered scenes into narration blocks for one-TTS-take synthesis.
 * Skips scenes with skipVoiceover or empty ttsText.
 */
export function planNarrationBlocks(
  scenes: NarrationPlannerScene[],
  options: NarrationPlannerOptions = {},
): NarrationBlockPlan[] {
  const resolveLimits =
    options.resolveLimits ?? ((provider) => getTtsProviderLimits(provider));
  const blocks: NarrationBlockPlan[] = [];
  let current: NarrationPlannerScene[] = [];
  let blockIndex = 0;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    blocks.push(toBlockPlan(blockIndex, current));
    blockIndex += 1;
    current = [];
  };

  for (const scene of scenes) {
    if (scene.skipVoiceover || !scene.ttsText.trim()) {
      flush();
      continue;
    }

    if (current.length === 0) {
      current.push(scene);
      continue;
    }

    const prev = current[current.length - 1]!;

    if (sceneBreaksBlock(prev, scene)) {
      flush();
      current.push(scene);
      continue;
    }

    const limits = resolveLimits(prev.provider);
    const joinedText = joinBlockTtsText([...current, scene]);

    if (exceedsHardLimits(joinedText, current.length + 1, limits)) {
      flush();
      current.push(scene);
      continue;
    }

    if (shouldFlushAtNaturalBoundary(current, scene, limits)) {
      flush();
      current.push(scene);
      continue;
    }

    current.push(scene);
  }

  flush();
  return blocks;
}

/** Helper for callers building planner scenes. */
export function narrationPlannerSceneFromVoice(opts: {
  sceneId: string;
  sortOrder: number;
  scriptText: string;
  spokenText: string;
  ttsText: string;
  provider: TtsVoiceProvider | string;
  voiceId: string;
  hasActingCues?: boolean;
  usesFishSpeechTags?: boolean;
  skipVoiceover?: boolean;
}): NarrationPlannerScene {
  return {
    sceneId: opts.sceneId,
    sortOrder: opts.sortOrder,
    scriptText: opts.scriptText,
    spokenText: opts.spokenText,
    ttsText: opts.ttsText,
    provider: opts.provider,
    voiceId: opts.voiceId,
    voiceKey: buildTtsVoiceKey(opts.provider, opts.voiceId),
    hasActingCues: opts.hasActingCues ?? false,
    usesFishSpeechTags: opts.usesFishSpeechTags ?? false,
    skipVoiceover: opts.skipVoiceover ?? false,
  };
}
