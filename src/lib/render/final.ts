import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertFfmpegOk,
  ensureFfmpegAssFilterAvailable,
  probeMedia,
  type FfmpegResult,
  type MediaProbe,
  validateAudioFile,
  validateVideoFile,
  runFfmpeg,
} from "@/lib/render/ffmpeg";
import { renderFinalVideoFileName } from "@/lib/render/output-name";
import { ensureRenderDir } from "@/lib/render/storage";

export class FinalRenderValidationError extends Error {
  constructor(
    message: string,
    public finalFfmpegResult: FfmpegResult,
    public finalVideoProbe: MediaProbe,
  ) {
    super(message);
    this.name = "FinalRenderValidationError";
  }
}

function hasStreamType(probe: MediaProbe, codecType: "audio" | "video") {
  return probe.streams.some((stream) => stream.codec_type === codecType);
}

export async function writeRenderSubtitles(videoId: string, assText: string) {
  const directory = await ensureRenderDir(videoId);
  const outputPath = path.join(directory, "draft_subtitles.ass");

  await writeFile(outputPath, assText);

  return outputPath;
}

export async function renderFinalDraftVideo({
  videoId,
  videoTitle,
  sceneVideoPath,
  audioPath,
  subtitlePath,
  width,
  height,
  fps,
  burnCaptions,
}: {
  videoId: string;
  videoTitle?: string | null;
  sceneVideoPath: string;
  audioPath: string;
  subtitlePath: string | null;
  width: number;
  height: number;
  fps: number;
  burnCaptions: boolean;
}) {
  void width;
  void height;
  void fps;

  const directory = await ensureRenderDir(videoId);
  const fileName = renderFinalVideoFileName(videoTitle);
  const outputPath = path.join(directory, fileName);
  const audioProbeBeforeFinalRender = await validateAudioFile(
    audioPath,
    "Cannot render: combined voiceover audio is missing or invalid.",
  );
  const sceneVideoProbeBeforeFinalRender = await validateVideoFile(
    sceneVideoPath,
    "Cannot render: scene_video.mp4 is missing a valid video stream.",
  );
  const warnings: string[] = [];

  if (
    audioProbeBeforeFinalRender.durationSec > 0 &&
    sceneVideoProbeBeforeFinalRender.durationSec > 0 &&
    sceneVideoProbeBeforeFinalRender.durationSec + 1 <
      audioProbeBeforeFinalRender.durationSec
  ) {
    throw new Error(
      `Cannot render: scene_video.mp4 is ${sceneVideoProbeBeforeFinalRender.durationSec.toFixed(
        2,
      )}s, shorter than voiceover audio at ${audioProbeBeforeFinalRender.durationSec.toFixed(
        2,
      )}s. Fix missing/empty scene images and re-render (the previous draft was cut short by -shortest).`,
    );
  }

  const args = [
    "-y",
    "-i",
    sceneVideoPath,
    "-i",
    audioPath,
  ];

  if (burnCaptions && subtitlePath) {
    await ensureFfmpegAssFilterAvailable();
    args.push(
      "-vf",
      `ass=filename=${path.basename(subtitlePath)},format=yuv420p`,
    );
  } else {
    args.push("-vf", "format=yuv420p");
  }

  args.push(
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-shortest",
    fileName,
  );

  const result = await runFfmpeg(args, { cwd: directory });

  assertFfmpegOk(result, "Final video render");

  const finalVideoProbe = await probeMedia(outputPath);

  if (
    !finalVideoProbe.ok ||
    finalVideoProbe.sizeBytes <= 0 ||
    !hasStreamType(finalVideoProbe, "video") ||
    finalVideoProbe.durationSec <= 0
  ) {
    throw new FinalRenderValidationError(
      `Render failed: final ${fileName} is missing a valid video stream.`,
      result,
      finalVideoProbe,
    );
  }

  if (!hasStreamType(finalVideoProbe, "audio")) {
    throw new FinalRenderValidationError(
      `Render failed: final ${fileName} contains no audio stream.`,
      result,
      finalVideoProbe,
    );
  }

  return {
    outputPath,
    fileName,
    durationSec: finalVideoProbe.durationSec,
    finalFfmpegArgs: result.args,
    finalFfmpegCwd: result.cwd,
    finalFfmpegResult: result,
    audioProbeBeforeFinalRender,
    sceneVideoProbeBeforeFinalRender,
    finalVideoProbe,
    warnings,
  };
}
