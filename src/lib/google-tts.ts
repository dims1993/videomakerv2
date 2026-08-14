/**
 * Google Cloud Text-to-Speech (REST) — server-only.
 * Client UI must import helpers from `@/lib/google-tts-shared` instead.
 *
 * Auth (first match wins):
 * 1. GOOGLE_TTS_API_KEY → ?key=
 * 2. GOOGLE_TTS_ACCESS_TOKEN → Authorization: Bearer
 */

import {
  assertChirp3HdUsageAllows,
  recordChirp3HdUsage,
} from "@/lib/google-tts-chirp-usage";
import {
  countGoogleTtsBillableCharacters,
  isChirp3HdVoice,
  languageCodeFromVoiceName,
  type GoogleTtsVoice,
} from "@/lib/google-tts-shared";

export type { GoogleTtsVoice } from "@/lib/google-tts-shared";
export {
  countGoogleTtsBillableCharacters,
  googleTtsVoiceFamily,
  googleTtsVoiceOptionLabel,
  isChirp3HdVoice,
  languageCodeFromVoiceName,
} from "@/lib/google-tts-shared";

export const GOOGLE_TTS_PROVIDER = "google" as const;

const SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICES_URL = "https://texttospeech.googleapis.com/v1/voices";

export const DEFAULT_GOOGLE_TTS_LANGUAGE_CODE = "en-US";
export const DEFAULT_GOOGLE_TTS_AUDIO_ENCODING = "MP3" as const;
/** Google speakingRate range is 0.25–4.0; we map UI speed into a tighter band. */
export const DEFAULT_GOOGLE_TTS_SPEAKING_RATE = 1;

export class GoogleTtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleTtsError";
  }
}

function envValue(key: string) {
  return process.env[key]?.trim() ?? "";
}

export function getDefaultGoogleTtsVoiceId() {
  return envValue("GOOGLE_TTS_DEFAULT_VOICE_ID") || "en-US-Neural2-A";
}

export function getDefaultGoogleTtsLanguageCode() {
  return (
    envValue("GOOGLE_TTS_DEFAULT_LANGUAGE_CODE") ||
    languageCodeFromVoiceName(getDefaultGoogleTtsVoiceId()) ||
    DEFAULT_GOOGLE_TTS_LANGUAGE_CODE
  );
}

export function sanitizeGoogleSpeakingRate(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_GOOGLE_TTS_SPEAKING_RATE;
  }
  // Cloud TTS speakingRate range is 0.25–4.0.
  return Math.min(Math.max(Number(value), 0.25), 4);
}

type GoogleAuth =
  | { kind: "apiKey"; apiKey: string }
  | { kind: "bearer"; token: string };

async function resolveGoogleAuth(): Promise<GoogleAuth> {
  const apiKey = envValue("GOOGLE_TTS_API_KEY");
  if (apiKey) {
    return { kind: "apiKey", apiKey };
  }
  const token = envValue("GOOGLE_TTS_ACCESS_TOKEN");
  if (token) {
    return { kind: "bearer", token };
  }
  throw new GoogleTtsError(
    "Missing Google TTS credentials. Set GOOGLE_TTS_API_KEY or GOOGLE_TTS_ACCESS_TOKEN (e.g. from `gcloud auth print-access-token`).",
  );
}

function withAuthUrl(url: string, auth: GoogleAuth) {
  if (auth.kind === "apiKey") {
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}key=${encodeURIComponent(auth.apiKey)}`;
  }
  return url;
}

function authHeaders(auth: GoogleAuth): HeadersInit {
  if (auth.kind === "bearer") {
    return {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json; charset=utf-8",
    };
  }
  return { "Content-Type": "application/json; charset=utf-8" };
}

export type GenerateGoogleTtsSpeechInput = {
  text: string;
  voiceId?: string | null;
  languageCode?: string | null;
  /** Mapped to Google speakingRate (0.7–1.2 typical). */
  speed?: number | null;
  audioEncoding?: "MP3" | "LINEAR16" | "OGG_OPUS";
  signal?: AbortSignal;
};

/**
 * Synthesize MP3 (default) via Cloud Text-to-Speech REST.
 */
export async function generateGoogleTtsSpeech(
  input: GenerateGoogleTtsSpeechInput,
): Promise<Buffer> {
  const cleanText = input.text.trim();
  if (!cleanText) {
    throw new GoogleTtsError("Voiceover text is empty.");
  }

  const voiceName = input.voiceId?.trim() || getDefaultGoogleTtsVoiceId();
  if (!voiceName) {
    throw new GoogleTtsError("Missing Google TTS voice name.");
  }

  const languageCode =
    input.languageCode?.trim() ||
    languageCodeFromVoiceName(voiceName) ||
    getDefaultGoogleTtsLanguageCode();

  const speakingRate = sanitizeGoogleSpeakingRate(input.speed);
  const audioEncoding = input.audioEncoding ?? DEFAULT_GOOGLE_TTS_AUDIO_ENCODING;
  const billableChars = countGoogleTtsBillableCharacters(cleanText);
  const chirp3Hd = isChirp3HdVoice(voiceName);

  if (chirp3Hd) {
    await assertChirp3HdUsageAllows(billableChars);
  }

  const auth = await resolveGoogleAuth();
  const response = await fetch(withAuthUrl(SYNTHESIZE_URL, auth), {
    method: "POST",
    headers: authHeaders(auth),
    signal: input.signal,
    body: JSON.stringify({
      input: { text: cleanText },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding,
        speakingRate,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GoogleTtsError(
      `Google TTS synthesize failed (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 400)}` : "."
      }`,
    );
  }

  const payload = (await response.json()) as { audioContent?: string };
  const audioContent = payload.audioContent?.trim();
  if (!audioContent) {
    throw new GoogleTtsError("Google TTS returned empty audioContent.");
  }

  const audio = Buffer.from(audioContent, "base64");
  if (audio.byteLength < 64) {
    throw new GoogleTtsError("Google TTS returned invalid audio bytes.");
  }

  if (chirp3Hd) {
    await recordChirp3HdUsage(billableChars);
  }

  return audio;
}

/**
 * List available Cloud TTS voices (optional helper for catalog UI).
 */
export async function listGoogleTtsVoices(options?: {
  languageCode?: string | null;
  signal?: AbortSignal;
}): Promise<GoogleTtsVoice[]> {
  const auth = await resolveGoogleAuth();
  const languageCode = options?.languageCode?.trim();
  const url = languageCode
    ? `${VOICES_URL}?languageCode=${encodeURIComponent(languageCode)}`
    : VOICES_URL;
  const response = await fetch(withAuthUrl(url, auth), {
    method: "GET",
    headers: authHeaders(auth),
    signal: options?.signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GoogleTtsError(
      `Google TTS list voices failed (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 300)}` : "."
      }`,
    );
  }
  const payload = (await response.json()) as {
    voices?: Array<{
      name?: string;
      languageCodes?: string[];
      ssmlGender?: string;
      naturalSampleRateHertz?: number;
    }>;
  };
  return (payload.voices ?? [])
    .map((voice) => ({
      name: (voice.name ?? "").trim(),
      languageCodes: Array.isArray(voice.languageCodes)
        ? voice.languageCodes.filter((code) => typeof code === "string")
        : [],
      ssmlGender: (voice.ssmlGender ?? "SSML_VOICE_GENDER_UNSPECIFIED").trim(),
      naturalSampleRateHertz: voice.naturalSampleRateHertz,
    }))
    .filter((voice) => Boolean(voice.name));
}
