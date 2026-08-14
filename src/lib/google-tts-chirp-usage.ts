import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Chirp3HdUsageSummary } from "@/lib/google-tts-shared";

export type { Chirp3HdUsageSummary } from "@/lib/google-tts-shared";
export {
  countGoogleTtsBillableCharacters,
  isChirp3HdVoice,
} from "@/lib/google-tts-shared";

/** Soft stop below Google's 1M Chirp 3 HD free monthly characters. */
export const DEFAULT_CHIRP3_HD_SOFT_LIMIT = 950_000;
export const CHIRP3_HD_FREE_TIER_CHARS = 1_000_000;

export type Chirp3HdUsageFile = {
  /** Calendar month key `YYYY-MM` (UTC). */
  monthKey: string;
  charactersUsed: number;
  updatedAt: string;
};

function usagePath() {
  return path.join(process.cwd(), "storage", "google-tts-chirp3-hd-usage.json");
}

export function currentChirp3HdMonthKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getChirp3HdSoftLimit() {
  const raw = process.env.GOOGLE_TTS_CHIRP3_HD_SOFT_LIMIT?.trim();
  if (!raw) {
    return DEFAULT_CHIRP3_HD_SOFT_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CHIRP3_HD_SOFT_LIMIT;
  }
  return Math.floor(parsed);
}

function emptyUsage(monthKey = currentChirp3HdMonthKey()): Chirp3HdUsageFile {
  return {
    monthKey,
    charactersUsed: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function readChirp3HdUsage(): Promise<Chirp3HdUsageFile> {
  const monthKey = currentChirp3HdMonthKey();
  try {
    const raw = await readFile(usagePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Chirp3HdUsageFile>;
    const storedMonth =
      typeof parsed.monthKey === "string" ? parsed.monthKey.trim() : "";
    const charactersUsed = Number(parsed.charactersUsed);
    if (storedMonth !== monthKey) {
      return emptyUsage(monthKey);
    }
    return {
      monthKey,
      charactersUsed:
        Number.isFinite(charactersUsed) && charactersUsed > 0
          ? Math.floor(charactersUsed)
          : 0,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return emptyUsage(monthKey);
  }
}

export async function getChirp3HdUsageSummary(): Promise<Chirp3HdUsageSummary> {
  const usage = await readChirp3HdUsage();
  const softLimit = getChirp3HdSoftLimit();
  const remaining = Math.max(0, softLimit - usage.charactersUsed);
  return {
    monthKey: usage.monthKey,
    charactersUsed: usage.charactersUsed,
    softLimit,
    freeTierChars: CHIRP3_HD_FREE_TIER_CHARS,
    remaining,
    percentUsed:
      softLimit > 0
        ? Math.min(100, (usage.charactersUsed / softLimit) * 100)
        : 100,
    blocked: usage.charactersUsed >= softLimit,
  };
}

async function writeChirp3HdUsage(usage: Chirp3HdUsageFile) {
  await mkdir(path.dirname(usagePath()), { recursive: true });
  await writeFile(usagePath(), JSON.stringify(usage, null, 2), "utf8");
}

export class Chirp3HdUsageLimitError extends Error {
  readonly charactersUsed: number;
  readonly softLimit: number;
  readonly requested: number;

  constructor(input: {
    charactersUsed: number;
    softLimit: number;
    requested: number;
  }) {
    super(
      `Chirp 3 HD free-tier soft limit reached (${input.charactersUsed.toLocaleString()} / ${input.softLimit.toLocaleString()} chars this month UTC). Switch to Standard/Neural2 or wait until next month. Requested ${input.requested.toLocaleString()} chars.`,
    );
    this.name = "Chirp3HdUsageLimitError";
    this.charactersUsed = input.charactersUsed;
    this.softLimit = input.softLimit;
    this.requested = input.requested;
  }
}

/**
 * Refuse Chirp 3 HD synthesis when this request would cross the soft limit.
 */
export async function assertChirp3HdUsageAllows(characterCount: number) {
  const requested = Math.max(0, Math.floor(characterCount));
  if (requested <= 0) {
    return;
  }
  const usage = await readChirp3HdUsage();
  const softLimit = getChirp3HdSoftLimit();
  if (usage.charactersUsed + requested > softLimit) {
    throw new Chirp3HdUsageLimitError({
      charactersUsed: usage.charactersUsed,
      softLimit,
      requested,
    });
  }
}

/** Persist usage after a successful Chirp 3 HD synthesize. */
export async function recordChirp3HdUsage(characterCount: number) {
  const add = Math.max(0, Math.floor(characterCount));
  if (add <= 0) {
    return;
  }
  const monthKey = currentChirp3HdMonthKey();
  const usage = await readChirp3HdUsage();
  const next: Chirp3HdUsageFile = {
    monthKey,
    charactersUsed:
      usage.monthKey === monthKey ? usage.charactersUsed + add : add,
    updatedAt: new Date().toISOString(),
  };
  await writeChirp3HdUsage(next);
  return next;
}
