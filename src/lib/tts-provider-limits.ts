/**
 * Per-provider TTS request limits for narration block planning.
 * Extensible: unknown providers fall back to DEFAULT_TTS_PROVIDER_LIMITS.
 */

import type { TtsVoiceProvider } from "@/lib/tts-voices";

export type TtsProviderLimits = {
  /** Hard cap on characters sent in one TTS request. */
  maxCharsPerRequest: number;
  /** Soft target — prefer flushing blocks at natural breaks after this. */
  targetMinDurationSec: number;
  /** Soft target — prefer not to exceed when a natural break is available. */
  targetMaxDurationSec: number;
  /** Hard cap on estimated spoken duration for one block. */
  maxEstimatedDurationSec: number;
  /** Maximum scenes merged into one block. */
  maxScenesPerBlock: number;
  /** Provider supports ElevenLabs-style previous_text between blocks. */
  supportsInterBlockPreviousText: boolean;
  /** When true, block mode should disable server-side text splitting (Chatterbox). */
  disableServerSplitTextInBlockMode: boolean;
};

export const DEFAULT_TTS_PROVIDER_LIMITS: TtsProviderLimits = {
  maxCharsPerRequest: 2800,
  targetMinDurationSec: 10,
  targetMaxDurationSec: 30,
  maxEstimatedDurationSec: 35,
  maxScenesPerBlock: 8,
  supportsInterBlockPreviousText: false,
  disableServerSplitTextInBlockMode: false,
};

/** Known providers — extend when adding a new TTS engine. */
export const TTS_PROVIDER_LIMITS: Record<TtsVoiceProvider, TtsProviderLimits> = {
  elevenlabs: {
    ...DEFAULT_TTS_PROVIDER_LIMITS,
    supportsInterBlockPreviousText: true,
  },
  fish: {
    ...DEFAULT_TTS_PROVIDER_LIMITS,
  },
  google: {
    ...DEFAULT_TTS_PROVIDER_LIMITS,
    maxCharsPerRequest: 4500,
    maxEstimatedDurationSec: 45,
    targetMaxDurationSec: 35,
  },
  speechify: {
    ...DEFAULT_TTS_PROVIDER_LIMITS,
    maxCharsPerRequest: 2000,
    maxEstimatedDurationSec: 25,
    targetMaxDurationSec: 22,
  },
  chatterbox: {
    ...DEFAULT_TTS_PROVIDER_LIMITS,
    maxCharsPerRequest: 2200,
    disableServerSplitTextInBlockMode: true,
  },
};

const KNOWN_PROVIDERS = new Set<string>(Object.keys(TTS_PROVIDER_LIMITS));

export function isKnownTtsProvider(value: string): value is TtsVoiceProvider {
  return KNOWN_PROVIDERS.has(value);
}

/**
 * Resolve limits for any provider id (known or future/unknown).
 * Unknown providers use conservative defaults so block planning stays safe.
 */
export function getTtsProviderLimits(
  provider: TtsVoiceProvider | string,
): TtsProviderLimits {
  if (isKnownTtsProvider(provider)) {
    return TTS_PROVIDER_LIMITS[provider];
  }
  return { ...DEFAULT_TTS_PROVIDER_LIMITS };
}

export function buildTtsVoiceKey(provider: TtsVoiceProvider | string, voiceId: string) {
  return `${provider}:${voiceId.trim()}`;
}
