import path from "node:path";

import { generatedImagesDir } from "@/lib/generated-images-path";

/**
 * Normalize / resolve the video-level image output folder used by Visual Plan,
 * Assets prepare, and pipeline Flow runs.
 *
 * Prefer storing paths relative to the repo root (e.g. storage/generated-images/…).
 */

export function normalizeStoredImageOutputFolder(
  value: string | null | undefined,
): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }

  const cwd = process.cwd();
  const absolute = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(cwd, raw);
  const relative = path.relative(cwd, absolute);

  if (!relative || relative === ".") {
    return null;
  }

  // Keep paths inside the repo as relative; otherwise keep absolute.
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }

  return absolute;
}

export function resolveImageOutputFolderAbsolute(
  stored: string | null | undefined,
  videoId: string,
  videoTitle?: string | null,
): string {
  const normalized = normalizeStoredImageOutputFolder(stored);
  if (!normalized) {
    return generatedImagesDir(videoId, videoTitle);
  }
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(process.cwd(), normalized);
}

export function displayImageOutputFolder(
  stored: string | null | undefined,
  videoId: string,
  videoTitle?: string | null,
): string {
  const normalized = normalizeStoredImageOutputFolder(stored);
  if (normalized) {
    return normalized;
  }
  const absolute = generatedImagesDir(videoId, videoTitle);
  const relative = path.relative(process.cwd(), absolute);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return absolute;
}
