const GLOBAL_KEY = "__videomaker_visual_plan_cancel_ids__";

function canceledVideoIds(): Set<string> {
  const globalStore = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Set<string>;
  };
  if (!globalStore[GLOBAL_KEY]) {
    globalStore[GLOBAL_KEY] = new Set<string>();
  }
  return globalStore[GLOBAL_KEY];
}

export function requestVisualPlanCancel(videoId: string) {
  const id = videoId.trim();
  if (!id) {
    return;
  }
  canceledVideoIds().add(id);
}

export function clearVisualPlanCancel(videoId: string) {
  canceledVideoIds().delete(videoId.trim());
}

export function isVisualPlanCancelRequested(videoId: string) {
  return canceledVideoIds().has(videoId.trim());
}

export class VisualPlanCanceledError extends Error {
  constructor(message = "Visual Plan Batch canceled.") {
    super(message);
    this.name = "VisualPlanCanceledError";
  }
}
