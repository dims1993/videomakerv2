import {
  normalizeTtsVoiceProvider,
  type TtsVoiceProvider,
} from "@/lib/tts-voices";
import type {
  ScriptSectionKind,
  SectionSceneRange,
  VoiceoverSectionRanges,
} from "@/lib/script-sections";

export type VoiceoverSectionVoice = {
  voiceId: string;
  voiceName?: string;
  /** TTS backend for this section/speaker. Missing ⇒ elevenlabs. */
  provider?: TtsVoiceProvider;
  /**
   * Optional speaking-rate override for this section/speaker.
   * Range 0.7–1.2 (lower = slower). When omitted, the global form speed is used.
   */
  speed?: number;
  /** Inclusive manual scene range for this section (optional). */
  startSortOrder?: number;
  /** Inclusive manual scene range for this section (optional). */
  endSortOrder?: number;
};

/** ElevenLabs voice_settings.speed accepted range. */
export const VOICEOVER_SECTION_SPEED_MIN = 0.7;
export const VOICEOVER_SECTION_SPEED_MAX = 1.2;

export function sanitizeVoiceoverSectionSpeed(
  value: unknown,
): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(
    VOICEOVER_SECTION_SPEED_MAX,
    Math.max(VOICEOVER_SECTION_SPEED_MIN, parsed),
  );
}

export type VoiceoverSectionVoices = Partial<
  Record<ScriptSectionKind, VoiceoverSectionVoice>
>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

export function normalizeVoiceoverSectionVoices(
  value: unknown,
): VoiceoverSectionVoices {
  if (!isObject(value)) {
    return {};
  }

  const allowedKinds: ScriptSectionKind[] = [
    "teacher",
    "student",
    "introduction",
    "lecture",
    "reflection_prayer",
    "closing",
    "other",
  ];
  const normalized: VoiceoverSectionVoices = {};

  for (const kind of allowedKinds) {
    const entry = value[kind];
    if (!isObject(entry)) {
      continue;
    }

    const voiceId = textValue(entry.voiceId);
    if (!voiceId) {
      continue;
    }

    const startSortOrder = optionalPositiveInt(entry.startSortOrder);
    const endSortOrder = optionalPositiveInt(entry.endSortOrder);
    const speed = sanitizeVoiceoverSectionSpeed(entry.speed);
    const provider = normalizeTtsVoiceProvider(entry.provider);

    normalized[kind] = {
      voiceId,
      voiceName: textValue(entry.voiceName) || undefined,
      provider,
      ...(speed != null ? { speed } : {}),
      ...(startSortOrder != null ? { startSortOrder } : {}),
      ...(endSortOrder != null ? { endSortOrder } : {}),
    };
  }

  return normalized;
}

export function extractVoiceoverSectionRanges(
  sectionVoices: VoiceoverSectionVoices,
): VoiceoverSectionRanges {
  const ranges: VoiceoverSectionRanges = {};

  for (const [kind, entry] of Object.entries(sectionVoices) as Array<
    [ScriptSectionKind, VoiceoverSectionVoice | undefined]
  >) {
    if (!entry) {
      continue;
    }
    if (entry.startSortOrder == null || entry.endSortOrder == null) {
      continue;
    }
    const range: SectionSceneRange = {
      startSortOrder: Math.min(entry.startSortOrder, entry.endSortOrder),
      endSortOrder: Math.max(entry.startSortOrder, entry.endSortOrder),
    };
    ranges[kind] = range;
  }

  return ranges;
}

export function resolveSceneVoiceoverSettings({
  sectionKind,
  sectionVoices,
  fallback,
}: {
  sectionKind: ScriptSectionKind;
  sectionVoices: VoiceoverSectionVoices;
  fallback: VoiceoverSectionVoice;
}): VoiceoverSectionVoice {
  const mapped = sectionVoices[sectionKind];
  if (!mapped) {
    return fallback;
  }
  return {
    voiceId: mapped.voiceId,
    voiceName: mapped.voiceName,
    provider: mapped.provider ?? fallback.provider,
    ...(mapped.speed != null ? { speed: mapped.speed } : {}),
  };
}
