export const videoStatuses = ["idea", "script", "visual_plan", "assets", "metadata", "done"] as const;
export const sceneStatuses = ["planned", "asset_needed", "asset_ready", "approved", "rejected"] as const;

export type VideoStatus = (typeof videoStatuses)[number];

type ComputableVideo = {
  ideaJson: string | null;
  script: string | null;
  metadataJson: string | null;
  scenes: Array<{
    imagePrompt: string | null;
  }>;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function getComputedVideoStatus(video: ComputableVideo): VideoStatus {
  if (!hasText(video.ideaJson)) {
    return "idea";
  }

  if (!hasText(video.script)) {
    return "script";
  }

  if (video.scenes.length === 0) {
    return "visual_plan";
  }

  const allScenesHaveImagePrompts = video.scenes.every((scene) =>
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
