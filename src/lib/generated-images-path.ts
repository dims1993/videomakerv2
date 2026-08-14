import path from "node:path";

/**
 * Path helpers for generated images — kept free of Prisma / podcast imports
 * so API routes can load without dragging the image-batch graph.
 */

function storageRoot() {
  return path.join(process.cwd(), "storage");
}

function generatedImagesRoot() {
  return path.join(storageRoot(), "generated-images");
}

export function slugifyGeneratedImageFolderPart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "video";
}

export function generatedImagesDir(videoId: string, videoTitle?: string | null) {
  const folderName = videoTitle?.trim()
    ? `${slugifyGeneratedImageFolderPart(videoTitle)}-images`
    : videoId;

  return path.join(generatedImagesRoot(), folderName);
}

export function localImageUrl(videoId: string, fileName: string) {
  return `/api/generated-images/${encodeURIComponent(videoId)}/${encodeURIComponent(
    fileName,
  )}`;
}
