import assert from "node:assert/strict";
import { test } from "node:test";

import {
  googleTtsVoiceFamily,
  languageCodeFromVoiceName,
} from "@/lib/google-tts-shared";
import { sanitizeGoogleSpeakingRate } from "@/lib/google-tts";
import { normalizeNamedVoices } from "@/lib/elevenlabs-preferences";
import {
  normalizeTtsVoiceProvider,
  resolveNamedVoiceProvider,
} from "@/lib/tts-voices";

test("languageCodeFromVoiceName extracts locale prefix", () => {
  assert.equal(languageCodeFromVoiceName("en-US-Neural2-A"), "en-US");
  assert.equal(languageCodeFromVoiceName("en-GB-Chirp3-HD-Aoede"), "en-GB");
  assert.equal(languageCodeFromVoiceName("es-ES-Neural2-B"), "es-ES");
  assert.equal(languageCodeFromVoiceName(""), null);
  assert.equal(languageCodeFromVoiceName("Neural2-A"), null);
});

test("googleTtsVoiceFamily classifies Cloud TTS names", () => {
  assert.equal(googleTtsVoiceFamily("en-US-Standard-A"), "Standard");
  assert.equal(googleTtsVoiceFamily("en-US-Neural2-C"), "Neural2");
  assert.equal(googleTtsVoiceFamily("en-US-Wavenet-D"), "WaveNet");
  assert.equal(googleTtsVoiceFamily("en-US-Chirp3-HD-Aoede"), "Chirp 3 HD");
  assert.equal(googleTtsVoiceFamily("en-US-Chirp-HD-F"), "Chirp HD");
});

test("sanitizeGoogleSpeakingRate clamps to Cloud TTS band", () => {
  assert.equal(sanitizeGoogleSpeakingRate(undefined), 1);
  assert.equal(sanitizeGoogleSpeakingRate(0.1), 0.25);
  assert.equal(sanitizeGoogleSpeakingRate(0.9), 0.9);
  assert.equal(sanitizeGoogleSpeakingRate(2), 2);
  assert.equal(sanitizeGoogleSpeakingRate(5), 4);
});

test("normalizeTtsVoiceProvider accepts google", () => {
  assert.equal(normalizeTtsVoiceProvider("google"), "google");
  assert.equal(normalizeTtsVoiceProvider("GOOGLE"), "elevenlabs");
  assert.equal(normalizeTtsVoiceProvider("chatterbox"), "chatterbox");
});

test("normalizeNamedVoices keeps googleLanguageCode", () => {
  const voices = normalizeNamedVoices([
    {
      name: "Neural A",
      voiceId: "en-US-Neural2-A",
      provider: "google",
      googleLanguageCode: "en-US",
    },
  ]);
  assert.equal(voices.length, 1);
  assert.equal(voices[0]?.provider, "google");
  assert.equal(voices[0]?.googleLanguageCode, "en-US");
  assert.equal(
    resolveNamedVoiceProvider(voices, "en-US-Neural2-A"),
    "google",
  );
});
