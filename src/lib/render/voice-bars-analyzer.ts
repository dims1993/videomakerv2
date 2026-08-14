/**
 * Time-based asymmetric envelope + spectrum analysis for voice bars.
 * FFmpeg-independent (pure math) so styles can share VisualizerData later.
 */

export type VisualizerFrame = number[];

export type VoiceBarsShapeId =
  | "flat"
  | "center"
  | "edges"
  | "left"
  | "right";

export type VoiceBarsDesignConfig = {
  bars: number;
  attackMs: number;
  releaseMs: number;
  sampleRate: number;
  fps: number;
  /** FFT size (power of 2). */
  fftSize: number;
  fMinHz: number;
  fMaxHz: number;
  minDb: number;
  maxDb: number;
  /** Aesthetic power curve after 0–1 normalize (< 1 lifts mids). */
  curve: number;
  noiseGate: number;
  /** Neighbor blend weight (0.2 → 0.20 / 0.60 / 0.20). */
  spatialSmoothing: number;
  minHeight: number;
  sensitivity: number;
  /** Spatial height mask applied after envelope. */
  shape: VoiceBarsShapeId;
  /** Floor multiplier at the weakest side of the shape (0–1). */
  edgeScale: number;
  /** Power on the base curve (>1 sharpens the peak). */
  shapeCurve: number;
};

export const DEFAULT_VOICE_BARS_DESIGN: VoiceBarsDesignConfig = {
  bars: 26,
  attackMs: 35,
  releaseMs: 240,
  sampleRate: 44100,
  fps: 30,
  fftSize: 2048,
  fMinHz: 60,
  fMaxHz: 16_000,
  minDb: -65,
  maxDb: -12,
  curve: 0.65,
  noiseGate: 0.05,
  spatialSmoothing: 0.2,
  /** Normalized floor; pixel min height is applied in the overlay renderer. */
  minHeight: 0.03,
  sensitivity: 1,
  shape: "center",
  edgeScale: 0.3,
  shapeCurve: 1,
};

/**
 * Per-bar height mask. `center` uses a sine arch so mids lead and edges stay ≥ edgeScale.
 */
export function barShapeFactor(
  index: number,
  barCount: number,
  shape: VoiceBarsShapeId = "center",
  edgeScale = 0.3,
  shapeCurve = 1,
) {
  if (barCount <= 1) {
    return 1;
  }
  const t = index / (barCount - 1);
  const edge = Math.min(1, Math.max(0, edgeScale));
  const power = Math.max(0.05, shapeCurve);

  let curve = 1;
  switch (shape) {
    case "flat":
      return 1;
    case "center":
      curve = Math.sin(Math.PI * t);
      break;
    case "edges":
      curve = 1 - Math.sin(Math.PI * t);
      break;
    case "left":
      curve = Math.cos((Math.PI * t) / 2);
      break;
    case "right":
      curve = Math.sin((Math.PI * t) / 2);
      break;
    default:
      curve = 1;
  }

  curve = Math.pow(Math.min(1, Math.max(0, curve)), power);
  return edge + (1 - edge) * curve;
}

export function applyBarShapeMask(
  heights: ArrayLike<number>,
  shape: VoiceBarsShapeId = "center",
  edgeScale = 0.3,
  shapeCurve = 1,
): number[] {
  const n = heights.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const value = heights[i] ?? 0;
    if (value <= 0) {
      out[i] = 0;
      continue;
    }
    out[i] = value * barShapeFactor(i, n, shape, edgeScale, shapeCurve);
  }
  return out;
}

/** Frame-rate independent attack/release (≈ 0.55 / 0.12 at 30fps for 40/260ms). */
export function envelopeStep(
  current: number,
  target: number,
  dtSec: number,
  attackMs: number,
  releaseMs: number,
) {
  const tau = (target > current ? attackMs : releaseMs) / 1000;
  const alpha = 1 - Math.exp(-dtSec / Math.max(1e-6, tau));
  return current + (target - current) * alpha;
}

export function noiseGate(value: number, threshold = 0.05) {
  if (value <= threshold) {
    return 0;
  }
  return (value - threshold) / (1 - threshold);
}

export function spatialSmooth(
  bars: ArrayLike<number>,
  neighborWeight = 0.2,
): Float32Array {
  const n = bars.length;
  const out = new Float32Array(n);
  const centerWeight = Math.max(0, 1 - 2 * neighborWeight);
  for (let i = 0; i < n; i += 1) {
    const left = bars[Math.max(0, i - 1)]!;
    const center = bars[i]!;
    const right = bars[Math.min(n - 1, i + 1)]!;
    out[i] =
      left * neighborWeight + center * centerWeight + right * neighborWeight;
  }
  return out;
}

