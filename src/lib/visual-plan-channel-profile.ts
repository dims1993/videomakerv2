/**
 * Platform Visual Plan profiles: local skeleton + ChatGPT fill-hybrid.
 * Podcast English Lessons keeps its own speaker/music skeleton path.
 */

import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-english-lessons-visual";
import { buildPodcastHybridFillBrief } from "@/lib/podcast-english-lessons-image-prompt-contract";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import { buildBibleOneYearSectionHybridContext } from "@/lib/the-bible-in-one-year-visual-brief";
import { THE_GODS_WORD_CHANNEL_KEY } from "@/lib/the-gods-word-script-prompt";
import { buildTheGodsWordSectionHybridContext } from "@/lib/the-gods-word-visual-brief";
import { normalizeGodsWordScenes } from "@/lib/the-gods-word-image-prompt";
import {
  buildGodsWordVisualPlanSkeleton,
  stripUnknownGodsWordBracketLines,
} from "@/lib/gods-word-visual-skeleton";
import { buildGenericVisualPlanSkeleton } from "@/lib/visual-plan-generic-skeleton";
import { normalizeForScriptCoverage } from "@/lib/visual-plan-script";
import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";
import { VISUAL_PLAN_FILL_CHUNK_SIZE } from "@/lib/visual-plan-skeleton";
import {
  buildWealthInsightsFillHybridContext,
} from "@/lib/wealth-insights-visual-brief";
import { resolveWealthInsightsVisualMode } from "@/lib/wealth-insights-visual-mode";
import { normalizeWealthInsightsScenes } from "@/lib/wealth-insights-image-prompt";
import {
  assertWealthSkeletonCoverage,
  buildWealthInsightsVisualPlanSkeleton,
} from "@/lib/wealth-insights-visual-skeleton";
import { buildWealthInsightsVisualElementLibraryCompact } from "@/lib/wealth-insights-visual-sections";

export type VisualPlanFillProfileKind =
  | "podcast"
  | "gods-word"
  | "bible-one-year"
  | "wealth-insights"
  | "generic";

export type VisualPlanChannelFillProfile = {
  kind: VisualPlanFillProfileKind;
  /** Compact planner context sent with every fill chunk. */
  contextPrompt: string;
  contextKind: string;
  chunkSize: number;
  scenes: PodcastVisualPlanSkeletonScene[];
  spokenCount: number;
  musicBedCount: number;
  sectionCount: number | null;
  /** Optional coverage failure (app-owned scriptText). */
  coverageError: string | null;
  /** Post-fill imagePrompt / scene normalization. */
  normalizeScenes: (
    scenes: PodcastVisualPlanSkeletonScene[],
  ) => PodcastVisualPlanSkeletonScene[];
  versionLabel: string;
};

const FILL_MODE_NOTES = [
  "## Fill-chunk mode notes",
  "",
  "The scene skeleton was built locally by the app (scriptText + duration are authoritative).",
  "Fill ONLY visualPurpose, visualIdea, imagePrompt, and sceneType for the listed orders.",
  "Do NOT rewrite scriptText.",
  "Do NOT invent extra scenes or omit any order.",
  "Keep identity/style locks consistent with Continuity and this context.",
].join("\n");

