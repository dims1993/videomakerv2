/**
 * Local Gods Word essay Visual Plan skeleton:
 * app owns scriptText / duration / covers; ChatGPT fills visuals only.
 */

import {
  GODS_WORD_BODY_DURATION_SOFT_MAX_SEC,
  GODS_WORD_BODY_DURATION_SOFT_MIN_SEC,
  GODS_WORD_BODY_WORD_SOFT_MIN,
  GODS_WORD_HOOK_DURATION_SOFT_MAX_SEC,
  countNarratedWords,
} from "@/lib/gods-word-visual-pacing";
import { forceSplitOversizedBeat } from "@/lib/visual-plan-dense-beats";
import { packSentencesIntoBeats } from "@/lib/visual-plan-generic-skeleton";
import {
  isChapterSectionLabel,
  isFinalSectionLabel,
  isStructuralSectionStartLabel,
  normalizeStructuralSectionLabel,
  splitScriptIntoStructuralSections,
  type StructuralScriptSection,
} from "@/lib/visual-plan-script-sections";
import {
  clampSceneDurationSeconds,
  stripStructuralMarkers,
  suggestHookDurationSeconds,
} from "@/lib/visual-plan-script";
import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";
import { isWealthHookSectionLabel } from "@/lib/wealth-insights-visual-sections";

/** Hook beat targets — dense single sentences must still force-split. */
export const GODS_WORD_HOOK_TARGET_WORDS = 8;
export const GODS_WORD_HOOK_MAX_WORDS = 14;
/** Estimated narration ceiling before force-splitting a hook beat. */
export const GODS_WORD_HOOK_MAX_ESTIMATED_SEC = 5.5;

/** Body beat targets aligned with Gods Word pacing P0/P1. */
export const GODS_WORD_BODY_TARGET_WORDS = 18;
export const GODS_WORD_BODY_MAX_WORDS = 25;

export type GodsWordVisualPlanSkeleton = {
  scenes: PodcastVisualPlanSkeletonScene[];
  spokenBeatCount: number;
  sectionCount: number;
};

function wordCount(text: string) {
  return countNarratedWords(text);
}

