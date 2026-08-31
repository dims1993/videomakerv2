/**
 * Wealth Insights micro-pauses between by-scene voiceover clips.
 * Base timing comes from shared punctuation pauses; cast handoffs widen further.
 * Incomplete mid-split beats use continuity hard-joins unless a cast handoff wins.
 */

import { parseWealthStoryVisualIdea } from "@/lib/wealth-insights-episode-cast";
import { suggestContinuityAwarePauseAfterMs } from "@/lib/voiceover-continuity";
import {
  suggestPunctuationPauseAfterMs,
  VOICEOVER_PAUSE_DEFAULT_MS,
} from "@/lib/voiceover-punctuation-pause";

/** Soft fallback when text gives no strong cue (matches punctuation default). */
export const WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS = VOICEOVER_PAUSE_DEFAULT_MS;

/** @deprecated Prefer punctuation comma pause; kept for older imports/tests. */
export const WEALTH_PAUSE_CONTINUATION_MS = 100;

/** @deprecated Prefer punctuation period pause; kept for older imports/tests. */
export const WEALTH_PAUSE_SENTENCE_MS = 245;

/** Host ↔ story cast handoff (at least a paragraph-class breath). */
export const WEALTH_PAUSE_CAST_SHIFT_MS = 313;

function isHostish(
  kind: ReturnType<typeof parseWealthStoryVisualIdea>["kind"],
) {
  return kind === "main_host" || kind === "host_plus_story";
}

function isStoryish(
  kind: ReturnType<typeof parseWealthStoryVisualIdea>["kind"],
) {
  return kind === "story_character" || kind === "story_pair";
}

function isCastHandoff(
  visualIdea: string | null | undefined,
  nextVisualIdea: string | null | undefined,
) {
  if (!nextVisualIdea?.trim()) {
    return false;
  }
  const kind = parseWealthStoryVisualIdea(visualIdea).kind;
  const nextKind = parseWealthStoryVisualIdea(nextVisualIdea).kind;
  if (kind === "other" || nextKind === "other") {
    return false;
  }
  if (kind === nextKind) {
    return false;
  }
  return (
    (isHostish(kind) && isStoryish(nextKind)) ||
    (isStoryish(kind) && isHostish(nextKind)) ||
    (kind === "story_character" && nextKind === "story_pair") ||
    (kind === "story_pair" && nextKind === "story_character") ||
    (kind === "main_host" && nextKind === "host_plus_story") ||
    (kind === "host_plus_story" && nextKind === "main_host")
  );
}

/**
 * Suggest a per-scene pause (ms) from narration punctuation + optional cast handoff.
 */
export function suggestWealthInsightsPauseAfterMs(opts: {
  scriptText: string;
  visualIdea?: string | null;
  nextVisualIdea?: string | null;
  nextScriptText?: string | null;
}): number {
  const base = suggestPunctuationPauseAfterMs(opts.scriptText);
  let pause = suggestContinuityAwarePauseAfterMs({
    scriptText: opts.scriptText,
    nextScriptText: opts.nextScriptText,
    basePauseAfterMs: base,
  });

  if (isCastHandoff(opts.visualIdea, opts.nextVisualIdea)) {
    pause = Math.max(pause, WEALTH_PAUSE_CAST_SHIFT_MS);
  }

  return pause;
}

export function suggestWealthInsightsPausesForScenes<
  T extends {
    scriptText: string;
    visualIdea?: string | null;
  },
>(scenes: T[]): Array<T & { suggestedPauseAfterMs: number }> {
  return scenes.map((scene, index) => {
    const next = scenes[index + 1];
    return {
      ...scene,
      suggestedPauseAfterMs: suggestWealthInsightsPauseAfterMs({
        scriptText: scene.scriptText,
        visualIdea: scene.visualIdea,
        nextVisualIdea: next?.visualIdea,
        nextScriptText: next?.scriptText,
      }),
    };
  });
}
