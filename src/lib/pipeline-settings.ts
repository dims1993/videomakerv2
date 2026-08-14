import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  ChannelPipelineDefaults,
  ChannelProfile,
  ChannelVoiceProfile,
} from "@/lib/channels";
import {
  CAPTION_STYLE_PRESETS,
  getCaptionStylePreset,
  type CaptionStylePresetId,
} from "@/lib/caption-styles";
import {
  displayImageOutputFolder,
  normalizeStoredImageOutputFolder,
  resolveImageOutputFolderAbsolute,
} from "@/lib/image-output-folder";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";
import { prisma } from "@/lib/prisma";
import {
  parseAlignmentProvider,
  type AlignmentProvider,
} from "@/lib/alignment-provider";
import {
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  parseVoiceSoundBarsStyle,
  type VoiceSoundBarsStyleId,
} from "@/lib/render/voice-sound-bars-shared";
import {
  normalizeTtsVoiceProvider,
  type TtsVoiceProvider,
} from "@/lib/tts-voices";

export type { ChannelVoiceProfile };
export type { AlignmentProvider } from "@/lib/alignment-provider";
export { parseAlignmentProvider } from "@/lib/alignment-provider";
export type { TtsVoiceProvider } from "@/lib/tts-voices";

export function parseTtsProvider(
  value: unknown,
  fallback: TtsVoiceProvider = "elevenlabs",
): TtsVoiceProvider {
  if (
    value === "chatterbox" ||
    value === "elevenlabs" ||
    value === "google"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (
      trimmed === "chatterbox" ||
      trimmed === "elevenlabs" ||
      trimmed === "google"
    ) {
      return trimmed;
    }
  }
  return normalizeTtsVoiceProvider(fallback);
}

function getChannelProfileSync(channelKey: string) {
  // Lazy require avoids circular import with channels-server → channels.
  const { getChannelProfile } =
    require("@/lib/channels-server") as typeof import("@/lib/channels-server");
  return getChannelProfile(channelKey);
}

export type PipelineSettings = {
  script: {
    includeReferenceTranscripts: boolean;
    referenceDocumentIds: string[];
  };
  visualPlan: {
    mode: "hybrid" | "library";
    generationMode: "FULL_VIDEO";
    libraryId?: string | null;
  };
  assets: {
    /** Repo-relative preferred. Null = default storage/generated-images/<slug>-images. */
    imageOutputFolder: string | null;
  };
  voiceover: {
    voiceId: string | null;
    voiceName?: string | null;
    /** TTS engine: ElevenLabs, local Chatterbox, or Google Cloud TTS. */
    ttsProvider: TtsVoiceProvider;
    pauseAfterMs: number | null;
    generateSubtitles: boolean;
    /** Forced alignment: ElevenLabs API or local WhisperX HTTP. */
    alignmentProvider: AlignmentProvider;
    captionStylePreset: CaptionStylePresetId;
  };
  render: {
    burnCaptions: boolean;
    /** Centered voice-reactive bars on stills (podcast). */
    voiceSoundBars: boolean;
    voiceSoundBarsStyle: VoiceSoundBarsStyleId;
  };
};

export type ChannelPipelineDefaultsFile = Record<
  string,
  {
    pipelineDefaults?: ChannelPipelineDefaults;
    voiceProfiles?: ChannelVoiceProfile[];
  }
>;

const OVERLAY_RELATIVE = "data/channels/pipeline-defaults.json";

function overlayAbsolutePath() {
  return path.join(process.cwd(), OVERLAY_RELATIVE);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function nonNegInt(value: unknown, fallback: number | null): number | null {
  if (value == null) {
    return fallback;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return Math.round(n);
}

export function channelSupportsImageLibrary(channelKey: string) {
  return channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;
}

export function listCaptionStyleOptions() {
  return Object.values(CAPTION_STYLE_PRESETS).map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
  }));
}

