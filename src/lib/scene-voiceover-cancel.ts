const GLOBAL_KEY = "__videomaker_scene_voiceover_cancel_ids__";

function canceledVideoIds(): Set<string> {
  const globalStore = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Set<string>;
  };
  if (!globalStore[GLOBAL_KEY]) {
    globalStore[GLOBAL_KEY] = new Set<string>();
  }
  return globalStore[GLOBAL_KEY];
}

export function requestSceneVoiceoverCancel(videoId: string) {
  const id = videoId.trim();
  if (!id) {
    return;
  }
  canceledVideoIds().add(id);
}

export function clearSceneVoiceoverCancel(videoId: string) {
  canceledVideoIds().delete(videoId.trim());
}

export function isSceneVoiceoverCancelRequested(videoId: string) {
  return canceledVideoIds().has(videoId.trim());
}

export class SceneVoiceoverCanceledError extends Error {
  readonly generated: number;
  readonly skipped: number;
  readonly failed: number;

  constructor(
    message = "Scene voiceover generation canceled.",
    counts: { generated?: number; skipped?: number; failed?: number } = {},
  ) {
    super(message);
    this.name = "SceneVoiceoverCanceledError";
    this.generated = counts.generated ?? 0;
    this.skipped = counts.skipped ?? 0;
    this.failed = counts.failed ?? 0;
  }
}
