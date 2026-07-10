import { mkdir } from "node:fs/promises";
import path from "node:path";

import { slugifyFilePart } from "@/lib/image-batches";

export const DEFAULT_VOICEOVER_SEGMENT_OPTIONS = {
  maxScenesPerSegment: 8,
  maxCharsPerSegment: 900,
  maxEstimatedSeconds: 75,
} as const;

export type VoiceoverScene = {
  sortOrder: number;
  scriptText: string | null;
};

export type VoiceoverSegmentDraft = {
  index: number;
  sceneStartOrder: number;
  sceneEndOrder: number;
  text: string;
};

export type VoiceoverSegmentOptions = {
  maxScenesPerSegment?: number;
  maxCharsPerSegment?: number;
  maxEstimatedSeconds?: number;
};

type ExistingSegment = {
  sceneStartOrder: number;
  sceneEndOrder: number;
};

function normalizeOptions(options: VoiceoverSegmentOptions = {}) {
  return {
    maxScenesPerSegment:
      options.maxScenesPerSegment ??
      DEFAULT_VOICEOVER_SEGMENT_OPTIONS.maxScenesPerSegment,
    maxCharsPerSegment:
      options.maxCharsPerSegment ??
      DEFAULT_VOICEOVER_SEGMENT_OPTIONS.maxCharsPerSegment,
    maxEstimatedSeconds:
      options.maxEstimatedSeconds ??
      DEFAULT_VOICEOVER_SEGMENT_OPTIONS.maxEstimatedSeconds,
  };
}

function sceneText(scene: VoiceoverScene) {
  return scene.scriptText?.trim() ?? "";
}

function estimatedSeconds(text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (words / 150) * 60;
}

function buildDraft(index: number, scenes: VoiceoverScene[]): VoiceoverSegmentDraft {
  return {
    index,
    sceneStartOrder: scenes[0]?.sortOrder ?? 0,
    sceneEndOrder: scenes[scenes.length - 1]?.sortOrder ?? 0,
    text: scenes.map((scene) => sceneText(scene)).join("\n\n"),
  };
}

export function createSegmentsFromScenes(
  scenes: VoiceoverScene[],
  options: VoiceoverSegmentOptions = {},
): VoiceoverSegmentDraft[] {
  const resolvedOptions = normalizeOptions(options);
  const orderedScenes = scenes
    .filter((scene) => sceneText(scene))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const segments: VoiceoverSegmentDraft[] = [];
  let currentScenes: VoiceoverScene[] = [];

  for (const scene of orderedScenes) {
    const nextScenes = [...currentScenes, scene];
    const nextText = nextScenes.map((item) => sceneText(item)).join("\n\n");
    const shouldStartNext =
      currentScenes.length > 0 &&
      (nextScenes.length > resolvedOptions.maxScenesPerSegment ||
        nextText.length > resolvedOptions.maxCharsPerSegment ||
        estimatedSeconds(nextText) > resolvedOptions.maxEstimatedSeconds);

    if (shouldStartNext) {
      segments.push(buildDraft(segments.length + 1, currentScenes));
      currentScenes = [scene];
      continue;
    }

    currentScenes = nextScenes;
  }

  if (currentScenes.length > 0) {
    segments.push(buildDraft(segments.length + 1, currentScenes));
  }

  return segments;
}

export function createSingleSceneSegment(
  scene: VoiceoverScene,
): VoiceoverSegmentDraft {
  return {
    index: 1,
    sceneStartOrder: scene.sortOrder,
    sceneEndOrder: scene.sortOrder,
    text: sceneText(scene),
  };
}

export function splitSegmentByScene(
  segment: ExistingSegment,
  scenes: VoiceoverScene[],
): VoiceoverSegmentDraft[] {
  return scenes
    .filter(
      (scene) =>
        scene.sortOrder >= segment.sceneStartOrder &&
        scene.sortOrder <= segment.sceneEndOrder &&
        sceneText(scene),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((scene, index) => ({
      ...createSingleSceneSegment(scene),
      index: index + 1,
    }));
}

export function splitSegmentAtSceneOrder(
  segment: ExistingSegment,
  splitSceneOrder: number,
  scenes: VoiceoverScene[],
): VoiceoverSegmentDraft[] {
  if (
    splitSceneOrder <= segment.sceneStartOrder ||
    splitSceneOrder > segment.sceneEndOrder
  ) {
    return [];
  }

  const coveredScenes = scenes
    .filter(
      (scene) =>
        scene.sortOrder >= segment.sceneStartOrder &&
        scene.sortOrder <= segment.sceneEndOrder &&
        sceneText(scene),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const leftScenes = coveredScenes.filter(
    (scene) => scene.sortOrder < splitSceneOrder,
  );
  const rightScenes = coveredScenes.filter(
    (scene) => scene.sortOrder >= splitSceneOrder,
  );

  if (leftScenes.length === 0 || rightScenes.length === 0) {
    return [];
  }

  return [buildDraft(1, leftScenes), buildDraft(2, rightScenes)];
}

function storageRoot() {
  return path.join(process.cwd(), "storage");
}

export function voiceoverSegmentsDir(videoId: string) {
  return path.join(storageRoot(), "voiceovers", videoId, "segments");
}

export function voiceoverSegmentFileName(segment: {
  index: number;
  sceneStartOrder: number;
  sceneEndOrder: number;
}) {
  const paddedIndex = segment.index.toString().padStart(3, "0");

  return `segment_${paddedIndex}_scenes_${segment.sceneStartOrder}-${segment.sceneEndOrder}.mp3`;
}

export function voiceoverSegmentRelativePath(videoId: string, fileName: string) {
  return path.join("storage", "voiceovers", slugifyFilePart(videoId), "segments", fileName);
}

export async function ensureVoiceoverSegmentsDir(videoId: string) {
  const directory = voiceoverSegmentsDir(videoId);

  await mkdir(directory, { recursive: true });

  return directory;
}

export function generatedAudioUrl(audioPath: string | null | undefined) {
  if (!audioPath?.startsWith("storage/voiceovers/")) {
    return null;
  }

  return `/api/generated-audio/${audioPath.slice("storage/voiceovers/".length)}`;
}
