import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

export type FfmpegResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  binaryPath: string;
  cwd: string;
  args: string[];
};

export type MediaProbeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  duration?: string;
};

export type MediaProbe = {
  ok: boolean;
  filePath: string;
  sizeBytes: number;
  binaryPath: string;
  args: string[];
  code: number | null;
  stdout: string;
  stderr: string;
  streams: MediaProbeStream[];
  format?: {
    duration?: string;
  };
  durationSec: number;
  error?: string;
};

export type FfmpegAvailability = {
  ok: boolean;
  binaryPath: string;
  versionOutput?: string;
  versionFirstLine?: string;
  configuration?: string;
  hasEnableLibass?: boolean;
  error?: string;
};

export type FfmpegAssFilterAvailability = {
  ok: boolean;
  binaryPath: string;
  filterLine?: string;
  error?: string;
  setupInstructions?: string;
};

export type FfprobeAvailability = {
  ok: boolean;
  binaryPath: string;
  versionOutput?: string;
  error?: string;
};

export type RenderFfmpegDiagnostics = {
  ffmpeg: {
    envPath: string | null;
    binary: string;
    available: boolean;
    versionFirstLine: string | null;
    configuration: string | null;
    hasEnableLibass: boolean;
    hasAssFilter: boolean;
    assFilterLine: string | null;
    error: string | null;
  };
  ffprobe: {
    envPath: string | null;
    binary: string;
    available: boolean;
    error: string | null;
  };
};

export const FFMPEG_LIBASS_SETUP_INSTRUCTIONS = [
  "Active-word captions require an FFmpeg build compiled with libass.",
  "macOS Homebrew setup:",
  "brew install ffmpeg-full",
  "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg -hide_banner -filters | grep ' ass '",
  'FFMPEG_PATH="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" npm run dev',
  "On Intel Macs, use /usr/local/opt/ffmpeg-full/bin/ffmpeg if that is where Homebrew installed it.",
  "To test the draft without captions, disable Burn captions.",
].join("\n");

export function getFfmpegBinaryPath() {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function getFfprobeBinaryPath() {
  const ffprobePath = process.env.FFPROBE_PATH?.trim();

  if (ffprobePath) {
    return ffprobePath;
  }

  const ffmpegPath = getFfmpegBinaryPath();

  if (path.basename(ffmpegPath) === "ffmpeg") {
    return path.join(path.dirname(ffmpegPath), "ffprobe");
  }

  return "ffprobe";
}

export function runFfmpeg(
  args: string[],
  options: { cwd?: string } = {},
): Promise<FfmpegResult> {
  return new Promise((resolve) => {
    const binaryPath = getFfmpegBinaryPath();
    const cwd = options.cwd ?? process.cwd();

    console.info("Running FFmpeg", { binaryPath, cwd, args });

    const child = spawn(binaryPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        stdout,
        stderr: stderr || error.message,
        code: null,
        binaryPath,
        cwd,
        args,
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        code,
        binaryPath,
        cwd,
        args,
      });
    });
  });
}

function parseProbeDuration(probe: {
  streams?: MediaProbeStream[];
  format?: { duration?: string };
}) {
  const candidates = [
    probe.format?.duration,
    ...(probe.streams ?? []).map((stream) => stream.duration),
  ];

  for (const candidate of candidates) {
    const duration = Number(candidate);

    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
  }

  return 0;
}

