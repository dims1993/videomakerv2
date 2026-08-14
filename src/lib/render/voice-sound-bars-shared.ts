/**
 * Client-safe voice sound-bar style catalog (no Node/ffmpeg imports).
 */

export type VoiceSoundBarsStyleId = "cline" | "bars" | "bars2";

/** Center-arch frequency bars (current default look). */
export const DEFAULT_VOICE_SOUND_BARS_STYLE: VoiceSoundBarsStyleId = "bars";

export const VOICE_SOUND_BARS_STYLE_OPTIONS: Array<{
  id: VoiceSoundBarsStyleId;
  name: string;
  description: string;
}> = [
  {
    id: "bars",
    name: "Frequency bars",
    description: "Center-weighted spectrum — taller in the middle.",
  },
  {
    id: "bars2",
    name: "Frequency bars 2",
    description: "Even-height spectrum bars — the previous flat look.",
  },
  {
    id: "cline",
    name: "Center line",
    description: "Thin center waveform line — lighter look.",
  },
];

export function parseVoiceSoundBarsStyle(
  value: unknown,
  fallback: VoiceSoundBarsStyleId = DEFAULT_VOICE_SOUND_BARS_STYLE,
): VoiceSoundBarsStyleId {
  if (value === "cline" || value === "bars" || value === "bars2") {
    return value;
  }
  // Legacy: filled wave → Frequency bars 2
  if (value === "filled") {
    return "bars2";
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "cline" || trimmed === "bars" || trimmed === "bars2") {
      return trimmed;
    }
    if (trimmed === "filled") {
      return "bars2";
    }
  }
  return fallback;
}
