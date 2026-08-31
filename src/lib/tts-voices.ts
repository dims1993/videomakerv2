/** Shared TTS catalog types — safe for client components (no Node fs). */

export type TtsVoiceProvider =
  | "elevenlabs"
  | "chatterbox"
  | "google"
  | "fish"
  | "speechify";

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

/** Per-catalog Fish Audio TTS overrides. */
export type FishAudioCatalogConfig = {
  /** Fish `model` header (e.g. s2.1-pro). */
  model?: string;
  /** Fish prosody.speed. */
  speed?: number;
};

/** Per-catalog Speechify TTS overrides. */
export type SpeechifyCatalogConfig = {
  /** Speechify `model` body field (e.g. simba-3.2). */
  model?: string;
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
  /** Fish Audio overrides (`voiceId` = Fish `reference_id`). */
  fishConfig?: FishAudioCatalogConfig;
  /** Speechify overrides (`voiceId` = Speechify `voice_id`). */
  speechifyConfig?: SpeechifyCatalogConfig;
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

export function normalizeFishAudioCatalogConfig(
  value: unknown,
): FishAudioCatalogConfig | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = value as Record<string, unknown>;
  const model =
    typeof entry.model === "string" && entry.model.trim()
      ? entry.model.trim()
      : undefined;
  const speedRaw = Number(entry.speed);
  const speed =
    Number.isFinite(speedRaw) && speedRaw > 0
      ? Math.min(Math.max(speedRaw, 0.5), 2)
      : undefined;
  if (!model && speed == null) {
    return undefined;
  }
  return {
    ...(model ? { model } : {}),
    ...(speed != null ? { speed } : {}),
  };
}

export function normalizeSpeechifyCatalogConfig(
  value: unknown,
): SpeechifyCatalogConfig | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entry = value as Record<string, unknown>;
  const model =
    typeof entry.model === "string" && entry.model.trim()
      ? entry.model.trim()
      : undefined;
  if (!model) {
    return undefined;
  }
  return { model };
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
  if (value === "fish") {
    return "fish";
  }
  if (value === "speechify") {
    return "speechify";
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
    explicit === "google" ||
    explicit === "fish" ||
    explicit === "speechify"
  ) {
    return explicit;
  }
  const match = namedVoices.find((voice) => voice.voiceId === voiceId);
  return match?.provider ?? "elevenlabs";
}

export function findNamedVoice(namedVoices: NamedTtsVoice[], voiceId: string) {
  return namedVoices.find((voice) => voice.voiceId === voiceId) ?? null;
}
