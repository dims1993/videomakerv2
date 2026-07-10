import { mkdir } from "node:fs/promises";
import path from "node:path";

export function renderDir(videoId: string) {
  return path.join(process.cwd(), "storage", "renders", videoId);
}

export async function ensureRenderDir(videoId: string) {
  const directory = renderDir(videoId);

  await mkdir(directory, { recursive: true });

  return directory;
}

export function renderRelativePath(videoId: string, fileName: string) {
  return path.join("storage", "renders", videoId, fileName);
}

export function renderPreviewUrl(
  outputPath: string | null | undefined,
  cacheKey?: string | null,
) {
  if (!outputPath?.startsWith("storage/renders/")) {
    return null;
  }

  const url = `/api/renders/${outputPath.slice("storage/renders/".length)}`;

  return cacheKey ? `${url}?v=${encodeURIComponent(cacheKey)}` : url;
}
