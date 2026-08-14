import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzePcmToVisualizerFrames,
  DEFAULT_VOICE_BARS_DESIGN,
  type VisualizerFrame,
  type VoiceBarsDesignConfig,
} from "@/lib/render/voice-bars-analyzer";
import {
  assertFfmpegOk,
  getFfmpegBinaryPath,
  runFfmpeg,
  type FfmpegResult,
} from "@/lib/render/ffmpeg";

/** Fallback overlay size when frame width is unknown. */
export const ENVELOPE_BARS_HEIGHT = 260;
export const ENVELOPE_BARS_FALLBACK_WIDTH = 1200;

/** Visual layout — thin bars with breathing room (not stretch-to-fill). */
export type VoiceBarsLayoutStyle = {
  barCount: number;
  barWidth: number;
  gap: number;
  /** Pixel floor when a bar has energy (avoids vanishing stubs). */
  minHeightPx: number;
  /** 999 → pill (radius clamped to barWidth/2). */
  radius: number;
  /**
   * Target width of the bar block as a fraction of the video frame.
   * Native barWidth/gap stay fixed; presence is achieved via scaleX.
   */
  visualizerWidthRatio: number;
  /** White bar opacity 0–1. */
  opacity: number;
};

export const DEFAULT_VOICE_BARS_LAYOUT: VoiceBarsLayoutStyle = {
  barCount: 26,
  barWidth: 8,
  gap: 8,
  minHeightPx: 8,
  radius: 999,
  visualizerWidthRatio: 0.34,
  opacity: 0.92,
};

/** Flat even bars — previous look before the center-arch mask. */
export const VOICE_BARS2_LAYOUT: VoiceBarsLayoutStyle = {
  barCount: 22,
  barWidth: 8,
  gap: 10,
  minHeightPx: 8,
  radius: 999,
  visualizerWidthRatio: 0.24,
  opacity: 0.92,
};

export function getEnvelopeBarsPreset(style: "bars" | "bars2"): {
  layout: VoiceBarsLayoutStyle;
  design: Partial<VoiceBarsDesignConfig>;
} {
  if (style === "bars2") {
    return {
      layout: VOICE_BARS2_LAYOUT,
      design: {
        bars: VOICE_BARS2_LAYOUT.barCount,
        shape: "flat",
      },
    };
  }
  return {
    layout: DEFAULT_VOICE_BARS_LAYOUT,
    design: {
      bars: DEFAULT_VOICE_BARS_LAYOUT.barCount,
      shape: "center",
      edgeScale: 0.3,
      shapeCurve: 1,
    },
  };
}

/**
 * Vertical placement only — horizontal presence comes from visualizerWidthRatio.
 * offsetY is relative to the shared center offset (negative = higher on screen).
 */
export const ENVELOPE_BARS_COMPOSITION = {
  scaleY: 1,
  offsetY: -28,
} as const;

export function nativeBarsBlockWidth(layout: Pick<
  VoiceBarsLayoutStyle,
  "barCount" | "barWidth" | "gap"
>) {
  const n = Math.max(1, layout.barCount);
  return n * layout.barWidth + (n - 1) * layout.gap;
}

/** Scale so the native bar block occupies visualizerWidthRatio of the frame. */
export function resolveEnvelopeBarsPresenceScale(options: {
  frameWidth: number;
  layout?: Partial<VoiceBarsLayoutStyle>;
}) {
  const layout: VoiceBarsLayoutStyle = {
    ...DEFAULT_VOICE_BARS_LAYOUT,
    ...options.layout,
  };
  const fitted = fitBarsLayoutToFrameWidth(options.frameWidth, layout);
  return {
    layout: fitted.layout,
    nativeWidth: fitted.totalWidth,
    targetWidth: fitted.totalWidth,
    scaleX: 1,
    scaleY: ENVELOPE_BARS_COMPOSITION.scaleY,
    offsetY: ENVELOPE_BARS_COMPOSITION.offsetY,
  };
}

/**
 * Keep barWidth fixed; widen by increasing gap until the block hits
 * visualizerWidthRatio of the frame (premium presence without fat bars).
 */
export function fitBarsLayoutToFrameWidth(
  frameWidth: number,
  layout: VoiceBarsLayoutStyle = DEFAULT_VOICE_BARS_LAYOUT,
) {
  const barCount = Math.max(1, layout.barCount);
  const barWidth = Math.max(1, Math.round(layout.barWidth));
  const targetWidth = Math.round(
    Math.max(1, frameWidth) * layout.visualizerWidthRatio,
  );
  const minTotal = nativeBarsBlockWidth({
    barCount,
    barWidth,
    gap: layout.gap,
  });
  const width = Math.max(minTotal, targetWidth);
  const fittedGap =
    barCount <= 1
      ? layout.gap
      : Math.max(
          layout.gap,
          Math.round((width - barCount * barWidth) / (barCount - 1)),
        );
  const fitted: VoiceBarsLayoutStyle = {
    ...layout,
    barWidth,
    gap: fittedGap,
  };
  return {
    layout: fitted,
    totalWidth: nativeBarsBlockWidth(fitted),
  };
}