export async function probeMedia(filePath: string): Promise<MediaProbe> {
  const binaryPath = getFfprobeBinaryPath();
  const args = [
    "-v",
    "error",
    "-show_entries",
    "stream=index,codec_type,codec_name,duration",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ];
  let sizeBytes = 0;

  try {
    const fileStat = await stat(filePath);
    sizeBytes = fileStat.size;
  } catch (error) {
    return {
      ok: false,
      filePath,
      sizeBytes: 0,
      binaryPath,
      args,
      code: null,
      stdout: "",
      stderr: "",
      streams: [],
      durationSec: 0,
      error: error instanceof Error ? error.message : "Media file does not exist.",
    };
  }

  return new Promise((resolve) => {
    const child = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        filePath,
        sizeBytes,
        binaryPath,
        args,
        code: null,
        stdout,
        stderr: stderr || error.message,
        streams: [],
        durationSec: 0,
        error: error.message,
      });
    });
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout || "{}") as {
          streams?: MediaProbeStream[];
          format?: { duration?: string };
        };
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const durationSec = parseProbeDuration({
          streams,
          format: parsed.format,
        });

        resolve({
          ok: code === 0,
          filePath,
          sizeBytes,
          binaryPath,
          args,
          code,
          stdout,
          stderr,
          streams,
          format: parsed.format,
          durationSec,
          error: code === 0 ? undefined : stderr || "ffprobe failed.",
        });
      } catch (error) {
        resolve({
          ok: false,
          filePath,
          sizeBytes,
          binaryPath,
          args,
          code,
          stdout,
          stderr,
          streams: [],
          durationSec: 0,
          error: error instanceof Error ? error.message : "Unable to parse ffprobe output.",
        });
      }
    });
  });
}

export function getMediaSummary(probe: MediaProbe) {
  return {
    ok: probe.ok,
    filePath: probe.filePath,
    sizeBytes: probe.sizeBytes,
    binaryPath: probe.binaryPath,
    args: probe.args,
    code: probe.code,
    durationSec: probe.durationSec,
    streams: probe.streams.map((stream) => ({
      index: stream.index,
      codecType: stream.codec_type,
      codecName: stream.codec_name,
      duration: stream.duration,
    })),
    format: probe.format,
    error: probe.error,
  };
}

function hasStreamType(probe: MediaProbe, codecType: "audio" | "video") {
  return probe.streams.some((stream) => stream.codec_type === codecType);
}

export async function validateAudioFile(filePath: string, message: string) {
  const probe = await probeMedia(filePath);

  if (
    !probe.ok ||
    probe.sizeBytes <= 0 ||
    !hasStreamType(probe, "audio") ||
    probe.durationSec <= 0
  ) {
    throw new Error(message);
  }

  return probe;
}

export async function validateFinalVideoFile(filePath: string) {
  const probe = await probeMedia(filePath);

  if (
    !probe.ok ||
    probe.sizeBytes <= 0 ||
    !hasStreamType(probe, "video") ||
    probe.durationSec <= 0
  ) {
    throw new Error("Render failed: final draft.mp4 is missing a valid video stream.");
  }

  if (!hasStreamType(probe, "audio")) {
    throw new Error("Render failed: final draft.mp4 contains no audio stream.");
  }

  return probe;
}

export async function validateVideoFile(filePath: string, message: string) {
  const probe = await probeMedia(filePath);

  if (
    !probe.ok ||
    probe.sizeBytes <= 0 ||
    !hasStreamType(probe, "video") ||
    probe.durationSec <= 0
  ) {
    throw new Error(message);
  }

  return probe;
}

function versionFirstLine(output: string | undefined) {
  return output?.split("\n").find((line) => line.trim())?.trim() ?? null;
}

function configurationLine(output: string | undefined) {
  const line = output
    ?.split("\n")
    .find((item) => item.trim().startsWith("configuration:"));

  return line?.trim() ?? null;
}

export async function checkFfmpegAvailable(): Promise<FfmpegAvailability> {
  const binaryPath = getFfmpegBinaryPath();
  const result = await runFfmpeg(["-version"]);
  const versionOutput = result.stdout || result.stderr;
  const configuration = configurationLine(versionOutput);

  if (!result.ok) {
    return {
      ok: false,
      binaryPath,
      error: result.stderr || "FFmpeg is required to render drafts. Install FFmpeg and try again.",
    };
  }

  return {
    ok: true,
    binaryPath,
    versionOutput,
    versionFirstLine: versionFirstLine(versionOutput) ?? undefined,
    configuration: configuration ?? undefined,
    hasEnableLibass: configuration?.includes("--enable-libass") ?? false,
  };
}

