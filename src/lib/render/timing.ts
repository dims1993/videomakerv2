export type RenderScene = {
  sortOrder: number;
  scriptText: string;
  duration: number | null;
  imagePath: string | null;
};

export type RenderVoiceoverSegment = {
  index: number;
  sceneStartOrder: number;
  sceneEndOrder: number;
  durationSec: number | null;
};

export type SceneTimelineItem = {
  sceneOrder: number;
  start: number;
  end: number;
  duration: number;
  imagePath: string;
  scriptText: string;
};

export function buildSceneTimelineFromSegments(
  scenes: RenderScene[],
  voiceoverSegments: RenderVoiceoverSegment[],
): SceneTimelineItem[] {
  const orderedScenes = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
  const orderedSegments = [...voiceoverSegments].sort(
    (a, b) => a.index - b.index || a.sceneStartOrder - b.sceneStartOrder,
  );
  const timeline: SceneTimelineItem[] = [];
  let cursor = 0;

  for (const segment of orderedSegments) {
    const segmentScenes = orderedScenes.filter(
      (scene) =>
        scene.sortOrder >= segment.sceneStartOrder &&
        scene.sortOrder <= segment.sceneEndOrder,
    );

    if (segmentScenes.length === 0) {
      continue;
    }

    const totalWeight = segmentScenes.reduce(
      (total, scene) => total + (scene.duration ?? 4),
      0,
    );
    const segmentDuration =
      segment.durationSec ??
      segmentScenes.reduce((total, scene) => total + (scene.duration ?? 4), 0);

    for (const scene of segmentScenes) {
      if (!scene.imagePath) {
        throw new Error(`Cannot render: missing image for scene ${scene.sortOrder}.`);
      }

      const duration = segmentDuration * ((scene.duration ?? 4) / totalWeight);
      const start = cursor;
      const end = start + duration;

      timeline.push({
        sceneOrder: scene.sortOrder,
        start,
        end,
        duration,
        imagePath: scene.imagePath,
        scriptText: scene.scriptText,
      });
      cursor = end;
    }
  }

  return timeline;
}
