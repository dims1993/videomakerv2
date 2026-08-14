import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";
import { clampSceneDurationSeconds } from "@/lib/visual-plan-script";

const BRACKET_LABEL_PATTERN = /^\[([^\]]+)\]\s*$/;
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+/;

/** Target words per generic narration beat (ChatGPT fills visuals only). */
const TARGET_WORDS_PER_BEAT = 28;
const MAX_WORDS_PER_BEAT = 48;

export type PackSentencesIntoBeatsOptions = {
  targetWords?: number;
  maxWords?: number;
};

export type GenericVisualPlanSkeleton = {
  scenes: PodcastVisualPlanSkeletonScene[];
  spokenBeatCount: number;
};

function estimateSpokenDurationSec(scriptText: string) {
  const words = scriptText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const estimated = Math.ceil(Math.max(2, words / 2.4));
  return clampSceneDurationSeconds(estimated);
}

function wordCount(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const parts = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!parts) {
    return [normalized];
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Pack sentences into beats near targetWords without exceeding maxWords when avoidable.
 */
export function packSentencesIntoBeats(
  sentences: string[],
  options?: PackSentencesIntoBeatsOptions,
): string[] {
  const targetWords = options?.targetWords ?? TARGET_WORDS_PER_BEAT;
  const maxWords = options?.maxWords ?? MAX_WORDS_PER_BEAT;
  const beats: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    beats.push(current.join(" ").replace(/\s+/g, " ").trim());
    current = [];
    currentWords = 0;
  };

  for (const sentence of sentences) {
    const words = wordCount(sentence);
    if (words === 0) {
      continue;
    }

    // Very long sentence: keep as its own beat (do not mid-sentence split).
    if (words > maxWords && current.length === 0) {
      beats.push(sentence);
      continue;
    }

    if (
      current.length > 0 &&
      currentWords + words > maxWords &&
      currentWords >= Math.floor(targetWords * 0.6)
    ) {
      flush();
    }

    current.push(sentence);
    currentWords += words;

    if (currentWords >= targetWords) {
      flush();
    }
  }

  flush();
  return beats;
}

/**
 * Generic local skeleton for non-podcast channels:
 * - Bracket labels (`[INTRODUCTION]`, `[CHAPTER COVER — …]`, …) are segmentation only
 * - Spoken lines inside a section are packed into narration beats
 * - ChatGPT fills visualPurpose / visualIdea / imagePrompt in hybrid chunks
 */
export function buildGenericVisualPlanSkeleton(
  script: string,
): GenericVisualPlanSkeleton {
  const scenes: PodcastVisualPlanSkeletonScene[] = [];
  let order = 1;
  let sectionLines: string[] = [];

  const flushSection = () => {
    const sectionText = sectionLines.join(" ").replace(/\s+/g, " ").trim();
    sectionLines = [];
    if (!sectionText) {
      return;
    }
    const beats = packSentencesIntoBeats(splitIntoSentences(sectionText));
    for (const beat of beats) {
      if (!beat) {
        continue;
      }
      scenes.push({
        order,
        scriptText: beat,
        sceneType: "avatar",
        visualPurpose: "Narration beat — fill visual fields for this spoken line.",
        visualIdea: "Narrative scene: (pending visual)",
        duration: estimateSpokenDurationSec(beat),
        imagePrompt:
          "Channel visual style. Match planner identity/style locks. No logos, watermarks, or baked-in captions.",
        status: "planned",
        pauseAfterMs: null,
        speaker: "other",
        visualsFilled: false,
      });
      order += 1;
    }
  };

  const lines = script.replace(/\r\n/g, "\n").split("\n");
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      // Blank lines stay inside the current section.
      continue;
    }

    if (MARKDOWN_HEADING_PATTERN.test(trimmed)) {
      flushSection();
      continue;
    }

    if (BRACKET_LABEL_PATTERN.test(trimmed)) {
      flushSection();
      continue;
    }

    sectionLines.push(trimmed);
  }

  flushSection();

  return {
    scenes,
    spokenBeatCount: scenes.length,
  };
}
