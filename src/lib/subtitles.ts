export const DEFAULT_CAPTION_STYLE = {
  maxLines: 2,
  targetWordsPerLineMin: 3,
  targetWordsPerLineMax: 7,
  maxCharsPerLine: 32,
  avoidThreeLines: true,
  preserveMeaning: true,
} as const;

export type SubtitleFormat = "srt" | "vtt";
export type SubtitleInputFormat = SubtitleFormat | "auto";

export type ParsedSubtitleCue = {
  start: number;
  end: number;
  rawText: string;
};

export type FormattedSubtitleCue = ParsedSubtitleCue & {
  index: number;
  text: string;
  sceneOrder?: number;
  warnings?: string[];
};

const timestampPattern =
  /((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/;

function normalizeInput(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function detectSubtitleFormat(input: string): SubtitleFormat {
  if (/^\s*WEBVTT\b/i.test(input) || /\d{2}:\d{2}\.\d{3}\s*-->/i.test(input)) {
    return "vtt";
  }

  return "srt";
}

export function timestampToSeconds(timestamp: string): number {
  const normalized = timestamp.trim().replace(",", ".");
  const [timePart, millisecondsPart = "0"] = normalized.split(".");
  const parts = timePart.split(":").map((part) => Number(part));

  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  const paddedParts = parts.length === 2 ? [0, ...parts] : parts;
  const [hours = 0, minutes = 0, seconds = 0] = paddedParts;
  const milliseconds = Number(millisecondsPart.padEnd(3, "0").slice(0, 3));

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function secondsToTimestamp(seconds: number, format: SubtitleFormat): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const milliseconds = Math.round((safeSeconds - wholeSeconds) * 1000);
  const adjustedSeconds =
    milliseconds === 1000 ? wholeSeconds + 1 : wholeSeconds;
  const adjustedMilliseconds = milliseconds === 1000 ? 0 : milliseconds;
  const hours = Math.floor(adjustedSeconds / 3600);
  const minutes = Math.floor((adjustedSeconds % 3600) / 60);
  const secs = adjustedSeconds % 60;
  const separator = format === "srt" ? "," : ".";

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    secs.toString().padStart(2, "0"),
  ].join(":") + separator + adjustedMilliseconds.toString().padStart(3, "0");
}

export function parseSubtitleText(
  input: string,
  format: SubtitleInputFormat = "auto",
): ParsedSubtitleCue[] {
  const normalized = normalizeInput(input);

  if (!normalized) {
    return [];
  }

  const resolvedFormat = format === "auto" ? detectSubtitleFormat(normalized) : format;
  const lines = (resolvedFormat === "vtt"
    ? normalized.replace(/^\s*WEBVTT[^\n]*\n?/i, "")
    : normalized
  ).split("\n");
  const cues: ParsedSubtitleCue[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    const match = line.match(timestampPattern);

    if (!match?.[1] || !match[2]) {
      continue;
    }

    const textLines: string[] = [];
    index += 1;

    while (index < lines.length) {
      const textLine = lines[index]?.trim() ?? "";

      if (!textLine) {
        break;
      }

      if (
        !/^\d+$/.test(textLine) &&
        !/^WEBVTT\b/i.test(textLine) &&
        !/^(NOTE|STYLE|REGION)\b/i.test(textLine)
      ) {
        textLines.push(textLine);
      }

      index += 1;
    }

    const rawText = textLines.join(" ").replace(/\s+/g, " ").trim();

    if (rawText) {
      cues.push({
        start: timestampToSeconds(match[1]),
        end: timestampToSeconds(match[2]),
        rawText,
      });
    }
  }

  return cues;
}

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function lineIsReadable(line: string) {
  const words = wordCount(line);

  return (
    words <= DEFAULT_CAPTION_STYLE.targetWordsPerLineMax &&
    line.length <= DEFAULT_CAPTION_STYLE.maxCharsPerLine
  );
}

function punctuationPenalty(previousWord: string, nextWord: string) {
  let penalty = 0;

  if (/^[,.;:!?)]/.test(nextWord)) {
    penalty += 4;
  }

  if (/[(]$/.test(previousWord)) {
    penalty += 4;
  }

  if (/^\$?\d/.test(previousWord) && /^\d/.test(nextWord)) {
    penalty += 3;
  }

  return penalty;
}

function splitReadableLines(words: string[]) {
  if (words.length <= DEFAULT_CAPTION_STYLE.targetWordsPerLineMax) {
    return [words.join(" ")];
  }

  let bestSplit = Math.ceil(words.length / 2);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split).join(" ");
    const second = words.slice(split).join(" ");
    const firstWords = split;
    const secondWords = words.length - split;
    const score =
      Math.abs(firstWords - secondWords) * 2 +
      Math.max(0, first.length - DEFAULT_CAPTION_STYLE.maxCharsPerLine) +
      Math.max(0, second.length - DEFAULT_CAPTION_STYLE.maxCharsPerLine) +
      Math.max(0, DEFAULT_CAPTION_STYLE.targetWordsPerLineMin - firstWords) +
      Math.max(0, DEFAULT_CAPTION_STYLE.targetWordsPerLineMin - secondWords) +
      punctuationPenalty(words[split - 1] ?? "", words[split] ?? "");

    if (score < bestScore) {
      bestSplit = split;
      bestScore = score;
    }
  }

  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
}

function cleanSubtitleText(text: string) {
  return text
    .replace(/["'`“”‘’]/g, "")
    .replace(/,/g, "")
    .replace(/\.(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function formatSubtitleCuesForReadableCaptions(
  cues: ParsedSubtitleCue[],
): FormattedSubtitleCue[] {
  return cues.map((cue, index) => {
    const normalizedText = cleanSubtitleText(cue.rawText);
    const words = normalizedText.split(/\s+/).filter(Boolean);
    const lines = splitReadableLines(words);

    return {
      index: index + 1,
      start: cue.start,
      end: cue.end,
      text: lines.join("\n"),
      rawText: cue.rawText,
    };
  });
}

export function exportCuesToSrt(cues: FormattedSubtitleCue[]): string {
  return cues
    .map((cue, index) =>
      [
        index + 1,
        `${secondsToTimestamp(cue.start, "srt")} --> ${secondsToTimestamp(cue.end, "srt")}`,
        cue.text,
      ].join("\n"),
    )
    .join("\n\n");
}

export function exportCuesToVtt(cues: FormattedSubtitleCue[]): string {
  return `WEBVTT\n\n${cues
    .map((cue, index) =>
      [
        index + 1,
        `${secondsToTimestamp(cue.start, "vtt")} --> ${secondsToTimestamp(cue.end, "vtt")}`,
        cue.text,
      ].join("\n"),
    )
    .join("\n\n")}`;
}

export function getCaptionStats(cues: FormattedSubtitleCue[]) {
  const totalDurationSeconds = cues.reduce(
    (total, cue) => total + Math.max(0, cue.end - cue.start),
    0,
  );
  const totalWords = cues.reduce((total, cue) => total + wordCount(cue.text), 0);
  const longLineCount = cues.filter((cue) =>
    cue.text.split("\n").some((line) => !lineIsReadable(line)),
  ).length;
  const moreThanTwoLinesCount = cues.filter(
    (cue) => cue.text.split("\n").length > DEFAULT_CAPTION_STYLE.maxLines,
  ).length;

  return {
    cueCount: cues.length,
    totalDurationSeconds,
    averageWordsPerCue: cues.length > 0 ? totalWords / cues.length : 0,
    longLineCount,
    moreThanTwoLinesCount,
  };
}
