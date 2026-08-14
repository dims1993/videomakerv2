/**
 * Expected shape of the next ChatGPT assistant reply for browser waits.
 * Used to avoid accepting a leftover score JSON while waiting for a script
 * rewrite (and vice versa).
 */
export type ChatGptExpectReplyKind = "score" | "script" | "any";

export function shouldAcceptAsScoreReply({
  expectReplyKind,
  narrationLike,
  hasScoreSignal,
}: {
  expectReplyKind: ChatGptExpectReplyKind;
  narrationLike: boolean;
  hasScoreSignal: boolean;
}): boolean {
  if (expectReplyKind === "script") {
    return false;
  }
  if (narrationLike) {
    return false;
  }
  return hasScoreSignal;
}

export function shouldKeepWaitingDespiteScoreLikeText({
  expectReplyKind,
  narrationLike,
  hasScoreSignal,
}: {
  expectReplyKind: ChatGptExpectReplyKind;
  narrationLike: boolean;
  hasScoreSignal: boolean;
}): boolean {
  return (
    expectReplyKind === "script" && !narrationLike && hasScoreSignal
  );
}

/**
 * Fail-fast when Stop already cleared but no new assistant bubble appeared.
 * Full session timeouts can be 15m+; this avoids burning them on a dead turn.
 */
export function shouldFailFastMissingAssistantBubble({
  elapsedMs,
  assistantCount,
  assistantBaselineCount,
  stopVisible,
  sawGeneratingStop,
  hangTimeoutMs = 180_000,
}: {
  elapsedMs: number;
  assistantCount: number;
  assistantBaselineCount: number;
  stopVisible: boolean;
  sawGeneratingStop: boolean;
  hangTimeoutMs?: number;
}): boolean {
  return (
    elapsedMs >= hangTimeoutMs &&
    assistantCount <= assistantBaselineCount &&
    !stopVisible &&
    sawGeneratingStop
  );
}

/**
 * ChatGPT sometimes finishes a turn without bumping
 * `[data-message-author-role="assistant"]` count (virtualized DOM / in-place
 * update). Detect a usable new reply by content change vs the pre-Send snapshot.
 */
export function shouldTreatAsNewAssistantContent({
  baselineText,
  currentText,
  expectReplyKind = "any",
  stopVisible,
}: {
  baselineText: string;
  currentText: string;
  expectReplyKind?: ChatGptExpectReplyKind;
  stopVisible: boolean;
}): boolean {
  if (stopVisible) {
    return false;
  }

  const baseline = baselineText.trim();
  const current = currentText.trim();
  if (!current || current === baseline) {
    return false;
  }

  const grewALot = current.length >= baseline.length + 400;
  const replacedPrefix =
    baseline.length >= 80 &&
    current.length >= 400 &&
    !current.startsWith(baseline.slice(0, 80));

  if (expectReplyKind === "script") {
    const looksScript =
      /\[(?:INTRO|LESSON|CLOSING|FINAL|EMMA|LEO|MAX|SARA|PART\b)/i.test(
        current,
      ) && current.length >= 200;
    if (
      looksScript &&
      (grewALot || replacedPrefix || current.length > baseline.length + 50)
    ) {
      return true;
    }
    return false;
  }

  if (expectReplyKind === "score") {
    return /"score"\s*:/i.test(current) && (grewALot || replacedPrefix || !/"score"\s*:/i.test(baseline));
  }

  return grewALot || replacedPrefix;
}

/**
 * Prefer ChatGPT's official Copy-turn clipboard when DOM innerText is empty,
 * truncated, or missing script markers that the clipboard still has.
 */
export function preferCopiedAssistantText({
  domText,
  copiedText,
  expectReplyKind = "any",
  isNarrationScript,
}: {
  domText: string;
  copiedText: string;
  expectReplyKind?: ChatGptExpectReplyKind;
  isNarrationScript?: (text: string) => boolean;
}): string {
  const dom = domText.trim();
  const copied = copiedText.trim();
  if (!copied) {
    return dom;
  }
  if (!dom) {
    return copied;
  }

  const narrationCheck =
    isNarrationScript ??
    ((text: string) =>
      /\[(?:INTRO|LESSON|CLOSING|FINAL|EMMA|LEO|MAX|SARA|PART\b)/i.test(text));

  if (expectReplyKind === "script") {
    if (narrationCheck(copied) && !narrationCheck(dom)) {
      return copied;
    }
    // DOM often truncates long podcast scripts; clipboard is usually complete.
    if (copied.length >= Math.max(200, Math.floor(dom.length * 1.05))) {
      return copied;
    }
  }

  if (expectReplyKind === "score") {
    const copiedHasScore = /"score"\s*:/i.test(copied);
    const domHasScore = /"score"\s*:/i.test(dom);
    if (copiedHasScore && !domHasScore) {
      return copied;
    }
  }

  if (copied.length > dom.length * 1.15) {
    return copied;
  }

  return dom;
}
