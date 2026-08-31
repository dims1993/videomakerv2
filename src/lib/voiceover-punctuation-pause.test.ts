import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VOICEOVER_PAUSE_COLON_MS,
  VOICEOVER_PAUSE_COMMA_MS,
  VOICEOVER_PAUSE_DEFAULT_MS,
  VOICEOVER_PAUSE_EXCLAMATION_MS,
  VOICEOVER_PAUSE_PARAGRAPH_MS,
  VOICEOVER_PAUSE_PERIOD_MS,
  VOICEOVER_PAUSE_QUESTION_MS,
  VOICEOVER_PAUSE_SEMICOLON_MS,
  classifyVoiceoverPunctuationPause,
  suggestPunctuationPauseAfterMs,
  suggestPunctuationPausesForScenes,
} from "./voiceover-punctuation-pause";

test("comma / semicolon / colon / period / question / exclamation map to defaults", () => {
  assert.equal(
    suggestPunctuationPauseAfterMs("At 8:12 on a Tuesday morning,"),
    VOICEOVER_PAUSE_COMMA_MS,
  );
  assert.equal(
    classifyVoiceoverPunctuationPause("Hold that thought;"),
    "semicolon",
  );
  assert.equal(
    suggestPunctuationPauseAfterMs("Hold that thought;"),
    VOICEOVER_PAUSE_SEMICOLON_MS,
  );
  assert.equal(
    suggestPunctuationPauseAfterMs("Here is the mechanism:"),
    VOICEOVER_PAUSE_COLON_MS,
  );
  assert.equal(
    suggestPunctuationPauseAfterMs(
      "Ryan pulls into the office parking lot in a spotless black SUV.",
    ),
    VOICEOVER_PAUSE_PERIOD_MS,
  );
  assert.equal(
    suggestPunctuationPauseAfterMs('He asked, "Have I gone too far?"'),
    VOICEOVER_PAUSE_QUESTION_MS,
  );
  assert.equal(
    classifyVoiceoverPunctuationPause("That is amazing!"),
    "exclamation",
  );
  assert.equal(
    suggestPunctuationPauseAfterMs("That is amazing!"),
    VOICEOVER_PAUSE_EXCLAMATION_MS,
  );
});

test("paragraph breaks use the longer pause band", () => {
  assert.equal(
    suggestPunctuationPauseAfterMs("First thought ends here.\n\n"),
    VOICEOVER_PAUSE_PARAGRAPH_MS,
  );
  assert.equal(
    suggestPunctuationPauseAfterMs(
      "First paragraph stays together.\n\nSecond paragraph closes the idea.",
    ),
    VOICEOVER_PAUSE_PARAGRAPH_MS,
  );
});

test("unclear endings fall back to the default breath", () => {
  assert.equal(
    suggestPunctuationPauseAfterMs("No terminator here"),
    VOICEOVER_PAUSE_DEFAULT_MS,
  );
});

test("batch helper applies continuity hard-join on incomplete→next beats", () => {
  const suggested = suggestPunctuationPausesForScenes([
    { scriptText: "Soft continuation," },
    { scriptText: "Full stop." },
  ]);
  assert.equal(suggested[0]?.suggestedPauseAfterMs, 0);
  assert.equal(suggested[1]?.suggestedPauseAfterMs, VOICEOVER_PAUSE_PERIOD_MS);
});
