import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePcmToVisualizerFrames,
  barShapeFactor,
  buildLogBandEdges,
  envelopeStep,
  noiseGate,
  spatialSmooth,
} from "@/lib/render/voice-bars-analyzer";
import {
  buildEnvelopeBarsOverlayFilterComplex,
  computeBarWidth,
  DEFAULT_VOICE_BARS_LAYOUT,
  ENVELOPE_BARS_COMPOSITION,
  fitBarsLayoutToFrameWidth,
  getBarLayout,
  renderBarsFrameRgba,
} from "@/lib/render/voice-bars-overlay";

test("envelopeStep at 30fps ≈ 0.56 attack / 0.12 release for 40/260ms", () => {
  const dt = 1 / 30;
  const attackAlpha = 1 - Math.exp(-dt / 0.04);
  const releaseAlpha = 1 - Math.exp(-dt / 0.26);
  assert.ok(Math.abs(attackAlpha - 0.56) < 0.02);
  assert.ok(Math.abs(releaseAlpha - 0.12) < 0.02);

  const up = envelopeStep(0, 1, dt, 40, 260);
  assert.ok(Math.abs(up - attackAlpha) < 1e-9);

  const down = envelopeStep(1, 0, dt, 40, 260);
  assert.ok(Math.abs(down - (1 - releaseAlpha)) < 1e-9);
});

test("envelopeStep is fps-independent for the same elapsed time", () => {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 4; i += 1) {
    a = envelopeStep(a, 1, 1 / 30, 35, 240);
  }
  for (let i = 0; i < 8; i += 1) {
    b = envelopeStep(b, 1, 1 / 60, 35, 240);
  }
  assert.ok(Math.abs(a - b) < 0.02);
});

test("noiseGate and spatialSmooth shape bar energy", () => {
  assert.equal(noiseGate(0.04, 0.05), 0);
  assert.ok(Math.abs(noiseGate(0.525, 0.05) - 0.5) < 1e-9);

  const jagged = [0.1, 1, 0.1, 0.8, 0.05, 1, 0.2];
  const smooth = spatialSmooth(jagged, 0.2);
  assert.equal(smooth.length, jagged.length);
  assert.ok(smooth[1]! < jagged[1]!);
  assert.ok(smooth[1]! > jagged[0]!);
});

test("buildLogBandEdges is logarithmic 60Hz→16kHz", () => {
  const edges = buildLogBandEdges(24, 60, 16_000);
  assert.equal(edges.length, 25);
  assert.ok(Math.abs(edges[0]! - 60) < 1e-6);
  assert.ok(Math.abs(edges[24]! - 16_000) < 1e-3);
  const mid = edges[12]!;
  const geo = Math.sqrt(60 * 16_000);
  assert.ok(Math.abs(mid - geo) / geo < 0.05);
});

test("center shape is sine arch with edge floor", () => {
  const n = 14;
  const edge = barShapeFactor(0, n, "center", 0.3);
  const mid = barShapeFactor(Math.floor((n - 1) / 2), n, "center", 0.3);
  const otherEdge = barShapeFactor(n - 1, n, "center", 0.3);
  assert.ok(Math.abs(edge - 0.3) < 1e-9);
  assert.ok(Math.abs(otherEdge - 0.3) < 1e-9);
  assert.ok(mid > 0.95);
  assert.ok(barShapeFactor(3, n, "center", 0.3) < mid);
  assert.equal(barShapeFactor(0, n, "flat"), 1);
  assert.ok(barShapeFactor(0, n, "edges", 0.3) > barShapeFactor(6, n, "edges", 0.3));
});