export type EnvelopeBarsRenderOptions = {
  driveAudioPath: string;
  outputOverlayPath: string;
  workDir: string;
  durationSec: number;
  fps: number;
  /** Full video frame width — overlay uses visualizerWidthRatio of this. */
  frameWidth?: number;
  height?: number;
  design?: Partial<VoiceBarsDesignConfig>;
  layout?: Partial<VoiceBarsLayoutStyle>;
};

export function getBarLayout(options: {
  containerWidth: number;
  barCount: number;
  barWidth: number;
  gap: number;
}) {
  const barCount = Math.max(1, options.barCount);
  const barWidth = Math.max(1, Math.round(options.barWidth));
  const gap = Math.max(0, Math.round(options.gap));
  const totalWidth = barCount * barWidth + (barCount - 1) * gap;
  const startX = Math.floor((options.containerWidth - totalWidth) / 2);
  return { barCount, barWidth, gap, totalWidth, startX };
}

export function computeBarWidth(
  containerWidth: number,
  barCount: number,
  gap: number,
) {
  const n = Math.max(1, barCount);
  return (containerWidth - (n - 1) * gap) / n;
}

function isInsideRoundedRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  if (px < x || py < y || px >= x + w || py >= y + h) {
    return false;
  }
  const rr = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (rr <= 0) {
    return true;
  }
  const lx = px - x;
  const ly = py - y;
  if (lx < rr && ly < rr) {
    const dx = lx - rr;
    const dy = ly - rr;
    return dx * dx + dy * dy <= rr * rr;
  }
  if (lx >= w - rr && ly < rr) {
    const dx = lx - (w - rr);
    const dy = ly - rr;
    return dx * dx + dy * dy <= rr * rr;
  }
  if (lx < rr && ly >= h - rr) {
    const dx = lx - rr;
    const dy = ly - (h - rr);
    return dx * dx + dy * dy <= rr * rr;
  }
  if (lx >= w - rr && ly >= h - rr) {
    const dx = lx - (w - rr);
    const dy = ly - (h - rr);
    return dx * dx + dy * dy <= rr * rr;
  }
  return true;
}

/**
 * Decode drive audio to mono f32le via FFmpeg.
 */
export async function decodeMonoF32leToFile(options: {
  inputPath: string;
  outputPath: string;
  sampleRate: number;
}) {
  const result = await runFfmpeg([
    "-y",
    "-i",
    options.inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(options.sampleRate),
    "-f",
    "f32le",
    options.outputPath,
  ]);
  assertFfmpegOk(result, "Decode voice-bars PCM");
}

export function renderBarsFrameRgba(options: {
  heights: VisualizerFrame;
  width: number;
  height: number;
  layout: VoiceBarsLayoutStyle;
}): Buffer {
  const { heights, width, height, layout } = options;
  const { barCount, barWidth, gap, startX } = getBarLayout({
    containerWidth: width,
    barCount: Math.min(layout.barCount, heights.length),
    barWidth: layout.barWidth,
    gap: layout.gap,
  });
  const alpha = Math.round(
    Math.min(1, Math.max(0, layout.opacity)) * 255,
  );
  const radius = layout.radius;
  const minHeightPx = Math.max(0, Math.round(layout.minHeightPx));

  const rgba = Buffer.alloc(width * height * 4, 0);
  for (let i = 0; i < barCount; i += 1) {
    const level = Math.min(1, Math.max(0, heights[i] ?? 0));
    if (level <= 0) {
      continue;
    }
    const barHeight = Math.min(
      height,
      Math.max(minHeightPx, Math.round(level * height)),
    );
    const x0 = startX + i * (barWidth + gap);
    const y0 = height - barHeight;
    for (let y = y0; y < height; y += 1) {
      const row = y * width * 4;
      for (let x = x0; x < x0 + barWidth; x += 1) {
        if (x < 0 || x >= width) {
          continue;
        }
        if (
          !isInsideRoundedRect(x, y, x0, y0, barWidth, barHeight, radius)
        ) {
          continue;
        }
        const idx = row + x * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = alpha;
      }
    }
  }
  return rgba;
}

