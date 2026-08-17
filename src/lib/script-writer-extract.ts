/**
 * ChatGPT assistant chrome that can leak into innerText (EN/ES).
 * Match whole lines only so real narration is never stripped mid-sentence.
 */
const CHATGPT_UI_LINE =
  /^(edit(?:ar)?|copy(?: code)?|copiar(?: código)?|share|compartir|regenerate|regenerar|retry|reintentar|good response|bad response|buena respuesta|mala respuesta|continue generating|seguir generando|read aloud|leer en voz alta|more|más|like|dislike|me gusta|no me gusta)$/i;

export function stripChatGptUiChrome(text: string): string {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && (!lines[0]!.trim() || CHATGPT_UI_LINE.test(lines[0]!.trim()))) {
    lines.shift();
  }
  while (
    lines.length > 0 &&
    (!lines[lines.length - 1]!.trim() ||
      CHATGPT_UI_LINE.test(lines[lines.length - 1]!.trim()))
  ) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

/**
 * Normalize a Script Writer ChatGPT response into plain narration for Video.script.
 */
export function extractScriptFromResponse(rawResponse: string): string {
  let text = stripChatGptUiChrome(rawResponse.trim());
  if (!text) {
    throw new Error("ChatGPT returned an empty script.");
  }

  const fencedBlocks = [...text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)].map(
    (match) => match[1]?.trim() ?? "",
  );
  const proseFences = fencedBlocks.filter(
    (block) =>
      block &&
      !block.trimStart().startsWith("{") &&
      !/"topics"\s*:/.test(block) &&
      !/"score"\s*:/.test(block),
  );

  if (proseFences.length === 1 && proseFences[0]) {
    text = proseFences[0];
  } else if (proseFences.length > 1) {
    text = proseFences.reduce((longest, block) =>
      block.length > longest.length ? block : longest,
    );
  } else if (
    fencedBlocks.length === 1 &&
    fencedBlocks[0] &&
    !/"topics"\s*:/.test(fencedBlocks[0]) &&
    !/"score"\s*:/.test(fencedBlocks[0])
  ) {
    text = fencedBlocks[0];
  }

  text = stripChatGptUiChrome(
    text
      .replace(/^\uFEFF/, "")
      .replace(/^#{1,6}\s+.+$/gm, "")
      .replace(
        /^(here(?:'s| is)|below is|i(?:'ve| have) (?:written|prepared)|sure[,!]?\s*)[^\n]{0,80}:\s*/i,
        "",
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

  // Unwrap {"script":"..."} wrappers ChatGPT sometimes returns.
  text = unwrapScriptJsonEnvelope(text);

  // Reject critique/score JSON mistaken for scripts (common after revision turns).
  if (looksLikeScoreOnlyJson(text)) {
    throw new Error(
      "ChatGPT returned a score/critique JSON instead of a narration script. Resume Batch or retry the rewrite turn.",
    );
  }

  // Reject provider/refusal error JSON mistaken for scripts.
  if (looksLikeErrorOnlyJson(text)) {
    throw new Error(
      "ChatGPT returned an error JSON instead of a narration script. Retry Script Writer Batch.",
    );
  }

  // Reject obvious JSON topic batches mistaken for scripts.
  if (/^\s*\{\s*"topics"\s*:/.test(text) || /"topics"\s*:\s*\[/.test(text)) {
    throw new Error(
      "ChatGPT returned topic-batch JSON instead of a narration script. Open a new ChatGPT chat and retry.",
    );
  }

  if (!text || text.length < 40) {
    throw new Error(
      "ChatGPT response did not look like a narration script. Try Run Batch again or paste manually.",
    );
  }

  return text;
}

function looksLikeScoreOnlyJson(text: string) {
  if (!/"score"\s*:/i.test(text)) {
    return false;
  }
  // Narration scripts use bracket labels; score replies do not.
  if (
    /\[(?:INTRO|LESSON|CLOSING|FINAL|EMMA|LEO|MAX|SARA|PART\b)/i.test(text)
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(text) as { score?: unknown; script?: unknown };
    if (typeof parsed.script === "string" && parsed.script.trim()) {
      return false;
    }
    return parsed.score != null;
  } catch {
    return /^\s*\{\s*"score"\s*:/i.test(text) && text.length < 2000;
  }
}

function looksLikeErrorOnlyJson(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || trimmed.length > 4000) {
    return false;
  }
  if (
    /\[(?:INTRO|LESSON|CLOSING|FINAL|EMMA|LEO|MAX|SARA|PART\b)/i.test(trimmed)
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: unknown;
      script?: unknown;
    };
    if (typeof parsed.script === "string" && parsed.script.trim()) {
      return false;
    }
    return typeof parsed.error === "string" && parsed.error.trim().length > 0;
  } catch {
    return /^\s*\{\s*"error"\s*:/i.test(trimmed);
  }
}

const SCRIPT_ENVELOPE_KEYS = [
  "script",
  "revisedNarrationScript",
  "revisedScript",
  "narrationScript",
  "narration",
  "fullScript",
] as const;

function unwrapScriptJsonEnvelope(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return text;
  }

  const hasEnvelopeKey = SCRIPT_ENVELOPE_KEYS.some((key) =>
    new RegExp(`"${key}"\\s*:`).test(trimmed),
  );
  if (!hasEnvelopeKey) {
    return text;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of SCRIPT_ENVELOPE_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length >= 40) {
        return value.replace(/\\n/g, "\n").trim();
      }
    }
  } catch {
    // Fall through to a tolerant extractor for slightly malformed JSON.
  }

  for (const key of SCRIPT_ENVELOPE_KEYS) {
    const match = trimmed.match(
      new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`),
    );
    if (match?.[1]) {
      try {
        const unescaped = JSON.parse(`"${match[1]}"`) as string;
        if (unescaped.trim().length >= 40) {
          return unescaped.trim();
        }
      } catch {
        const loose = match[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
          .trim();
        if (loose.length >= 40) {
          return loose;
        }
      }
    }
  }

  return text;
}

/** True when assistant text looks like a podcast/narration script, not a score. */
export function looksLikeNarrationScript(text: string): boolean {
  const cleaned = stripChatGptUiChrome(text.trim());
  if (!cleaned) {
    return false;
  }
  if (looksLikeScoreOnlyJson(cleaned)) {
    return false;
  }
  if (looksLikeErrorOnlyJson(cleaned)) {
    return false;
  }
  // Podcast English Lessons: Emma/Leo challenge OR Max/Sara conversation.
  if (
    /\[(?:INTRO|LESSON|CLOSING|FINAL|EMMA|LEO|MAX|SARA|TEACHER|STUDENT|PART\b)/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  // Generic long narration without brackets.
  return cleaned.length > 800 && !/"score"\s*:/i.test(cleaned);
}
