import {
  PODCAST_ACTING_TAG_WHITELIST,
  PODCAST_ENGLISH_GOLD_STANDARD,
  PODCAST_FORCED_HOPE_LINE_STEM,
  PODCAST_FORCED_THANKS_LINE,
  PODCAST_MAX_SARA_GOLD_STANDARD,
  canonicalizePodcastActingTag,
  type PodcastEpisodeFormat,
} from "@/lib/podcast-english-lessons-script-shared";
import { extractScriptFromResponse } from "@/lib/script-writer-extract";

export type PodcastScriptValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type PodcastScriptMetrics = {
  spokenWordCount: number;
  partCount: number;
  pauseCount: number;
  pauseSeconds: number;
  hasIntro: boolean;
  hasLesson: boolean;
  hasClosing: boolean;
  hasFinal: boolean;
  consecutiveEchoPairs: number;
  format: PodcastEpisodeFormat;
};

export type PodcastScriptValidationResult = {
  ok: boolean;
  normalizedScript: string;
  errors: PodcastScriptValidationIssue[];
  warnings: PodcastScriptValidationIssue[];
  metrics: PodcastScriptMetrics;
};

const EMMA_LEO_SPEAKER_RE = /^(EMMA|LEO|TEACHER|STUDENT|HOST|GUEST)$/i;
const MAX_SARA_SPEAKER_RE = /^(MAX|SARA)$/i;
const PART_RE = /^PART\s+(\d+)\s*[-—–]\s*(.+)$/i;
const PAUSE_RE = /^PAUSE:\s*(\d+(?:\.\d+)?)\s*s$/i;
const LONG_PAUSE_RE = /^LONG PAUSE:\s*(\d+(?:\.\d+)?)\s*s$/i;
const MUSIC_RE = /^MUSIC\b/i;
const SECTION_RE = /^(INTRO|LESSON|CLOSING|FINAL)$/i;

function parseBracketLabel(line: string): string | null {
  const match = line.trim().match(/^\[([^\]]+)\]\s*$/);
  return match?.[1]?.trim() ?? null;
}

function isSpeaker(label: string, format: PodcastEpisodeFormat) {
  return format === "max_sara_conversation"
    ? MAX_SARA_SPEAKER_RE.test(label)
    : EMMA_LEO_SPEAKER_RE.test(label);
}

function countSpokenWords(script: string) {
  const spoken = script
    .replace(/^\[[^\]]+\]\s*$/gm, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/^#.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spoken) {
    return 0;
  }
  return spoken.split(/\s+/).filter(Boolean).length;
}

function collectTurns(script: string, format: PodcastEpisodeFormat) {
  const lines = script.split(/\r?\n/);
  const turns: Array<{ speaker: string; text: string }> = [];
  let current: { speaker: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) {
      return;
    }
    const text = current.lines.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      turns.push({ speaker: current.speaker, text });
    }
    current = null;
  };

  for (const raw of lines) {
    const label = parseBracketLabel(raw);
    if (label && isSpeaker(label, format)) {
      flush();
      current = { speaker: label.toUpperCase(), lines: [] };
      continue;
    }
    if (label) {
      flush();
      continue;
    }
    if (current && raw.trim()) {
      current.lines.push(raw.trim());
    }
  }
  flush();
  return turns;
}

/** Host turns from the start of the script until the first [PART N - TITLE]. */
function countSpeakerTurnsBeforeFirstPart(
  script: string,
  format: PodcastEpisodeFormat,
) {
  const lines = script.split(/\r?\n/);
  let turns = 0;
  let currentSpeaker: string | null = null;

  for (const raw of lines) {
    const label = parseBracketLabel(raw);
    if (!label) {
      continue;
    }
    if (PART_RE.test(label)) {
      break;
    }
    if (isSpeaker(label, format)) {
      const speaker = label.toUpperCase();
      if (speaker !== currentSpeaker) {
        turns += 1;
        currentSpeaker = speaker;
      }
    } else {
      currentSpeaker = null;
    }
  }

  return turns;
}

