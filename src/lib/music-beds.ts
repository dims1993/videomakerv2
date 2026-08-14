import { access } from "node:fs/promises";
import path from "node:path";

import { isMusicBedVisualIdea } from "@/lib/podcast-pause-cues";

export const MUSIC_BED_PROVIDER = "freesound" as const;

/**
 * Minimum alone-time for a MUSIC_BED before the next spoken scene starts.
 * Shorter attached clips are looped up to this intro at stitch time.
 */
export const MUSIC_BED_MIN_INTRO_SEC = 5;

/**
 * Leave this much of the following spoken scene with music nearly gone.
 * Underlay fade length ≈ speechDuration - tail.
 */
export const MUSIC_BED_UNDERLAY_TAIL_SEC = 0.45;

/** Soft end fade when a bed has no following spoken scene to underlay. */
export const MUSIC_BED_ORPHAN_FADE_SEC = 1.5;

/** @deprecated Use MUSIC_BED_ORPHAN_FADE_SEC / underlay planning instead. */
export const MUSIC_BED_STITCH_CROSSFADE_SEC = MUSIC_BED_ORPHAN_FADE_SEC;

/** Optional local overrides / Freesound preview cache. */
export const MUSIC_BED_LIBRARY_RELATIVE_DIR = path.join(
  "data",
  "music-beds",
  "freesound",
);

export type MusicBedCueKind = "begin" | "fade" | "outro" | "generic";

export type MusicBedPreset = {
  id: string;
  title: string;
  cueKinds: MusicBedCueKind[];
  mood: string;
  defaultDurationSec: number;
  /** Freesound text search query */
  freesoundQuery: string;
  /** Optional Freesound filter expression */
  freesoundFilter?: string;
  /** Optional local override filename under data/music-beds/freesound/ */
  localFileName?: string;
  licenseNote: string;
};

/**
 * Cue presets → Freesound search recipes.
 * Attach downloads a preview MP3 via FREESOUND_API_KEY (no OAuth needed for previews).
 */
export const MUSIC_BED_PRESETS: Record<string, MusicBedPreset> = {
  soft_begin: {
    id: "soft_begin",
    title: "Soft begin",
    cueKinds: ["begin", "generic"],
    mood: "warm, light, podcast intro",
    defaultDurationSec: 5.5,
    freesoundQuery: "soft ambient intro calm music pad",
    freesoundFilter: "duration:[5 TO 120]",
    localFileName: "soft-begin.mp3",
    licenseNote:
      "Freesound preview — check the track license and credit the author when required.",
  },
  soft_fade: {
    id: "soft_fade",
    title: "Soft fade / transition",
    cueKinds: ["fade", "generic"],
    mood: "gentle transition, low energy",
    defaultDurationSec: 4.5,
    freesoundQuery: "soft ambient transition fade music pad",
    freesoundFilter: "duration:[4 TO 90]",
    localFileName: "soft-fade.mp3",
    licenseNote:
      "Freesound preview — check the track license and credit the author when required.",
  },
  outro_soft: {
    id: "outro_soft",
    title: "Soft outro",
    cueKinds: ["outro", "generic"],
    mood: "warm close, soft landing",
    defaultDurationSec: 5,
    freesoundQuery: "soft ambient outro ending calm music",
    freesoundFilter: "duration:[3 TO 90]",
    localFileName: "outro-soft.mp3",
    licenseNote:
      "Freesound preview — check the track license and credit the author when required.",
  },
};

export type MusicBedPresetId = keyof typeof MUSIC_BED_PRESETS;

export function listMusicBedPresets(): MusicBedPreset[] {
  return Object.values(MUSIC_BED_PRESETS);
}

export function getMusicBedPreset(id: string | null | undefined): MusicBedPreset | null {
  if (!id?.trim()) {
    return null;
  }
  return MUSIC_BED_PRESETS[id.trim()] ?? null;
}

export function musicBedLibraryDir() {
  return path.join(process.cwd(), MUSIC_BED_LIBRARY_RELATIVE_DIR);
}

export function musicBedLocalOverridePath(preset: MusicBedPreset) {
  if (!preset.localFileName) {
    return null;
  }
  return path.join(musicBedLibraryDir(), preset.localFileName);
}

export function musicBedCachePath(presetId: string, soundId: number) {
  return path.join(
    musicBedLibraryDir(),
    "cache",
    `${presetId}-${soundId}.mp3`,
  );
}

export async function musicBedLocalOverrideExists(preset: MusicBedPreset) {
  const localPath = musicBedLocalOverridePath(preset);
  if (!localPath) {
    return false;
  }
  try {
    await access(localPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Infer cue kind from MUSIC_BED visualIdea / visualPurpose / script markers.
 */
export function inferMusicBedCueKind({
  visualIdea,
  visualPurpose,
}: {
  visualIdea?: string | null;
  visualPurpose?: string | null;
}): MusicBedCueKind {
  const haystack = `${visualIdea ?? ""} ${visualPurpose ?? ""}`.toLowerCase();

  if (/\boutro\b/.test(haystack)) {
    return "outro";
  }
  if (/\bfade\b|\bend\b|\bclose\b/.test(haystack)) {
    return "fade";
  }
  if (/\bbegin\b|\bintro\b|\bopen\b|\bstart\b/.test(haystack)) {
    return "begin";
  }
  return "generic";
}

export function suggestMusicBedPresetId(input: {
  visualIdea?: string | null;
  visualPurpose?: string | null;
}): string {
  const cue = inferMusicBedCueKind(input);
  const match = listMusicBedPresets().find((preset) =>
    preset.cueKinds.includes(cue),
  );
  return match?.id ?? MUSIC_BED_PRESETS.soft_begin.id;
}

export function isMusicBedScene(scene: {
  visualIdea?: string | null;
  scriptText?: string | null;
}) {
  return isMusicBedVisualIdea(scene.visualIdea);
}

export type MusicBedAttachSettings = {
  bedId: string;
  title: string;
  provider: typeof MUSIC_BED_PROVIDER;
  cueKind: MusicBedCueKind;
  licenseNote: string;
  targetDurationSec: number;
  attachedAt: string;
  source: "local_override" | "freesound_preview" | "user_import";
  sourceRelativePath?: string;
  originalFileName?: string;
  freesound?: {
    id: number;
    name: string;
    username: string;
    license: string;
    url: string | null;
    duration: number;
  };
};
