export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

/** Locale-stable for SSR/client hydration (never use bare toLocaleString()). */
export function formatDateTime(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    return typeof date === "string" ? date : "";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(value);
}

type SceneStatsInput = {
  sceneType: string;
  duration: number | null;
  imagePrompt: string | null;
  imageUrl: string | null;
  imageLocalPath?: string | null;
  imageStatus?: string | null;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function durationSeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeSceneType(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function countSceneType(scenes: SceneStatsInput[], sceneType: string) {
  return scenes.filter(
    (scene) => normalizeSceneType(scene.sceneType) === sceneType,
  ).length;
}

export function formatSceneTypeShare(count: number, total: number) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return `${count} / ${percentage}%`;
}

export function getSceneStats(scenes: SceneStatsInput[]) {
  const totalScenes = scenes.length;
  const totalDurationSeconds = scenes.reduce(
    (total, scene) => total + durationSeconds(scene.duration),
    0,
  );
  const scenesWithImagePrompts = scenes.filter((scene) =>
    hasText(scene.imagePrompt),
  ).length;
  const scenesWithImageUrls = scenes.filter((scene) =>
    hasText(scene.imageUrl) || hasText(scene.imageLocalPath),
  ).length;
  const failedScenes = scenes.filter(
    (scene) => scene.imageStatus === "failed" || scene.imageStatus === "needs_retry",
  ).length;
  const avatarScenes = countSceneType(scenes, "avatar");
  const insertScenes = countSceneType(scenes, "insert");
  const spaceScenes = countSceneType(scenes, "space");

  return {
    totalScenes,
    totalDurationSeconds,
    averageDurationSeconds:
      totalScenes > 0 ? totalDurationSeconds / totalScenes : 0,
    scenesWithImagePrompts,
    scenesMissingImagePrompts: totalScenes - scenesWithImagePrompts,
    scenesWithImageUrls,
    scenesMissingImageUrls: totalScenes - scenesWithImageUrls,
    failedScenes,
    avatarScenes,
    insertScenes,
    spaceScenes,
  };
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}
