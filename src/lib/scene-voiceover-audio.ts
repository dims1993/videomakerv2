import { access } from "node:fs/promises";
import path from "node:path";

import { probeMedia } from "@/lib/render/ffmpeg";

export type SceneVoiceoverAudioCheck = {
  ok: boolean;
  reason?: "missing_path" | "missing_file" | "invalid_audio";
  absolutePath?: string;
};

export function resolveSceneVoiceoverAbsolutePath(
  relativePath: string,
): string {
  const trimmed = relativePath.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.join(process.cwd(), trimmed);
}

/**
 * Fast check: path set and file exists on disk.
 * Does not ffprobe — use {@link sceneVoiceoverAudioHasUsableStream} before stitch.
 */
export async function sceneVoiceoverFileExists(
  relativePath: string | null | undefined,
): Promise<SceneVoiceoverAudioCheck> {
  const trimmed = relativePath?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, reason: "missing_path" };
  }
  const absolutePath = resolveSceneVoiceoverAbsolutePath(trimmed);
  try {
    await access(absolutePath);
    return { ok: true, absolutePath };
  } catch {
    return { ok: false, reason: "missing_file", absolutePath };
  }
}

/** Exists + readable audio stream with duration (for stitch preflight). */
export async function sceneVoiceoverAudioHasUsableStream(
  relativePath: string | null | undefined,
): Promise<SceneVoiceoverAudioCheck> {
  const exists = await sceneVoiceoverFileExists(relativePath);
  if (!exists.ok || !exists.absolutePath) {
    return exists;
  }
  const probe = await probeMedia(exists.absolutePath);
  const hasAudio = probe.streams.some((stream) => stream.codec_type === "audio");
  if (!probe.ok || probe.sizeBytes <= 0 || !hasAudio || probe.durationSec <= 0) {
    return {
      ok: false,
      reason: "invalid_audio",
      absolutePath: exists.absolutePath,
    };
  }
  return { ok: true, absolutePath: exists.absolutePath };
}
