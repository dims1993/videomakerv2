"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CAPTION_STYLE_PRESETS,
  getCaptionStylePreset,
  type CaptionStylePreset,
} from "@/lib/caption-styles";

const PREVIEW_WORDS_UPPER = ["UNLESS", "ONE", "IS", "BORN", "AGAIN"] as const;
const PREVIEW_WORDS_SCRIPT = ["Unless", "one", "is", "Born", "again"] as const;
const ACTIVE_WORD_INDEX = 3;

function captionPreviewTextShadow(preset: CaptionStylePreset) {
  const outline = Math.max(1, Math.round(preset.outlineWidth / 2));
  const blur = Math.max(0, preset.shadowBlur);
  return [
    `0 0 ${outline}px ${preset.outlineColor}`,
    `0 0 ${outline}px ${preset.outlineColor}`,
    `0 ${blur}px ${blur + 2}px ${preset.shadowColor}`,
  ].join(", ");
}

export function CaptionStylePicker({
  action,
  currentPresetId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentPresetId: string;
}) {
  const [selectedId, setSelectedId] = useState(currentPresetId);

  useEffect(() => {
    setSelectedId(currentPresetId);
  }, [currentPresetId]);

  const preset = useMemo(
    () => getCaptionStylePreset(selectedId),
    [selectedId],
  );
  const previewShadow = captionPreviewTextShadow(preset);
  const activeMatchesInactive =
    preset.activeColor.toLowerCase() === preset.inactiveColor.toLowerCase();
  const previewWords = preset.uppercase
    ? PREVIEW_WORDS_UPPER
    : PREVIEW_WORDS_SCRIPT;

  return (
    <form action={action} className="w-full max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="captionStylePreset"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {Object.values(CAPTION_STYLE_PRESETS).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Apply style
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div
          className="relative flex min-h-[120px] items-end justify-center px-4 pb-8 pt-10"
          style={{
            background:
              "linear-gradient(160deg, #3a342c 0%, #1f1b16 45%, #12100e 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-35"
            style={{
              background:
                "radial-gradient(ellipse at 30% 20%, rgba(201, 168, 76, 0.22), transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(90, 110, 90, 0.18), transparent 50%)",
            }}
          />
          <p
            className="relative z-10 text-center tracking-wide"
            style={{
              fontFamily: preset.fontFamily,
              fontWeight: preset.fontWeight,
              fontStyle: preset.italic ? "italic" : "normal",
              fontSize: Math.min(34, Math.round(preset.fontSize * 0.48)),
              lineHeight: 1.15,
              textTransform: preset.uppercase ? "uppercase" : "none",
              textShadow: previewShadow,
            }}
          >
            {previewWords.map((word, index) => {
              const isActive = index === ACTIVE_WORD_INDEX;
              const color =
                isActive && !activeMatchesInactive
                  ? preset.activeColor
                  : preset.inactiveColor;

              return (
                <span key={`${word}-${index}`} style={{ color }}>
                  {word}
                  {index < previewWords.length - 1 ? " " : ""}
                </span>
              );
            })}
          </p>
        </div>
        <div className="space-y-1 border-t bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium">{preset.name}</p>
          <p className="text-muted-foreground">{preset.description}</p>
          <p className="text-xs text-muted-foreground">
            Preview: inactive{" "}
            <span
              className="inline-block size-2.5 rounded-sm align-middle"
              style={{ backgroundColor: preset.inactiveColor }}
            />{" "}
            {preset.inactiveColor}
            {activeMatchesInactive ? (
              <> · no active-word highlight</>
            ) : (
              <>
                {" "}
                · active{" "}
                <span
                  className="inline-block size-2.5 rounded-sm align-middle"
                  style={{ backgroundColor: preset.activeColor }}
                />{" "}
                {preset.activeColor}
              </>
            )}
            {preset.italic ? <> · italic</> : null}
            {preset.matchScriptCasing ? <> · script casing</> : null}
          </p>
        </div>
      </div>
    </form>
  );
}
