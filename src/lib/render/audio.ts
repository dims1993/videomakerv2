import { writeFile } from "node:fs/promises";
import path from "node:path";

import { assertFfmpegOk, runFfmpeg, validateAudioFile } from "@/lib/render/ffmpeg";
import { ensureRenderDir } from "@/lib/render/storage";

type VoiceoverAudioSegment = {
  index: number;
  sceneStartOrder: number;
  audioPath: string | null;
};

type SceneVoiceoverClip = {
  sortOrder: number;
  audioPath: string | null;
  pauseAfterMs: number | null;
};

function resolveStoragePath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const resolved = path.resolve(process.cwd(), normalized);
  const storageRoot = path.resolve(process.cwd(), "storage");

  if (!resolved.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Stored audio path is outside local storage.");
  }

  return resolved;
}

function concatFileLine(filePath: string) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

export async function buildVoiceoverConcatFile(
  videoId: string,
  segments: VoiceoverAudioSegment[],
) {
  const directory = await ensureRenderDir(videoId);
  const concatPath = path.join(directory, "audio_concat.txt");
  const orderedSegments = [...segments].sort(
    (a, b) => a.index - b.index || a.sceneStartOrder - b.sceneStartOrder,
  );
  const lines = orderedSegments.map((segment) => {
    if (!segment.audioPath) {
      throw new Error(`Cannot render: missing audio for segment ${segment.index}.`);
    }

    return concatFileLine(resolveStoragePath(segment.audioPath));
  });

  await writeFile(concatPath, `${lines.join("\n")}\n`);

  return concatPath;
}

export async function validateVoiceoverSegmentAudioFiles(
  segments: VoiceoverAudioSegment[],
) {
  const orderedSegments = [...segments].sort(
    (a, b) => a.index - b.index || a.sceneStartOrder - b.sceneStartOrder,
  );

  return Promise.all(
    orderedSegments.map(async (segment) => {
      if (!segment.audioPath) {
        throw new Error(`Cannot render: missing audio for segment ${segment.index}.`);
      }

      const filePath = resolveStoragePath(segment.audioPath);
      const probe = await validateAudioFile(
        filePath,
        `Cannot render: voiceover segment ${segment.index} has no audio stream.`,
      );

      return {
        segmentIndex: segment.index,
        filePath,
        probe,
      };
    }),
  );
}

export async function renderCombinedVoiceoverAudio(
  videoId: string,
  segments: VoiceoverAudioSegment[],
) {
  const directory = await ensureRenderDir(videoId);
  const segmentAudioProbes = await validateVoiceoverSegmentAudioFiles(segments);
  const concatPath = await buildVoiceoverConcatFile(videoId, segments);
  const outputPath = path.join(directory, "draft_audio.wav");
  const encodeResult = await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    path.basename(concatPath),
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    path.basename(outputPath),
  ], { cwd: directory });

  assertFfmpegOk(encodeResult, "Voiceover audio render");
  const draftAudioProbe = await validateAudioFile(
    outputPath,
    "Cannot render: combined voiceover audio is missing or invalid.",
  );

  return {
    outputPath,
    durationSec: draftAudioProbe.durationSec,
    segmentAudioProbes,
    draftAudioProbe,
    audioConcatResult: encodeResult,
  };
}

export async function stitchSceneVoiceoverAudio(
  videoId: string,
  clips: SceneVoiceoverClip[],
  outputRelativePath: string,
) {
  const orderedClips = [...clips].sort((a, b) => a.sortOrder - b.sortOrder);

  if (orderedClips.length === 0) {
    throw new Error("No scene voiceover clips found.");
  }

  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  let inputIndex = 0;

  for (const clip of orderedClips) {
    if (!clip.audioPath) {
      throw new Error(`Cannot stitch: missing audio for scene ${clip.sortOrder}.`);
    }

    const filePath = resolveStoragePath(clip.audioPath);

    await validateAudioFile(
      filePath,
      `Cannot stitch: scene ${clip.sortOrder} voiceover has no audio stream.`,
    );
    inputArgs.push("-i", filePath);
    filterParts.push(`[${inputIndex}:a]`);
    inputIndex += 1;

    const pauseSec = Math.max(0, (clip.pauseAfterMs ?? 0) / 1000);

    if (pauseSec > 0 && clip !== orderedClips[orderedClips.length - 1]) {
      inputArgs.push(
        "-f",
        "lavfi",
        "-t",
        pauseSec.toFixed(3),
        "-i",
        "anullsrc=r=44100:cl=stereo",
      );
      filterParts.push(`[${inputIndex}:a]`);
      inputIndex += 1;
    }
  }

  const outputPath = path.resolve(process.cwd(), outputRelativePath);
  const filter = `${filterParts.join("")}concat=n=${filterParts.length}:v=0:a=1,loudnorm=I=-16:LRA=11:TP=-1.5[outa]`;
  const encodeResult = await runFfmpeg([
    "-y",
    ...inputArgs,
    "-filter_complex",
    filter,
    "-map",
    "[outa]",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);

  assertFfmpegOk(encodeResult, "Scene voiceover stitch");
  const masterProbe = await validateAudioFile(
    outputPath,
    "Scene voiceover master audio is missing or invalid.",
  );

  return {
    outputPath,
    durationSec: masterProbe.durationSec,
    masterProbe,
    audioConcatResult: encodeResult,
  };
}
