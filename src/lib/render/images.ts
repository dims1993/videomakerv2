import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertFfmpegOk,
  runFfmpeg,
  validateVideoFile,
} from "@/lib/render/ffmpeg";
import { ensureRenderDir } from "@/lib/render/storage";
import type { SceneTimelineItem } from "@/lib/render/timing";
import {
  buildVoiceSoundBarsFilterComplex,
  parseVoiceSoundBarsStyle,
  prepareVoiceDriveAudio,
  VOICE_SOUND_BARS_CENTER_Y_OFFSET,
} from "@/lib/render/voice-sound-bars";
import type { VoiceSoundBarsStyleId } from "@/lib/render/voice-sound-bars-shared";
import {
  buildEnvelopeBarsOverlayFilterComplex,
  getEnvelopeBarsPreset,
  renderEnvelopeBarsOverlay,
} from "@/lib/render/voice-bars-overlay";
import { materializeSceneClipToDuration } from "@/lib/scene-clips";

function concatFileLine(filePath: string) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

async function assertUsableStillImage(item: SceneTimelineItem) {
  if (!item.imagePath) {
    throw new Error(`Cannot render: missing image for scene ${item.sceneOrder}.`);
  }
  try {
    const fileStat = await stat(item.imagePath);
    if (!fileStat.isFile() || fileStat.size <= 0) {
      throw new Error(
        fileStat.size <= 0 ? "empty file (0 bytes)" : "not a file",
      );
    }
  } catch (error) {
    const reason =
      error instanceof Error && !error.message.startsWith("Cannot render")
        ? error.message === "empty file (0 bytes)" || error.message === "not a file"
          ? error.message
          : "missing file"
        : "missing file";
    throw new Error(
      `Cannot render: unusable scene image for scene ${item.sceneOrder} (${reason}: ${path.basename(item.imagePath)}).`,
    );
  }
}

function expectedTimelineDurationSec(sceneTimeline: SceneTimelineItem[]) {
  return sceneTimeline.reduce((total, item) => total + Math.max(0, item.duration), 0);
}

function ffmpegConcatFailedMidway(stderr: string) {
  return (
    /Impossible to open/i.test(stderr) ||
    /Error during demuxing/i.test(stderr) ||
    /Invalid data found when processing input/i.test(stderr)
  );
}

