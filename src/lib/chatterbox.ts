import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { assertFfmpegOk, runFfmpeg } from "@/lib/render/ffmpeg";
import type { ChatterboxPredefinedVoice } from "@/lib/tts-voices";

export type { ChatterboxPredefinedVoice } from "@/lib/tts-voices";

export const CHATTERBOX_PROVIDER = "chatterbox" as const;

const DEFAULT_CHATTERBOX_BASE_URL = "http://127.0.0.1:8004";

export function getChatterboxBaseUrl() {
  const fromEnv = process.env.CHATTERBOX_BASE_URL?.trim();
  return (fromEnv || DEFAULT_CHATTERBOX_BASE_URL).replace(/\/+$/, "");
}

function chatterboxVoicesDir() {
  return path.join(process.cwd(), "storage", "chatterbox-voices");
}

export function chatterboxLocalSampleRelativePath(fileName: string) {
  return path.join("storage", "chatterbox-voices", fileName);
}

export async function ensureChatterboxVoicesDir() {
  const dir = chatterboxVoicesDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

function buildUrl(pathname: string) {
  return `${getChatterboxBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function chatterboxFetch(
  pathname: string,
  init?: RequestInit & { timeoutMs?: number },
) {
  const { timeoutMs = 120_000, ...rest } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upstream = rest.signal;
  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      upstream.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    return await fetch(buildUrl(pathname), {
      ...rest,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        upstream?.aborted
          ? "Chatterbox request canceled."
          : `Chatterbox server unreachable at ${getChatterboxBaseUrl()} (timeout or connection failed).`,
      );
    }
    throw new Error(
      `Chatterbox server unreachable at ${getChatterboxBaseUrl()}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export type ChatterboxHealth = {
  ok: boolean;
  baseUrl: string;
  message: string;
  referenceFiles: string[];
  predefinedVoices: ChatterboxPredefinedVoice[];
};

export async function checkChatterboxHealth(): Promise<ChatterboxHealth> {
  const baseUrl = getChatterboxBaseUrl();
  try {
    const response = await chatterboxFetch("/api/ui/initial-data", {
      method: "GET",
      timeoutMs: 8_000,
    });
    if (!response.ok) {
      return {
        ok: false,
        baseUrl,
        message: `Chatterbox health check failed (HTTP ${response.status}).`,
        referenceFiles: [],
        predefinedVoices: [],
      };
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const referenceFiles = extractReferenceFileNames(payload);
    const predefinedVoices = extractPredefinedVoices(payload);
    return {
      ok: true,
      baseUrl,
      message: "Chatterbox server is reachable.",
      referenceFiles,
      predefinedVoices,
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      message:
        error instanceof Error
          ? error.message
          : "Chatterbox server unreachable.",
      referenceFiles: [],
      predefinedVoices: [],
    };
  }
}

function extractPredefinedVoices(
  payload: Record<string, unknown>,
): ChatterboxPredefinedVoice[] {
  const raw = payload.predefined_voices ?? payload.predefinedVoices;
  if (!Array.isArray(raw)) {
    return [];
  }
  const voices: ChatterboxPredefinedVoice[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const filename = entry.trim();
      if (!filename) continue;
      voices.push({
        displayName: filename.replace(/\.[^.]+$/, ""),
        filename,
      });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const filename =
      (typeof record.filename === "string" && record.filename.trim()) ||
      (typeof record.file_name === "string" && record.file_name.trim()) ||
      (typeof record.id === "string" && record.id.trim()) ||
      "";
    if (!filename) continue;
    const displayName =
      (typeof record.display_name === "string" && record.display_name.trim()) ||
      (typeof record.displayName === "string" && record.displayName.trim()) ||
      (typeof record.name === "string" && record.name.trim()) ||
      filename.replace(/\.[^.]+$/, "");
    voices.push({ displayName, filename });
  }
  return voices;
}

/** List built-in Chatterbox voices (server `voices/` pack). */
export async function listChatterboxPredefinedVoices(): Promise<
  ChatterboxPredefinedVoice[]
> {
  const health = await checkChatterboxHealth();
  if (health.ok && health.predefinedVoices.length > 0) {
    return health.predefinedVoices;
  }
  try {
    const response = await chatterboxFetch("/get_predefined_voices", {
      method: "GET",
      timeoutMs: 8_000,
    });
    if (!response.ok) {
      return health.predefinedVoices;
    }
    const payload = (await response.json()) as unknown;
    return extractPredefinedVoices({ predefined_voices: payload as unknown[] });
  } catch {
    return health.predefinedVoices;
  }
}

function extractReferenceFileNames(payload: Record<string, unknown>): string[] {
  const candidates = [
    payload.reference_files,
    payload.referenceFiles,
    payload.reference_audio_files,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    return candidate
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          const name =
            (typeof record.filename === "string" && record.filename) ||
            (typeof record.name === "string" && record.name) ||
            "";
          return name.trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

function sanitizeReferenceFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\-]+/g, "_");
  return base || `clone-${randomUUID().slice(0, 8)}.wav`;
}

export type UploadChatterboxReferenceResult = {
  referenceFileName: string;
  localSamplePath: string;
  allReferenceFiles: string[];
};

/**
 * Save a local copy under storage/chatterbox-voices and upload to the
 * Chatterbox server via POST /upload_reference.
 */
export async function uploadChatterboxReferenceAudio(input: {
  fileName: string;
  bytes: Buffer;
  contentType?: string;
}): Promise<UploadChatterboxReferenceResult> {
  const referenceFileName = sanitizeReferenceFileName(input.fileName);
  const dir = await ensureChatterboxVoicesDir();
  const absoluteLocal = path.join(dir, referenceFileName);
  await writeFile(absoluteLocal, input.bytes);

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.bytes)], {
    type: input.contentType || "application/octet-stream",
  });
  form.append("files", blob, referenceFileName);

  const response = await chatterboxFetch("/upload_reference", {
    method: "POST",
    body: form,
    timeoutMs: 60_000,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Chatterbox upload_reference failed (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 300)}` : ""
      }`,
    );
  }

  let allReferenceFiles: string[] = [];
  let uploadedName = referenceFileName;
  let uploadErrors: string[] = [];
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    allReferenceFiles = extractUploadedNames(payload);
    const firstUploaded = firstUploadedFileName(payload);
    if (firstUploaded) {
      uploadedName = firstUploaded;
    }
    if (Array.isArray(payload.errors)) {
      uploadErrors = payload.errors
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return "";
          }
          const record = entry as Record<string, unknown>;
          const filename =
            typeof record.filename === "string" ? record.filename : "file";
          const error =
            typeof record.error === "string" ? record.error : "unknown error";
          return `${filename}: ${error}`;
        })
        .filter(Boolean);
    }
  } catch {
    // Some servers return empty/non-JSON on success; keep local name.
  }

  if (uploadErrors.length > 0 && !uploadedName) {
    throw new Error(
      `Chatterbox rejected the reference sample. ${uploadErrors.join("; ")}`,
    );
  }
  if (uploadErrors.length > 0) {
    // Server may still list a filename even when validation failed and deleted it.
    const stillPresent = allReferenceFiles.includes(uploadedName);
    if (!stillPresent) {
      throw new Error(
        `Chatterbox rejected the reference sample. ${uploadErrors.join("; ")}`,
      );
    }
  }

  return {
    referenceFileName: uploadedName,
    localSamplePath: chatterboxLocalSampleRelativePath(referenceFileName),
    allReferenceFiles,
  };
}

