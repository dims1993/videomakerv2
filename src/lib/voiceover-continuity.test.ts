import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VOICEOVER_PAUSE_CONTINUATION_MS,
  buildTtsStitchContext,
  endsIncompleteForProsody,
  looksLikeContinuationStart,
  shouldBridgeProsody,
  suggestContinuityAwarePauseAfterMs,
  truncateTtsNextContext,
  truncateTtsStitchContext,
} from "./voiceover-continuity";

test("incomplete endings and continuation starts", () => {
  assert.equal(endsIncompleteForProsody("They panic about falling away,"), true);
  assert.equal(endsIncompleteForProsody("They panic about falling away."), false);
  assert.equal(looksLikeContinuationStart("and they panic."), true);
  assert.equal(looksLikeContinuationStart("And they panic."), true);
  assert.equal(looksLikeContinuationStart("trampling the Son of God"), true);
  assert.equal(looksLikeContinuationStart("Ryan arrives at work."), false);
});

test("shouldBridgeProsody bridges incomplete beats even if next is capitalized", () => {
  assert.equal(
    shouldBridgeProsody(
      "They see phrases about falling away,",
      "Trampling the Son of God.",
    ),
    true,
  );
  assert.equal(
    shouldBridgeProsody("Full stop here.", "Next sentence starts."),
    false,
  );
  assert.equal(shouldBridgeProsody("Trailing comma,", null), false);
});

test("continuity-aware pause zeros incomplete joins", () => {
  assert.equal(
    suggestContinuityAwarePauseAfterMs({
      scriptText: "Soft continuation,",
      nextScriptText: "keeps going.",
      basePauseAfterMs: 100,
    }),
    VOICEOVER_PAUSE_CONTINUATION_MS,
  );
  assert.equal(
    suggestContinuityAwarePauseAfterMs({
      scriptText: "Full stop.",
      nextScriptText: "Next beat.",
      basePauseAfterMs: 245,
    }),
    245,
  );
});

test("TTS stitch context truncates and respects same-voice flags", () => {
  const longPrev = "word ".repeat(200);
  const ctx = buildTtsStitchContext({
    previousSpokenText: longPrev,
    nextSpokenText: "Later we continue the thought carefully.",
    sameVoiceAsPrevious: true,
    sameVoiceAsNext: true,
  });
  assert.ok(ctx.previousText);
  assert.ok((ctx.previousText?.length ?? 0) <= 320);
  assert.equal(
    truncateTtsStitchContext(longPrev).length <= 320,
    true,
  );
  assert.ok(truncateTtsNextContext("Later we continue.").startsWith("Later"));

  const muted = buildTtsStitchContext({
    previousSpokenText: "Earlier line.",
    nextSpokenText: "Next line.",
    sameVoiceAsPrevious: false,
    sameVoiceAsNext: false,
  });
  assert.equal(muted.previousText, undefined);
  assert.equal(muted.nextText, undefined);
});
