import {
  classifyScriptSectionLabel,
  isPodcastCueLabel,
  type ScriptSectionKind,
} from "@/lib/script-sections";
import {
  defaultPauseCueSeconds,
  parsePauseCueSecondsFromLabel,
  pauseSecondsToMs,
} from "@/lib/podcast-pause-cues";
import {
  assemblePodcastPartCoverImagePrompt,
  PODCAST_ATTACHED_STILL_IMAGE_PROMPT,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import {
  isPodcastStandaloneSectionLabel,
  parsePodcastPartHeading,
} from "@/lib/podcast-part-covers";
import {
  buildSectionClipVisualIdea,
  buildSectionClipVisualPurpose,
  parsePodcastSectionClipLabel,
  type PodcastSectionClipTag,
} from "@/lib/podcast-video-library-shared";
import { inferMusicBedCueKind } from "@/lib/music-beds";
import { clampSceneDurationSeconds } from "@/lib/visual-plan-script";

const SECTION_LABEL_PATTERN = /^\[([^\]]+)\]\s*$/;

export type PodcastSkeletonSpeaker = "teacher" | "student" | "music" | "other";

export type PodcastVisualPlanSkeletonScene = {
  order: number;
  scriptText: string;
  sceneType: "avatar" | "insert" | "space";
  visualPurpose: string;
  visualIdea: string;
  duration: number;
  imagePrompt: string;
  status: "planned";
  pauseAfterMs: number | null;
  speaker: PodcastSkeletonSpeaker;
  /** True once ChatGPT filled visualPurpose / visualIdea / imagePrompt. */
  visualsFilled: boolean;
  /**
   * Optional Fish Audio S2 directed speech (tags + same words as scriptText).
   * The God's Word fill-hybrid only; validated before persist.
   */
  fishSpeechText?: string | null;
};

export type PodcastVisualPlanSkeleton = {
  scenes: PodcastVisualPlanSkeletonScene[];
  spokenTurnCount: number;
  musicBedCount: number;
};

function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, " ");
}

function isSpeakerKind(kind: ScriptSectionKind): kind is "teacher" | "student" {
  return kind === "teacher" || kind === "student";
}

function isMusicCueLabel(label: string) {
  const normalized = normalizeLabel(label).toUpperCase();
  return normalized === "MUSIC" || normalized.startsWith("MUSIC:");
}

function isPauseCueLabel(label: string) {
  const normalized = normalizeLabel(label).toUpperCase();
  return (
    normalized === "PAUSE" ||
    normalized.startsWith("PAUSE:") ||
    normalized === "LONG PAUSE" ||
    normalized.startsWith("LONG PAUSE:")
  );
}

function isActingTagLabel(label: string) {
  const normalized = normalizeLabel(label).toUpperCase();
  return (
    normalized === "LAUGH" ||
    normalized === "LAUGHS" ||
    normalized === "SIGH" ||
    normalized === "SIGHS" ||
    normalized === "HUNGRY" ||
    normalized === "CONFUSED" ||
    normalized === "NERVOUS" ||
    normalized === "EXCITED" ||
    normalized === "PROUD" ||
    normalized === "WHISPER" ||
    normalized === "WHISPERS"
  );
}

function speakerFromKind(kind: "teacher" | "student"): PodcastSkeletonSpeaker {
  return kind;
}

function defaultComposition(speaker: PodcastSkeletonSpeaker) {
  if (speaker === "teacher") {
    return "COMP_EMMA_HOST";
  }
  if (speaker === "student") {
    return "COMP_LEO_STUDENT";
  }
  return "COMP_MUSIC_BED";
}

function defaultVisualIdea(speaker: PodcastSkeletonSpeaker, musicLabel?: string) {
  if (speaker === "music") {
    const cue = inferMusicBedCueKind({
      visualIdea: musicLabel ?? "MUSIC_BED",
      visualPurpose: musicLabel ?? null,
    });
    const cueTitle =
      cue === "begin" ? "soft begin" : cue === "outro" ? "soft outro" : "soft fade";
    return `MUSIC_BED | COMP_MUSIC_BED: ${cueTitle}`;
  }
  if (speaker === "teacher") {
    return `TEACHER_EMMA | ${defaultComposition(speaker)}: (pending visual)`;
  }
  if (speaker === "student") {
    return `STUDENT_LEO | ${defaultComposition(speaker)}: (pending visual)`;
  }
  return `TEACHER_EMMA | COMP_EMMA_HOST: (pending visual)`;
}

