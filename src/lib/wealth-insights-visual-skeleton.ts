/**
 * Local Wealth Insights Visual Plan skeleton:
 * app owns scriptText / duration; ChatGPT fills visuals only (fill-hybrid).
 */

import { packSentencesIntoBeats } from "@/lib/visual-plan-generic-skeleton";
import {
  clampSceneDurationSeconds,
  suggestHookDurationSeconds,
} from "@/lib/visual-plan-script";
import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";
import {
  isWealthHookSectionLabel,
  splitWealthInsightsScriptIntoVisualPlanSections,
  spokenWealthScript,
  WEALTH_BODY_SCENE_HARD_MAX_SEC,
  WEALTH_HOOK_SCENE_HARD_MAX_SEC,
} from "@/lib/wealth-insights-visual-sections";
import { normalizeForScriptCoverage } from "@/lib/visual-plan-script";
import { stripStructuralMarkers } from "@/lib/visual-plan-script";

/** Hook beats stay short (≈2–4s / ≤5.5s estimated). */
export const WEALTH_HOOK_TARGET_WORDS = 8;
export const WEALTH_HOOK_MAX_WORDS = 12;

/** Body/closing beats aim for ≈5–8s at ~130–145 wpm. */
export const WEALTH_BODY_TARGET_WORDS = 16;
export const WEALTH_BODY_MAX_WORDS = 22;
export const WEALTH_BODY_SOFT_MIN_WORDS = 8;

export type WealthInsightsVisualPlanSkeleton = {
  scenes: PodcastVisualPlanSkeletonScene[];
  spokenBeatCount: number;
  sectionCount: number;
};

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
  const parts = normalized.match(
    /[^.!?]+[.!?]+(?:['"”’«»)\]]+)?|[^.!?]+$/g,
  );
  if (!parts) {
    return [normalized];
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

function mergeShortBeats(beats: string[], softMinWords: number, maxWords: number) {
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
      if (wordCount(combined) <= maxWords + 6) {
        merged[merged.length - 1] = combined;
        continue;
      }
    }
    merged.push(trimmed);
  }
  return merged;
}

function estimateBodyDurationSec(scriptText: string) {
  const words = wordCount(scriptText);
  // ~135 wpm → ~2.25 words/sec
  const estimated = Math.round(Math.max(5, words / 2.25));
  return clampSceneDurationSeconds(
    Math.min(WEALTH_BODY_SCENE_HARD_MAX_SEC, Math.max(5, estimated)),
  );
}

function estimateHookDurationSec(scriptText: string) {
  const suggested = suggestHookDurationSeconds(scriptText);
  return Math.min(WEALTH_HOOK_SCENE_HARD_MAX_SEC, Math.max(2, suggested));
}

function spokenSectionText(text: string) {
  return stripStructuralMarkers(text).replace(/\s+/g, " ").trim();
}

function pendingImagePrompt() {
  return "Wealth Insights illustration body — fill concrete scene for this narration beat.";
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

function packHookBeats(spoken: string): string[] {
  const packed = packSentencesIntoBeats(splitIntoSentences(spoken), {
    targetWords: WEALTH_HOOK_TARGET_WORDS,
    maxWords: WEALTH_HOOK_MAX_WORDS,
  });
  return mergeShortBeats(packed, 4, WEALTH_HOOK_MAX_WORDS);
}

function packBodyBeats(spoken: string): string[] {
  const packed = packSentencesIntoBeats(splitIntoSentences(spoken), {
    targetWords: WEALTH_BODY_TARGET_WORDS,
    maxWords: WEALTH_BODY_MAX_WORDS,
  });
  return mergeShortBeats(
    packed,
    WEALTH_BODY_SOFT_MIN_WORDS,
    WEALTH_BODY_MAX_WORDS,
  );
}

/**
 * Build a full local scene skeleton for Wealth Insights scripts.
 * Uses the same deterministic HOOK/BODY/CLOSING splitter as section-hybrid,
 * but packs beats locally so ChatGPT only fills visuals.
 */
export function buildWealthInsightsVisualPlanSkeleton(
  script: string,
): WealthInsightsVisualPlanSkeleton {
  const sections = splitWealthInsightsScriptIntoVisualPlanSections(script);
  const scenes: PodcastVisualPlanSkeletonScene[] = [];
  let order = 1;

  for (const section of sections) {
    const spoken = spokenSectionText(section.text);
    if (!spoken) {
      continue;
    }
    const isHook = isWealthHookSectionLabel(section.label);
    const beats = isHook ? packHookBeats(spoken) : packBodyBeats(spoken);
    for (const beat of beats) {
      if (!beat) {
        continue;
      }
      scenes.push(
        makeScene({
          order,
          scriptText: beat,
          sceneType: "avatar",
          visualPurpose: isHook
            ? "Hook beat — fill a concrete visual for this retention line."
            : "Body narration beat — fill visual fields for this spoken line.",
          visualIdea: "MAIN HOST: (pending visual)",
          duration: isHook
            ? estimateHookDurationSec(beat)
            : estimateBodyDurationSec(beat),
        }),
      );
      order += 1;
    }
  }

  scenes.forEach((scene, index) => {
    scene.order = index + 1;
  });

  return {
    scenes,
    spokenBeatCount: scenes.filter((scene) => scene.scriptText.trim()).length,
    sectionCount: sections.length,
  };
}

/** Assert local skeleton preserves spoken Wealth script coverage. */
export function assertWealthSkeletonCoverage(script: string, scenes: PodcastVisualPlanSkeletonScene[]) {
  const expected = normalizeForScriptCoverage(spokenWealthScript(script));
  const actual = normalizeForScriptCoverage(
    scenes.map((scene) => scene.scriptText).join(" "),
  );
  if (expected && actual !== expected) {
    return {
      ok: false as const,
      expectedChars: expected.length,
      actualChars: actual.length,
      expectedPreview: expected.slice(0, 240),
      actualPreview: actual.slice(0, 240),
    };
  }
  return { ok: true as const };
}