export async function checkFfprobeAvailable(): Promise<FfprobeAvailability> {
  const binaryPath = getFfprobeBinaryPath();

  return new Promise((resolve) => {
    const child = spawn(binaryPath, ["-version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        binaryPath,
        error: error.message,
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        binaryPath,
        versionOutput: stdout || stderr,
        error: code === 0 ? undefined : stderr || "ffprobe failed.",
      });
    });
  });
}

export async function ensureFfmpegAvailable() {
  const availability = await checkFfmpegAvailable();

  if (!availability.ok) {
    throw new Error(
      `${availability.error ?? "FFmpeg is required to render drafts. Install FFmpeg and try again."} Current FFmpeg binary: ${availability.binaryPath}`,
    );
  }

  return availability;
}

function findAssFilterLine(output: string) {
  return output
    .split("\n")
    .find(
      (line) =>
        /\sass\s/.test(line) ||
        (line.includes(" ass") && line.toLowerCase().includes("render ass")),
    );
}

export async function checkFfmpegAssFilterAvailable(): Promise<FfmpegAssFilterAvailability> {
  const binaryPath = getFfmpegBinaryPath();
  const result = await runFfmpeg(["-hide_banner", "-filters"]);
  const filterLine = findAssFilterLine(`${result.stdout}\n${result.stderr}`);

  if (!result.ok || !filterLine) {
    return {
      ok: false,
      binaryPath,
      error:
        "FFmpeg is installed, but the 'ass' filter is not available. Active-word captions require an FFmpeg build compiled with libass. Install ffmpeg-full or configure FFMPEG_PATH to point to a binary with libass support.",
      setupInstructions: FFMPEG_LIBASS_SETUP_INSTRUCTIONS,
    };
  }

  return {
    ok: true,
    binaryPath,
    filterLine,
  };
}

const FFMPEG_DIAGNOSTICS_TTL_MS = 60_000;
let cachedFfmpegDiagnostics:
  | { at: number; value: RenderFfmpegDiagnostics }
  | null = null;

export async function getRenderFfmpegDiagnostics(): Promise<RenderFfmpegDiagnostics> {
  if (
    cachedFfmpegDiagnostics &&
    Date.now() - cachedFfmpegDiagnostics.at < FFMPEG_DIAGNOSTICS_TTL_MS
  ) {
    return cachedFfmpegDiagnostics.value;
  }

  const [ffmpegAvailability, assFilterAvailability, ffprobeAvailability] =
    await Promise.all([
      checkFfmpegAvailable(),
      checkFfmpegAssFilterAvailable(),
      checkFfprobeAvailable(),
    ]);

  const value: RenderFfmpegDiagnostics = {
    ffmpeg: {
      envPath: process.env.FFMPEG_PATH?.trim() || null,
      binary: ffmpegAvailability.binaryPath,
      available: ffmpegAvailability.ok,
      versionFirstLine: ffmpegAvailability.versionFirstLine ?? null,
      configuration: ffmpegAvailability.configuration ?? null,
      hasEnableLibass: ffmpegAvailability.hasEnableLibass ?? false,
      hasAssFilter: assFilterAvailability.ok,
      assFilterLine: assFilterAvailability.filterLine ?? null,
      error: ffmpegAvailability.error ?? assFilterAvailability.error ?? null,
    },
    ffprobe: {
      envPath: process.env.FFPROBE_PATH?.trim() || null,
      binary: ffprobeAvailability.binaryPath,
      available: ffprobeAvailability.ok,
      error: ffprobeAvailability.error ?? null,
    },
  };

  cachedFfmpegDiagnostics = { at: Date.now(), value };
  return value;
}

export async function ensureFfmpegAssFilterAvailable() {
  const availability = await checkFfmpegAssFilterAvailable();

  if (!availability.ok) {
    throw new Error(
      `Cannot burn active-word captions: the selected FFmpeg binary does not include the 'ass' filter. Current FFmpeg binary: ${availability.binaryPath}\n${availability.setupInstructions}`,
    );
  }

  return availability;
}

export function assertFfmpegOk(result: FfmpegResult, label: string) {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.stderr.slice(-1200)}`);
  }
}

export function escapeAssFilterPath(filePath: string) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}