export function buildLogBandEdges(
  barCount: number,
  fMinHz: number,
  fMaxHz: number,
): Float64Array {
  const edges = new Float64Array(barCount + 1);
  const ratio = fMaxHz / Math.max(1e-6, fMinHz);
  for (let i = 0; i <= barCount; i += 1) {
    edges[i] = fMinHz * Math.pow(ratio, i / barCount);
  }
  return edges;
}

/** In-place radix-2 Cooley–Tukey FFT. */
export function fftInPlace(re: Float64Array, im: Float64Array) {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) {
    throw new Error("FFT size must be a power of 2.");
  }

  let j = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < j) {
      const tr = re[i]!;
      const ti = im[i]!;
      re[i] = re[j]!;
      im[i] = im[j]!;
      re[j] = tr;
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wLenRe = Math.cos(ang);
    const wLenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + half]! * wRe - im[i + k + half]! * wIm;
        const vi = re[i + k + half]! * wIm + im[i + k + half]! * wRe;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + half] = ur - vr;
        im[i + k + half] = ui - vi;
        const nextWRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextWRe;
      }
    }
  }
}

function hannWindow(size: number) {
  const w = new Float64Array(size);
  if (size === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < size; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Convert mono PCM (f32) → per-frame bar heights in [0, 1] with envelope.
 */
export function analyzePcmToVisualizerFrames(
  samples: Float32Array,
  config: Partial<VoiceBarsDesignConfig> = {},
): VisualizerFrame[] {
  const cfg: VoiceBarsDesignConfig = {
    ...DEFAULT_VOICE_BARS_DESIGN,
    ...config,
  };
  const {
    bars,
    attackMs,
    releaseMs,
    sampleRate,
    fps,
    fftSize,
    fMinHz,
    fMaxHz,
    minDb,
    maxDb,
    curve,
    noiseGate: gate,
    spatialSmoothing,
    minHeight,
    sensitivity,
    shape,
    edgeScale,
    shapeCurve,
  } = cfg;

  const hop = Math.max(1, Math.round(sampleRate / fps));
  const frameCount = Math.max(1, Math.ceil(samples.length / hop));
  const edges = buildLogBandEdges(bars, fMinHz, fMaxHz);
  const window = hannWindow(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const state = new Float32Array(bars);
  const dt = 1 / fps;
  const dbRange = Math.max(1e-6, maxDb - minDb);
  const frames: VisualizerFrame[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = frame * hop;
    const start = center - Math.floor(fftSize / 2);

    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i += 1) {
      const sampleIndex = start + i;
      const sample =
        sampleIndex >= 0 && sampleIndex < samples.length
          ? samples[sampleIndex]!
          : 0;
      re[i] = sample * window[i]!;
    }
    fftInPlace(re, im);

    const targets = new Float32Array(bars);
    const nyquistBins = fftSize / 2;
    for (let b = 0; b < bars; b += 1) {
      const loHz = edges[b]!;
      const hiHz = edges[b + 1]!;
      const loBin = Math.max(
        1,
        Math.floor((loHz / sampleRate) * fftSize),
      );
      const hiBin = Math.min(
        nyquistBins - 1,
        Math.ceil((hiHz / sampleRate) * fftSize),
      );
      let peak = 1e-12;
      for (let bin = loBin; bin <= hiBin; bin += 1) {
        const mag = Math.hypot(re[bin]!, im[bin]!);
        if (mag > peak) {
          peak = mag;
        }
      }
      // Normalize roughly by FFT length so dB range stays stable.
      const db = 20 * Math.log10(peak / (fftSize * 0.5) + 1e-12);
      let normalized = (db - minDb) / dbRange;
      normalized = clamp01(normalized * sensitivity);
      normalized = noiseGate(normalized, gate);
      normalized = Math.pow(normalized, curve);
      targets[b] = normalized;
    }

    const smoothed = spatialSmooth(targets, spatialSmoothing);
    const enveloped: number[] = new Array(bars);
    for (let i = 0; i < bars; i += 1) {
      state[i] = envelopeStep(
        state[i]!,
        smoothed[i]!,
        dt,
        attackMs,
        releaseMs,
      );
      const value = state[i]!;
      enveloped[i] = value < 0.001 ? 0 : Math.max(minHeight, value);
    }
    frames.push(
      applyBarShapeMask(enveloped, shape, edgeScale, shapeCurve),
    );
  }

  return frames;
}
