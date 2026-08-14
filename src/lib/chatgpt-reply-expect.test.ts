import assert from "node:assert/strict";
import { test } from "node:test";

import {
  preferCopiedAssistantText,
  shouldAcceptAsScoreReply,
  shouldFailFastMissingAssistantBubble,
  shouldKeepWaitingDespiteScoreLikeText,
  shouldTreatAsNewAssistantContent,
} from "@/lib/chatgpt-reply-expect";

test("preferCopiedAssistantText uses clipboard when DOM truncates scripts", () => {
  const dom = "[INTRO]\n\n[MAX]\nHi.";
  const copied = [
    "[INTRO]",
    "",
    "[MAX]",
    "Hi Sara.",
    "",
    "[LESSON]",
    "",
    "[PART 1 - CATCH UP]",
    "",
    "[SARA]",
    "The group chat spiral is real.",
    "",
    "[FINAL]",
    "",
    "[MAX]",
    "Bye for now.",
  ].join("\n");

  assert.equal(
    preferCopiedAssistantText({
      domText: dom,
      copiedText: copied,
      expectReplyKind: "script",
    }),
    copied,
  );
});

test("preferCopiedAssistantText keeps DOM when clipboard empty", () => {
  assert.equal(
    preferCopiedAssistantText({
      domText: "[MAX]\nHello",
      copiedText: "",
      expectReplyKind: "script",
    }),
    "[MAX]\nHello",
  );
});

test("script waits never accept score-like replies", () => {
  assert.equal(
    shouldAcceptAsScoreReply({
      expectReplyKind: "script",
      narrationLike: false,
      hasScoreSignal: true,
    }),
    false,
  );
  assert.equal(
    shouldKeepWaitingDespiteScoreLikeText({
      expectReplyKind: "script",
      narrationLike: false,
      hasScoreSignal: true,
    }),
    true,
  );
});

test("score waits accept score signals when not narration", () => {
  assert.equal(
    shouldAcceptAsScoreReply({
      expectReplyKind: "score",
      narrationLike: false,
      hasScoreSignal: true,
    }),
    true,
  );
  assert.equal(
    shouldAcceptAsScoreReply({
      expectReplyKind: "score",
      narrationLike: true,
      hasScoreSignal: true,
    }),
    false,
  );
});

test("fail-fast when Stop cleared with no new assistant bubble", () => {
  assert.equal(
    shouldFailFastMissingAssistantBubble({
      elapsedMs: 180_000,
      assistantCount: 3,
      assistantBaselineCount: 3,
      stopVisible: false,
      sawGeneratingStop: true,
    }),
    true,
  );
  assert.equal(
    shouldFailFastMissingAssistantBubble({
      elapsedMs: 120_000,
      assistantCount: 3,
      assistantBaselineCount: 3,
      stopVisible: false,
      sawGeneratingStop: true,
    }),
    false,
  );
  assert.equal(
    shouldFailFastMissingAssistantBubble({
      elapsedMs: 200_000,
      assistantCount: 4,
      assistantBaselineCount: 3,
      stopVisible: false,
      sawGeneratingStop: true,
    }),
    false,
  );
});

test("shouldTreatAsNewAssistantContent detects script without count bump", () => {
  const baseline = "[INTRO]\n\n[MAX]\nOld short script ending early.";
  const current = [
    "[INTRO]",
    "",
    "[MAX]",
    "Sara, the group chat spiral is real and keeps growing with every maybe.",
    "",
    "[LESSON]",
    "",
    "[PART 1 - CATCH UP]",
    "",
    "[SARA]",
    "Yes. Too many polite replies.",
    "",
    "[CLOSING]",
    "",
    "[MAX]",
    "Write one sentence in the comments.",
    "",
    "[FINAL]",
    "",
    "[SARA]",
    "Bye for now.",
  ].join("\n");

  assert.equal(
    shouldTreatAsNewAssistantContent({
      baselineText: baseline,
      currentText: current,
      expectReplyKind: "script",
      stopVisible: false,
    }),
    true,
  );
  assert.equal(
    shouldTreatAsNewAssistantContent({
      baselineText: baseline,
      currentText: baseline,
      expectReplyKind: "script",
      stopVisible: false,
    }),
    false,
  );
  assert.equal(
    shouldTreatAsNewAssistantContent({
      baselineText: baseline,
      currentText: current,
      expectReplyKind: "script",
      stopVisible: true,
    }),
    false,
  );
});
