import {
  exportCuesToSrt,
  exportCuesToVtt,
  type FormattedSubtitleCue,
} from "@/lib/subtitles";
import {
  CAPTION_STYLE_PRESETS,
  DEFAULT_CAPTION_STYLE_PRESET_ID,
  type CaptionStylePresetId,
  type CaptionStylePreset,
} from "@/lib/caption-styles";

export const DEFAULT_SEGMENT_CAPTION_OPTIONS = {
  maxLines: 2,
  maxCharsPerLine: 32,
  targetWordsPerLineMin: 3,
  targetWordsPerLineMax: 7,
  maxWordsPerCue: 10,
  minCueDurationSec: 0.8,
  maxCueDurationSec: 3.2,
  gapBetweenCuesSec: 0.02,
} as const;

export const ACTIVE_WORD_ASS_EVENT_OVERLAP_SEC = 0;
export const ACTIVE_WORD_ASS_TIMING_MODEL = "contiguous_centisecond_events";

export type AlignedWord = {
  word: string;
  start: number;
  end: number;
};

export type ActiveWordCaptionWord = {
  index: number;
  word: string;
  rawWord: string;
  displayWord: string;
  start: number;
  end: number;
  lineIndex: number;
  wordIndexInLine: number;
};

export type ActiveWordCaptionCue = FormattedSubtitleCue & {
  lines: string[];
  words: ActiveWordCaptionWord[];
  style: CaptionStylePresetId;
};

type AlignmentObject = Record<string, unknown>;
type SubtitleChunkTimingWord = AlignedWord & { displayWord: string };

const HOOK_SECONDS_DEFAULT = 120;
const CONTRAST_WORDS = new Set(["but", "then", "because", "so"]);
const SHORT_DRAMATIC_LINES = new Set([
  "NOT CLOSER",
  "FURTHER",
  "WAITING IS EXPOSURE",
  "THAT IS THE MISTAKE",
  "IT IS MOVING",
  "THE MARKET KEEPS MOVING",
  "THAT IS THE DIFFERENCE",
]);
const FUNCTION_WORDS = new Set([
  "A",
  "AN",
  "THE",
  "TO",
  "OF",
  "IN",
  "ON",
  "AT",
  "FOR",
  "AND",
  "OR",
  "BUT",
]);

function isObject(value: unknown): value is AlignmentObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberFrom(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : null;
}

function wordFromObject(item: AlignmentObject): AlignedWord | null {
  const word =
    stringFrom(item.word) ??
    stringFrom(item.text) ??
    stringFrom(item.value) ??
    stringFrom(item.alignedWord);
  const start =
    numberFrom(item.start) ??
    numberFrom(item.start_time) ??
    numberFrom(item.startTime);
  const end =
    numberFrom(item.end) ?? numberFrom(item.end_time) ?? numberFrom(item.endTime);

  if (!word?.trim() || start === null || end === null) {
    return null;
  }

  return { word: word.trim(), start, end };
}

