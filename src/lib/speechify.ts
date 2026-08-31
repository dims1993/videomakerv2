/**
 * Speechify Build TTS (REST) — server-only.
 * POST https://api.speechify.ai/v1/audio/speech
 * Auth: Authorization: Bearer <SPEECHIFY_API_KEY>
 * Docs: https://docs.speechify.ai/build/text-to-speech-api
 */

export const SPEECHIFY_PROVIDER = "speechify" as const;

const SPEECH_URL = "https://api.speechify.ai/v1/audio/speech";

/** Prefer simba-3.2 for new English integrations (API default is still simba-3.0). */
export const DEFAULT_SPEECHIFY_MODEL = "simba-3.2";
export const DEFAULT_SPEECHIFY_AUDIO_FORMAT = "mp3" as const;
/** Speech endpoint hard limit (use /v1/audio/stream for longer text). */
export const SPEECHIFY_SPEECH_CHAR_LIMIT = 2000;

export class SpeechifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeechifyError";
  }
}

function envValue(key: string) {
  return process.env[key]?.trim() ?? "";
}

export function getSpeechifyApiKey() {
  return envValue("SPEECHIFY_API_KEY");
}

export function getDefaultSpeechifyModel() {
  return envValue("SPEECHIFY_MODEL") || DEFAULT_SPEECHIFY_MODEL;
}

export type GenerateSpeechifySpeechInput = {
  text: string;
  voiceId: string;
  model?: string | null;
  signal?: AbortSignal;
};

type SpeechifySpeechResponse = {
  audio_data?: string;
  audio_format?: string;
  billable_characters_count?: number;
};

/**
 * Synthesize MP3 via Speechify Build API.
 * Returns decoded audio bytes from JSON `audio_data` (base64).
 */
export async function generateSpeechifySpeech(
  input: GenerateSpeechifySpeechInput,
): Promise<Buffer> {
  const apiKey = getSpeechifyApiKey();
  if (!apiKey) {
    throw new SpeechifyError("Missing SPEECHIFY_API_KEY.");
  }

  const cleanText = input.text.trim();
  if (!cleanText) {
    throw new SpeechifyError("Voiceover text is empty.");
  }
  if (cleanText.length > SPEECHIFY_SPEECH_CHAR_LIMIT) {
    throw new SpeechifyError(
      `Speechify speech endpoint allows up to ${SPEECHIFY_SPEECH_CHAR_LIMIT} characters (got ${cleanText.length}). Split the scene or use streaming later.`,
    );
  }

  const voiceId = input.voiceId.trim();
  if (!voiceId) {
    throw new SpeechifyError("Missing Speechify voice_id.");
  }

  const model =
    input.model?.trim() || getDefaultSpeechifyModel() || DEFAULT_SPEECHIFY_MODEL;

  const response = await fetch(SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: input.signal,
    body: JSON.stringify({
      input: cleanText,
      voice_id: voiceId,
      audio_format: DEFAULT_SPEECHIFY_AUDIO_FORMAT,
      model,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SpeechifyError(
      `Speechify TTS failed (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 400)}` : "."
      }`,
    );
  }

  const payload = (await response.json()) as SpeechifySpeechResponse;
  const audioData = payload.audio_data?.trim();
  if (!audioData) {
    throw new SpeechifyError("Speechify returned empty audio_data.");
  }

  const audio = Buffer.from(audioData, "base64");
  if (audio.byteLength < 64) {
    throw new SpeechifyError("Speechify returned invalid audio bytes.");
  }

  return audio;
}
