import { access, readFile } from "node:fs/promises";
import path from "node:path";

import {
  flattenSegmentWordsAlignment,
  normalizeElevenLabsAlignment,
  type AlignedWord,
} from "@/lib/subtitle-alignment";

export const WHISPERX_PROVIDER = "whisperx" as const;
export const WHISPERX_SUBTITLE_PROVIDER = "whisperx" as const;

const DEFAULT_WHISPERX_BASE_URL = "http://127.0.0.1:8011";
const DEFAULT_LANGUAGE = "en";

export function getWhisperXBaseUrl() {
  const fromEnv = process.env.WHISPERX_BASE_URL?.trim();
  return (fromEnv || DEFAULT_WHISPERX_BASE_URL).replace(/\/+$/, "");
}

function buildUrl(pathname: string) {
  return `${getWhisperXBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function whisperxFetch(
  pathname: string,
  init?: RequestInit & { timeoutMs?: number },
) {
  const { timeoutMs = 300_000, ...rest } = init ?? {};
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
          ? "WhisperX request canceled."
          : `WhisperX server unreachable at ${getWhisperXBaseUrl()} (timeout or connection failed).`,
      );
    }
    throw new Error(
      `WhisperX server unreachable at ${getWhisperXBaseUrl()}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export type WhisperXHealth = {
  ok: boolean;
  baseUrl: string;
  message: string;
};

export async function checkWhisperXHealth(): Promise<WhisperXHealth> {
  const baseUrl = getWhisperXBaseUrl();
  try {
    const response = await whisperxFetch("/health", {
      method: "GET",
      timeoutMs: 8_000,
    });
    if (!response.ok) {
      return {
        ok: false,
        baseUrl,
        message: `WhisperX health check failed (HTTP ${response.status}).`,
      };
    }
    return {
      ok: true,
      baseUrl,
      message: "WhisperX server is reachable.",
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      message:
        error instanceof Error
          ? error.message
          : "WhisperX server unreachable.",
    };
  }
}

/**
 * Normalize WhisperX `/align` JSON to word-level timestamps.
 * Accepts flat `{ words: [...] }` or nested `{ segments: [{ words: [...] }] }`.
 */
export function normalizeWhisperXAlignment(alignmentJson: unknown): AlignedWord[] {
  const flat = normalizeElevenLabsAlignment(alignmentJson);
  if (flat.length > 0) {
    return flat;
  }
  return flattenSegmentWordsAlignment(alignmentJson);
}

export async function alignWhisperXAudioWithText({
  audioFilePath,
  text,
  language = DEFAULT_LANGUAGE,
}: {
  audioFilePath: string;
  text: string;
  language?: string;
}): Promise<unknown> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("Alignment text is empty.");
  }

  try {
    await access(audioFilePath);
  } catch {
    throw new Error("Segment audio file was not found.");
  }

  const audio = await readFile(audioFilePath);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audio], { type: "audio/mpeg" }),
    path.basename(audioFilePath),
  );
  formData.append("text", cleanText);
  formData.append("language", (language || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE);

  const response = await whisperxFetch("/align", {
    method: "POST",
    body: formData,
    timeoutMs: 300_000,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `WhisperX /align failed (HTTP ${response.status})${
        body ? `: ${body.slice(0, 400)}` : "."
      }`,
    );
  }

  return response.json();
}