export function hardcodedPipelineDefaults(
  channel?: ChannelProfile | null,
): PipelineSettings {
  const voiceId = channel?.voiceoverDefaultVoiceId?.trim() || null;
  const voiceName = channel?.voiceoverDefaultVoiceName?.trim() || null;
  const profilePause =
    voiceId && channel?.voiceProfiles?.length
      ? channel.voiceProfiles.find((item) => item.voiceId === voiceId)
          ?.defaultPauseAfterMs
      : null;
  const channelPreset = channel?.pipelineDefaults?.voiceover?.captionStylePreset;
  const captionStylePreset = getCaptionStylePreset(
    typeof channelPreset === "string" ? channelPreset : null,
  ).id as CaptionStylePresetId;

  return {
    script: {
      includeReferenceTranscripts: false,
      referenceDocumentIds: [],
    },
    visualPlan: {
      mode: "hybrid",
      generationMode: "FULL_VIDEO",
      libraryId: channelSupportsImageLibrary(channel?.key ?? "")
        ? PODCAST_ENGLISH_LESSONS_CHANNEL_KEY
        : null,
    },
    assets: {
      imageOutputFolder: null,
    },
    voiceover: {
      voiceId,
      voiceName,
      ttsProvider: parseTtsProvider(
        channel?.pipelineDefaults?.voiceover?.ttsProvider,
        "elevenlabs",
      ),
      pauseAfterMs:
        typeof profilePause === "number" && Number.isFinite(profilePause)
          ? profilePause
          : null,
      generateSubtitles: true,
      alignmentProvider: parseAlignmentProvider(
        channel?.pipelineDefaults?.voiceover?.alignmentProvider,
        "elevenlabs",
      ),
      captionStylePreset,
    },
    render: {
      burnCaptions: true,
      // Podcast opts in via channel.pipelineDefaults.render.voiceSoundBars.
      voiceSoundBars: false,
      voiceSoundBarsStyle: DEFAULT_VOICE_SOUND_BARS_STYLE,
    },
  };
}

export function parseChannelVoiceProfiles(
  value: unknown,
): ChannelVoiceProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const profiles: ChannelVoiceProfile[] = [];
  for (const entry of value) {
    if (!isObject(entry)) {
      continue;
    }
    const voiceId = text(entry.voiceId);
    if (!voiceId) {
      continue;
    }
    profiles.push({
      voiceId,
      voiceName: text(entry.voiceName),
      defaultPauseAfterMs: nonNegInt(entry.defaultPauseAfterMs, 0) ?? 0,
    });
  }
  return profiles;
}

export function parsePipelineSettings(
  value: unknown,
  fallback: PipelineSettings,
): PipelineSettings {
  if (!isObject(value)) {
    return structuredClone(fallback);
  }

  const scriptRaw = isObject(value.script) ? value.script : {};
  const visualRaw = isObject(value.visualPlan) ? value.visualPlan : {};
  const assetsRaw = isObject(value.assets) ? value.assets : {};
  const voiceRaw = isObject(value.voiceover) ? value.voiceover : {};
  const renderRaw = isObject(value.render) ? value.render : {};

  const modeRaw = text(visualRaw.mode);
  const mode =
    modeRaw === "library" || modeRaw === "hybrid"
      ? modeRaw
      : fallback.visualPlan.mode;

  const referenceDocumentIds = Array.isArray(scriptRaw.referenceDocumentIds)
    ? scriptRaw.referenceDocumentIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : fallback.script.referenceDocumentIds;

  const imageOutputFolder =
    normalizeStoredImageOutputFolder(text(assetsRaw.imageOutputFolder)) ??
    normalizeStoredImageOutputFolder(fallback.assets.imageOutputFolder);

  return {
    script: {
      includeReferenceTranscripts: bool(
        scriptRaw.includeReferenceTranscripts,
        fallback.script.includeReferenceTranscripts,
      ),
      referenceDocumentIds,
    },
    visualPlan: {
      mode,
      generationMode: "FULL_VIDEO",
      libraryId:
        text(visualRaw.libraryId) ?? fallback.visualPlan.libraryId ?? null,
    },
    assets: {
      imageOutputFolder,
    },
    voiceover: {
      voiceId: text(voiceRaw.voiceId) ?? fallback.voiceover.voiceId,
      voiceName: text(voiceRaw.voiceName) ?? fallback.voiceover.voiceName,
      ttsProvider: parseTtsProvider(
        voiceRaw.ttsProvider,
        fallback.voiceover.ttsProvider,
      ),
      pauseAfterMs: nonNegInt(
        voiceRaw.pauseAfterMs,
        fallback.voiceover.pauseAfterMs,
      ),
      generateSubtitles: bool(
        voiceRaw.generateSubtitles,
        fallback.voiceover.generateSubtitles,
      ),
      alignmentProvider: parseAlignmentProvider(
        voiceRaw.alignmentProvider,
        fallback.voiceover.alignmentProvider,
      ),
      captionStylePreset: getCaptionStylePreset(
        text(voiceRaw.captionStylePreset) ??
          fallback.voiceover.captionStylePreset,
      ).id as CaptionStylePresetId,
    },
    render: {
      burnCaptions: bool(
        renderRaw.burnCaptions,
        fallback.render.burnCaptions,
      ),
      voiceSoundBars: bool(
        renderRaw.voiceSoundBars,
        fallback.render.voiceSoundBars,
      ),
      voiceSoundBarsStyle: parseVoiceSoundBarsStyle(
        renderRaw.voiceSoundBarsStyle,
        fallback.render.voiceSoundBarsStyle,
      ),
    },
  };
}

