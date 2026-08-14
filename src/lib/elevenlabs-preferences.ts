import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_SPEED,
  getDefaultElevenLabsModelId,
  getDefaultElevenLabsVoiceId,
} from "@/lib/elevenlabs";
import {
  findNamedVoice,
  normalizeChatterboxVoiceMode,
  normalizeGoogleTtsCatalogConfig,
  normalizeTtsVoiceProvider,
  resolveNamedVoiceProvider,
  type ElevenLabsPreferenceSettings,
  type NamedElevenLabsVoice,
} from "@/lib/tts-voices";

export type {
  ChatterboxVoiceMode,
  ElevenLabsPreferenceSettings,
  GoogleTtsCatalogConfig,
  NamedElevenLabsVoice,
  NamedTtsVoice,
  TtsVoiceProvider,
} from "@/lib/tts-voices";
export {
  findNamedVoice,
  normalizeChatterboxVoiceMode,
  normalizeGoogleTtsCatalogConfig,
  normalizeTtsVoiceProvider,
  resolveChatterboxVoiceMode,
  resolveNamedVoiceProvider,
} from "@/lib/tts-voices";

export type ElevenLabsPreferencesFile = {
  lastUsed: ElevenLabsPreferenceSettings;
  voiceIdHistory: string[];
  namedVoices: NamedElevenLabsVoice[];
  updatedAt: string;
};

const preferencesFileName = "elevenlabs-preferences.json";
const maxVoiceIdHistory = 20;

function preferencesPath() {
  return path.join(process.cwd(), "storage", preferencesFileName);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function defaultElevenLabsPreferenceSettings(
  channelSpeedDefault?: number | null,
): ElevenLabsPreferenceSettings {
  return {
    voiceId: getDefaultElevenLabsVoiceId(),
    modelId: getDefaultElevenLabsModelId(),
    outputFormat: DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
    speed: channelSpeedDefault ?? DEFAULT_ELEVENLABS_SPEED,
    stability: 0.5,
    similarityBoost: 0.75,
  };
}

function normalizeSettings(
  partial: Partial<ElevenLabsPreferenceSettings> | null | undefined,
  channelSpeedDefault?: number | null,
): ElevenLabsPreferenceSettings {
  const defaults = defaultElevenLabsPreferenceSettings(channelSpeedDefault);

  return {
    voiceId: textValue(partial?.voiceId, defaults.voiceId),
    voiceName: textValue(partial?.voiceName) || undefined,
    modelId: textValue(partial?.modelId, defaults.modelId),
    outputFormat: textValue(partial?.outputFormat, defaults.outputFormat),
    speed: finiteNumber(partial?.speed, defaults.speed),
    stability: finiteNumber(partial?.stability, defaults.stability),
    similarityBoost: finiteNumber(partial?.similarityBoost, defaults.similarityBoost),
  };
}

export function settingsFromVoiceoverJson(
  value: unknown,
): Partial<ElevenLabsPreferenceSettings> | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    voiceId: textValue(value.voiceId) || undefined,
    voiceName: textValue(value.voiceName) || undefined,
    modelId: textValue(value.modelId) || undefined,
    outputFormat: textValue(value.outputFormat) || undefined,
    speed: Number.isFinite(Number(value.speed)) ? Number(value.speed) : undefined,
    stability: Number.isFinite(Number(value.stability))
      ? Number(value.stability)
      : undefined,
    similarityBoost: Number.isFinite(Number(value.similarityBoost))
      ? Number(value.similarityBoost)
      : undefined,
  };
}

export function normalizeNamedVoices(value: unknown): NamedElevenLabsVoice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const voices: NamedElevenLabsVoice[] = [];

  for (const entry of value) {
    if (!isObject(entry)) {
      continue;
    }

    const name = textValue(entry.name);
    const voiceId = textValue(entry.voiceId);
    if (!name || !voiceId || seen.has(voiceId)) {
      continue;
    }

    seen.add(voiceId);
    const provider = normalizeTtsVoiceProvider(entry.provider);
    const referenceFileName = textValue(entry.referenceFileName) || undefined;
    const localSamplePath = textValue(entry.localSamplePath) || undefined;
    const predefinedVoiceId = textValue(entry.predefinedVoiceId) || undefined;
    const googleLanguageCode = textValue(entry.googleLanguageCode) || undefined;
    const googleConfig = normalizeGoogleTtsCatalogConfig(entry.googleConfig);
    const chatterboxMode =
      provider === "chatterbox"
        ? normalizeChatterboxVoiceMode(
            entry.chatterboxMode ??
              (predefinedVoiceId && !referenceFileName
                ? "predefined"
                : "clone"),
          )
        : undefined;
    voices.push({
      name,
      voiceId,
      provider,
      ...(chatterboxMode ? { chatterboxMode } : {}),
      ...(predefinedVoiceId ? { predefinedVoiceId } : {}),
      ...(referenceFileName ? { referenceFileName } : {}),
      ...(localSamplePath ? { localSamplePath } : {}),
      ...(provider === "google" && googleLanguageCode
        ? { googleLanguageCode }
        : {}),
      ...(provider === "google" && googleConfig ? { googleConfig } : {}),
    });
  }

  return voices.slice(0, 40);
}