function extractUploadedNames(payload: Record<string, unknown>): string[] {
  const lists = [
    payload.all_reference_files,
    payload.reference_files,
    payload.files,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    return list
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          return (
            (typeof record.filename === "string" && record.filename.trim()) ||
            (typeof record.name === "string" && record.name.trim()) ||
            ""
          );
        }
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

function firstUploadedFileName(payload: Record<string, unknown>): string | null {
  const lists = [
    payload.uploaded_files,
    payload.uploadedFiles,
    payload.filenames,
  ];
  for (const list of lists) {
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }
    const first = list[0];
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
    if (first && typeof first === "object") {
      const record = first as Record<string, unknown>;
      const name =
        (typeof record.filename === "string" && record.filename) ||
        (typeof record.name === "string" && record.name) ||
        "";
      if (name.trim()) {
        return name.trim();
      }
    }
  }
  return null;
}

async function convertAudioBufferToMp3(
  audio: Buffer,
  sourceExt: string,
): Promise<Buffer> {
  const tempDir = path.join(process.cwd(), "storage", "tmp");
  await mkdir(tempDir, { recursive: true });
  const id = randomUUID();
  const inputPath = path.join(tempDir, `${id}.${sourceExt}`);
  const outputPath = path.join(tempDir, `${id}.mp3`);

  try {
    await writeFile(inputPath, audio);
    const result = await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ar",
      "44100",
      "-ac",
      "1",
      "-b:a",
      "128k",
      outputPath,
    ]);
    assertFfmpegOk(result, "Convert Chatterbox audio to mp3");
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => undefined);
    await unlink(outputPath).catch(() => undefined);
  }
}

