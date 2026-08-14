import path from "node:path";

import {
  assertFfmpegOk,
  runFfmpeg,
} from "@/lib/render/ffmpeg";
import {
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  parseVoiceSoundBarsStyle,
  type VoiceSoundBarsStyleId,
} from "@/lib/render/voice-sound-bars-shared";

export type { VoiceSoundBarsStyleId } from "@/lib/render/voice-sound-bars-shared";
export {
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  VOICE_SOUND_BARS_STYLE_OPTIONS,
  parseVoiceSoundBarsStyle,
} from "@/lib/render/voice-sound-bars-shared";

/** Fixed look: solid white bars, mid-frame, leave bottom free for captions. */
export const VOICE_SOUND_BARS_WIDTH = 980;
export const VOICE_SOUND_BARS_HEIGHT = 320;
/** Pixels above vertical center so captions at bottom stay clear. */
export const VOICE_SOUND_BARS_CENTER_Y_OFFSET = 120;

/**
 * Visualizer frame rate — below video fps for chunkier motion.
 * Must NOT be followed by an unbounded fps upsample against an infinite still
 * loop (that deadlocks FFmpeg); both legs are duration-trimmed instead.
 */
export const VOICE_SOUND_BARS_VIS_RATE = 15;

/**
 * Clean-pulse drive chain: strip rumble/sibilance, compress peaks, gate silence.
 * Visualizer then sees a speech envelope — not every fricative.
 */
export function buildCleanPulseDriveAudioFilter(durationSec: number) {
  const d = Math.max(0.05, durationSec).toFixed(3);
  return [
    `atrim=0:${d}`,
    `apad=whole_dur=${d}`,
    "asetpts=N/SR/TB",
    "aformat=channel_layouts=mono",
    "highpass=f=120",
    "lowpass=f=4200",
    // Soft knee compressor: tame peaks, lift body.
    "acompressor=threshold=-28dB:ratio=4:attack=30:release=300:makeup=2:knee=8",
    // Soft gate — avoid near-total silence that can stall showwaves.
    "agate=threshold=0.02:ratio=2:attack=10:release=200",
  ].join(",");
}

export type VoiceSoundBarsEligibilityInput = {
  voiceSoundBarsEnabled: boolean;
  mediaKind: "image" | "video";
  scriptText?: string | null;
  voiceoverLocalPath?: string | null;
  isMusicBed: boolean;
  /** PART_COVER title cards — no bars (narration is the title itself). */
  isPartCover?: boolean;
};

/**
 * Spoken stills only — skip attached clips, music beds, PART covers, empty bumpers.
 */
export function shouldAttachVoiceSoundBars(
  input: VoiceSoundBarsEligibilityInput,
): boolean {
  if (!input.voiceSoundBarsEnabled) {
    return false;
  }
  if (input.mediaKind !== "image") {
    return false;
  }
  if (input.isMusicBed) {
    return false;
  }
  if (input.isPartCover) {
    return false;
  }
  if (!input.scriptText?.trim()) {
    return false;
  }
  if (!input.voiceoverLocalPath?.trim()) {
    return false;
  }
  return true;
}

/**
 * FFmpeg showwaves filter for `cline` only.
 * Styles `bars` / `bars2` use the Node envelope analyzer + PNG overlay.
 */
export function waveVisualizerFilter(
  style: VoiceSoundBarsStyleId,
  barsWidth: number,
  barsHeight: number,
  visRate: number = VOICE_SOUND_BARS_VIS_RATE,
) {
  switch (style) {
    case "cline":
      return [
        "aformat=channel_layouts=mono",
        `showwaves=s=${barsWidth}x${barsHeight}:mode=cline:colors=white:rate=${visRate}:scale=cbrt`,
        "format=rgba",
      ].join(",");
    case "bars":
    case "bars2":
      throw new Error(
        `voice sound bars style '${style}' uses the envelope overlay path, not showwaves`,
      );
    default:
      throw new Error(`Unsupported voice sound bars style: ${String(style)}`);
  }
}

/**
 * Finite still + finite waves. Trimming both legs avoids the classic FFmpeg hang
 * of `-loop 1` infinite video vs showwaves/overlay=shortest.
 */
export function buildVoiceSoundBarsFilterComplex(options: {
  fitFilter: string;
  fps: number;
  durationSec: number;
  barsWidth?: number;
  barsHeight?: number;
  centerYOffset?: number;
  style?: VoiceSoundBarsStyleId;
  visRate?: number;
}) {
  const barsWidth = options.barsWidth ?? VOICE_SOUND_BARS_WIDTH;
  const barsHeight = options.barsHeight ?? VOICE_SOUND_BARS_HEIGHT;
  const centerYOffset =
    options.centerYOffset ?? VOICE_SOUND_BARS_CENTER_Y_OFFSET;
  const style = parseVoiceSoundBarsStyle(
    options.style,
    DEFAULT_VOICE_SOUND_BARS_STYLE,
  );
  if (style === "bars" || style === "bars2") {
    throw new Error(
      "buildVoiceSoundBarsFilterComplex does not support envelope bar styles; use renderEnvelopeBarsOverlay",
    );
  }
  const visRate = options.visRate ?? VOICE_SOUND_BARS_VIS_RATE;
  const duration = Math.max(0.05, options.durationSec).toFixed(3);

  const waveChain = [
    waveVisualizerFilter(style, barsWidth, barsHeight, visRate),
    // Match still fps by holding vis frames (no open-ended upsample).
    `fps=${options.fps}`,
    `trim=duration=${duration}`,
    "setpts=PTS-STARTPTS",
  ].join(",");

  return [
    `[0:v]${options.fitFilter},fps=${options.fps},trim=duration=${duration},setpts=PTS-STARTPTS,format=rgba[bg]`,
    `[1:a]${waveChain}[wv]`,
    `[bg][wv]overlay=(W-w)/2:(H-h)/2-${centerYOffset}:format=auto,format=yuv420p[vout]`,
  ].join(";");
}

/**
 * Pad to timeline duration and apply clean-pulse envelope processing.
 */
export async function prepareVoiceDriveAudio(options: {
  inputPath: string;
  outputPath: string;
  durationSec: number;
}) {
  const durationSec = Math.max(0.05, options.durationSec);
  const result = await runFfmpeg([
    "-y",
    "-i",
    options.inputPath,
    "-af",
    buildCleanPulseDriveAudioFilter(durationSec),
    "-t",
    durationSec.toFixed(3),
    "-ar",
    "44100",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    options.outputPath,
  ]);
  assertFfmpegOk(
    result,
    `Voice sound-bars drive (${path.basename(options.outputPath)})`,
  );
  return result;
}
