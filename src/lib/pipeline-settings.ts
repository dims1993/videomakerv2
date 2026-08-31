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
import {
  defaultPodcastPipelineSectionVoices,
  isPodcastPipelineChannel,
  mergePipelineSectionVoicesForVideo,
} from "@/lib/pipeline-podcast-voices";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";
import { Prisma } from "@prisma/client";
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
import {
  normalizeVoiceoverSectionVoices,
  type VoiceoverSectionVoices,
} from "@/lib/voiceover-section-voices";

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
    value === "google" ||
    value === "fish" ||
    value === "speechify"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (
      trimmed === "chatterbox" ||
      trimmed === "elevenlabs" ||
      trimmed === "google" ||
      trimmed === "fish" ||
      trimmed === "speechify"
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
    /** Podcast: Emma/Leo (teacher/student) speaker voices for pipeline VO. */
    sectionVoices?: VoiceoverSectionVoices;
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
  // Explicit null must win (e.g. channel defaults opt into punctuation pauses).
  // Missing / undefined keeps the fallback.
  if (value === null) {
    return null;
  }
  if (value === undefined) {
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
  const channelPreset = channel?.pipelineDefaults?.voiceover?.captionStylePreset;
  const captionStylePreset = getCaptionStylePreset(
    typeof channelPreset === "string" ? channelPreset : null,
  ).id as CaptionStylePresetId;

  const ttsProvider = parseTtsProvider(
    channel?.pipelineDefaults?.voiceover?.ttsProvider,
    "elevenlabs",
  );

  const voiceover: PipelineSettings["voiceover"] = {
    voiceId,
    voiceName,
    ttsProvider,
    pauseAfterMs: null,
    generateSubtitles: true,
    alignmentProvider: parseAlignmentProvider(
      channel?.pipelineDefaults?.voiceover?.alignmentProvider,
      "elevenlabs",
    ),
    captionStylePreset,
  };

  if (channel?.key && isPodcastPipelineChannel(channel.key)) {
    voiceover.sectionVoices = defaultPodcastPipelineSectionVoices(ttsProvider);
    voiceover.ttsProvider = parseTtsProvider(
      channel.pipelineDefaults?.voiceover?.ttsProvider,
      "google",
    );
    voiceover.alignmentProvider = parseAlignmentProvider(
      channel.pipelineDefaults?.voiceover?.alignmentProvider,
      "whisperx",
    );
  }

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
    voiceover,
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
      sectionVoices: (() => {
        const normalized = normalizeVoiceoverSectionVoices(
          voiceRaw.sectionVoices,
        );
        if (Object.keys(normalized).length > 0) {
          return normalized;
        }
        return fallback.voiceover.sectionVoices;
      })(),
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

function ensurePodcastDefaultVoicesInProfiles(
  channelKey: string,
  profiles: ChannelVoiceProfile[],
): ChannelVoiceProfile[] {
  if (!isPodcastPipelineChannel(channelKey)) {
    return profiles;
  }
  const byId = new Map(profiles.map((profile) => [profile.voiceId, profile]));
  for (const entry of Object.values(defaultPodcastPipelineSectionVoices())) {
    if (!entry?.voiceId || byId.has(entry.voiceId)) {
      continue;
    }
    byId.set(entry.voiceId, {
      voiceId: entry.voiceId,
      voiceName: entry.voiceName ?? null,
      defaultPauseAfterMs: 0,
    });
  }
  return [...byId.values()];
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

  return ensurePodcastDefaultVoicesInProfiles(channelKey, [...byId.values()]);
}

export function getChannelPipelineDefaults(
  channelKey: string,
): PipelineSettings {
  const channel = getChannelProfileSync(channelKey);
  const base = hardcodedPipelineDefaults(channel);
  const fromProfile = mergePartialSettings(base, channel.pipelineDefaults);
  const overlay = loadPipelineDefaultsOverlay()[channelKey];
  const merged = mergePartialSettings(fromProfile, overlay?.pipelineDefaults);

  // Voice profile `defaultPauseAfterMs` is a UI / voice-linked hint only.
  // Do not promote it into a flat pipeline pauseAfterMs — that would bypass
  // per-scene punctuation pauses when channel defaults leave pauseAfterMs null.
  if (merged.voiceover.voiceId) {
    const profiles = getChannelVoiceProfiles(channelKey);
    const match = profiles.find(
      (profile) => profile.voiceId === merged.voiceover.voiceId,
    );
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
    select: {
      channelKey: true,
      pipelineSettingsJson: true,
      voiceoverSectionVoicesJson: true,
    },
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

  if (isPodcastPipelineChannel(video.channelKey)) {
    settings.voiceover.sectionVoices = mergePipelineSectionVoicesForVideo({
      pipelineSectionVoices: settings.voiceover.sectionVoices,
      videoSectionVoices: video.voiceoverSectionVoicesJson,
      ttsProvider: settings.voiceover.ttsProvider,
    });
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
      ...(isPodcastPipelineChannel(video.channelKey) &&
      normalized.voiceover.sectionVoices &&
      Object.keys(normalized.voiceover.sectionVoices).length > 0
        ? {
            voiceoverSectionVoicesJson:
              normalized.voiceover.sectionVoices as Prisma.InputJsonValue,
          }
        : {}),
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

/**
 * Apply shared punctuation smart pauses (overwrites existing pauseAfterMs).
 * Wealth Insights also widens host↔story cast handoffs.
 */
export async function applySmartPunctuationScenePauses(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true },
  });
  if (!video) {
    return { updated: 0 };
  }

  if (video.channelKey === "wealth-insights") {
    return applyWealthSmartScenePauses(videoId);
  }

  const { suggestPunctuationPausesForScenes } = await import(
    "@/lib/voiceover-punctuation-pause"
  );
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      scriptText: true,
    },
  });
  if (scenes.length === 0) {
    return { updated: 0 };
  }
  const suggested = suggestPunctuationPausesForScenes(scenes);
  await prisma.$transaction(
    suggested.map((scene) =>
      prisma.scene.update({
        where: { id: scene.id },
        data: { pauseAfterMs: scene.suggestedPauseAfterMs },
      }),
    ),
  );
  return { updated: suggested.length };
}

/**
 * Apply Wealth Insights smart per-scene pauses (overwrites existing pauseAfterMs).
 */
export async function applyWealthSmartScenePauses(videoId: string) {
  const { suggestWealthInsightsPausesForScenes } = await import(
    "@/lib/wealth-insights-pause"
  );
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      scriptText: true,
      visualIdea: true,
    },
  });
  if (scenes.length === 0) {
    return { updated: 0 };
  }
  const suggested = suggestWealthInsightsPausesForScenes(scenes);
  await prisma.$transaction(
    suggested.map((scene) =>
      prisma.scene.update({
        where: { id: scene.id },
        data: { pauseAfterMs: scene.suggestedPauseAfterMs },
      }),
    ),
  );
  return { updated: suggested.length };
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
