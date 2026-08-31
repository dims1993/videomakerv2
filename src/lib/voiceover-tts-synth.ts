/**
 * Provider-agnostic TTS synthesis — shared by per-scene and narration-block paths.
 */

import {
  generateChatterboxSpeech,
  CHATTERBOX_PROVIDER,
} from "@/lib/chatterbox";
import { generateElevenLabsSpeech } from "@/lib/elevenlabs";
import { generateFishSpeech, FISH_AUDIO_PROVIDER } from "@/lib/fish-audio";
import {
  generateGoogleTtsSpeech,
  GOOGLE_TTS_PROVIDER,
  languageCodeFromVoiceName,
} from "@/lib/google-tts";
import { generateSpeechifySpeech, SPEECHIFY_PROVIDER } from "@/lib/speechify";
import { getTtsProviderLimits, isKnownTtsProvider } from "@/lib/tts-provider-limits";
import {
  findNamedVoice,
  resolveChatterboxVoiceMode,
  resolveNamedVoiceProvider,
  type NamedTtsVoice,
  type TtsVoiceProvider,
} from "@/lib/tts-voices";

export type VoiceoverTtsGenerationOptions = {
  voiceId?: string | null;
  modelId?: string | null;
  outputFormat?: string | null;
  stability?: number | null;
  similarityBoost?: number | null;
  speed?: number | null;
};

export type VoiceoverTtsSynthInput = {
  text: string;
  voiceProvider: TtsVoiceProvider | string;
  voiceId: string;
  namedVoices: NamedTtsVoice[];
  generationOptions: VoiceoverTtsGenerationOptions;
  /** ElevenLabs expressive text (with acting tags when applicable). */
  expressiveText?: string | null;
  /** Plain spoken text for providers that reject tags. */
  spokenText: string;
  /** Fish directed speech when applicable. */
  fishText?: string | null;
  actingCueCount?: number;
  /** Narration block mode — full block in one request. */
  blockMode?: boolean;
  /** ElevenLabs inter-block continuity. */
  previousText?: string | null;
  nextText?: string | null;
  signal?: AbortSignal;
};

export async function synthesizeVoiceoverTtsText(
  input: VoiceoverTtsSynthInput,
): Promise<Buffer> {
  const provider = resolveNamedVoiceProvider(
    input.namedVoices,
    input.voiceId,
    isKnownTtsProvider(String(input.voiceProvider))
      ? input.voiceProvider
      : null,
  );
  const namedVoice = findNamedVoice(input.namedVoices, input.voiceId);
  const cleanText = input.text.trim();
  if (!cleanText) {
    throw new Error("Voiceover TTS text is empty.");
  }

  if (provider === CHATTERBOX_PROVIDER) {
    const chatterboxMode = resolveChatterboxVoiceMode(namedVoice);
    const predefinedVoiceId =
      namedVoice?.predefinedVoiceId?.trim() ||
      (chatterboxMode === "predefined" ? input.voiceId : "");
    const referenceFileName =
      namedVoice?.referenceFileName?.trim() ||
      (chatterboxMode === "clone" ? input.voiceId : "");
    const limits = getTtsProviderLimits(provider);
    return generateChatterboxSpeech({
      text: cleanText,
      voiceMode: chatterboxMode,
      predefinedVoiceId:
        chatterboxMode === "predefined" ? predefinedVoiceId : undefined,
      referenceFileName:
        chatterboxMode === "clone" ? referenceFileName : undefined,
      speed: input.generationOptions.speed,
      signal: input.signal,
      splitText:
        input.blockMode && limits.disableServerSplitTextInBlockMode
          ? false
          : true,
    });
  }

  if (provider === GOOGLE_TTS_PROVIDER) {
    const googleConfig = namedVoice?.googleConfig;
    return generateGoogleTtsSpeech({
      text: cleanText,
      voiceId: input.voiceId,
      languageCode:
        googleConfig?.languageCode ||
        namedVoice?.googleLanguageCode ||
        languageCodeFromVoiceName(input.voiceId),
      speed:
        googleConfig?.speakingRate != null
          ? googleConfig.speakingRate
          : input.generationOptions.speed,
      audioEncoding: googleConfig?.audioEncoding,
      signal: input.signal,
    });
  }

  if (provider === FISH_AUDIO_PROVIDER) {
    const fishConfig = namedVoice?.fishConfig;
    const fishText = input.fishText?.trim() || input.spokenText.trim() || cleanText;
    return generateFishSpeech({
      text: fishText,
      referenceId: input.voiceId,
      model: fishConfig?.model,
      speed:
        fishConfig?.speed != null
          ? fishConfig.speed
          : input.generationOptions.speed,
      signal: input.signal,
    });
  }

  if (provider === SPEECHIFY_PROVIDER) {
    return generateSpeechifySpeech({
      text: cleanText,
      voiceId: input.voiceId,
      model: namedVoice?.speechifyConfig?.model,
      signal: input.signal,
    });
  }

  const elevenText =
    (input.actingCueCount ?? 0) > 0 && input.expressiveText?.trim()
      ? input.expressiveText.trim()
      : cleanText;

  return generateElevenLabsSpeech({
    text: elevenText,
    voiceId: input.voiceId,
    modelId: input.generationOptions.modelId,
    outputFormat: input.generationOptions.outputFormat,
    stability: input.generationOptions.stability,
    similarityBoost: input.generationOptions.similarityBoost,
    speed: input.generationOptions.speed,
    previousText: input.previousText,
    nextText: input.nextText,
    signal: input.signal,
  });
}

export { FISH_AUDIO_PROVIDER, GOOGLE_TTS_PROVIDER, SPEECHIFY_PROVIDER };