test("analyzePcmToVisualizerFrames reacts to a tone then decays", () => {
  const sampleRate = 44100;
  const fps = 30;
  const bars = 16;
  const hop = Math.round(sampleRate / fps);
  const samples = new Float32Array(hop * 20);
  for (let frame = 4; frame < 9; frame += 1) {
    const start = frame * hop;
    for (let i = 0; i < hop; i += 1) {
      const t = (start + i) / sampleRate;
      samples[start + i] = 0.35 * Math.sin(2 * Math.PI * 440 * t);
    }
  }

  const frames = analyzePcmToVisualizerFrames(samples, {
    sampleRate,
    fps,
    bars,
    fftSize: 1024,
    attackMs: 35,
    releaseMs: 240,
    noiseGate: 0.05,
    minHeight: 0.04,
    shape: "flat",
  });

  assert.equal(frames.length, 20);
  assert.equal(frames[0]!.length, bars);

  const energy = (frame: number[]) =>
    frame.reduce((sum, v) => sum + v, 0) / frame.length;

  const silent = energy(frames[1]!);
  const peak = energy(frames[7]!);
  const after = energy(frames[14]!);

  assert.ok(peak > silent + 0.05, `peak ${peak} should exceed silent ${silent}`);
  assert.ok(after < peak, `decay ${after} should be below peak ${peak}`);
  assert.ok(after > silent, "release should still show residual energy");
});

test("buildEnvelopeBarsOverlayFilterComplex lifts bars; scale optional", () => {
  const filter = buildEnvelopeBarsOverlayFilterComplex({
    fitFilter: "scale=1920:1080",
    fps: 30,
    durationSec: 3.5,
    centerYOffset: 120,
  });
  assert.match(filter, /trim=duration=3\.500/);
  assert.match(filter, /\[1:v\].*\[bars\]/);
  assert.doesNotMatch(filter, /scale=iw\*/);
  // offsetY -28 → effective lift 120 - (-28) = 148
  assert.match(filter, /overlay=\(W-w\)\/2:\(H-h\)\/2-148/);
  assert.equal(ENVELOPE_BARS_COMPOSITION.scaleY, 1);
  assert.equal(ENVELOPE_BARS_COMPOSITION.offsetY, -28);
  assert.doesNotMatch(filter, /showfreqs|showwaves/);
});

test("layout defaults target ~34% frame width without thickening bars", () => {
  assert.equal(DEFAULT_VOICE_BARS_LAYOUT.barCount, 26);
  assert.equal(DEFAULT_VOICE_BARS_LAYOUT.barWidth, 8);
  assert.equal(DEFAULT_VOICE_BARS_LAYOUT.gap, 8);
  assert.equal(DEFAULT_VOICE_BARS_LAYOUT.visualizerWidthRatio, 0.34);

  const fitted = fitBarsLayoutToFrameWidth(1920, DEFAULT_VOICE_BARS_LAYOUT);
  assert.equal(fitted.layout.barWidth, 8);
  assert.ok(fitted.layout.gap >= 8);
  assert.ok(Math.abs(fitted.totalWidth / 1920 - 0.34) < 0.01);

  const layout = getBarLayout({
    containerWidth: fitted.totalWidth,
    barCount: fitted.layout.barCount,
    barWidth: fitted.layout.barWidth,
    gap: fitted.layout.gap,
  });
  assert.equal(layout.totalWidth, fitted.totalWidth);
  assert.ok(Math.abs(computeBarWidth(400, 10, 10) - 31) < 1e-9);
});

test("renderBarsFrameRgba draws thin rounded bars with soft alpha", () => {
  const width = 200;
  const height = 40;
  const heights = new Array(26).fill(0);
  heights[13] = 0.8;
  const rgba = renderBarsFrameRgba({
    heights,
    width,
    height,
    layout: DEFAULT_VOICE_BARS_LAYOUT,
  });
  assert.equal(rgba.length, width * height * 4);

  let opaque = 0;
  let softAlpha = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i]!;
    if (a > 0) {
      opaque += 1;
      if (a === Math.round(0.92 * 255)) {
        softAlpha += 1;
      }
    }
  }
  assert.ok(opaque > 0);
  assert.equal(softAlpha, opaque);
});
