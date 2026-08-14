const GLOBAL_KEY = "__videomaker_thumbnail_batch_cancel_ids__";

function canceledVideoIds(): Set<string> {
  const globalStore = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Set<string>;
  };
  if (!globalStore[GLOBAL_KEY]) {
    globalStore[GLOBAL_KEY] = new Set<string>();
  }
  return globalStore[GLOBAL_KEY];
}

export function requestThumbnailBatchCancel(videoId: string) {
  const id = videoId.trim();
  if (!id) {
    return;
  }
  canceledVideoIds().add(id);
}

export function clearThumbnailBatchCancel(videoId: string) {
  canceledVideoIds().delete(videoId.trim());
}

export function isThumbnailBatchCancelRequested(videoId: string) {
  return canceledVideoIds().has(videoId.trim());
}

export class ThumbnailBatchCanceledError extends Error {
  constructor(message = "Thumbnail batch canceled.") {
    super(message);
    this.name = "ThumbnailBatchCanceledError";
  }
}