function withFillModeNotes(context: string) {
  const trimmed = context.trim();
  // Drop legacy section-chunk footers if present.
  const withoutSectionNotes = trimmed
    .replace(/\n*## Section-chunk mode notes\n[\s\S]*$/i, "")
    .trim();
  return [withoutSectionNotes, FILL_MODE_NOTES]
    .filter(Boolean)
    .join("\n\n");
}

function stripGenericSkeletonLabels(script: string) {
  return script
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^#{1,6}\s+/.test(trimmed)) return false;
      if (/^\[[^\]]+\]\s*$/.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

function genericCoverageError(
  script: string,
  scenes: PodcastVisualPlanSkeletonScene[],
) {
  const expected = normalizeForScriptCoverage(stripGenericSkeletonLabels(script));
  const actual = normalizeForScriptCoverage(
    scenes.map((scene) => scene.scriptText).join(" "),
  );
  if (expected && actual !== expected) {
    return `Local skeleton coverage mismatch. expectedChars=${expected.length} actualChars=${actual.length}.`;
  }
  return null;
}

/**
 * Resolve skeleton + fill context for a channel.
 * Podcast is handled separately by the podcast skeleton builder.
 */
export function resolveVisualPlanFillProfile(options: {
  channelKey: string;
  script: string;
  title?: string | null;
  topicCategory?: string | null;
  ideaJson?: string | null;
  episodeContext?: string | null;
}): VisualPlanChannelFillProfile {
  const {
    channelKey,
    script,
    title,
    topicCategory,
    ideaJson,
    episodeContext,
  } = options;

  if (channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    // Caller should use buildPodcastVisualPlanSkeleton; this branch is defensive.
    return {
      kind: "podcast",
      contextPrompt: buildPodcastHybridFillBrief(),
      contextKind: "podcast-fill",
      chunkSize: VISUAL_PLAN_FILL_CHUNK_SIZE,
      scenes: [],
      spokenCount: 0,
      musicBedCount: 0,
      sectionCount: null,
      coverageError: null,
      normalizeScenes: (scenes) => scenes,
      versionLabel: "v1-hybrid",
    };
  }

  if (channelKey === "wealth-insights") {
    let parsedIdea: unknown = ideaJson;
    if (typeof ideaJson === "string" && ideaJson.trim()) {
      try {
        parsedIdea = JSON.parse(ideaJson);
      } catch {
        parsedIdea = ideaJson;
      }
    }
    const mode = resolveWealthInsightsVisualMode({
      topicCategory,
      ideaJson: parsedIdea,
    });
    const library = buildWealthInsightsVisualElementLibraryCompact({
      title,
      topicCategory,
      ideaJson: parsedIdea,
      script,
    });
    const skeleton = buildWealthInsightsVisualPlanSkeleton(script);
    const coverage = assertWealthSkeletonCoverage(script, skeleton.scenes);
    return {
      kind: "wealth-insights",
      contextPrompt: buildWealthInsightsFillHybridContext({
        mode,
        visualElementLibraryCompact: library,
      }),
      contextKind:
        mode === "narrative_economics_stories"
          ? "wealth-narrative-fill"
          : "wealth-default-fill",
      chunkSize: VISUAL_PLAN_FILL_CHUNK_SIZE,
      scenes: skeleton.scenes,
      spokenCount: skeleton.spokenBeatCount,
      musicBedCount: 0,
      sectionCount: skeleton.sectionCount,
      coverageError: coverage.ok
        ? null
        : `Wealth local skeleton coverage mismatch (app-owned scriptText). expectedChars=${coverage.expectedChars} actualChars=${coverage.actualChars}.`,
      normalizeScenes: (scenes) =>
        mode === "narrative_economics_stories"
          ? scenes
          : (normalizeWealthInsightsScenes(scenes) as PodcastVisualPlanSkeletonScene[]),
      versionLabel: "v2-wealth-fill",
    };
  }

  if (
    channelKey === THE_GODS_WORD_CHANNEL_KEY &&
    isBibleOneYearCategory(topicCategory)
  ) {
    const cleaned = stripUnknownGodsWordBracketLines(script);
    const skeleton = buildGodsWordVisualPlanSkeleton(cleaned);
    const expected = normalizeForScriptCoverage(cleaned);
    const actual = normalizeForScriptCoverage(
      skeleton.scenes.map((scene) => scene.scriptText).join(" "),
    );
    return {
      kind: "bible-one-year",
      contextPrompt: withFillModeNotes(buildBibleOneYearSectionHybridContext()),
      contextKind: "bible-one-year-fill",
      chunkSize: VISUAL_PLAN_FILL_CHUNK_SIZE,
      scenes: skeleton.scenes,
      spokenCount: skeleton.spokenBeatCount,
      musicBedCount: 0,
      sectionCount: skeleton.sectionCount,
      coverageError:
        expected && actual !== expected
          ? `Bible One Year local skeleton coverage mismatch. expectedChars=${expected.length} actualChars=${actual.length}.`
          : null,
      normalizeScenes: (scenes) => normalizeGodsWordScenes(scenes),
      versionLabel: "v2-bible-one-year-fill",
    };
  }

  if (channelKey === THE_GODS_WORD_CHANNEL_KEY) {
    const cleaned = stripUnknownGodsWordBracketLines(script);
    const skeleton = buildGodsWordVisualPlanSkeleton(cleaned);
    const expected = normalizeForScriptCoverage(cleaned);
    const actual = normalizeForScriptCoverage(
      skeleton.scenes.map((scene) => scene.scriptText).join(" "),
    );
    return {
      kind: "gods-word",
      contextPrompt: withFillModeNotes(buildTheGodsWordSectionHybridContext()),
      contextKind: "gods-word-fill",
      chunkSize: VISUAL_PLAN_FILL_CHUNK_SIZE,
      scenes: skeleton.scenes,
      spokenCount: skeleton.spokenBeatCount,
      musicBedCount: 0,
      sectionCount: skeleton.sectionCount,
      coverageError:
        expected && actual !== expected
          ? `Gods Word local skeleton coverage mismatch (app-owned scriptText). expectedChars=${expected.length} actualChars=${actual.length}.`
          : null,
      normalizeScenes: (scenes) => normalizeGodsWordScenes(scenes),
      versionLabel: "v2-gods-word-fill",
    };
  }

  // Platform default for every other / new channel.
  const skeleton = buildGenericVisualPlanSkeleton(script);
  return {
    kind: "generic",
    contextPrompt: withFillModeNotes(
      [
        "Follow the channel visual planner rules from the project brief.",
        "Prefer one clear claim per scene.",
        "Use avatar / insert / space as appropriate.",
        "Keep character and style identity locks consistent across chunks.",
        "No logos or baked-in captions unless the channel requires on-image title text.",
        episodeContext?.trim()
          ? `\n## Episode context (truncated)\n${episodeContext.trim().slice(0, 2500)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    contextKind: "generic-fill",
    chunkSize: VISUAL_PLAN_FILL_CHUNK_SIZE,
    scenes: skeleton.scenes,
    spokenCount: skeleton.spokenBeatCount,
    musicBedCount: 0,
    sectionCount: null,
    coverageError: genericCoverageError(script, skeleton.scenes),
    normalizeScenes: (scenes) => scenes,
    versionLabel: "v2-platform-fill",
  };
}

/** True when this channel uses the platform fill-hybrid path (not podcast-specific). */
export function channelUsesPlatformFillHybrid(channelKey: string) {
  return channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;
}