function normalizeComparable(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyMetrics(format: PodcastEpisodeFormat): PodcastScriptMetrics {
  return {
    spokenWordCount: 0,
    partCount: 0,
    pauseCount: 0,
    pauseSeconds: 0,
    hasIntro: false,
    hasLesson: false,
    hasClosing: false,
    hasFinal: false,
    consecutiveEchoPairs: 0,
    format,
  };
}

/**
 * Deterministic structural validation before ChatGPT scoring.
 */
export function validatePodcastEnglishScript(
  rawScript: string,
  format: PodcastEpisodeFormat = "emma_leo_lesson",
): PodcastScriptValidationResult {
  const errors: PodcastScriptValidationIssue[] = [];
  const warnings: PodcastScriptValidationIssue[] = [];

  let normalizedScript = "";
  try {
    normalizedScript = extractScriptFromResponse(rawScript);
  } catch (error) {
    return {
      ok: false,
      normalizedScript: rawScript.trim(),
      errors: [
        {
          code: "extract_failed",
          message:
            error instanceof Error
              ? error.message
              : "Could not normalize script text.",
          severity: "error",
        },
      ],
      warnings: [],
      metrics: emptyMetrics(format),
    };
  }

  const lines = normalizedScript.split(/\r?\n/);
  const labels: Array<{ line: number; label: string }> = [];
  let danglingSpeaker = false;
  let lastSpeakerLine = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const label = parseBracketLabel(line);
    if (!label) {
      if (danglingSpeaker && line.trim()) {
        danglingSpeaker = false;
      }
      continue;
    }

    labels.push({ line: i + 1, label });

    if (MUSIC_RE.test(label)) {
      errors.push({
        code: "music_cue",
        message: `Music cues are forbidden (found [${label}] on line ${i + 1}).`,
        severity: "error",
      });
    }

    if (isSpeaker(label, format)) {
      danglingSpeaker = true;
      lastSpeakerLine = i + 1;
      let hasDialogue = false;
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j] ?? "";
        if (!next.trim()) {
          continue;
        }
        if (parseBracketLabel(next)) {
          break;
        }
        hasDialogue = true;
        break;
      }
      if (!hasDialogue) {
        errors.push({
          code: "dangling_speaker",
          message: `Speaker tag [${label}] on line ${i + 1} has no dialogue underneath.`,
          severity: "error",
        });
      }
      continue;
    }

    // Wrong-cast speakers become hard errors for the active format.
    if (format === "max_sara_conversation" && EMMA_LEO_SPEAKER_RE.test(label)) {
      errors.push({
        code: "wrong_cast",
        message: `Max & Sara episodes must use [MAX]/[SARA] only (found [${label}] on line ${i + 1}).`,
        severity: "error",
      });
      continue;
    }
    if (format === "emma_leo_lesson" && MAX_SARA_SPEAKER_RE.test(label)) {
      errors.push({
        code: "wrong_cast",
        message: `Emma & Leo episodes must use [EMMA]/[LEO] (or aliases), not [${label}] (line ${i + 1}).`,
        severity: "error",
      });
      continue;
    }

    if (PAUSE_RE.test(label) || LONG_PAUSE_RE.test(label)) {
      if (format === "max_sara_conversation") {
        errors.push({
          code: "learner_pause",
          message: `Timed learner pauses are not used in Max & Sara conversation episodes (found [${label}] on line ${i + 1}).`,
          severity: "error",
        });
      }
      continue;
    }

    if (PART_RE.test(label) || SECTION_RE.test(label)) {
      continue;
    }

    const acting = canonicalizePodcastActingTag(label);
    if (acting) {
      continue;
    }

    if (/^PART\b/i.test(label)) {
      errors.push({
        code: "part_format",
        message: `PART label must be [PART N - TITLE] (found [${label}] on line ${i + 1}).`,
        severity: "error",
      });
    } else if (/^INTRODUCTION$/i.test(label)) {
      errors.push({
        code: "intro_alias",
        message: `Use [INTRO], not [INTRODUCTION] (line ${i + 1}).`,
        severity: "error",
      });
    } else {
      errors.push({
        code: "unknown_bracket",
        message: `Unknown bracket label [${label}] on line ${i + 1}. Acting whitelist: ${PODCAST_ACTING_TAG_WHITELIST.map((t) => `[${t}]`).join(", ")}.`,
        severity: "error",
      });
    }
  }

  void danglingSpeaker;
  void lastSpeakerLine;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^\[[^\]]+\]\s+\S+/.test(line.trim())) {
      errors.push({
        code: "inline_speaker",
        message: `Speaker/cue tags must sit alone on their line (line ${i + 1}): ${line.trim().slice(0, 80)}`,
        severity: "error",
      });
    }
  }

  const sectionOrder = labels
    .map((entry) => entry.label.toUpperCase())
    .filter((label) => SECTION_RE.test(label));

  const expectedSections = ["INTRO", "LESSON", "CLOSING", "FINAL"];
  let expectedIndex = 0;
  for (const section of sectionOrder) {
    if (section === expectedSections[expectedIndex]) {
      expectedIndex += 1;
    }
  }
  if (expectedIndex < expectedSections.length) {
    errors.push({
      code: "spine_order",
      message: `Missing or out-of-order spine. Required order: ${expectedSections.join(" → ")}. Found sections: ${sectionOrder.join(" → ") || "(none)"}.`,
      severity: "error",
    });
  }

  const partNumbers: number[] = [];
  for (const entry of labels) {
    const match = entry.label.match(PART_RE);
    if (!match) {
      continue;
    }
    partNumbers.push(Number(match[1]));
  }

  for (let i = 0; i < partNumbers.length; i += 1) {
    const expected = i + 1;
    if (partNumbers[i] !== expected) {
      errors.push({
        code: "part_sequence",
        message: `PART numbers must be sequential starting at 1 (expected PART ${expected}, found PART ${partNumbers[i]}).`,
        severity: "error",
      });
      break;
    }
  }

  const finalIndex = labels.findIndex(
    (entry) => entry.label.toUpperCase() === "FINAL",
  );
  if (finalIndex >= 0) {
    if (finalIndex !== labels.length - 1) {
      errors.push({
        code: "final_not_last",
        message:
          "[FINAL] must be the last label in the script. Nothing (dialogue or labels) may appear after [FINAL].",
        severity: "error",
      });
    }

    const finalLabel = labels[finalIndex]!;
    const hasTrailingText = lines
      .slice(finalLabel.line)
      .some((line) => line.trim().length > 0);
    if (hasTrailingText) {
      errors.push({
        code: "content_after_final",
        message:
          "Nothing may appear after [FINAL]. The script must end on the [FINAL] label.",
        severity: "error",
      });
    }

    const beforeFinalScript = lines.slice(0, finalLabel.line - 1).join("\n");
    const turnsBeforeFinal = collectTurns(beforeFinalScript, format);
    const thanksTurn = turnsBeforeFinal.at(-2);
    const hopeTurn = turnsBeforeFinal.at(-1);
    const expectedThanksSpeaker =
      format === "max_sara_conversation" ? "MAX" : "LEO";
    const expectedHopeSpeaker =
      format === "max_sara_conversation" ? "SARA" : "EMMA";
    const thanksOk =
      thanksTurn &&
      thanksTurn.speaker === expectedThanksSpeaker &&
      normalizeComparable(thanksTurn.text) ===
        normalizeComparable(PODCAST_FORCED_THANKS_LINE);
    const hopeOk =
      hopeTurn &&
      hopeTurn.speaker === expectedHopeSpeaker &&
      normalizeComparable(hopeTurn.text).startsWith(
        normalizeComparable(PODCAST_FORCED_HOPE_LINE_STEM),
      );

    if (!thanksOk || !hopeOk) {
      errors.push({
        code: "final_missing_forced_thanks",
        message:
          format === "max_sara_conversation"
            ? `Immediately before [FINAL], required ending is [MAX] "${PODCAST_FORCED_THANKS_LINE}" then [SARA] starting with "${PODCAST_FORCED_HOPE_LINE_STEM} …".`
            : `Immediately before [FINAL], required ending is [LEO] "${PODCAST_FORCED_THANKS_LINE}" then [EMMA] starting with "${PODCAST_FORCED_HOPE_LINE_STEM} …".`,
        severity: "error",
      });
    }
  }

  let pauseCount = 0;
  let pauseSeconds = 0;
  for (const entry of labels) {
    const pause = entry.label.match(PAUSE_RE);
    const longPause = entry.label.match(LONG_PAUSE_RE);
    if (pause?.[1]) {
      pauseCount += 1;
      pauseSeconds += Number(pause[1]);
    } else if (longPause?.[1]) {
      pauseCount += 1;
      pauseSeconds += Number(longPause[1]);
    }
  }

  const spokenWordCount = countSpokenWords(normalizedScript);
  const partCount = partNumbers.length;
  const lower = normalizedScript.toLowerCase();

  if (format === "max_sara_conversation") {
    const gold = PODCAST_MAX_SARA_GOLD_STANDARD;

    if (spokenWordCount < gold.spokenWordMin) {
      warnings.push({
        code: "word_count_low",
        message: `Spoken word count ${spokenWordCount} is below soft floor ${gold.spokenWordMin} (target ${gold.spokenWordTargetMin}–${gold.spokenWordMax}).`,
        severity: "warning",
      });
    } else if (spokenWordCount > gold.spokenWordMax + 400) {
      warnings.push({
        code: "word_count_high",
        message: `Spoken word count ${spokenWordCount} is above target ${gold.spokenWordMax}.`,
        severity: "warning",
      });
    }

    if (partCount < gold.partCountMin) {
      errors.push({
        code: "part_count_low",
        message: `PART count ${partCount} is below Max & Sara standard ${gold.partCountMin}–${gold.partCountMax}.`,
        severity: "error",
      });
    } else if (partCount > gold.partCountMax + 2) {
      warnings.push({
        code: "part_count_high",
        message: `PART count ${partCount} is above typical Max & Sara standard ${gold.partCountMax}.`,
        severity: "warning",
      });
    }

    for (const beat of gold.forbiddenPracticeBeats) {
      if (lower.includes(beat)) {
        errors.push({
          code: "forbidden_practice_beat",
          message: `Max & Sara conversation scripts must not include practice/challenge language: "${beat}".`,
          severity: "error",
        });
      }
    }

    if (/\bemma\b/.test(lower) || /\bleo\b/.test(lower)) {
      errors.push({
        code: "wrong_cast_name",
        message: "Max & Sara scripts must not mention Emma or Leo.",
        severity: "error",
      });
    }

    if (!/\b(comment|comments)\b/.test(lower)) {
      warnings.push({
        code: "missing_comment_question",
        message:
          "No clear viewer comment question detected near the end of the episode.",
        severity: "warning",
      });
    }

    const didacticVocabPatterns: Array<{ code: string; re: RegExp; message: string }> = [
      {
        code: "didactic_vocab_framing",
        re: /today we will study|now we will study vocabulary|the objective of this lesson|repeat these phrases|the first vocabulary word|here is a list of words|learn these words/i,
        message:
          "Vocabulary/chunks framing sounds like a classroom list or lesson objective. Prefer natural phrase collection.",
      },
    ];
    for (const pattern of didacticVocabPatterns) {
      if (pattern.re.test(normalizedScript)) {
        warnings.push({
          code: pattern.code,
          message: pattern.message,
          severity: "warning",
        });
      }
    }

    if (
      /\[PART\s+\d+\s*[-—–]\s*[^\]]*(VOCABULARY LIST|LEARN THESE WORDS|IMPORTANT VOCABULARY|PHRASES LESSON)[^\]]*\]/i.test(
        normalizedScript,
      )
    ) {
      warnings.push({
        code: "classroom_vocab_part_title",
        message:
          "A PART title sounds like a classroom vocabulary lesson. Prefer conversational titles such as PHRASES THAT CAME UP TODAY.",
        severity: "warning",
      });
    }

    const phraseCollectionPartTitles = [
      ...normalizedScript.matchAll(
        /\[PART\s+(\d+)\s*[-—–]\s*([^\]]+)\]/gi,
      ),
    ]
      .map((match) => ({
        number: Number(match[1]),
        title: String(match[2] ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " "),
      }))
      .filter((entry) =>
        /\b(phrases?|messages?|vocabulary|chunks?|words?)\b/.test(entry.title) &&
        /\b(came up|from (the )?conversation|actually help|useful|clear|important|to remember|learn|list|collect|today)\b/.test(
          entry.title,
        ) &&
        !/\b(write|writing|using|apply|application|real message|in the chat|would write)\b/.test(
          entry.title,
        ),
      );

    if (phraseCollectionPartTitles.length > 1) {
      warnings.push({
        code: "duplicate_phrase_collection",
        message: `More than one explicit phrase-collection PART detected (${phraseCollectionPartTitles
          .map((entry) => `PART ${entry.number}`)
          .join(", ")}). Keep one collection section; any later section should apply phrases in context.`,
        severity: "warning",
      });
    }

    // Soft catch-up check: enough host turns before PART 1 so the episode
    // does not jump from cold open straight into explanation blocks.
    const prePartTurns = countSpeakerTurnsBeforeFirstPart(
      normalizedScript,
      format,
    );
    if (prePartTurns > 0 && prePartTurns < 8) {
      warnings.push({
        code: "thin_catchup",
        message: `Only ${prePartTurns} host turns before PART 1. Prefer a brief natural catch-up (~8–16 turns) before the main explanation.`,
        severity: "warning",
      });
    }
  } else {
    const gold = PODCAST_ENGLISH_GOLD_STANDARD;

    if (spokenWordCount < gold.spokenWordMin) {
      errors.push({
        code: "word_count_low",
        message: `Spoken word count ${spokenWordCount} is below gold standard ${gold.spokenWordMin}–${gold.spokenWordMax}.`,
        severity: "error",
      });
    } else if (spokenWordCount > gold.spokenWordMax + 400) {
      warnings.push({
        code: "word_count_high",
        message: `Spoken word count ${spokenWordCount} is above gold standard ${gold.spokenWordMax} (may run long at speed 0.9).`,
        severity: "warning",
      });
    }

    if (partCount < gold.partCountMin) {
      errors.push({
        code: "part_count_low",
        message: `PART count ${partCount} is below gold standard ${gold.partCountMin}–${gold.partCountMax}.`,
        severity: "error",
      });
    } else if (partCount > gold.partCountMax + 2) {
      warnings.push({
        code: "part_count_high",
        message: `PART count ${partCount} is above typical gold standard ${gold.partCountMax}.`,
        severity: "warning",
      });
    }

    if (pauseCount < 12) {
      errors.push({
        code: "pause_count_low",
        message: `Only ${pauseCount} pause cues (${pauseSeconds}s). Day-3-style practice needs many timed learner pauses.`,
        severity: "error",
      });
    }

    const turns = collectTurns(normalizedScript, format);
    let consecutiveEchoPairs = 0;
    for (let i = 1; i < turns.length; i += 1) {
      const prev = turns[i - 1]!;
      const curr = turns[i]!;
      if (
        /^EMMA$/i.test(prev.speaker) &&
        /^LEO$/i.test(curr.speaker) &&
        normalizeComparable(prev.text) === normalizeComparable(curr.text)
      ) {
        consecutiveEchoPairs += 1;
      }
    }
    if (consecutiveEchoPairs > 0) {
      errors.push({
        code: "mechanical_echo",
        message: `Found ${consecutiveEchoPairs} identical consecutive Emma→Leo line pair(s). Leo must not mechanically echo Emma (Listen and Repeat = Emma + pause only).`,
        severity: "error",
      });
    }

    for (const beat of [
      ["listen and repeat", "missing_listen_and_repeat"],
      ["your turn", "missing_your_turn"],
      ["build your", "missing_build_your_own"],
      ["quiz", "missing_quiz"],
      ["mission", "missing_mission"],
    ] as const) {
      if (!lower.includes(beat[0])) {
        warnings.push({
          code: beat[1],
          message: `Gold-standard practice beat not clearly present: "${beat[0]}".`,
          severity: "warning",
        });
      }
    }
  }

  const turns = collectTurns(normalizedScript, format);
  let consecutiveEchoPairs = 0;
  if (format === "emma_leo_lesson") {
    for (let i = 1; i < turns.length; i += 1) {
      const prev = turns[i - 1]!;
      const curr = turns[i]!;
      if (
        /^EMMA$/i.test(prev.speaker) &&
        /^LEO$/i.test(curr.speaker) &&
        normalizeComparable(prev.text) === normalizeComparable(curr.text)
      ) {
        consecutiveEchoPairs += 1;
      }
    }
  }

  const metrics: PodcastScriptMetrics = {
    spokenWordCount,
    partCount,
    pauseCount,
    pauseSeconds: Math.round(pauseSeconds),
    hasIntro: sectionOrder.includes("INTRO"),
    hasLesson: sectionOrder.includes("LESSON"),
    hasClosing: sectionOrder.includes("CLOSING"),
    hasFinal: sectionOrder.includes("FINAL"),
    consecutiveEchoPairs,
    format,
  };

  return {
    ok: errors.length === 0,
    normalizedScript,
    errors,
    warnings,
    metrics,
  };
}

export function formatPodcastValidationReport(
  result: PodcastScriptValidationResult,
) {
  const lines = [
    `Validation: ${result.ok ? "PASS" : "FAIL"}`,
    `Format: ${result.metrics.format}`,
    `Metrics: words=${result.metrics.spokenWordCount}, parts=${result.metrics.partCount}, pauses=${result.metrics.pauseCount} (${result.metrics.pauseSeconds}s), echoes=${result.metrics.consecutiveEchoPairs}`,
  ];
  for (const issue of result.errors) {
    lines.push(`ERROR [${issue.code}]: ${issue.message}`);
  }
  for (const issue of result.warnings) {
    lines.push(`WARN [${issue.code}]: ${issue.message}`);
  }
  return lines.join("\n");
}
