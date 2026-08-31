import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  musicBedOverlapsFromSteps,
  planMusicBedStitch,
} from "@/lib/music-bed-stitch";
import { assertFfmpegOk, runFfmpeg, validateAudioFile } from "@/lib/render/ffmpeg";
import { ensureRenderDir } from "@/lib/render/storage";

type VoiceoverAudioSegment = {
  index: number;
  sceneStartOrder: number;
  audioPath: string | null;
};

export type SceneVoiceoverClip = {
  sortOrder: number;
  audioPath: string | null;
  pauseAfterMs: number | null;
  isMusicBed?: boolean;
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

function aformatFilter(inputLabel: string, outputLabel: string) {
  return `${inputLabel}aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo${outputLabel}`;
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
  const encodeResult = await runFfmpeg(
    [
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
    ],
    { cwd: directory },
  );

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

async function normalizeClipToPcmWav(options: {
  inputPath: string;
  outputPath: string;
  fadeOutSec?: number;
  durationSec?: number;
}) {
  const { inputPath, outputPath, fadeOutSec = 0, durationSec = 0 } = options;
  const args = ["-y", "-i", inputPath, "-ar", "44100", "-ac", "2"];
  if (fadeOutSec > 0 && durationSec > fadeOutSec) {
    const start = Math.max(0, durationSec - fadeOutSec);
    args.push(
      "-af",
      `afade=t=out:st=${start.toFixed(3)}:d=${fadeOutSec.toFixed(3)}`,
    );
  }
  args.push("-c:a", "pcm_s16le", outputPath);
  const result = await runFfmpeg(args);
  assertFfmpegOk(result, "Scene voiceover clip normalize");
}

async function ensureSilenceWav(options: {
  directory: string;
  pauseSec: number;
  cache: Map<string, string>;
}) {
  const ms = Math.max(1, Math.round(options.pauseSec * 1000));
  const cached = options.cache.get(String(ms));
  if (cached) {
    return cached;
  }
  const outputPath = path.join(options.directory, `silence_${ms}ms.wav`);
  const result = await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-t",
    (ms / 1000).toFixed(3),
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
  assertFfmpegOk(result, "Scene voiceover silence");
  options.cache.set(String(ms), outputPath);
  return outputPath;
}

async function renderOverlapPieceToWav(options: {
  bedPath: string;
  speechPath: string;
  bedDurationSec: number;
  introSec: number;
  underlaySec: number;
  outputPath: string;
}) {
  const {
    bedPath,
    speechPath,
    bedDurationSec,
    introSec,
    underlaySec,
    outputPath,
  } = options;
  const totalBedSec = introSec + underlaySec;
  const bedSamples = Math.max(
    1,
    Math.round(Math.max(bedDurationSec, 0.05) * 44100),
  );
  const delayMs = Math.max(0, Math.round(introSec * 1000));
  const filter = [
    aformatFilter("[0:a]", "[bedfmt]"),
    `[bedfmt]aloop=loop=-1:size=${bedSamples},atrim=0:${totalBedSec.toFixed(3)},asetpts=N/SR/TB,volume='if(lt(t\\,${introSec.toFixed(3)})\\,1\\,0.42)',afade=t=out:st=${introSec.toFixed(3)}:d=${underlaySec.toFixed(3)}:curve=exp[bed]`,
    aformatFilter("[1:a]", "[speechpre]"),
    `[speechpre]adelay=${delayMs}|${delayMs}[speech]`,
    "[bed][speech]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mix]",
    "[mix]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo[outa]",
  ].join(";");

  const result = await runFfmpeg([
    "-y",
    "-i",
    bedPath,
    "-i",
    speechPath,
    "-filter_complex",
    filter,
    "-map",
    "[outa]",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
  assertFfmpegOk(result, "Scene voiceover music-bed overlap");
}

/**
 * Stitch scene clips with pauses / music-bed underlays.
 *
 * Builds one normalized WAV piece per plan step, then concatenates with the
 * concat demuxer. Avoids a single mega filter_complex (hundreds of inputs),
 * which fails on macOS with pthread_create / Resource temporarily unavailable.
 */
export async function stitchSceneVoiceoverAudio(
  videoId: string,
  clips: SceneVoiceoverClip[],
  outputRelativePath: string,
  options?: { defaultPauseAfterMs?: number },
) {
  const orderedClips = [...clips].sort((a, b) => a.sortOrder - b.sortOrder);

  if (orderedClips.length === 0) {
    throw new Error("No scene voiceover clips found.");
  }

  const clipPaths: string[] = [];
  const clipDurations: number[] = [];

  for (const clip of orderedClips) {
    if (!clip.audioPath) {
      throw new Error(`Cannot stitch: missing audio for scene ${clip.sortOrder}.`);
    }
    const filePath = resolveStoragePath(clip.audioPath);
    const probe = await validateAudioFile(
      filePath,
      `Cannot stitch: scene ${clip.sortOrder} voiceover has no audio stream.`,
    );
    clipPaths.push(filePath);
    clipDurations.push(probe.durationSec);
  }

  const steps = planMusicBedStitch(
    orderedClips.map((clip, index) => ({
      isMusicBed: Boolean(clip.isMusicBed),
      pauseAfterMs: clip.pauseAfterMs,
      durationSec: clipDurations[index] ?? 0,
    })),
    { defaultPauseAfterMs: options?.defaultPauseAfterMs },
  );
  const overlaps = musicBedOverlapsFromSteps(steps);

  const workDir = path.join(
    process.cwd(),
    "storage",
    "voiceovers",
    videoId,
    "stitch-work",
  );
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const silenceCache = new Map<string, string>();
  const piecePaths: string[] = [];
  let pieceIndex = 0;

  try {
    for (const step of steps) {
      if (step.kind === "silence") {
        piecePaths.push(
          await ensureSilenceWav({
            directory: workDir,
            pauseSec: step.pauseSec,
            cache: silenceCache,
          }),
        );
        continue;
      }

      if (step.kind === "clip") {
        const outPath = path.join(workDir, `piece_${pieceIndex++}.wav`);
        await normalizeClipToPcmWav({
          inputPath: clipPaths[step.clipIndex]!,
          outputPath: outPath,
          fadeOutSec: step.fadeOutSec,
          durationSec: clipDurations[step.clipIndex] ?? 0,
        });
        piecePaths.push(outPath);
        continue;
      }

      const outPath = path.join(workDir, `piece_${pieceIndex++}.wav`);
      await renderOverlapPieceToWav({
        bedPath: clipPaths[step.bedIndex]!,
        speechPath: clipPaths[step.speechIndex]!,
        bedDurationSec: clipDurations[step.bedIndex] ?? 0,
        introSec: step.introSec,
        underlaySec: step.underlaySec,
        outputPath: outPath,
      });
      piecePaths.push(outPath);
    }

    if (piecePaths.length === 0) {
      throw new Error("Cannot stitch: no audio segments produced.");
    }

    const concatListPath = path.join(workDir, "pieces.txt");
    await writeFile(
      concatListPath,
      `${piecePaths.map((filePath) => concatFileLine(filePath)).join("\n")}\n`,
    );

    const outputPath = path.resolve(process.cwd(), outputRelativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    // Concat identical PCM pieces, then one loudnorm pass on the master.
    const concatRawPath = path.join(workDir, "concat_raw.wav");
    const concatResult = await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      concatRawPath,
    ]);
    assertFfmpegOk(concatResult, "Scene voiceover stitch concat");

    const encodeResult = await runFfmpeg([
      "-y",
      "-i",
      concatRawPath,
      "-af",
      "loudnorm=I=-16:LRA=11:TP=-1.5",
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
      musicBedOverlaps: overlaps.length,
      overlaps: overlaps.map((overlap) => ({
        bedSortOrder: orderedClips[overlap.bedIndex]!.sortOrder,
        speechSortOrder: orderedClips[overlap.speechIndex]!.sortOrder,
        introSec: overlap.introSec,
        underlaySec: overlap.underlaySec,
        overlapSec: overlap.underlaySec,
      })),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
