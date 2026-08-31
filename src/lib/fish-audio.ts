/**
 * Fish Audio Text-to-Speech (REST) — server-only.
 * POST https://api.fish.audio/v1/tts with Bearer auth + `model` header.
 */

export const FISH_AUDIO_PROVIDER = "fish" as const;

const TTS_URL = "https://api.fish.audio/v1/tts";

export const DEFAULT_FISH_AUDIO_MODEL = "s2.1-pro";
export const DEFAULT_FISH_AUDIO_SPEED = 1;
export const DEFAULT_FISH_AUDIO_MP3_BITRATE = 128;

export class FishAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FishAudioError";
  }
}

function envValue(key: string) {
  return process.env[key]?.trim() ?? "";
}

export function getFishAudioApiKey() {
  return envValue("FISH_AUDIO_API_KEY");
}

export function getDefaultFishAudioModel() {
  return envValue("FISH_AUDIO_MODEL") || DEFAULT_FISH_AUDIO_MODEL;
}

/** Fish prosody.speed — clamp to a practical band around 1.0. */
export function sanitizeFishAudioSpeed(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_FISH_AUDIO_SPEED;
  }
  return Math.min(Math.max(Number(value), 0.5), 2);
}

export type GenerateFishSpeechInput = {
  text: string;
  referenceId: string;
  model?: string | null;
  speed?: number | null;
  signal?: AbortSignal;
};

/**
 * Synthesize MP3 via Fish Audio OpenAPI TTS.
 */
export async function generateFishSpeech(
  input: GenerateFishSpeechInput,
): Promise<Buffer> {
  const apiKey = getFishAudioApiKey();
  if (!apiKey) {
    throw new FishAudioError("Missing FISH_AUDIO_API_KEY.");
  }

  const cleanText = input.text.trim();
  if (!cleanText) {
    throw new FishAudioError("Voiceover text is empty.");
  }

  const referenceId = input.referenceId.trim();
  if (!referenceId) {
    throw new FishAudioError("Missing Fish Audio reference_id (voice id).");
  }

  const model =
    input.model?.trim() || getDefaultFishAudioModel() || DEFAULT_FISH_AUDIO_MODEL;
  const speed = sanitizeFishAudioSpeed(input.speed);

  const response = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model,
    },
    signal: input.signal,
    body: JSON.stringify({
      text: cleanText,
      reference_id: referenceId,
      format: "mp3",
      mp3_bitrate: DEFAULT_FISH_AUDIO_MP3_BITRATE,
      prosody: { speed },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new FishAudioError(
      `Fish Audio TTS failed (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 400)}` : "."
      }`,
    );
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.byteLength < 64) {
    throw new FishAudioError("Fish Audio returned invalid audio bytes.");
  }

  return audio;
}
