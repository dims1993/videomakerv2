import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countGoogleTtsBillableCharacters,
  isChirp3HdVoice,
  languageCodeFromVoiceName,
} from "@/lib/google-tts-shared";
import { currentChirp3HdMonthKey } from "@/lib/google-tts-chirp-usage";

test("isChirp3HdVoice matches Chirp 3 HD ids only", () => {
  assert.equal(isChirp3HdVoice("en-US-Chirp3-HD-Aoede"), true);
  assert.equal(isChirp3HdVoice("en-US-Chirp-HD-F"), false);
  assert.equal(isChirp3HdVoice("en-US-Neural2-A"), false);
  assert.equal(isChirp3HdVoice("en-US-Standard-A"), false);
});

test("countGoogleTtsBillableCharacters counts code points", () => {
  assert.equal(countGoogleTtsBillableCharacters("Hello"), 5);
  assert.equal(countGoogleTtsBillableCharacters("café"), 4);
  assert.equal(countGoogleTtsBillableCharacters("🙂a"), 2);
});

test("languageCodeFromVoiceName extracts locale prefix", () => {
  assert.equal(languageCodeFromVoiceName("en-US-Neural2-A"), "en-US");
  assert.equal(languageCodeFromVoiceName("en-GB-Chirp3-HD-Aoede"), "en-GB");
});

test("currentChirp3HdMonthKey is YYYY-MM UTC", () => {
  assert.match(
    currentChirp3HdMonthKey(new Date("2026-08-14T12:00:00Z")),
    /^2026-08$/,
  );
});
