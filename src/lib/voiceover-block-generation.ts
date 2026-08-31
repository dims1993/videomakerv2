/**
 * Provider-agnostic narration block synthesis: one TTS take → align → slice.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { NarrationBlockPlan } from "@/lib/narration-planner";
import {
  ensureNarrationBlocksDir,
  narrationBlockFileName,
  narrationBlockRelativePath,
  type NarrationBlockRecord,
  type NarrationBlockSegmentTiming,
} from "@/lib/voiceover-blocks";
import { validateNarrationBlockGeneration } from "@/lib/voiceover-block-validation";
import {
  planContinuityGroupSlices,
  synthesizeContinuityGroup,
} from "@/lib/voiceover-continuity-groups";
import {
  buildTtsStitchContext,
  truncateTtsStitchContext,
} from "@/lib/voiceover-continuity";
import { getTtsProviderLimits } from "@/lib/tts-provider-limits";

export type NarrationBlockSliceResult = {
  sceneId: string;
  audio: Buffer;
  durationSec: number;
  startTimeSec: number;
  endTimeSec: number;
};

export type NarrationBlockGenerationResult = {
  block: NarrationBlockPlan;
  blockAudioPath: string | null;
  slices: NarrationBlockSliceResult[];
  alignmentProvider: "whisperx" | "elevenlabs" | null;
  alignmentConfidence: number | null;
  validationIssues: string[];
};

export type PregenerateNarrationBlocksOptions = {
  videoId: string;
  blocks: NarrationBlockPlan[];
  minScenesForBlockTake?: number;
  language?: string;
  persistBlockAudio?: boolean;
  maxRetries?: number;
  synthesizeBlock: (
    block: NarrationBlockPlan,
    fullText: string,
    context: { previousText?: string },
  ) => Promise<Buffer>;
  onBlockComplete?: (
    result: NarrationBlockGenerationResult | null,
    block: NarrationBlockPlan,
  ) => void;
};

export type PregenerateNarrationBlocksResult = {
  audioBySceneId: Map<string, Buffer>;
  records: NarrationBlockRecord[];
  successfulBlockIds: Set<string>;
};

function blockRecordFromResult(
  result: NarrationBlockGenerationResult,
): NarrationBlockRecord {
  const segmentTimings: NarrationBlockSegmentTiming[] = result.slices.map(
    (slice) => ({
      sceneId: slice.sceneId,
      sortOrder:
        result.block.scenes.find((scene) => scene.sceneId === slice.sceneId)
          ?.sortOrder ?? 0,
      startTimeSec: slice.startTimeSec,
      endTimeSec: slice.endTimeSec,
    }),
  );
  return {
    index: result.block.index,
    blockId: result.block.blockId,
    provider: result.block.provider,
    voiceKey: result.block.voiceKey,
    voiceId: result.block.voiceId,
    audioPath: result.blockAudioPath,
    durationSec: result.slices.reduce(
      (max, slice) => Math.max(max, slice.endTimeSec),
      0,
    ),
    sceneIds: result.block.scenes.map((scene) => scene.sceneId),
    segmentTimings,
    alignmentProvider: result.alignmentProvider,
    alignmentConfidence: result.alignmentConfidence,
  };
}

async function generateOneNarrationBlock(opts: {
  videoId: string;
  block: NarrationBlockPlan;
  language?: string;
  persistBlockAudio: boolean;
  synthesizeBlock: PregenerateNarrationBlocksOptions["synthesizeBlock"];
  previousText?: string;
}): Promise<NarrationBlockGenerationResult | null> {
  const groupScenes = opts.block.scenes.map((scene) => ({
    id: scene.sceneId,
    scriptText: scene.scriptText,
    spokenText: scene.ttsText,
    voiceKey: opts.block.voiceKey,
  }));

  let blockAudioPath: string | null = null;

  const groupResult = await synthesizeContinuityGroup({
    scenes: groupScenes,
    label: opts.block.blockId,
    language: opts.language,
    synthesize: async (fullText) => {
      const audio = await opts.synthesizeBlock(opts.block, fullText, {
        previousText: opts.previousText,
      });
      if (opts.persistBlockAudio) {
        const fileName = narrationBlockFileName(opts.block.index);
        const filePath = path.join(
          await ensureNarrationBlocksDir(opts.videoId),
          fileName,
        );
        await writeFile(filePath, audio);
        blockAudioPath = narrationBlockRelativePath(opts.videoId, fileName);
      }
      return audio;
    },
  });

  if (!groupResult) {
    return null;
  }

  const slices: NarrationBlockSliceResult[] = groupResult.slices.map(
    (slice) => ({
      sceneId: slice.id,
      audio: slice.audio,
      durationSec: slice.durationSec,
      startTimeSec: slice.startSec,
      endTimeSec: slice.endSec,
    }),
  );

  const validation = validateNarrationBlockGeneration({
    block: opts.block,
    slices,
    totalDurationSec: groupResult.totalDurationSec,
    alignmentConfidence: groupResult.alignmentConfidence,
  });

  if (!validation.ok) {
    return {
      block: opts.block,
      blockAudioPath,
      slices,
      alignmentProvider: groupResult.alignmentProvider,
      alignmentConfidence: validation.confidence,
      validationIssues: validation.issues.map((issue) => issue.message),
    };
  }

  return {
    block: opts.block,
    blockAudioPath,
    slices,
    alignmentProvider: groupResult.alignmentProvider,
    alignmentConfidence: validation.confidence,
    validationIssues: [],
  };
}

/**
 * Synthesize multi-scene blocks as single TTS takes, align, validate, and slice.
 * Failed blocks are omitted (caller cold-synths those scenes).
 */
