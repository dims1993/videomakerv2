export type PrependSceneDraft = {
  scriptText: string;
  sceneType: string;
  visualPurpose: string | null;
  visualIdea: string | null;
  imagePrompt: string | null;
  duration: number;
  status: string;
  pauseAfterMs?: number | null;
  /** Original patch/import order used only for stable sorting (e.g. -16 … -1). */
  sourceOrder: number | null;
};

const DEFAULT_SCENE_TYPES = new Set(["avatar", "insert", "space"]);

export function normalizePrependSceneType(sceneType: string | null | undefined) {
  const trimmed = sceneType?.trim() ?? "";
  return DEFAULT_SCENE_TYPES.has(trimmed) ? trimmed : "avatar";
}

export function sortScenesByOptionalOrder<T extends { order?: number | null }>(
  scenes: T[],
): T[] {
  const allHaveOrder = scenes.every(
    (scene) => typeof scene.order === "number" && Number.isFinite(scene.order),
  );

  if (!allHaveOrder) {
    return scenes;
  }

  return [...scenes].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

/**
 * Plans final sortOrders after inserting `insertCount` scenes at the start.
 * Existing scene N becomes N + insertCount. Images stay attached to scene ids.
 */
export function shiftedSortOrdersAfterPrepend(
  existingSortOrders: number[],
  insertCount: number,
): number[] {
  if (insertCount <= 0) {
    return existingSortOrders;
  }

  return existingSortOrders.map((order) => order + insertCount);
}

/**
 * When shifting up under a unique (videoId, sortOrder) constraint, update
 * highest orders first so intermediate values never collide.
 */
export function sortExistingScenesForUpwardShift<T extends { sortOrder: number }>(
  scenes: T[],
): T[] {
  return [...scenes].sort((left, right) => right.sortOrder - left.sortOrder);
}
