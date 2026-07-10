export const VOICEOVER_PACE_PRESETS = [
  "normal",
  "slightly_slower",
  "slow_narrative",
] as const;

export const VOICEOVER_PAUSE_STYLES = [
  "minimal",
  "balanced",
  "dramatic",
] as const;

export type VoiceoverPacePreset = (typeof VOICEOVER_PACE_PRESETS)[number];
export type VoiceoverPauseStyle = (typeof VOICEOVER_PAUSE_STYLES)[number];

export type VoiceoverPacingOptions = {
  pacePreset: VoiceoverPacePreset;
  pauseStyle: VoiceoverPauseStyle;
};

export const DEFAULT_VOICEOVER_PACING: VoiceoverPacingOptions = {
  pacePreset: "normal",
  pauseStyle: "minimal",
};

export const WEALTH_INSIGHTS_VOICEOVER_PACING: VoiceoverPacingOptions = {
  pacePreset: "slightly_slower",
  pauseStyle: "balanced",
};

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(paragraph: string) {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function shouldIsolateSentence(sentence: string, style: VoiceoverPauseStyle) {
  const words = sentence.split(/\s+/).filter(Boolean);

  if (words.length <= 4) {
    return true;
  }

  return style === "dramatic" && words.length <= 7;
}

function formatBalancedParagraph(paragraph: string, style: VoiceoverPauseStyle) {
  const sentences = splitSentences(paragraph);

  if (sentences.length <= 1) {
    return paragraph;
  }

  const chunks: string[] = [];
  let currentChunk: string[] = [];

  for (const sentence of sentences) {
    if (shouldIsolateSentence(sentence, style)) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
      }

      chunks.push(sentence);
      continue;
    }

    currentChunk.push(sentence);

    if (currentChunk.join(" ").length >= (style === "dramatic" ? 150 : 220)) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks.join("\n\n");
}

function applyDramaticEllipses(text: string) {
  return text.replace(
    /\b(But|And yet|Here is the thing|That is the mistake)\b/g,
    (match) => (match === "But" ? "But..." : match),
  );
}

export function applyVoiceoverPacingText(
  text: string,
  options: VoiceoverPacingOptions,
) {
  const normalized = normalizeWhitespace(text);

  if (
    options.pacePreset === "normal" &&
    options.pauseStyle === "minimal"
  ) {
    return normalized;
  }

  // Pacing is primarily controlled through TTS text formatting. Direct speed
  // control should only be passed if supported by the provider helper.
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const shouldAddSpacing =
    options.pauseStyle !== "minimal" ||
    options.pacePreset !== "normal";
  const formatted = paragraphs
    .map((paragraph) =>
      shouldAddSpacing
        ? formatBalancedParagraph(paragraph, options.pauseStyle)
        : paragraph,
    )
    .join("\n\n");

  if (options.pauseStyle !== "dramatic") {
    return formatted;
  }

  return applyDramaticEllipses(formatted);
}