async function encodeRgbaFramesToPngMov(options: {
  frames: VisualizerFrame[];
  width: number;
  height: number;
  layout: VoiceBarsLayoutStyle;
  fps: number;
  outputPath: string;
}): Promise<FfmpegResult> {
  const binaryPath = getFfmpegBinaryPath();
  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${options.width}x${options.height}`,
    "-r",
    String(options.fps),
    "-i",
    "pipe:0",
    "-c:v",
    "png",
    "-an",
    options.outputPath,
  ];

  return new Promise((resolve) => {
    console.info("Running FFmpeg", {
      binaryPath,
      cwd: process.cwd(),
      args,
      stdin: "rgba-frames",
    });

    const child = spawn(binaryPath, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout,
        stderr: stderr || error.message,
        code: null,
        binaryPath,
        cwd: process.cwd(),
        args,
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        code,
        binaryPath,
        cwd: process.cwd(),
        args,
      });
    });

    const stdin = child.stdin;
    if (!stdin) {
      resolve({
        ok: false,
        stdout,
        stderr: "FFmpeg stdin unavailable for envelope bars encode",
        code: null,
        binaryPath,
        cwd: process.cwd(),
        args,
      });
      return;
    }

    let index = 0;
    const writeNext = () => {
      while (index < options.frames.length) {
        const rgba = renderBarsFrameRgba({
          heights: options.frames[index]!,
          width: options.width,
          height: options.height,
          layout: options.layout,
        });
        index += 1;
        if (!stdin.write(rgba)) {
          stdin.once("drain", writeNext);
          return;
        }
      }
      stdin.end();
    };
    writeNext();
  });
}

/**
 * Analyze drive WAV → envelope frames → transparent bar strip video (PNG in MOV).
 * Frames stream to FFmpeg stdin (no multi‑GB raw dump on disk).
 */
export async function renderEnvelopeBarsOverlay(
  options: EnvelopeBarsRenderOptions,
) {
  const baseLayout: VoiceBarsLayoutStyle = {
    ...DEFAULT_VOICE_BARS_LAYOUT,
    ...options.layout,
  };
  const frameWidth = options.frameWidth ?? ENVELOPE_BARS_FALLBACK_WIDTH;
  const fitted = fitBarsLayoutToFrameWidth(frameWidth, baseLayout);
  const layout = fitted.layout;
  const height = options.height ?? ENVELOPE_BARS_HEIGHT;
  const width = fitted.totalWidth;
  const fps = Math.max(1, options.fps);
  const design: Partial<VoiceBarsDesignConfig> = {
    ...DEFAULT_VOICE_BARS_DESIGN,
    ...options.design,
    bars: layout.barCount,
    fps,
  };
  const sampleRate = design.sampleRate ?? DEFAULT_VOICE_BARS_DESIGN.sampleRate;
  const barCount = layout.barCount;

  await mkdir(options.workDir, { recursive: true });
  const pcmPath = path.join(options.workDir, "drive.f32le");

  await decodeMonoF32leToFile({
    inputPath: options.driveAudioPath,
    outputPath: pcmPath,
    sampleRate,
  });

  const pcmBuf = await readFile(pcmPath);
  const samples = new Float32Array(
    pcmBuf.buffer,
    pcmBuf.byteOffset,
    Math.floor(pcmBuf.byteLength / 4),
  );
  const frames = analyzePcmToVisualizerFrames(samples, design);

  const expectedFrames = Math.max(
    1,
    Math.round(Math.max(0.05, options.durationSec) * fps),
  );
  while (frames.length < expectedFrames) {
    frames.push(frames[frames.length - 1] ?? new Array(barCount).fill(0));
  }
  if (frames.length > expectedFrames) {
    frames.length = expectedFrames;
  }

  const encode = await encodeRgbaFramesToPngMov({
    frames,
    width,
    height,
    layout,
    fps,
    outputPath: options.outputOverlayPath,
  });
  assertFfmpegOk(encode, "Encode envelope bars overlay");

  const presence = resolveEnvelopeBarsPresenceScale({
    frameWidth,
    layout: baseLayout,
  });

  return {
    overlayPath: options.outputOverlayPath,
    frameCount: frames.length,
    bars: barCount,
    width,
    height,
    layout,
    presence,
  };
}

/** Filtergraph: still + pre-rendered envelope bars (alpha PNG). */
export function buildEnvelopeBarsOverlayFilterComplex(options: {
  fitFilter: string;
  fps: number;
  durationSec: number;
  centerYOffset: number;
  scaleX?: number;
  scaleY?: number;
  offsetY?: number;
}) {
  const duration = Math.max(0.05, options.durationSec).toFixed(3);
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? ENVELOPE_BARS_COMPOSITION.scaleY;
  const offsetY = options.offsetY ?? ENVELOPE_BARS_COMPOSITION.offsetY;
  // Shared centerYOffset lifts above mid-frame; offsetY (neg = up) stacks on top.
  const yOffset = options.centerYOffset - offsetY;
  const scaleFilter =
    Math.abs(scaleX - 1) < 1e-6 && Math.abs(scaleY - 1) < 1e-6
      ? ""
      : `scale=iw*${scaleX}:ih*${scaleY}:flags=bicubic,`;

  return [
    `[0:v]${options.fitFilter},fps=${options.fps},trim=duration=${duration},setpts=PTS-STARTPTS,format=rgba[bg]`,
    `[1:v]${scaleFilter}fps=${options.fps},trim=duration=${duration},setpts=PTS-STARTPTS,format=rgba[bars]`,
    `[bg][bars]overlay=(W-w)/2:(H-h)/2-${yOffset}:format=auto,format=yuv420p[vout]`,
  ].join(";");
}