function mergePartialSettings(
  base: PipelineSettings,
  partial: ChannelPipelineDefaults | Partial<PipelineSettings> | undefined,
): PipelineSettings {
  if (!partial) {
    return structuredClone(base);
  }
  return parsePipelineSettings(partial, base);
}

export function loadPipelineDefaultsOverlay(): ChannelPipelineDefaultsFile {
  const absolute = overlayAbsolutePath();
  if (!existsSync(absolute)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    if (!isObject(raw)) {
      return {};
    }
    const out: ChannelPipelineDefaultsFile = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isObject(value)) {
        continue;
      }
      out[key] = {
        ...(value.pipelineDefaults && isObject(value.pipelineDefaults)
          ? {
              pipelineDefaults:
                value.pipelineDefaults as ChannelPipelineDefaults,
            }
          : {}),
        voiceProfiles: parseChannelVoiceProfiles(value.voiceProfiles),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function savePipelineDefaultsOverlay(
  overlay: ChannelPipelineDefaultsFile,
) {
  const absolute = overlayAbsolutePath();
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(`${absolute}`, `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
}

export function getChannelVoiceProfiles(channelKey: string): ChannelVoiceProfile[] {
  const channel = getChannelProfileSync(channelKey);
  const overlay = loadPipelineDefaultsOverlay()[channelKey];
  const fromOverlay = overlay?.voiceProfiles ?? [];
  const fromChannel = channel.voiceProfiles ?? [];

  const byId = new Map<string, ChannelVoiceProfile>();
  for (const profile of fromChannel) {
    byId.set(profile.voiceId, profile);
  }
  for (const profile of fromOverlay) {
    byId.set(profile.voiceId, profile);
  }

  // Ensure default voice exists as a profile.
  if (channel.voiceoverDefaultVoiceId?.trim()) {
    const id = channel.voiceoverDefaultVoiceId.trim();
    if (!byId.has(id)) {
      byId.set(id, {
        voiceId: id,
        voiceName: channel.voiceoverDefaultVoiceName ?? null,
        defaultPauseAfterMs: 0,
      });
    }
  }

  return [...byId.values()];
}

export function getChannelPipelineDefaults(
  channelKey: string,
): PipelineSettings {
  const channel = getChannelProfileSync(channelKey);
  const base = hardcodedPipelineDefaults(channel);
  const fromProfile = mergePartialSettings(base, channel.pipelineDefaults);
  const overlay = loadPipelineDefaultsOverlay()[channelKey];
  const merged = mergePartialSettings(fromProfile, overlay?.pipelineDefaults);

  // Sync pause from selected voice profile when pause is unset.
  if (merged.voiceover.voiceId) {
    const profiles = getChannelVoiceProfiles(channelKey);
    const match = profiles.find(
      (profile) => profile.voiceId === merged.voiceover.voiceId,
    );
    if (match && merged.voiceover.pauseAfterMs == null) {
      merged.voiceover.pauseAfterMs = match.defaultPauseAfterMs;
    }
    if (match?.voiceName && !merged.voiceover.voiceName) {
      merged.voiceover.voiceName = match.voiceName;
    }
  }

  if (
    merged.visualPlan.mode === "library" &&
    !channelSupportsImageLibrary(channelKey)
  ) {
    merged.visualPlan.mode = "hybrid";
  }

  return merged;
}

export function parseVideoPipelineSettingsJson(
  raw: string | null | undefined,
  fallback: PipelineSettings,
): PipelineSettings | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    return parsePipelineSettings(JSON.parse(raw) as unknown, fallback);
  } catch {
    return null;
  }
}

export async function resolvePipelineSettings(
  videoId: string,
): Promise<PipelineSettings> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true, pipelineSettingsJson: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }

  const channelDefaults = getChannelPipelineDefaults(video.channelKey);
  const fromVideo = parseVideoPipelineSettingsJson(
    video.pipelineSettingsJson,
    channelDefaults,
  );
  const settings = fromVideo ?? channelDefaults;

  if (
    settings.visualPlan.mode === "library" &&
    !channelSupportsImageLibrary(video.channelKey)
  ) {
    settings.visualPlan.mode = "hybrid";
  }

  return settings;
}

export async function seedVideoPipelineSettingsIfMissing(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true, pipelineSettingsJson: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  if (video.pipelineSettingsJson?.trim()) {
    return parseVideoPipelineSettingsJson(
      video.pipelineSettingsJson,
      getChannelPipelineDefaults(video.channelKey),
    )!;
  }

  const settings = getChannelPipelineDefaults(video.channelKey);
  await prisma.video.update({
    where: { id: videoId },
    data: { pipelineSettingsJson: JSON.stringify(settings, null, 2) },
  });
  return settings;
}

export async function saveVideoPipelineSettings(
  videoId: string,
  settings: PipelineSettings,
) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }

  const normalized = parsePipelineSettings(
    settings,
    getChannelPipelineDefaults(video.channelKey),
  );
  if (
    normalized.visualPlan.mode === "library" &&
    !channelSupportsImageLibrary(video.channelKey)
  ) {
    normalized.visualPlan.mode = "hybrid";
  }

  await prisma.video.update({
    where: { id: videoId },
    data: {
      pipelineSettingsJson: JSON.stringify(normalized, null, 2),
      captionStylePreset: normalized.voiceover.captionStylePreset,
    },
  });
  return normalized;
}

export function saveChannelPipelineDefaults(
  channelKey: string,
  settings: PipelineSettings,
  options?: { updateSelectedVoicePause?: boolean },
) {
  const normalized = parsePipelineSettings(
    settings,
    getChannelPipelineDefaults(channelKey),
  );
  if (
    normalized.visualPlan.mode === "library" &&
    !channelSupportsImageLibrary(channelKey)
  ) {
    normalized.visualPlan.mode = "hybrid";
  }

  const overlay = loadPipelineDefaultsOverlay();
  const existing = overlay[channelKey] ?? {};
  let voiceProfiles = [...(existing.voiceProfiles ?? getChannelVoiceProfiles(channelKey))];

  if (
    options?.updateSelectedVoicePause !== false &&
    normalized.voiceover.ttsProvider !== "chatterbox" &&
    normalized.voiceover.voiceId &&
    normalized.voiceover.pauseAfterMs != null
  ) {
    const voiceId = normalized.voiceover.voiceId;
    const idx = voiceProfiles.findIndex((profile) => profile.voiceId === voiceId);
    const next: ChannelVoiceProfile = {
      voiceId,
      voiceName: normalized.voiceover.voiceName ?? null,
      defaultPauseAfterMs: normalized.voiceover.pauseAfterMs,
    };
    if (idx >= 0) {
      voiceProfiles[idx] = { ...voiceProfiles[idx]!, ...next };
    } else {
      voiceProfiles.push(next);
    }
  }

  overlay[channelKey] = {
    pipelineDefaults: normalized,
    voiceProfiles,
  };
  savePipelineDefaultsOverlay(overlay);
  return normalized;
}

export async function applyPipelinePauseAfterMsToScenes(
  videoId: string,
  pauseAfterMs: number | null,
) {
  if (pauseAfterMs == null || !Number.isFinite(pauseAfterMs) || pauseAfterMs < 0) {
    return { updated: 0 };
  }
  const rounded = Math.round(pauseAfterMs);
  const result = await prisma.scene.updateMany({
    where: { videoId },
    data: { pauseAfterMs: rounded },
  });
  return { updated: result.count };
}

export async function saveVideoImageOutputFolder(
  videoId: string,
  folder: string | null | undefined,
) {
  const settings = await resolvePipelineSettings(videoId);
  const next = parsePipelineSettings(
    {
      ...settings,
      assets: {
        imageOutputFolder: normalizeStoredImageOutputFolder(folder),
      },
    },
    settings,
  );
  await saveVideoPipelineSettings(videoId, next);
  return next.assets.imageOutputFolder;
}

export async function resolveVideoImageOutputFolderAbsolute(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  const settings = await resolvePipelineSettings(videoId);
  return resolveImageOutputFolderAbsolute(
    settings.assets.imageOutputFolder,
    videoId,
    video.title,
  );
}

export async function displayVideoImageOutputFolder(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  const settings = await resolvePipelineSettings(videoId);
  return displayImageOutputFolder(
    settings.assets.imageOutputFolder,
    videoId,
    video.title,
  );
}