function findArray(value: unknown, keys: string[]): unknown[] | null {
  if (!isObject(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];

    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const candidate of Object.values(value)) {
    if (isObject(candidate)) {
      const nested = findArray(candidate, keys);

      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function normalizeWordsArray(words: unknown[]) {
  return words
    .map((item) => (isObject(item) ? wordFromObject(item) : null))
    .filter((word): word is AlignedWord => Boolean(word))
    .sort((a, b) => a.start - b.start);
}

function charFromObject(item: AlignmentObject) {
  const character =
    stringFrom(item.character) ??
    stringFrom(item.char) ??
    stringFrom(item.text) ??
    stringFrom(item.value);
  const start =
    numberFrom(item.start) ??
    numberFrom(item.start_time) ??
    numberFrom(item.startTime);
  const end =
    numberFrom(item.end) ?? numberFrom(item.end_time) ?? numberFrom(item.endTime);

  if (character === null || start === null || end === null) {
    return null;
  }

  return { character, start, end };
}

function normalizeCharactersArray(characters: unknown[]) {
  const normalizedCharacters = characters
    .map((item) => (isObject(item) ? charFromObject(item) : null))
    .filter(
      (character): character is { character: string; start: number; end: number } =>
        Boolean(character),
    );
  const words: AlignedWord[] = [];
  let currentText = "";
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  function flush() {
    const word = currentText.trim();

    if (word && currentStart !== null && currentEnd !== null) {
      words.push({ word, start: currentStart, end: currentEnd });
    }

    currentText = "";
    currentStart = null;
    currentEnd = null;
  }

  for (const character of normalizedCharacters) {
    if (/\s/.test(character.character)) {
      flush();
      continue;
    }

    if (currentStart === null) {
      currentStart = character.start;
    }

    currentText += character.character;
    currentEnd = character.end;
  }

  flush();

  return words.sort((a, b) => a.start - b.start);
}

export function normalizeElevenLabsAlignment(alignmentJson: unknown): AlignedWord[] {
  const wordsArray = findArray(alignmentJson, [
    "words",
    "word_alignments",
    "wordAlignment",
  ]);

  if (wordsArray) {
    const words = normalizeWordsArray(wordsArray);

    if (words.length > 0) {
      return words;
    }
  }

  const charactersArray = findArray(alignmentJson, [
    "characters",
    "chars",
    "character_alignments",
    "characterAlignment",
  ]);

  return charactersArray ? normalizeCharactersArray(charactersArray) : [];
}

function cueText(words: AlignedWord[]) {
  return words.map((word) => word.word).join(" ").replace(/\s+/g, " ").trim();
}

export function cleanSubtitleDisplayText(
  text: string,
  style: CaptionStylePreset = CAPTION_STYLE_PRESETS.clean_active_word,
) {
  let cleaned = text.replace(/\s+/g, " ").trim();
  const isQuestion = /\?\s*$/.test(cleaned);

  if (style.removeQuotes) {
    cleaned = cleaned.replace(/["'`“”‘’]/g, "");
  }
  if (style.removeCommas) {
    cleaned = cleaned.replace(/,/g, "");
  }
  if (style.removeFinalPeriods) {
    cleaned = cleaned.replace(/\.(?=\s|$)/g, "");
  }
  if (!style.preserveEllipsis) {
    cleaned = cleaned.replace(/\.{3,}/g, "");
  }
  if (!style.preserveExclamationMarks) {
    cleaned = cleaned.replace(/!/g, "");
  }
  if (!style.preserveQuestionMarks || !isQuestion) {
    cleaned = cleaned.replace(/\?/g, "");
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return style.uppercase ? cleaned.toUpperCase() : cleaned;
}

function cleanDisplayWord(
  word: string,
  style: CaptionStylePreset,
) {
  return cleanSubtitleDisplayText(word, style).replace(/\s+/g, " ").trim();
}

function phraseBreakAfter(word: string) {
  return /[.!?;:]$/.test(word);
}

function phraseBreakBefore(word: string) {
  const normalized = word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  return CONTRAST_WORDS.has(normalized);
}

function targetOptionsForTime(style: CaptionStylePreset, startTimeSec: number) {
  const isHook = startTimeSec < HOOK_SECONDS_DEFAULT;

  return {
    maxWords: isHook ? Math.min(style.maxWordsPerCue, 5) : Math.max(style.maxWordsPerCue, 7),
    preferredWords: isHook
      ? style.hookPreferredWordsPerCue
      : style.bodyPreferredWordsPerCue,
    maxChars: isHook ? style.hookMaxCharsPerCue : style.bodyMaxCharsPerCue,
    isHook,
  };
}

function splitCueLinesByBalance(
  words: SubtitleChunkTimingWord[],
  maxCharsPerLine: number,
) {
  if (words.length <= 1) {
    return { lines: [words.map((word) => word.displayWord).join(" ")], lineMap: [0] };
  }

  let bestSplit = Math.ceil(words.length / 2);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split).map((word) => word.displayWord).join(" ");
    const second = words.slice(split).map((word) => word.displayWord).join(" ");
    const score =
      Math.abs(first.length - second.length) +
      Math.max(0, first.length - maxCharsPerLine) * 4 +
      Math.max(0, second.length - maxCharsPerLine) * 4;

    if (score < bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }

  return {
    lines: [
      words.slice(0, bestSplit).map((word) => word.displayWord).join(" "),
      words.slice(bestSplit).map((word) => word.displayWord).join(" "),
    ],
    lineMap: words.map((_, index) => (index < bestSplit ? 0 : 1)),
  };
}

function shouldEndCue(
  words: AlignedWord[],
  nextWord: AlignedWord | undefined,
  options = CAPTION_STYLE_PRESETS.active_word_highlight,
) {
  if (words.length === 0) {
    return false;
  }

  const text = cueText(words);
  const duration = words[words.length - 1].end - words[0].start;
  const lastWord = words[words.length - 1].word;

  if (words.length >= options.maxWordsPerCue) {
    return true;
  }

  if (duration >= options.maxCueDurationSec) {
    return true;
  }

  if (
    text.length >= options.maxCharsPerLine * options.maxLines &&
    duration >= options.minCueDurationSec
  ) {
    return true;
  }

  if (
    /[.!?]$/.test(lastWord) &&
    words.length >= options.minWordsPerCue &&
    duration >= options.minCueDurationSec
  ) {
    return true;
  }

  if (
    nextWord &&
    nextWord.start - words[words.length - 1].end >
      DEFAULT_SEGMENT_CAPTION_OPTIONS.gapBetweenCuesSec + 0.35 &&
    duration >= options.minCueDurationSec
  ) {
    return true;
  }

  return false;
}

function exceedsActiveWordSingleLineCue(
  words: AlignedWord[],
  style: CaptionStylePreset,
) {
  return (
    words.length > style.maxWordsPerCue ||
    cueText(words).length > style.maxCharsPerLine
  );
}

function splitCueLines(
  text: string,
  options: { maxCharsPerLine: number; maxWordsPerCue: number } =
    DEFAULT_SEGMENT_CAPTION_OPTIONS,
) {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length <= Math.min(3, options.maxWordsPerCue)) {
    return text;
  }

  let bestSplit = Math.ceil(words.length / 2);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split).join(" ");
    const second = words.slice(split).join(" ");
    const score =
      Math.abs(first.length - second.length) +
      Math.max(0, first.length - options.maxCharsPerLine) * 3 +
      Math.max(0, second.length - options.maxCharsPerLine) * 3 +
      (/^\$?\d/.test(words[split - 1] ?? "") && /^\d/.test(words[split] ?? "")
        ? 10
        : 0);

    if (score < bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }

  return `${words.slice(0, bestSplit).join(" ")}\n${words
    .slice(bestSplit)
    .join(" ")}`;
}

export function buildCaptionCuesFromWords(
  words: AlignedWord[],
): FormattedSubtitleCue[] {
  const cues: FormattedSubtitleCue[] = [];
  let currentWords: AlignedWord[] = [];

  function flush() {
    if (currentWords.length === 0) {
      return;
    }

    const rawText = cueText(currentWords);

    cues.push({
      index: cues.length + 1,
      start: currentWords[0].start,
      end: currentWords[currentWords.length - 1].end,
      text: splitCueLines(rawText),
      rawText,
    });
    currentWords = [];
  }

  for (let index = 0; index < words.length; index += 1) {
    currentWords.push(words[index]);

    if (shouldEndCue(currentWords, words[index + 1])) {
      flush();
    }
  }

  flush();

  return cues;
}

function normalizeDisplayWord(word: string, style: CaptionStylePreset) {
  return cleanDisplayWord(word, style);
}

function activeCueFromWords(
  cueWords: AlignedWord[],
  index: number,
  style: CaptionStylePreset,
): ActiveWordCaptionCue {
  const rawText = cueText(cueWords);
  const displayWords = cueWords
    .map((word) => ({
      ...word,
      displayWord: normalizeDisplayWord(word.word, style),
    }))
    .filter((word) => word.displayWord);
  const { maxChars } = targetOptionsForTime(style, cueWords[0]?.start ?? 0);
  const lineLayout =
    displayWords.length > 4 ||
    displayWords.map((word) => word.displayWord).join(" ").length > maxChars
      ? splitCueLinesByBalance(displayWords, maxChars)
      : {
          lines: [displayWords.map((word) => word.displayWord).join(" ")],
          lineMap: displayWords.map(() => 0),
        };
  const lines = lineLayout.lines.filter(Boolean);
  const styledWords: ActiveWordCaptionWord[] = [];

  displayWords.forEach((sourceWord, wordIndexInCue) => {
    const lineIndex = lineLayout.lineMap[wordIndexInCue] ?? 0;
    styledWords.push({
      index: wordIndexInCue + 1,
      word: sourceWord.displayWord,
      rawWord: sourceWord.word,
      displayWord: sourceWord.displayWord,
      start: sourceWord.start,
      end: sourceWord.end,
      lineIndex,
      wordIndexInLine:
        displayWords.filter(
          (_, index) => index < wordIndexInCue && (lineLayout.lineMap[index] ?? 0) === lineIndex,
        ).length,
    });
  });

  return {
    index,
    start: cueWords[0].start,
    end: cueWords[cueWords.length - 1].end,
    text: lines.join("\n"),
    lines,
    rawText,
    words: styledWords,
    style: style.id,
  };
}

export function buildActiveWordCaptionCuesFromWords(
  words: AlignedWord[],
  styleOptions: CaptionStylePreset = CAPTION_STYLE_PRESETS.active_word_highlight,
): ActiveWordCaptionCue[] {
  if (styleOptions.phraseMode === "clean") {
    return buildPhraseAwareActiveWordCaptionCues(words, styleOptions);
  }

  const cues: ActiveWordCaptionCue[] = [];
  let currentWords: AlignedWord[] = [];

  function flush() {
    if (currentWords.length === 0) {
      return;
    }

    if (
      currentWords.length === 1 &&
      cues.length > 0 &&
      currentWords[0].end - cues[cues.length - 1].end < 0.45 &&
      !exceedsActiveWordSingleLineCue(
        [
          ...cues[cues.length - 1].words.map((word) => ({
            word: word.rawWord,
            start: word.start,
            end: word.end,
          })),
          ...currentWords,
        ],
        styleOptions,
      )
    ) {
      cues[cues.length - 1] = activeCueFromWords(
        [
          ...cues[cues.length - 1].words.map((word) => ({
            word: word.rawWord,
            start: word.start,
            end: word.end,
          })),
          ...currentWords,
        ],
        cues.length,
        styleOptions,
      );
      currentWords = [];
      return;
    }

    cues.push(activeCueFromWords(currentWords, cues.length + 1, styleOptions));
    currentWords = [];
  }

  for (let index = 0; index < words.length; index += 1) {
    const nextCurrentWords = [...currentWords, words[index]];

    if (
      currentWords.length > 0 &&
      exceedsActiveWordSingleLineCue(nextCurrentWords, styleOptions)
    ) {
      flush();
    }

    currentWords.push(words[index]);

    if (shouldEndCue(currentWords, words[index + 1], styleOptions)) {
      flush();
    }
  }

  flush();

  return cues.map((cue, index) => ({ ...cue, index: index + 1 }));
}

function buildPhraseAwareActiveWordCaptionCues(
  words: AlignedWord[],
  styleOptions: CaptionStylePreset,
): ActiveWordCaptionCue[] {
  const cues: ActiveWordCaptionCue[] = [];
  let currentWords: AlignedWord[] = [];

  function flush() {
    if (currentWords.length === 0) {
      return;
    }

    cues.push(activeCueFromWords(currentWords, cues.length + 1, styleOptions));
    currentWords = [];
  }

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const nextWord = words[index + 1];
    const nextWords = [...currentWords, word];
    const previewText = cleanSubtitleDisplayText(cueText(nextWords), styleOptions);
    const options = targetOptionsForTime(styleOptions, nextWords[0]?.start ?? 0);
    const duration = nextWords[nextWords.length - 1].end - nextWords[0].start;

    if (
      currentWords.length > 0 &&
      phraseBreakBefore(word.word) &&
      currentWords.length >= Math.max(2, options.preferredWords - 1)
    ) {
      flush();
    }

    currentWords.push(word);

    const cleanedText = cleanSubtitleDisplayText(cueText(currentWords), styleOptions);
    const cleanedWordCount = cleanedText.split(/\s+/).filter(Boolean).length;
    const isShortDramaticLine = SHORT_DRAMATIC_LINES.has(cleanedText);
    const tooManyWords = cleanedWordCount >= options.maxWords;
    const tooManyChars = cleanedText.length >= options.maxChars;
    const reachedPreferredSize =
      cleanedWordCount >= options.preferredWords &&
      duration >= styleOptions.minCueDurationSec;
    const gapBreak =
      nextWord &&
      nextWord.start - currentWords[currentWords.length - 1].end >
        DEFAULT_SEGMENT_CAPTION_OPTIONS.gapBetweenCuesSec + 0.25;

    if (
      isShortDramaticLine ||
      phraseBreakAfter(word.word) ||
      tooManyWords ||
      (tooManyChars && reachedPreferredSize) ||
      (gapBreak && cleanedWordCount >= styleOptions.minWordsPerCue) ||
      (duration >= styleOptions.maxCueDurationSec && cleanedWordCount >= styleOptions.minWordsPerCue)
    ) {
      flush();
      continue;
    }

    if (
      nextWord &&
      phraseBreakBefore(nextWord.word) &&
      cleanedWordCount >= styleOptions.minWordsPerCue
    ) {
      flush();
      continue;
    }

    if (
      previewText.length >= options.maxChars &&
      cleanedWordCount >= styleOptions.minWordsPerCue
    ) {
      flush();
    }
  }

  flush();
  return cues.map((cue, index) => ({ ...cue, index: index + 1 }));
}

export function offsetCues(
  cues: FormattedSubtitleCue[],
  offset: number,
  startIndex = 1,
): FormattedSubtitleCue[] {
  return cues.map((cue, index) => ({
    ...cue,
    index: startIndex + index,
    start: cue.start + offset,
    end: cue.end + offset,
    words: "words" in cue && Array.isArray(cue.words)
      ? cue.words.map((word) => ({
          ...word,
          start: word.start + offset,
          end: word.end + offset,
        }))
      : undefined,
  }));
}

export function exportCombinedCues(cues: FormattedSubtitleCue[]) {
  return {
    cues,
    srt: exportCuesToSrt(cues),
    vtt: exportCuesToVtt(cues),
    ass: exportActiveWordCaptionsToAss(cues),
    activeWordJson: exportActiveWordCaptionsToJson(cues),
  };
}

export function getActiveWordIndexForCue(
  cue: Pick<ActiveWordCaptionCue, "words">,
  currentTimeSec: number,
) {
  const activeWord = cue.words.find(
    (word) => word.start <= currentTimeSec && currentTimeSec < word.end,
  );

  return activeWord?.index ?? null;
}

export function getCaptionCueAtTime(
  cues: Array<Pick<FormattedSubtitleCue, "start" | "end">>,
  currentTimeSec: number,
) {
  return (
    cues.find((cue) => cue.start <= currentTimeSec && currentTimeSec < cue.end) ??
    null
  );
}

function assTimestamp(seconds: number) {
  return assTimestampFromCs(toAssCs(seconds));
}

function toAssCs(seconds: number) {
  return Math.max(0, Math.round(seconds * 100));
}

function assTimestampFromCs(centiseconds: number) {
  const safeCentiseconds = Math.max(0, centiseconds);
  const hours = Math.floor(safeCentiseconds / 360000);
  const minutes = Math.floor((safeCentiseconds % 360000) / 6000);
  const secs = Math.floor((safeCentiseconds % 6000) / 100);
  const cs = safeCentiseconds % 100;

  return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function assTimestampToSeconds(timestamp: string) {
  const [hours = "0", minutes = "0", seconds = "0"] = timestamp.split(":");
  const parsedSeconds = Number(seconds);

  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    (Number.isFinite(parsedSeconds) ? parsedSeconds : 0)
  );
}

export function hexToAssColor(hex: string, alpha = "00") {
  const normalized = hex.replace("#", "").padStart(6, "0").slice(0, 6);
  const rr = normalized.slice(0, 2);
  const gg = normalized.slice(2, 4);
  const bb = normalized.slice(4, 6);

  return `&H${alpha}${bb}${gg}${rr}`;
}

function escapeAssText(text: string) {
  return text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function activeWordAssText(
  cue: FormattedSubtitleCue,
  activeWordIndex: number | null,
  styleOptions: CaptionStylePreset,
) {
  if (!("words" in cue) || !Array.isArray(cue.words)) {
    return escapeAssText(cue.text);
  }

  const inactiveColor = hexToAssColor(styleOptions.inactiveColor).replace("&H", "H");
  const activeColor = hexToAssColor(styleOptions.activeColor).replace("&H", "H");

  return cue.words
    .map((word, index) => {
      const prefix = index > 0 ? " " : "";
      const color =
        activeWordIndex !== null && word.index === activeWordIndex
          ? activeColor
          : inactiveColor;

      return `${prefix}{\\c&${color}&}${escapeAssText(word.word)}`;
    })
    .join("");
}

type ActiveWordAssEvent = {
  cueIndex: number;
  startCs: number;
  endCs: number;
  activeWordIndex: number;
  line: string;
};

function clampAssCs(value: number, startCs: number, endCs: number) {
  return Math.min(Math.max(value, startCs), endCs);
}

function buildActiveWordAssEventsForCue(
  cue: FormattedSubtitleCue,
  styleOptions: CaptionStylePreset,
): ActiveWordAssEvent[] {
  const cueStartCs = toAssCs(cue.start);
  const cueEndCs = Math.max(cueStartCs, toAssCs(cue.end));
  const words = "words" in cue && Array.isArray(cue.words) ? cue.words : [];

  if (cueEndCs <= cueStartCs) {
    return [];
  }

  if (words.length === 0) {
    return [
      {
        cueIndex: cue.index,
        startCs: cueStartCs,
        endCs: cueEndCs,
        activeWordIndex: -1,
        line: `Dialogue: 0,${assTimestampFromCs(cueStartCs)},${assTimestampFromCs(cueEndCs)},ActiveWord,,0,0,0,,${escapeAssText(cue.text)}`,
      },
    ];
  }

  const timingWords = [...words].sort(
    (a, b) => a.start - b.start || a.index - b.index,
  );
  const events: ActiveWordAssEvent[] = [];
  let startCs = cueStartCs;

  for (const [index, word] of timingWords.entries()) {
    const nextWord = timingWords[index + 1] ?? null;
    const rawEndCs = nextWord ? toAssCs(nextWord.start) : cueEndCs;
    let endCs = clampAssCs(rawEndCs, cueStartCs, cueEndCs);

    if (endCs <= startCs) {
      continue;
    }

    if (index === timingWords.length - 1) {
      endCs = cueEndCs;
    }

    events.push({
      cueIndex: cue.index,
      startCs,
      endCs,
      activeWordIndex: word.index,
      line: `Dialogue: 0,${assTimestampFromCs(startCs)},${assTimestampFromCs(endCs)},ActiveWord,,0,0,0,,${activeWordAssText(cue, word.index, styleOptions)}`,
    });
    startCs = endCs;
  }

  return events;
}

export function exportActiveWordCaptionsToAss(
  cues: FormattedSubtitleCue[],
  styleOptions: CaptionStylePreset = CAPTION_STYLE_PRESETS.active_word_highlight,
) {
  const primaryColor = hexToAssColor(styleOptions.inactiveColor);
  const outlineColor = hexToAssColor(styleOptions.outlineColor);
  const backColor = hexToAssColor(styleOptions.shadowColor, "80");
  const events: ActiveWordAssEvent[] = [];

  for (const cue of cues) {
    events.push(...buildActiveWordAssEventsForCue(cue, styleOptions));
  }

  events.sort(
    (a, b) =>
      a.cueIndex - b.cueIndex ||
      a.startCs - b.startCs ||
      a.activeWordIndex - b.activeWordIndex,
  );

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ActiveWord,${styleOptions.fontFamily},${styleOptions.fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},1,0,0,0,100,100,0,0,1,${styleOptions.outlineWidth},${styleOptions.shadowBlur},2,80,80,${styleOptions.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events.map((event) => event.line),
  ].join("\n");
}

export function analyzeActiveWordAssEvents(
  cues: FormattedSubtitleCue[],
  assText: string | null | undefined,
) {
  const dialogueLines = assText
    ?.split("\n")
    .filter((line) => line.startsWith("Dialogue:")) ?? [];
  const durations = dialogueLines
    .map((line) => {
      const parts = line.replace(/^Dialogue:\s*/, "").split(",");
      const start = assTimestampToSeconds(parts[1] ?? "0");
      const end = assTimestampToSeconds(parts[2] ?? "0");

      return end - start;
    })
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const gapWarnings: string[] = [];
  const overlapWarnings: string[] = [];

  for (const cue of cues) {
    const cueEvents = buildActiveWordAssEventsForCue(
      cue,
      CAPTION_STYLE_PRESETS.active_word_highlight,
    ).sort((a, b) => a.startCs - b.startCs || a.endCs - b.endCs);

    for (let index = 0; index < cueEvents.length - 1; index += 1) {
      const currentEvent = cueEvents[index];
      const nextEvent = cueEvents[index + 1];

      if (nextEvent.startCs > currentEvent.endCs) {
        gapWarnings.push(
          `Cue ${cue.index}: gap from ${currentEvent.endCs}cs to ${nextEvent.startCs}cs.`,
        );
      }

      if (nextEvent.startCs < currentEvent.endCs) {
        overlapWarnings.push(
          `Cue ${cue.index}: overlap from ${nextEvent.startCs}cs to ${currentEvent.endCs}cs.`,
        );
      }
    }
  }

  return {
    assDialogueEventsCount: dialogueLines.length,
    eventCount: dialogueLines.length,
    minEventDurationSec: durations.length ? Math.min(...durations) : 0,
    maxEventDurationSec: durations.length ? Math.max(...durations) : 0,
    totalCaptionCoveredDurationSec: durations.reduce(
      (total, duration) => total + duration,
      0,
    ),
    gapWarnings,
    overlapWarnings,
    duplicateRisk: overlapWarnings.length > 0,
  };
}

export function exportActiveWordCaptionsToJson(
  cues: FormattedSubtitleCue[],
  styleOptions: CaptionStylePreset = CAPTION_STYLE_PRESETS.active_word_highlight,
) {
  return {
    style: DEFAULT_CAPTION_STYLE_PRESET_ID,
    styleOptions,
    cues,
  };
}
