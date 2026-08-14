"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { VoiceSoundBarsStylePicker } from "@/components/voice-sound-bars-style-picker";
import {
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  type VoiceSoundBarsStyleId,
} from "@/lib/render/voice-sound-bars-shared";

type VoiceSoundBarsRenderFieldsProps = {
  defaultEnabled: boolean;
  defaultStyle?: VoiceSoundBarsStyleId;
};

/**
 * Render-draft form fields: enable toggle + live style previews.
 */
export function VoiceSoundBarsRenderFields({
  defaultEnabled,
  defaultStyle = DEFAULT_VOICE_SOUND_BARS_STYLE,
}: VoiceSoundBarsRenderFieldsProps) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [style, setStyle] = useState<VoiceSoundBarsStyleId>(defaultStyle);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          id="voiceSoundBars"
          name="voiceSoundBars"
          type="checkbox"
          value="on"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-4"
        />
        <Label htmlFor="voiceSoundBars">Voice sound bars on stills</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Podcast: centered bars follow spoken voiceover only (skipped on
        attached clips, music beds, and PART covers).
      </p>
      <VoiceSoundBarsStylePicker
        value={style}
        onChange={setStyle}
        enabled={enabled}
      />
    </div>
  );
}
