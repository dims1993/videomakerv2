export type GenerateElevenLabsSpeechOptions = {
  text: string;
  voiceId?: string | null;
  modelId?: string | null;
  outputFormat?: string | null;
  stability?: number | null;
  similarityBoost?: number | null;
  speed?: number | null;
  /** Prior spoken text for request stitching / prosody continuity. */
  previousText?: string | null;
  /** Following spoken text for request stitching / prosody continuity. */
  nextText?: string | null;
  signal?: AbortSignal;
};

export class ElevenLabsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
export const DEFAULT_ELEVENLABS_SPEED = 0.85;

function envValue(key: string) {
  return process.env[key]?.trim() ?? "";
}

export function getDefaultElevenLabsVoiceId() {
  return envValue("ELEVENLABS_DEFAULT_VOICE_ID");
}

export function getDefaultElevenLabsModelId() {
  return envValue("ELEVENLABS_DEFAULT_MODEL_ID") || DEFAULT_ELEVENLABS_MODEL_ID;
}

function sanitizeSetting(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.min(Math.max(Number(value), 0), 1) : fallback;
}

function sanitizeSpeed(value: number | null | undefined) {
  return Number.isFinite(value)
    ? Math.min(Math.max(Number(value), 0.7), 1.2)
    : undefined;
}

export async function generateElevenLabsSpeech({
  text,
  voiceId,
  modelId,
  outputFormat,
  stability,
  similarityBoost,
  speed,
  previousText,
  nextText,
  signal,
}: GenerateElevenLabsSpeechOptions): Promise<Buffer> {
  const apiKey = envValue("ELEVENLABS_API_KEY");
  const resolvedVoiceId = voiceId?.trim() || getDefaultElevenLabsVoiceId();
  const resolvedModelId = modelId?.trim() || getDefaultElevenLabsModelId();
  const resolvedOutputFormat =
    outputFormat?.trim() || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;
  const cleanText = text.trim();
  const cleanPrevious = previousText?.trim() || "";
  const cleanNext = nextText?.trim() || "";

  if (!apiKey) {
    throw new ElevenLabsError("Missing ELEVENLABS_API_KEY.");
  }

  if (!resolvedVoiceId) {
    throw new ElevenLabsError("Missing ElevenLabs voice ID.");
  }

  if (!cleanText) {
    throw new ElevenLabsError("Voiceover segment text is empty.");
  }

  let response: Response;
  const sanitizedSpeed = sanitizeSpeed(speed);

  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        resolvedVoiceId,
      )}?output_format=${encodeURIComponent(resolvedOutputFormat)}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: resolvedModelId,
          voice_settings: {
            stability: sanitizeSetting(stability, 0.5),
            similarity_boost: sanitizeSetting(similarityBoost, 0.75),
            ...(sanitizedSpeed === undefined ? {} : { speed: sanitizedSpeed }),
          },
          ...(cleanPrevious ? { previous_text: cleanPrevious } : {}),
          ...(cleanNext ? { next_text: cleanNext } : {}),
        }),
        signal,
      },
    );
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new ElevenLabsError("ElevenLabs request aborted.");
    }
    throw new ElevenLabsError("Could not reach ElevenLabs.");
  }

  if (!response.ok) {
    let detail = "";

    try {
      detail = await response.text();
    } catch {
      detail = "";
    }

    throw new ElevenLabsError(
      `ElevenLabs returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : "."}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function alignElevenLabsAudioWithText({
  audioFilePath,
  text,
}: {
  audioFilePath: string;
  text: string;
}): Promise<unknown> {
  const apiKey = envValue("ELEVENLABS_API_KEY");
  const cleanText = text.trim();

  if (!apiKey) {
    throw new ElevenLabsError("Missing ELEVENLABS_API_KEY.");
  }

  if (!cleanText) {
    throw new ElevenLabsError("Alignment text is empty.");
  }

  try {
    await access(audioFilePath);
  } catch {
    throw new ElevenLabsError("Segment audio file was not found.");
  }

  const audio = await readFile(audioFilePath);
  const formData = new FormData();

  formData.append(
    "file",
    new Blob([audio], { type: "audio/mpeg" }),
    path.basename(audioFilePath),
  );
  formData.append("text", cleanText);

  let response: Response;

  try {
    response = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: formData,
    });
  } catch {
    throw new ElevenLabsError("Could not reach ElevenLabs forced alignment.");
  }

  if (!response.ok) {
    let detail = "";

    try {
      detail = await response.text();
    } catch {
      detail = "";
    }

    throw new ElevenLabsError(
      `ElevenLabs forced alignment returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : "."}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ElevenLabsError("ElevenLabs forced alignment returned invalid JSON.");
  }
}
import { access, readFile } from "node:fs/promises";
import path from "node:path";
