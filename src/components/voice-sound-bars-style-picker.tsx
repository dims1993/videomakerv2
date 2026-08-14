"use client";

import { useEffect, useRef } from "react";

import {
  VOICE_SOUND_BARS_STYLE_OPTIONS,
  type VoiceSoundBarsStyleId,
} from "@/lib/render/voice-sound-bars-shared";

function drawPreview(
  ctx: CanvasRenderingContext2D,
  style: VoiceSoundBarsStyleId,
  width: number,
  height: number,
  t: number,
) {
  ctx.clearRect(0, 0, width, height);

  // Studio-ish photo backdrop (approx podcast still).
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#3a342c");
  bg.addColorStop(0.45, "#1f1b16");
  bg.addColorStop(1, "#12100e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(201, 168, 76, 0.12)";
  ctx.beginPath();
  ctx.ellipse(width * 0.3, height * 0.35, width * 0.28, height * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  const midY = height * 0.42;
  const amp = height * 0.26;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Slow envelope (~clean pulse), not sample-rate jitter.
  const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2));

  if (style === "bars" || style === "bars2") {
    const barCount = style === "bars" ? 18 : 14;
    const gap = style === "bars" ? 4 : 5;
    const span = style === "bars" ? 0.7 : 0.55;
    const barW = Math.max(3, (width * span - gap * (barCount - 1)) / barCount);
    const startX = (width - (barCount * barW + (barCount - 1) * gap)) / 2;
    for (let i = 0; i < barCount; i += 1) {
      const phase = t * 2.4 + i * 0.28;
      const level =
        pulse *
        (0.35 +
          0.65 *
            Math.abs(Math.sin(phase) * 0.7 + Math.sin(phase * 0.55 + 0.3) * 0.3));
      const tNorm = barCount <= 1 ? 0.5 : i / (barCount - 1);
      const shape =
        style === "bars"
          ? 0.3 + 0.7 * Math.sin(Math.PI * tNorm)
          : 1;
      const h = Math.max(6, amp * level * shape);
      const x = startX + i * (barW + gap);
      const radius = barW / 2;
      roundRect(ctx, x, midY - h / 2, barW, h, radius);
      ctx.fill();
    }
    return;
  }

  // cline
  ctx.beginPath();
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * width;
    const phase = t * 2.4 + i * 0.12;
    const y = midY + Math.sin(phase) * amp * 0.45 * pulse;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function StylePreviewCanvas({
  style,
  selected,
}: {
  style: VoiceSoundBarsStyleId;
  selected: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let frame = 0;
    let raf = 0;
    const width = canvas.width;
    const height = canvas.height;
    const start = performance.now();

    function tick(now: number) {
      const t = (now - start) / 1000;
      drawPreview(ctx!, style, width, height, t);
      frame += 1;
      // Keep animating while mounted so switching styles feels live.
      raf = window.requestAnimationFrame(tick);
      void frame;
    }

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [style]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={120}
      className={`w-full rounded-md border ${
        selected ? "border-primary ring-1 ring-primary/40" : "border-border"
      }`}
      aria-hidden
    />
  );
}

type VoiceSoundBarsStylePickerProps = {
  value: VoiceSoundBarsStyleId;
  onChange: (style: VoiceSoundBarsStyleId) => void;
  /** When false, still show previews but dim the control. */
  enabled?: boolean;
  name?: string;
};

/**
 * Live canvas previews for each FFmpeg bar style — compare without a full render.
 */
export function VoiceSoundBarsStylePicker({
  value,
  onChange,
  enabled = true,
  name = "voiceSoundBarsStyle",
}: VoiceSoundBarsStylePickerProps) {
  return (
    <div className={enabled ? "space-y-2" : "space-y-2 opacity-60"}>
      <input type="hidden" name={name} value={value} />
      <p className="text-xs font-medium text-muted-foreground">
        Sound bar style (live preview — approximate)
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {VOICE_SOUND_BARS_STYLE_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!enabled}
              onClick={() => onChange(option.id)}
              className={`rounded-md border bg-background p-2 text-left transition ${
                selected
                  ? "border-primary shadow-sm"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <StylePreviewCanvas style={option.id} selected={selected} />
              <p className="mt-2 text-sm font-medium">{option.name}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Preview approximates the clean-pulse look (slower envelope). Final
        FFmpeg bars use compressed/gated voiceover; PART covers and attached
        clips stay without bars.
      </p>
    </div>
  );
}
