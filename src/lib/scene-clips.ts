import { access, copyFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";

import { assertFfmpegOk, probeMedia, runFfmpeg } from "@/lib/render/ffmpeg";
import { renderRelativePath } from "@/lib/render/storage";
import {
  ensureSceneVoiceoversDir,
  sceneVoiceoverRelativePath,
} from "@/lib/voiceover-scenes";

export function sceneClipsRootDir() {
  return path.join(process.cwd(), "storage", "scene-clips");
}

export function sceneClipsDir(videoId: string) {
  return path.join(sceneClipsRootDir(), videoId);
}

export function sceneClipFileName(sceneId: string, extension = ".mp4") {
  const normalizedExtension = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
  return `scene_${sceneId}${normalizedExtension}`;
}

export function sceneClipRelativePath(videoId: string, fileName: string) {
  return path.join("storage", "scene-clips", videoId, fileName);
}

export async function ensureSceneClipsDir(videoId: string) {
  const dir = sceneClipsDir(videoId);
  await mkdir(dir, { recursive: true });
  return dir;
}

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".m4v",
]);

export function isSupportedSceneClipExtension(fileName: string) {
  return VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/**
 * Fit a source video to an exact duration:
 * - longer than target → trim from the start
 * - shorter than target → freeze the last frame (do NOT loop — looping
 *   restarts at frame 0 and causes a visible jump before the next still)
 * Always strips audio when `muted` is true.
 */
export async function materializeSceneClipToDuration({
  sourcePath,
  outputPath,
  targetDurationSec,
  width,
  height,
  fps,
  imageFit,
  muted,
}: {
  sourcePath: string;
  outputPath: string;
  targetDurationSec: number;
  width: number;
  height: number;
  fps: number;
  imageFit: "cover" | "contain";
  muted: boolean;
}) {
  const duration = Math.max(0.1, targetDurationSec);
  const probe = await probeMedia(sourcePath);
  if (!probe.ok || probe.durationSec <= 0) {
    throw new Error("Scene clip is missing a valid video stream.");
  }

  const fitFilter =
    imageFit === "contain"
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;

  const padSec = Math.max(0, duration - probe.durationSec);
  // Freeze last frame instead of -stream_loop (which flashes frame 0 at the end).
  const vf =
    padSec > 0.04
      ? `${fitFilter},fps=${fps},format=yuv420p,tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}`
      : `${fitFilter},fps=${fps},format=yuv420p`;

  const args = [
    "-y",
    "-i",
    sourcePath,
    "-t",
    duration.toFixed(3),
    "-vf",
    vf,
    "-r",
    fps.toString(),
  ];

  if (muted) {
    args.push("-an");
  } else {
    args.push(
      "-af",
      `atrim=0:${duration.toFixed(3)},apad=whole_dur=${duration.toFixed(3)},asetpts=N/SR/TB`,
      "-ac",
      "2",
      "-ar",
      "44100",
    );
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-movflags",
    "+faststart",
    outputPath,
  );

  const result = await runFfmpeg(args);
  assertFfmpegOk(result, "Scene clip fit-to-duration");
  return result;
}

export async function extractFittedClipAudio({
  sourcePath,
  outputPath,
  targetDurationSec,
}: {
  sourcePath: string;
  outputPath: string;
  targetDurationSec: number;
}) {
  const duration = Math.max(0.1, targetDurationSec);
  const probe = await probeMedia(sourcePath);
  if (!probe.ok) {
    throw new Error("Cannot extract audio from scene clip.");
  }
  const hasAudio = probe.streams.some((stream) => stream.codec_type === "audio");
  if (!hasAudio) {
    // Write a short silent file so mixers can still pad.
    const silence = await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-t",
      duration.toFixed(3),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    ]);
    assertFfmpegOk(silence, "Silent clip audio placeholder");
    return { hasAudio: false };
  }

  const needsPad =
    probe.durationSec > 0 && probe.durationSec + 0.05 < duration;
  const args = [
    "-y",
    "-i",
    sourcePath,
    "-t",
    duration.toFixed(3),
    "-vn",
    "-af",
    needsPad
      ? `atrim=0:${duration.toFixed(3)},apad=whole_dur=${duration.toFixed(3)},asetpts=N/SR/TB`
      : `atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB`,
    "-ac",
    "2",
    "-ar",
    "44100",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outputPath,
  ];
  const result = await runFfmpeg(args);
  assertFfmpegOk(result, "Extract fitted clip audio");
  return { hasAudio: true };
}

export function sceneUsesExclusiveClipAudio(scene: {
  clipLocalPath?: string | null;
  clipMuted?: boolean | null;
}) {
  return Boolean(scene.clipLocalPath?.trim()) && scene.clipMuted === false;
}

/**
 * Replace master audio in [startSec, startSec+durationSec] with clip audio only.
 * No amix — the music bed / VO in that window is removed.
 */
