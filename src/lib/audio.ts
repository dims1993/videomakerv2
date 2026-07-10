import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getFfprobeBinaryPath } from "@/lib/render/ffmpeg";

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
