export const videoStatuses = ["idea", "script", "visual_plan", "assets", "metadata", "done"] as const;
export const sceneStatuses = ["planned", "asset_needed", "asset_ready", "approved", "rejected"] as const;

export type VideoStatus = (typeof videoStatuses)[number];
export type SceneStatus = (typeof sceneStatuses)[number];

export const SCENE_STATUS_REJECTED = "rejected" satisfies SceneStatus;

type ComputableVideo = {
  ideaJson: string | null;
  script: string | null;
  metadataJson: string | null;
  scenes: Array<{
    imagePrompt: string | null;
    status?: string | null;
  }>;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

/** Rejected in Assets → skipped by voiceover, stitch, subtitles, and render. */
export function isSceneRejected(status: string | null | undefined) {
  return (status ?? "").trim().toLowerCase() === SCENE_STATUS_REJECTED;
}

export function isSceneIncludedInPipeline(status: string | null | undefined) {
  return !isSceneRejected(status);
}

/** Prisma `where` fragment: only scenes that continue past Assets. */
export function sceneIncludedInPipelineWhere() {
  return {
    status: { not: SCENE_STATUS_REJECTED },
  } as const;
}

export function getComputedVideoStatus(video: ComputableVideo): VideoStatus {
  if (!hasText(video.ideaJson)) {
    return "idea";
  }

  if (!hasText(video.script)) {
    return "script";
  }

  const pipelineScenes = video.scenes.filter((scene) =>
    isSceneIncludedInPipeline(scene.status),
  );

  if (pipelineScenes.length === 0 && video.scenes.length === 0) {
    return "visual_plan";
  }

  if (pipelineScenes.length === 0) {
    // Every scene rejected — treat visual plan as done enough to move on.
    if (!hasText(video.metadataJson)) {
      return "metadata";
    }
    return "done";
  }

  const allScenesHaveImagePrompts = pipelineScenes.every((scene) =>
    hasText(scene.imagePrompt),
  );

  if (!allScenesHaveImagePrompts) {
    return "visual_plan";
  }

  if (!hasText(video.metadataJson)) {
    return "metadata";
  }

  return "done";
}

export function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
