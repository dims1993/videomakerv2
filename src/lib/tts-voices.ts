/** Shared TTS catalog types — safe for client components (no Node fs). */

export type TtsVoiceProvider = "elevenlabs" | "chatterbox" | "google";

/** Chatterbox built-in pack vs uploaded clone sample. */
export type ChatterboxVoiceMode = "predefined" | "clone";

export type ChatterboxPredefinedVoice = {
  displayName: string;
  filename: string;
};

/** Per-catalog Google Cloud TTS overrides (advanced). */
export type GoogleTtsCatalogConfig = {
  languageCode?: string;
  /** Cloud TTS speakingRate (0.25–4.0). */
  speakingRate?: number;
  audioEncoding?: "MP3" | "LINEAR16" | "OGG_OPUS";
};

export type NamedTtsVoice = {
  name: string;
  voiceId: string;
  provider: TtsVoiceProvider;
  /**
   * Chatterbox only. Defaults to `clone` when missing (legacy catalog entries).
   * `predefined` = server `voices/` pack; `clone` = `reference_audio/` sample.
   */
  chatterboxMode?: ChatterboxVoiceMode;
  /** Filename in Chatterbox `voices/` (predefined mode). */
  predefinedVoiceId?: string;
  /** Filename on the Chatterbox server `reference_audio/` dir (clone mode). */
  referenceFileName?: string;
  /** Local copy under `storage/chatterbox-voices/`. */
  localSamplePath?: string;
  /** Google Cloud TTS languageCode (e.g. en-US). Optional — derived from voiceId. */
  googleLanguageCode?: string;
  /** Advanced Google synthesize overrides stored on the catalog entry. */
  googleConfig?: GoogleTtsCatalogConfig;
};

export function normalizeChatterboxVoiceMode(
  value: unknown,
): ChatterboxVoiceMode {
  return value === "predefined" ? "predefined" : "clone";
}

export function resolveChatterboxVoiceMode(
  voice: NamedTtsVoice | null | undefined,
): ChatterboxVoiceMode {
  if (voice?.provider !== "chatterbox") {
    return "clone";
  }
  return normalizeChatterboxVoiceMode(voice.chatterboxMode);
}

export function normalizeGoogleTtsCatalogConfig(
  value: unknown,
): GoogleTtsCatalogConfig | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = value as Record<string, unknown>;
  const languageCode =
    typeof entry.languageCode === "string" && entry.languageCode.trim()
      ? entry.languageCode.trim()
      : undefined;
  const speakingRateRaw = Number(entry.speakingRate);
  const speakingRate =
    Number.isFinite(speakingRateRaw) && speakingRateRaw > 0
      ? Math.min(Math.max(speakingRateRaw, 0.25), 4)
      : undefined;
  const encodingRaw =
    typeof entry.audioEncoding === "string"
      ? entry.audioEncoding.trim().toUpperCase()
      : "";
  const audioEncoding =
    encodingRaw === "MP3" ||
    encodingRaw === "LINEAR16" ||
    encodingRaw === "OGG_OPUS"
      ? encodingRaw
      : undefined;
  if (!languageCode && speakingRate == null && !audioEncoding) {
    return undefined;
  }
  return {
    ...(languageCode ? { languageCode } : {}),
    ...(speakingRate != null ? { speakingRate } : {}),
    ...(audioEncoding ? { audioEncoding } : {}),
  };
}

/** @deprecated Prefer NamedTtsVoice; kept for existing ElevenLabs-named call sites. */
export type NamedElevenLabsVoice = NamedTtsVoice;

/** Last-used ElevenLabs generation settings (also mirrored in localStorage). */
export type ElevenLabsPreferenceSettings = {
  voiceId: string;
  voiceName?: string;
  modelId: string;
  outputFormat: string;
  speed: number;
  stability: number;
  similarityBoost: number;
};

export function normalizeTtsVoiceProvider(value: unknown): TtsVoiceProvider {
  if (value === "chatterbox") {
    return "chatterbox";
  }
  if (value === "google") {
    return "google";
  }
  return "elevenlabs";
}

export function resolveNamedVoiceProvider(
  namedVoices: NamedTtsVoice[],
  voiceId: string,
  explicit?: TtsVoiceProvider | null,
): TtsVoiceProvider {
  if (
    explicit === "chatterbox" ||
    explicit === "elevenlabs" ||
    explicit === "google"
  ) {
    return explicit;
  }
  const match = namedVoices.find((voice) => voice.voiceId === voiceId);
  return match?.provider ?? "elevenlabs";
}

export function findNamedVoice(namedVoices: NamedTtsVoice[], voiceId: string) {
  return namedVoices.find((voice) => voice.voiceId === voiceId) ?? null;
}
