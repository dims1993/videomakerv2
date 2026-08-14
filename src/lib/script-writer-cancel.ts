const GLOBAL_KEY = "__videomaker_script_writer_cancel_ids__";

function canceledVideoIds(): Set<string> {
  const globalStore = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Set<string>;
  };
  if (!globalStore[GLOBAL_KEY]) {
    globalStore[GLOBAL_KEY] = new Set<string>();
  }
  return globalStore[GLOBAL_KEY];
}

export function requestScriptWriterCancel(videoId: string) {
  const id = videoId.trim();
  if (!id) {
    return;
  }
  canceledVideoIds().add(id);
}

export function clearScriptWriterCancel(videoId: string) {
  canceledVideoIds().delete(videoId.trim());
}

export function isScriptWriterCancelRequested(videoId: string) {
  return canceledVideoIds().has(videoId.trim());
}

export class ScriptWriterCanceledError extends Error {
  constructor(message = "Script Writer Batch canceled.") {
    super(message);
    this.name = "ScriptWriterCanceledError";
  }
}