export async function pregenerateNarrationBlocks(
  opts: PregenerateNarrationBlocksOptions,
): Promise<PregenerateNarrationBlocksResult> {
  const minScenes = opts.minScenesForBlockTake ?? 2;
  const maxRetries = opts.maxRetries ?? 1;
  const persist = opts.persistBlockAudio !== false;
  const audioBySceneId = new Map<string, Buffer>();
  const records: NarrationBlockRecord[] = [];
  const successfulBlockIds = new Set<string>();
  const previousTextByVoiceKey = new Map<string, string>();

  if (persist) {
    await ensureNarrationBlocksDir(opts.videoId);
  }

  for (const block of opts.blocks) {
    if (block.scenes.length < minScenes) {
      opts.onBlockComplete?.(null, block);
      continue;
    }

    const limits = getTtsProviderLimits(block.provider);
    const stitchContext = buildTtsStitchContext({
      previousSpokenText: previousTextByVoiceKey.get(block.voiceKey),
      sameVoiceAsPrevious: true,
    });
    const previousText = limits.supportsInterBlockPreviousText
      ? stitchContext.previousText
      : truncateTtsStitchContext(
          previousTextByVoiceKey.get(block.voiceKey) ?? "",
        ) || undefined;

    let result: NarrationBlockGenerationResult | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      result = await generateOneNarrationBlock({
        videoId: opts.videoId,
        block,
        language: opts.language,
        persistBlockAudio: persist,
        synthesizeBlock: opts.synthesizeBlock,
        previousText: attempt === 0 ? previousText : undefined,
      });
      if (result && result.validationIssues.length === 0) {
        break;
      }
      if (attempt < maxRetries) {
        continue;
      }
    }

    if (!result || result.validationIssues.length > 0) {
      opts.onBlockComplete?.(result, block);
      continue;
    }

    successfulBlockIds.add(block.blockId);
    records.push(blockRecordFromResult(result));
    previousTextByVoiceKey.set(block.voiceKey, block.fullText);

    for (const slice of result.slices) {
      audioBySceneId.set(slice.sceneId, slice.audio);
    }

    opts.onBlockComplete?.(result, block);
  }

  return { audioBySceneId, records, successfulBlockIds };
}

export { planContinuityGroupSlices };

export function narrationBlockSegmentTimingsFromSlices(
  block: NarrationBlockPlan,
  slices: NarrationBlockSliceResult[],
): NarrationBlockSegmentTiming[] {
  return slices.map((slice) => ({
    sceneId: slice.sceneId,
    sortOrder:
      block.scenes.find((scene) => scene.sceneId === slice.sceneId)
        ?.sortOrder ?? 0,
    startTimeSec: slice.startTimeSec,
    endTimeSec: slice.endTimeSec,
  }));
}