function findNamedVoiceName(
  namedVoices: NamedElevenLabsVoice[],
  voiceId: string,
) {
  const match = namedVoices.find((voice) => voice.voiceId === voiceId);
  return match?.name ?? "";
}

function addVoiceIdToHistory(history: string[], voiceId: string) {
  const trimmed = voiceId.trim();

  if (!trimmed) {
    return history;
  }

  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(
    0,
    maxVoiceIdHistory,
  );
}

export async function readElevenLabsPreferences(): Promise<ElevenLabsPreferencesFile | null> {
  try {
    const raw = await readFile(preferencesPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isObject(parsed) || !isObject(parsed.lastUsed)) {
      return null;
    }

    return {
      lastUsed: normalizeSettings(
        settingsFromVoiceoverJson(parsed.lastUsed) ?? undefined,
      ),
      voiceIdHistory: Array.isArray(parsed.voiceIdHistory)
        ? parsed.voiceIdHistory.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0,
          )
        : [],
      namedVoices: normalizeNamedVoices(parsed.namedVoices),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveElevenLabsPreferences(
  partial: Partial<ElevenLabsPreferenceSettings>,
  channelSpeedDefault?: number | null,
) {
  const existing = await readElevenLabsPreferences();
  const lastUsed = normalizeSettings(
    {
      ...existing?.lastUsed,
      ...partial,
    },
    channelSpeedDefault,
  );
  const voiceIdHistory = addVoiceIdToHistory(
    existing?.voiceIdHistory ?? [],
    lastUsed.voiceId,
  );
  const namedVoices = existing?.namedVoices ?? [];
  const resolvedVoiceName =
    textValue(partial?.voiceName) ||
    findNamedVoiceName(namedVoices, lastUsed.voiceId);
  const payload: ElevenLabsPreferencesFile = {
    lastUsed: {
      ...lastUsed,
      voiceName: resolvedVoiceName || lastUsed.voiceName,
    },
    voiceIdHistory,
    namedVoices,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(preferencesPath()), { recursive: true });
  await writeFile(preferencesPath(), JSON.stringify(payload, null, 2), "utf8");

  return payload;
}

export function resolveElevenLabsPreferenceSettings({
  saved,
  sceneSettings,
  channelSpeedDefault,
  channelVoiceId,
  channelVoiceName,
}: {
  saved?: ElevenLabsPreferencesFile | null;
  sceneSettings?: Partial<ElevenLabsPreferenceSettings> | null;
  channelSpeedDefault?: number | null;
  /** Channel-owned default voice (wins over global lastUsed for that channel). */
  channelVoiceId?: string | null;
  channelVoiceName?: string | null;
}) {
  const channelVoice = textValue(channelVoiceId);
  const channelName = textValue(channelVoiceName) || undefined;

  if (channelVoice) {
    const settings = normalizeSettings(
      {
        ...(saved?.lastUsed ?? {}),
        ...(sceneSettings ?? {}),
        voiceId: channelVoice,
        voiceName: channelName,
      },
      channelSpeedDefault,
    );
    return {
      settings,
      voiceIdHistory: addVoiceIdToHistory(
        saved?.voiceIdHistory ?? (settings.voiceId ? [settings.voiceId] : []),
        settings.voiceId,
      ),
      namedVoices: saved?.namedVoices ?? [],
    };
  }

  if (saved?.lastUsed) {
    return {
      settings: normalizeSettings(saved.lastUsed, channelSpeedDefault),
      voiceIdHistory: addVoiceIdToHistory(
        saved.voiceIdHistory ?? [],
        saved.lastUsed.voiceId,
      ),
      namedVoices: saved.namedVoices ?? [],
    };
  }

  if (sceneSettings) {
    const settings = normalizeSettings(sceneSettings, channelSpeedDefault);

    return {
      settings,
      voiceIdHistory: settings.voiceId ? [settings.voiceId] : [],
      namedVoices: [] as NamedElevenLabsVoice[],
    };
  }

  const settings = defaultElevenLabsPreferenceSettings(channelSpeedDefault);

  return {
    settings,
    voiceIdHistory: settings.voiceId ? [settings.voiceId] : [],
    namedVoices: [] as NamedElevenLabsVoice[],
  };
}

export async function saveNamedElevenLabsVoices(namedVoices: NamedElevenLabsVoice[]) {
  const existing = await readElevenLabsPreferences();
  const payload: ElevenLabsPreferencesFile = {
    lastUsed:
      existing?.lastUsed ?? defaultElevenLabsPreferenceSettings(),
    voiceIdHistory: existing?.voiceIdHistory ?? [],
    namedVoices: normalizeNamedVoices(namedVoices),
    updatedAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(preferencesPath()), { recursive: true });
  await writeFile(preferencesPath(), JSON.stringify(payload, null, 2), "utf8");

  return payload;
}

export function resolveNamedVoiceLabel(
  namedVoices: NamedElevenLabsVoice[],
  voiceId: string,
) {
  return findNamedVoiceName(namedVoices, voiceId) || voiceId;
}
