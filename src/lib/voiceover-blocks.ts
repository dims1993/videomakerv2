/**
 * Narration block storage paths and feature flag.
 * Blocks are provider-agnostic multi-scene TTS takes (~10–30 s).
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { TtsVoiceProvider } from "@/lib/tts-voices";

/** Enable multi-scene narration blocks. Default ON; set ENABLE_NARRATION_BLOCKS=0 to disable. */
export function isNarrationBlocksEnabled(): boolean {
  const raw = process.env.ENABLE_NARRATION_BLOCKS?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") {
    return false;
  }
  return true;
}

function storageRoot() {
  return path.join(process.cwd(), "storage");
}

export function narrationBlocksDir(videoId: string) {
  return path.join(storageRoot(), "voiceovers", videoId, "blocks");
}

export function narrationBlockFileName(blockIndex: number) {
  const padded = String(blockIndex + 1).padStart(3, "0");
  return `narration_block_${padded}.mp3`;
}

export function narrationBlockRelativePath(videoId: string, fileName: string) {
  return path.join("storage", "voiceovers", videoId, "blocks", fileName);
}

export async function ensureNarrationBlocksDir(videoId: string) {
  const directory = narrationBlocksDir(videoId);
  await mkdir(directory, { recursive: true });
  return directory;
}

/** Persisted segment timing within a block (optional JSON on Video later). */
export type NarrationBlockSegmentTiming = {
  sceneId: string;
  sortOrder: number;
  startTimeSec: number;
  endTimeSec: number;
};

export type NarrationBlockRecord = {
  index: number;
  blockId: string;
  provider: TtsVoiceProvider | string;
  voiceKey: string;
  voiceId: string;
  audioPath?: string | null;
  durationSec?: number | null;
  sceneIds: string[];
  segmentTimings?: NarrationBlockSegmentTiming[];
  alignmentProvider?: "whisperx" | "elevenlabs" | null;
  alignmentConfidence?: number | null;
};
