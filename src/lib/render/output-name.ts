import { slugifyFilePart } from "@/lib/image-batches";

/** Final rendered video basename from title: "Video Sobre Amor" → "video-sobre-amor". */
export function renderFinalVideoBaseName(videoTitle: string | null | undefined) {
  return slugifyFilePart(videoTitle?.trim() || "") || "video";
}

export function renderFinalVideoFileName(videoTitle: string | null | undefined) {
  return `${renderFinalVideoBaseName(videoTitle)}.mp4`;
}
