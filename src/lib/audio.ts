import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { assertFfmpegOk, getFfprobeBinaryPath, runFfmpeg } from "@/lib/render/ffmpeg";

const execFileAsync = promisify(execFile);

export async function getAudioDurationSec(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(getFfprobeBinaryPath(), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = Number(stdout.trim());

    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

/**
 * Extract a time window from MP3 bytes and re-encode safely.
 * Decodes to PCM first so libmp3lame never receives fltp frames from mp3float
 * (avoids "inadequate AVFrame plane padding" on short narration-block slices).
 */
export async function sliceMp3Buffer(opts: {
  audio: Buffer;
  startSec: number;
  durationSec: number;
  label?: string;
  tempPrefix?: string;
  /** Extra ffmpeg audio filters applied after trim (e.g. afade). */
  audioFilter?: string;
}): Promise<Buffer> {
  const durationSec = Math.max(0.05, opts.durationSec);
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), opts.tempPrefix ?? "vm-audio-slice-"),
  );
  const label = (opts.label ?? "slice").replace(/[^\w.-]/g, "_").slice(0, 40);
  const inputPath = path.join(tempRoot, `${label}-in.mp3`);
  const wavPath = path.join(tempRoot, `${label}-pcm.wav`);
  const outputPath = path.join(tempRoot, `${label}-out.mp3`);
  try {
    await writeFile(inputPath, opts.audio);
    const trimArgs = [
      "-y",
      "-i",
      inputPath,
      "-ss",
      opts.startSec.toFixed(3),
      "-t",
      durationSec.toFixed(3),
    ];
    if (opts.audioFilter) {
      trimArgs.push("-af", opts.audioFilter);
    }
    trimArgs.push(
      "-ar",
      "44100",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wavPath,
    );
    const trimResult = await runFfmpeg(trimArgs);
    assertFfmpegOk(trimResult, "Slice audio (PCM)");

    const encodeResult = await runFfmpeg([
      "-y",
      "-i",
      wavPath,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outputPath,
    ]);
    assertFfmpegOk(encodeResult, "Slice audio (MP3 encode)");
    return await readFile(outputPath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