function estimateSpokenDurationSec(scriptText: string) {
  const words = scriptText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  // ~2.4 words/sec conversational teaching pace.
  const estimated = Math.ceil(Math.max(2, words / 2.4));
  return clampSceneDurationSeconds(estimated);
}

function estimateMusicDurationSec(label: string) {
  const cue = inferMusicBedCueKind({
    visualIdea: label,
    visualPurpose: label,
  });
  if (cue === "outro") {
    return 4;
  }
  if (cue === "begin") {
    return 5;
  }
  return 3;
}

function defaultImagePromptStub(
  speaker: PodcastSkeletonSpeaker,
  _scriptText?: string,
  _options?: {
    title?: string | null;
    topicCategory?: string | null;
    episodeContext?: string | null;
  },
) {
  void speaker;
  void _scriptText;
  void _options;
  return PODCAST_ATTACHED_STILL_IMAGE_PROMPT;
}

function joinTurnLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a local podcast scene skeleton from speaker/music/pause cues.
 * ChatGPT only needs to fill visualPurpose / visualIdea / imagePrompt (and may
 * refine duration/sceneType) in later chunked calls.
 */
export function buildPodcastVisualPlanSkeleton(
  script: string,
  options?: {
    title?: string | null;
    topicCategory?: string | null;
    episodeContext?: string | null;
  },
): PodcastVisualPlanSkeleton {
  const episodeContext =
    options?.episodeContext?.trim() ||
    [options?.title, options?.topicCategory, script.slice(0, 4000)]
      .filter(Boolean)
      .join("\n");
  const scenes: PodcastVisualPlanSkeletonScene[] = [];
  let currentSpeaker: "teacher" | "student" | null = null;
  let currentLines: string[] = [];
  let order = 1;

  const flushSpoken = () => {
    if (!currentSpeaker) {
      currentLines = [];
      return;
    }
    const scriptText = joinTurnLines(currentLines);
    currentLines = [];
    if (!scriptText) {
      return;
    }
    const speaker = speakerFromKind(currentSpeaker);
    scenes.push({
      order,
      scriptText,
      sceneType: "avatar",
      visualPurpose: `${speaker === "teacher" ? "Emma" : "Leo"} speaks this turn.`,
      visualIdea: defaultVisualIdea(speaker),
      duration: estimateSpokenDurationSec(scriptText),
      imagePrompt: defaultImagePromptStub(speaker, scriptText, {
        title: options?.title,
        topicCategory: options?.topicCategory,
        episodeContext,
      }),
      status: "planned",
      pauseAfterMs: null,
      speaker,
      visualsFilled: false,
    });
    order += 1;
  };

  const addPauseToPrevious = (label: string) => {
    const previous = [...scenes].reverse().find((scene) => scene.speaker !== "music");
    if (!previous) {
      return;
    }
    const seconds =
      parsePauseCueSecondsFromLabel(label) ?? defaultPauseCueSeconds(label);
    const ms = pauseSecondsToMs(seconds);
    previous.pauseAfterMs = Math.max(previous.pauseAfterMs ?? 0, ms);
  };

  const pushMusic = (label: string) => {
    flushSpoken();
    currentSpeaker = null;
    scenes.push({
      order,
      scriptText: "",
      sceneType: "insert",
      visualPurpose: `Music bed cue (${normalizeLabel(label)}).`,
      visualIdea: defaultVisualIdea("music", label),
      duration: estimateMusicDurationSec(label),
      imagePrompt: defaultImagePromptStub("music"),
      status: "planned",
      pauseAfterMs: null,
      speaker: "music",
      visualsFilled: false,
    });
    order += 1;
  };

  const pushSectionClip = (tag: PodcastSectionClipTag) => {
    flushSpoken();
    currentSpeaker = null;
    scenes.push({
      order,
      scriptText: "",
      sceneType: "insert",
      visualPurpose: buildSectionClipVisualPurpose(tag),
      visualIdea: buildSectionClipVisualIdea(tag),
      // Placeholder until video-library attach probes the real duration.
      duration: 5,
      imagePrompt:
        "Podcast section bumper from video-library. No generated still required.",
      status: "planned",
      pauseAfterMs: null,
      speaker: "other",
      visualsFilled: true,
    });
    order += 1;
  };

  const pushPartCover = (rawLine: string) => {
    const part = parsePodcastPartHeading(rawLine);
    if (!part) {
      return;
    }
    flushSpoken();
    currentSpeaker = null;
    scenes.push({
      order,
      scriptText: part.spokenText,
      sceneType: "insert",
      visualPurpose: `Part ${part.partNumber} title cover for the lesson section.`,
      visualIdea: `PART_COVER | COMP_PART_COVER: ${part.displayTitle}`,
      duration: estimateSpokenDurationSec(part.spokenText),
      imagePrompt: assemblePodcastPartCoverImagePrompt(part.displayTitle),
      status: "planned",
      pauseAfterMs: null,
      // Emma narrates the part announcement.
      speaker: "teacher",
      // Local ownership — do not let chunk fill reinvent the cover.
      visualsFilled: true,
    });
    order += 1;
  };

  let cursor = 0;
  while (cursor <= script.length) {
    const nextNl = script.indexOf("\n", cursor);
    const lineEnd = nextNl < 0 ? script.length : nextNl;
    const rawLine = script.slice(cursor, lineEnd);
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    const sectionClipTag = parsePodcastSectionClipLabel(trimmed);
    const partHeading = parsePodcastPartHeading(trimmed);
    const match = trimmed.match(SECTION_LABEL_PATTERN);

    if (sectionClipTag) {
      pushSectionClip(sectionClipTag);
    } else if (partHeading) {
      pushPartCover(trimmed);
    } else if (match?.[1]) {
      const label = normalizeLabel(match[1]);
      const bracketSection = parsePodcastSectionClipLabel(`[${label}]`);
      if (bracketSection) {
        pushSectionClip(bracketSection);
      } else if (isMusicCueLabel(label)) {
        pushMusic(label);
      } else if (isPauseCueLabel(label)) {
        flushSpoken();
        currentSpeaker = null;
        addPauseToPrevious(label);
      } else if (isActingTagLabel(label) || isPodcastCueLabel(label)) {
        // Strip laughs/sighs and other non-scene cues from spoken text.
      } else {
        const kind = classifyScriptSectionLabel(label);
        if (isSpeakerKind(kind)) {
          flushSpoken();
          currentSpeaker = kind;
        } else {
          // Structural labels (INTRODUCTION, chapter covers, etc.) are not scenes.
          flushSpoken();
          currentSpeaker = null;
        }
      }
    } else if (isPodcastStandaloneSectionLabel(trimmed)) {
      // Legacy bare COLD OPEN / INTRODUCTION — segmentation only, never spoken.
      flushSpoken();
      currentSpeaker = null;
    } else if (trimmed && !trimmed.startsWith("#")) {
      // Ignore other markdown headings (except PART N, handled above); keep dialogue.
      if (currentSpeaker) {
        currentLines.push(trimmed);
      }
    }

    if (nextNl < 0) {
      break;
    }
    cursor = nextNl + 1;
  }

  flushSpoken();

  return {
    scenes,
    spokenTurnCount: scenes.filter((scene) => scene.speaker !== "music").length,
    musicBedCount: scenes.filter((scene) => scene.speaker === "music").length,
  };
}

export const VISUAL_PLAN_FILL_CHUNK_SIZE = 10;

export function chunkPodcastSkeletonScenes<T>(
  scenes: T[],
  chunkSize = VISUAL_PLAN_FILL_CHUNK_SIZE,
): T[][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < scenes.length; index += size) {
    chunks.push(scenes.slice(index, index + size));
  }
  return chunks;
}

export function skeletonScenesToImportJson(
  scenes: PodcastVisualPlanSkeletonScene[],
): string {
  return JSON.stringify(
    scenes.map((scene) => ({
      order: scene.order,
      scriptText: scene.scriptText,
      sceneType: scene.sceneType,
      visualPurpose: scene.visualPurpose,
      visualIdea: scene.visualIdea,
      duration: scene.duration,
      imagePrompt: scene.imagePrompt,
      status: scene.status,
      ...(scene.pauseAfterMs != null ? { pauseAfterMs: scene.pauseAfterMs } : {}),
      ...(scene.fishSpeechText
        ? { fishSpeechText: scene.fishSpeechText }
        : {}),
    })),
  );
}