export async function replaceMasterAudioSegment({
  masterAudioPath,
  clipAudioPath,
  startSec,
  durationSec,
  outputPath,
}: {
  masterAudioPath: string;
  clipAudioPath: string;
  startSec: number;
  durationSec: number;
  outputPath: string;
}) {
  const start = Math.max(0, startSec);
  const duration = Math.max(0.05, durationSec);
  const end = start + duration;
  const masterProbe = await probeMedia(masterAudioPath);
  if (!masterProbe.ok || masterProbe.durationSec <= 0) {
    throw new Error("Master audio is missing a valid stream.");
  }

  const filterParts: string[] = [];
  const concatLabels: string[] = [];
  const aformat =
    "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo";

  if (start > 0.02) {
    filterParts.push(
      `[0:a]atrim=0:${start.toFixed(3)},asetpts=N/SR/TB,${aformat}[pre]`,
    );
    concatLabels.push("[pre]");
  }

  filterParts.push(
    `[1:a]atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB,${aformat}[clip]`,
  );
  concatLabels.push("[clip]");

  if (end + 0.02 < masterProbe.durationSec) {
    filterParts.push(
      `[0:a]atrim=${end.toFixed(3)},asetpts=N/SR/TB,${aformat}[post]`,
    );
    concatLabels.push("[post]");
  }

  const filter = `${filterParts.join(";")};${concatLabels.join("")}concat=n=${concatLabels.length}:v=0:a=1[aout]`;
  const result = await runFfmpeg([
    "-y",
    "-i",
    masterAudioPath,
    "-i",
    clipAudioPath,
    "-filter_complex",
    filter,
    "-map",
    "[aout]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ]);
  assertFfmpegOk(result, "Replace master audio with scene clip");
  return result;
}

/** @deprecated Use replaceMasterAudioSegment — clip audio is exclusive, not mixed. */
export async function mixClipAudioOntoMaster(
  args: Parameters<typeof replaceMasterAudioSegment>[0],
) {
  return replaceMasterAudioSegment(args);
}

export async function removePreviousSceneClip(
  previousLocalPath: string | null | undefined,
  keepLocalPath?: string | null,
) {
  if (!previousLocalPath?.trim()) {
    return;
  }
  const absolute = path.resolve(process.cwd(), previousLocalPath);
  if (keepLocalPath?.trim()) {
    const keepAbsolute = path.resolve(process.cwd(), keepLocalPath);
    if (absolute === keepAbsolute) {
      // Re-attach to the same scene/path must not delete the file just written.
      return;
    }
  }
  const root = path.resolve(sceneClipsRootDir());
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    return;
  }
  try {
    await unlink(absolute);
  } catch {
    // ignore
  }
}

export async function resolveSceneClipPath(scene: {
  clipLocalPath: string | null;
  clipFileName: string | null;
}, videoId: string) {
  const candidates = [
    scene.clipLocalPath
      ? path.resolve(process.cwd(), scene.clipLocalPath)
      : null,
    scene.clipFileName
      ? path.join(sceneClipsDir(videoId), scene.clipFileName)
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

export function exclusiveSceneVoiceoverFileName(sceneId: string) {
  return `scene_${sceneId}_exclusive.m4a`;
}

/**
 * Persist exclusive-clip audio under storage/voiceovers/.../scenes so subtitle
 * sync/stitch include the same timeline slot as final render.
 */
export async function ensureExclusiveSceneVoiceoverAudio({
  videoId,
  sceneId,
  clipLocalPath,
  clipFileName,
  targetDurationSec,
}: {
  videoId: string;
  sceneId: string;
  clipLocalPath: string | null;
  clipFileName: string | null;
  targetDurationSec: number;
}) {
  const sourcePath = await resolveSceneClipPath(
    { clipLocalPath, clipFileName },
    videoId,
  );
  if (!sourcePath) {
    throw new Error(`Scene clip file missing for scene ${sceneId}.`);
  }

  const fileName = exclusiveSceneVoiceoverFileName(sceneId);
  const directory = await ensureSceneVoiceoversDir(videoId);
  const outputPath = path.join(directory, fileName);
  await extractFittedClipAudio({
    sourcePath,
    outputPath,
    targetDurationSec: Math.max(0.1, targetDurationSec),
  });

  return {
    fileName,
    relativePath: sceneVoiceoverRelativePath(videoId, fileName),
  };
}

export async function prepareExclusiveClipAudioForScene({
  videoId,
  sceneId,
  clipLocalPath,
  clipFileName,
  targetDurationSec,
}: {
  videoId: string;
  sceneId: string;
  clipLocalPath: string | null;
  clipFileName: string | null;
  targetDurationSec: number;
}) {
  // Prefer the durable scene-voiceover path so subtitle sync stays aligned.
  const ensured = await ensureExclusiveSceneVoiceoverAudio({
    videoId,
    sceneId,
    clipLocalPath,
    clipFileName,
    targetDurationSec,
  });
  return ensured.relativePath;
}

export async function storeUploadedSceneClip({
  videoId,
  sceneId,
  sourcePath,
  originalFileName,
}: {
  videoId: string;
  sceneId: string;
  sourcePath: string;
  originalFileName: string;
}) {
  if (!isSupportedSceneClipExtension(originalFileName)) {
    throw new Error("Unsupported video type. Use mp4, mov, webm, mkv, or m4v.");
  }
  const ext = path.extname(originalFileName).toLowerCase() || ".mp4";
  const fileName = sceneClipFileName(sceneId, ext);
  const dir = await ensureSceneClipsDir(videoId);
  const destAbs = path.join(dir, fileName);
  await copyFile(sourcePath, destAbs);
  return {
    fileName,
    relativePath: sceneClipRelativePath(videoId, fileName),
    absolutePath: destAbs,
  };
}
