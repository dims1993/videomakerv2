/**
 * Client-safe Google Cloud TTS helpers (no Node fs / network).
 */

export type GoogleTtsVoice = {
  name: string;
  languageCodes: string[];
  ssmlGender: string;
  naturalSampleRateHertz?: number;
};

export type Chirp3HdUsageSummary = {
  monthKey: string;
  charactersUsed: number;
  softLimit: number;
  freeTierChars: number;
  remaining: number;
  percentUsed: number;
  blocked: boolean;
};

/** Classify Cloud TTS voice names for catalog optgroups. */
export function googleTtsVoiceFamily(voiceName: string): string {
  const name = voiceName.trim();
  if (/-Standard-/i.test(name)) {
    return "Standard";
  }
  if (/-Neural2-/i.test(name)) {
    return "Neural2";
  }
  if (/-Wavenet-/i.test(name)) {
    return "WaveNet";
  }
  if (/-Chirp3-HD-/i.test(name)) {
    return "Chirp 3 HD";
  }
  if (/-Chirp-HD-/i.test(name)) {
    return "Chirp HD";
  }
  if (/-News-/i.test(name)) {
    return "News";
  }
  if (/-Studio-/i.test(name)) {
    return "Studio";
  }
  if (/-Polyglot-/i.test(name)) {
    return "Polyglot";
  }
  return "Other";
}

export function isChirp3HdVoice(voiceName: string | null | undefined) {
  return /-Chirp3-HD-/i.test(voiceName?.trim() ?? "");
}

/** Billable characters ≈ Unicode code points sent to Cloud TTS. */
export function countGoogleTtsBillableCharacters(text: string) {
  return Array.from(text).length;
}

export function googleTtsVoiceOptionLabel(voice: GoogleTtsVoice): string {
  const gender = voice.ssmlGender
    .replace(/^SSML_VOICE_GENDER_/, "")
    .toLowerCase();
  const genderLabel =
    gender === "male" || gender === "female" || gender === "neutral"
      ? gender
      : null;
  return genderLabel ? `${voice.name} (${genderLabel})` : voice.name;
}

/** Derive languageCode from voice name like `en-US-Neural2-A` → `en-US`. */
export function languageCodeFromVoiceName(voiceName: string): string | null {
  const trimmed = voiceName.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^([a-z]{2,3}-[A-Z]{2})\b/);
  return match?.[1] ?? null;
}