function stillFitFilter(
  imageFit: "cover" | "contain",
  width: number,
  height: number,
) {
  return imageFit === "contain"
    ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
    : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

async function renderStillSegment({
  item,
  outputPath,
  width,
  height,
  fps,
  imageFit,
  driveAudioPath,
  voiceSoundBarsStyle,
}: {
  item: SceneTimelineItem;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  imageFit: "cover" | "contain";
  /** Voice-only WAV padded to item.duration; when set, overlay centered bars. */
  driveAudioPath?: string | null;
  voiceSoundBarsStyle?: VoiceSoundBarsStyleId;
}) {
  await assertUsableStillImage(item);
  const fitFilter = stillFitFilter(imageFit, width, height);
  const duration = item.duration.toFixed(3);

  if (driveAudioPath) {
    const style = parseVoiceSoundBarsStyle(voiceSoundBarsStyle);

    if (style === "bars" || style === "bars2") {
      const preset = getEnvelopeBarsPreset(style);
      const workDir = path.join(path.dirname(outputPath), "voice-bars-env");
      await mkdir(workDir, { recursive: true });
      const overlayPath = path.join(
        workDir,
        `overlay_${String(item.sceneOrder).padStart(4, "0")}.mov`,
      );
      const overlay = await renderEnvelopeBarsOverlay({
        driveAudioPath,
        outputOverlayPath: overlayPath,
        workDir: path.join(workDir, `scene_${item.sceneOrder}`),
        durationSec: item.duration,
        fps,
        frameWidth: width,
        layout: preset.layout,
        design: preset.design,
      });
      const filterComplex = buildEnvelopeBarsOverlayFilterComplex({
        fitFilter,
        fps,
        durationSec: item.duration,
        centerYOffset: VOICE_SOUND_BARS_CENTER_Y_OFFSET,
        scaleX: overlay.presence.scaleX,
        scaleY: overlay.presence.scaleY,
        offsetY: overlay.presence.offsetY,
      });
      const result = await runFfmpeg([
        "-y",
        "-loop",
        "1",
        "-framerate",
        fps.toString(),
        "-t",
        duration,
        "-i",
        item.imagePath!,
        "-i",
        overlayPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "[vout]",
        "-t",
        duration,
        "-r",
        fps.toString(),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
      assertFfmpegOk(
        result,
        `Scene ${item.sceneOrder} still segment (envelope bars)`,
      );
      return result;
    }

    const filterComplex = buildVoiceSoundBarsFilterComplex({
      fitFilter,
      fps,
      durationSec: item.duration,
      style,
    });
    const result = await runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-framerate",
      fps.toString(),
      "-t",
      duration,
      "-i",
      item.imagePath!,
      "-i",
      driveAudioPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-t",
      duration,
      "-r",
      fps.toString(),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    assertFfmpegOk(result, `Scene ${item.sceneOrder} still segment (voice bars)`);
    return result;
  }

  const result = await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    item.imagePath!,
    "-t",
    duration,
    "-vf",
    `${fitFilter},fps=${fps},format=yuv420p`,
    "-r",
    fps.toString(),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
  assertFfmpegOk(result, `Scene ${item.sceneOrder} still segment`);
  return result;
}

/**
 * Build scene_video.mp4 from a mixed image/video timeline.
 * Every segment is video-only (-an); unmuted clip audio is mixed later into draft audio.
 */
export async function renderImageSequenceVideo({
  videoId,
  sceneTimeline,
  width,
  height,
  fps,
  imageFit,
  voiceSoundBars = false,
  voiceSoundBarsStyle,
  voiceDriveSourceByOrder,
}: {
  videoId: string;
  sceneTimeline: SceneTimelineItem[];
  width: number;
  height: number;
  fps: number;
  imageFit: "cover" | "contain";
  voiceSoundBars?: boolean;
  voiceSoundBarsStyle?: VoiceSoundBarsStyleId;
  /** Absolute paths to per-scene spoken VO files (eligibility already filtered). */
  voiceDriveSourceByOrder?: Map<number, string> | Record<number, string>;
}) {
  if (sceneTimeline.length === 0) {
    throw new Error("Cannot render: scene timeline is empty.");
  }

  const directory = await ensureRenderDir(videoId);
  const segmentsDir = path.join(directory, "scene-segments");
  await mkdir(segmentsDir, { recursive: true });
  const driveDir = path.join(directory, "voice-bars-drive");
  if (voiceSoundBars) {
    await mkdir(driveDir, { recursive: true });
  }
  const segmentPaths: string[] = [];

  const sourceMap =
    voiceDriveSourceByOrder instanceof Map
      ? voiceDriveSourceByOrder
      : new Map(
          Object.entries(voiceDriveSourceByOrder ?? {}).map(([key, value]) => [
            Number(key),
            value,
          ]),
        );

  for (const item of sceneTimeline) {
    const segmentPath = path.join(
      segmentsDir,
      `scene_${String(item.sceneOrder).padStart(4, "0")}.mp4`,
    );

    if (item.mediaKind === "video") {
      if (!item.clipPath) {
        throw new Error(
          `Cannot render: missing clip for scene ${item.sceneOrder}.`,
        );
      }
      await materializeSceneClipToDuration({
        sourcePath: item.clipPath,
        outputPath: segmentPath,
        targetDurationSec: item.duration,
        width,
        height,
        fps,
        imageFit,
        // Visual track is always silent; unmute mixes into master audio later.
        muted: true,
      });
    } else {
      let driveAudioPath: string | null = null;
      const sourcePath = sourceMap.get(item.sceneOrder);
      if (voiceSoundBars && sourcePath) {
        driveAudioPath = path.join(
          driveDir,
          `scene_${String(item.sceneOrder).padStart(4, "0")}.wav`,
        );
        await prepareVoiceDriveAudio({
          inputPath: sourcePath,
          outputPath: driveAudioPath,
          durationSec: item.duration,
        });
      }
      await renderStillSegment({
        item,
        outputPath: segmentPath,
        width,
        height,
        fps,
        imageFit,
        driveAudioPath,
        voiceSoundBarsStyle,
      });
    }

    segmentPaths.push(segmentPath);
  }

  const listPath = path.join(directory, "segments.txt");
  await writeFile(
    listPath,
    `${segmentPaths.map((filePath) => concatFileLine(filePath)).join("\n")}\n`,
  );

  const outputPath = path.join(directory, "scene_video.mp4");
  const result = await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-an",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  assertFfmpegOk(result, "Scene timeline video concat");

  if (ffmpegConcatFailedMidway(result.stderr)) {
    throw new Error(
      `Scene timeline video concat stopped early. ${result.stderr.slice(-1200)}`,
    );
  }

  const sceneVideoProbe = await validateVideoFile(
    outputPath,
    "Cannot render: scene_video.mp4 is missing a valid video stream.",
  );
  const expectedDurationSec = expectedTimelineDurationSec(sceneTimeline);
  const durationGapSec = expectedDurationSec - sceneVideoProbe.durationSec;

  if (expectedDurationSec > 0 && durationGapSec > 1) {
    throw new Error(
      `Cannot render: scene_video.mp4 is ${sceneVideoProbe.durationSec.toFixed(
        2,
      )}s but the timeline expects ${expectedDurationSec.toFixed(
        2,
      )}s.`,
    );
  }

  return {
    outputPath,
    imageVideoResult: result,
    sceneVideoProbe,
    unmutedClipItems: sceneTimeline.filter(
      (item) => item.mediaKind === "video" && !item.clipMuted && item.clipPath,
    ),
  };
}
