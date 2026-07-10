import { writeFile } from "node:fs/promises";
import path from "node:path";

import { assertFfmpegOk, runFfmpeg, validateVideoFile } from "@/lib/render/ffmpeg";
import { ensureRenderDir } from "@/lib/render/storage";
import type { SceneTimelineItem } from "@/lib/render/timing";

function concatFileLine(filePath: string) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

export async function renderImageSequenceVideo({
  videoId,
  sceneTimeline,
  width,
  height,
  fps,
  imageFit,
}: {
  videoId: string;
  sceneTimeline: SceneTimelineItem[];
  width: number;
  height: number;
  fps: number;
  imageFit: "cover" | "contain";
}) {
  if (sceneTimeline.length === 0) {
    throw new Error("Cannot render: scene timeline is empty.");
  }

  const directory = await ensureRenderDir(videoId);
  const imagesPath = path.join(directory, "images.txt");
  const outputPath = path.join(directory, "scene_video.mp4");
  const lines: string[] = [];

  for (const item of sceneTimeline) {
    lines.push(concatFileLine(item.imagePath));
    lines.push(`duration ${item.duration.toFixed(3)}`);
  }

  lines.push(concatFileLine(sceneTimeline[sceneTimeline.length - 1].imagePath));
  await writeFile(imagesPath, `${lines.join("\n")}\n`);

  const fitFilter =
    imageFit === "contain"
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  const result = await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    imagesPath,
    "-vf",
    `${fitFilter},fps=${fps},format=yuv420p`,
    "-r",
    fps.toString(),
    "-an",
    outputPath,
  ]);

  assertFfmpegOk(result, "Scene image video render");
  const sceneVideoProbe = await validateVideoFile(
    outputPath,
    "Cannot render: scene_video.mp4 is missing a valid video stream.",
  );

  return {
    outputPath,
    imageVideoResult: result,
    sceneVideoProbe,
  };
}