export type GenerateChatterboxSpeechInput = {
  text: string;
  /**
   * `predefined` = built-in pack (`voices/`). `clone` = uploaded reference.
   * Defaults to `clone` for backward compatibility.
   */
  voiceMode?: "predefined" | "clone";
  /** Required when voiceMode is `predefined` (e.g. `Emily.wav`). */
  predefinedVoiceId?: string;
  /** Required when voiceMode is `clone`. */
  referenceFileName?: string;
  /** Maps roughly to Chatterbox speed_factor (0.7–1.2 typical). */
  speed?: number | null;
  /** Emotion intensity. Lower = calmer / less “cartoon”. */
  exaggeration?: number | null;
  /** Guidance toward the reference voice. Higher ≈ closer to sample. */
  cfgWeight?: number | null;
  temperature?: number | null;
  seed?: number | null;
  signal?: AbortSignal;
};

/** Defaults tuned for natural podcast dialogue (not story-narrator energy). */
export const CHATTERBOX_PODCAST_GENERATION_DEFAULTS = {
  temperature: 0.55,
  exaggeration: 0.3,
  cfgWeight: 0.65,
  seed: 0,
} as const;

/**
 * Generate speech via POST /tts and return MP3 bytes.
 * Supports built-in predefined voices and clone (reference) mode.
 */
export async function generateChatterboxSpeech(
  input: GenerateChatterboxSpeechInput,
): Promise<Buffer> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Chatterbox TTS requires non-empty text.");
  }

  const voiceMode = input.voiceMode === "predefined" ? "predefined" : "clone";
  const predefinedVoiceId = input.predefinedVoiceId?.trim() || "";
  const referenceFileName = input.referenceFileName?.trim() || "";

  if (voiceMode === "predefined") {
    if (!predefinedVoiceId) {
      throw new Error(
        "Chatterbox TTS (predefined) requires a predefined voice filename.",
      );
    }
  } else if (!referenceFileName) {
    throw new Error("Chatterbox TTS requires a reference audio filename.");
  }

  const exaggeration =
    input.exaggeration ?? CHATTERBOX_PODCAST_GENERATION_DEFAULTS.exaggeration;
  const cfgWeight =
    input.cfgWeight ?? CHATTERBOX_PODCAST_GENERATION_DEFAULTS.cfgWeight;
  const temperature =
    input.temperature ?? CHATTERBOX_PODCAST_GENERATION_DEFAULTS.temperature;
  const seed = input.seed ?? CHATTERBOX_PODCAST_GENERATION_DEFAULTS.seed;

  const body: Record<string, unknown> = {
    text,
    voice_mode: voiceMode,
    output_format: "mp3",
    split_text: true,
    exaggeration,
    cfg_weight: cfgWeight,
    temperature,
    seed,
  };
  if (voiceMode === "predefined") {
    body.predefined_voice_id = predefinedVoiceId;
  } else {
    body.reference_audio_filename = referenceFileName;
  }
  if (input.speed != null && Number.isFinite(input.speed)) {
    body.speed_factor = input.speed;
  }

  const response = await chatterboxFetch("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/*,*/*" },
    body: JSON.stringify(body),
    signal: input.signal,
    timeoutMs: 300_000,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Chatterbox /tts failed (HTTP ${response.status})${
        detail ? `: ${detail.slice(0, 400)}` : ""
      }`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);
  if (audio.byteLength < 64) {
    throw new Error("Chatterbox returned empty audio.");
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return audio;
  }

  const isWav =
    contentType.includes("wav") ||
    (audio[0] === 0x52 &&
      audio[1] === 0x49 &&
      audio[2] === 0x46 &&
      audio[3] === 0x46);
  return convertAudioBufferToMp3(audio, isWav ? "wav" : "bin");
}