function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  // Keep trailing curly/straight quotes attached to the sentence terminator
  // so "Me.'" / "Me.'"" does not become "Me. '" when beats are joined.
  const parts = normalized.match(
    /[^.!?]+[.!?]+(?:['"”’«»)\]]+)?|[^.!?]+$/g,
  );
  if (!parts) {
    return [normalized];
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Drop unrecognized bracket-only lines (e.g. [MESSAGE]) so they never enter
 * coverage expected text or open phantom PREAMBLE sections with junk markers.
 */
export function stripUnknownGodsWordBracketLines(script: string): string {
  return script
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((rawLine) => {
      const trimmed = rawLine.trim();
      const match = trimmed.match(/^\[([^\]]+)\]\s*$/);
      if (!match) {
        return true;
      }
      const label = normalizeStructuralSectionLabel(match[1] ?? "");
      const upper = label.toUpperCase();
      if (upper === "HOOK" || upper === "END HOOK" || upper === "ENDHOOK") {
        return true;
      }
      if (upper === "FINAL") {
        return true;
      }
      return isStructuralSectionStartLabel(label);
    })
    .join("\n");
}

function coverTitleFromLabel(label: string): string {
  const normalized = normalizeStructuralSectionLabel(label);
  if (isChapterSectionLabel(normalized)) {
    const match = normalized.match(/^CHAPTER\s+\d+\s*[—–\-]\s*(.+)$/i);
    return (match?.[1] ?? normalized).trim().toUpperCase();
  }
  if (isFinalSectionLabel(normalized)) {
    const match = normalized.match(/^FINAL\s*[—–\-]\s*(.+)$/i);
    return (match?.[1] ?? "FINAL").trim().toUpperCase();
  }
  return normalized.toUpperCase();
}

function estimateBodyDurationSec(scriptText: string): number {
  const words = wordCount(scriptText);
  const estimated = Math.round(Math.max(1, words / 3));
  return clampSceneDurationSeconds(
    Math.min(
      GODS_WORD_BODY_DURATION_SOFT_MAX_SEC,
      Math.max(GODS_WORD_BODY_DURATION_SOFT_MIN_SEC, estimated),
    ),
  );
}

/**
 * Merge trailing / consecutive short beats so soft min words is respected
 * when neighboring clauses exist — without re-inflating past maxWords.
 */
export function mergeShortBodyBeats(
  beats: string[],
  softMinWords = GODS_WORD_BODY_WORD_SOFT_MIN,
  maxWords = GODS_WORD_BODY_MAX_WORDS,
): string[] {
  if (beats.length <= 1) {
    return beats.filter(Boolean);
  }
  const merged: string[] = [];
  for (const beat of beats) {
    const trimmed = beat.trim();
    if (!trimmed) {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (
      prev &&
      (wordCount(trimmed) < softMinWords || wordCount(prev) < softMinWords)
    ) {
      const combined = `${prev} ${trimmed}`.replace(/\s+/g, " ").trim();
      if (wordCount(combined) <= maxWords + 2) {
        merged[merged.length - 1] = combined;
        continue;
      }
    }
    merged.push(trimmed);
  }
  return merged;
}

function packBodyBeats(spoken: string): string[] {
  const sentences = splitIntoSentences(spoken);
  const packed = packSentencesIntoBeats(sentences, {
    targetWords: GODS_WORD_BODY_TARGET_WORDS,
    maxWords: GODS_WORD_BODY_MAX_WORDS,
  });
  const expanded = packed.flatMap((beat) =>
    forceSplitOversizedBeat(beat, {
      maxWords: GODS_WORD_BODY_MAX_WORDS,
      maxEstimatedSec: GODS_WORD_BODY_DURATION_SOFT_MAX_SEC,
    }),
  );
  return mergeShortBodyBeats(
    expanded,
    GODS_WORD_BODY_WORD_SOFT_MIN,
    GODS_WORD_BODY_MAX_WORDS,
  );
}

function pendingImagePrompt() {
  return "Bible-study illustration body — fill concrete scene for this narration beat.";
}

function makeScene(options: {
  order: number;
  scriptText: string;
  sceneType: "avatar" | "insert" | "space";
  visualPurpose: string;
  visualIdea: string;
  duration: number;
}): PodcastVisualPlanSkeletonScene {
  return {
    order: options.order,
    scriptText: options.scriptText,
    sceneType: options.sceneType,
    visualPurpose: options.visualPurpose,
    visualIdea: options.visualIdea,
    duration: options.duration,
    imagePrompt: pendingImagePrompt(),
    status: "planned",
    pauseAfterMs: null,
    speaker: "other",
    visualsFilled: false,
  };
}

function spokenSectionText(section: StructuralScriptSection) {
  return stripStructuralMarkers(section.text).replace(/\s+/g, " ").trim();
}

function packHookBeats(spoken: string): string[] {
  const packed = packSentencesIntoBeats(splitIntoSentences(spoken), {
    targetWords: GODS_WORD_HOOK_TARGET_WORDS,
    maxWords: GODS_WORD_HOOK_MAX_WORDS,
  });
  // packSentencesIntoBeats keeps a single dense sentence whole when it exceeds
  // maxWords — force-split those by clause / comma / connective.
  const expanded = packed.flatMap((beat) =>
    forceSplitOversizedBeat(beat, {
      maxWords: GODS_WORD_HOOK_MAX_WORDS,
      maxEstimatedSec: GODS_WORD_HOOK_MAX_ESTIMATED_SEC,
    }),
  );
  return mergeShortBodyBeats(
    expanded,
    4,
    GODS_WORD_HOOK_MAX_WORDS,
  );
}

function clampHookDurationSec(scriptText: string): number {
  const suggested = suggestHookDurationSeconds(scriptText);
  return Math.min(GODS_WORD_HOOK_DURATION_SOFT_MAX_SEC, suggested);
}

function appendBeatsForSection(
  scenes: PodcastVisualPlanSkeletonScene[],
  section: StructuralScriptSection,
  startOrder: number,
): number {
  const spoken = spokenSectionText(section);
  if (!spoken) {
    return startOrder;
  }

  const isHook = isWealthHookSectionLabel(section.label);
  // Prefer coverage-safe packing over segmentHookNarration (which can rewrite
  // punctuation spacing when rejoining micro-beats).
  const beats = isHook ? packHookBeats(spoken) : packBodyBeats(spoken);
  if (beats.length === 0) {
    return startOrder;
  }

  let order = startOrder;
  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index]!;
    const isCover = section.expectsCover && index === 0;
    const duration = isHook
      ? clampHookDurationSec(beat)
      : isCover
        ? estimateBodyDurationSec(beat)
        : estimateBodyDurationSec(beat);

    scenes.push(
      makeScene({
        order,
        scriptText: beat,
        sceneType: isCover ? "insert" : "avatar",
        visualPurpose: isCover
          ? "Chapter/section cover opener for this structural marker."
          : isHook
            ? "Hook beat — fill a concrete visual for this retention line."
            : "Body narration beat — fill visual fields for this spoken line.",
        visualIdea: isCover
          ? `Chapter cover: ${coverTitleFromLabel(section.label)}, with (pending visual)`
          : "Narrative scene: (pending visual)",
        duration,
      }),
    );
    order += 1;
  }

  return order;
}

/**
 * Build a full local scene skeleton for Gods Word essay scripts.
 * Bible One Year should keep section-hybrid / compact paths.
 */
export function buildGodsWordVisualPlanSkeleton(
  script: string,
): GodsWordVisualPlanSkeleton {
  const cleaned = stripUnknownGodsWordBracketLines(script);
  const sections = splitScriptIntoStructuralSections(cleaned);
  const scenes: PodcastVisualPlanSkeletonScene[] = [];
  let order = 1;

  for (const section of sections) {
    order = appendBeatsForSection(scenes, section, order);
  }

  // Re-number in case of gaps (should already be sequential).
  scenes.forEach((scene, index) => {
    scene.order = index + 1;
  });

  return {
    scenes,
    spokenBeatCount: scenes.filter((scene) => scene.scriptText.trim()).length,
    sectionCount: sections.length,
  };
}
