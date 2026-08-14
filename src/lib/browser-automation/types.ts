import { createHash } from "node:crypto";

export type BrowserSessionContext = {
  profileDir: string;
  cdpUrl?: string | null;
  headful: boolean;
  launchMode: "persistent_context" | "connect_cdp";
  timeoutMs: number;
};

export type BrowserSubmissionResult = {
  submissionId: string;
  conversationId: string;
  submittedAt: string;
};

export type BrowserCompletionResult = {
  submissionId: string;
  conversationId: string;
  completedAt: string;
  stabilized: boolean;
};

export type ExtractedModelResponse = {
  text: string;
  jsonText?: string | null;
  finished: boolean;
  providerError?: string | null;
  requiresUserAction?: boolean;
  userActionMessage?: string | null;
};

export type BrowserGeneratedImage = {
  bytes: Buffer;
  contentType: string;
  sourceUrl?: string | null;
};

export type BrowserSessionCheck = {
  authenticated: boolean;
  requiresUserAction: boolean;
  message?: string;
};

export type BrowserExpectReplyKind = "score" | "script" | "any";

export interface BrowserModelProvider {
  key: string;
  displayName: string;

  openSession(context: BrowserSessionContext): Promise<void>;

  submitPrompt(input: {
    jobId: string;
    prompt: string;
    conversationMode: "new" | "continue";
    conversationId?: string;
    /** Open this ChatGPT URL when starting a new conversation. */
    conversationStartUrl?: string;
    /** When set, waitForCompletion only accepts matching reply shapes. */
    expectReplyKind?: BrowserExpectReplyKind;
  }): Promise<BrowserSubmissionResult>;

  waitForCompletion(
    submission: BrowserSubmissionResult,
  ): Promise<BrowserCompletionResult>;

  extractResponse(
    completion: BrowserCompletionResult,
  ): Promise<ExtractedModelResponse>;

  cancel?(submissionId: string): Promise<void>;

  /** Optional cooperative abort checked while waiting for ChatGPT replies. */
  setAbortChecker?(checker: (() => boolean) | null): void;

  checkSession(): Promise<BrowserSessionCheck>;

  closeSession?(): Promise<void>;

  /**
   * Optional: download the latest generated image from the open chat
   * (ChatGPT native image generation). Used by thumbnail batch.
   */
  downloadLatestGeneratedImage?(options?: {
    timeoutMs?: number;
  }): Promise<BrowserGeneratedImage>;
}

export function hashPrompt(prompt: string) {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 24);
}

/**
 * Extract one balanced `{...}` or `[...]` starting at `start`.
 * O(n) — avoids the old char-by-char JSON.parse shrink that hung on large drafts.
 */
export function extractBalancedJsonAt(raw: string, start: number): string | null {
  if (start < 0 || start >= raw.length) {
    return null;
  }

  const open = raw[start];
  if (open !== "{" && open !== "[") {
    return null;
  }

  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i]!;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === open) {
      depth += 1;
      continue;
    }

    if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function extractJsonPayload(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    const objectStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const start =
      objectStart === -1
        ? arrayStart
        : arrayStart === -1
          ? objectStart
          : Math.min(objectStart, arrayStart);

    if (start < 0) {
      return null;
    }

    const balanced = extractBalancedJsonAt(candidate, start);
    if (!balanced) {
      return null;
    }

    try {
      JSON.parse(balanced);
      return balanced;
    } catch {
      return null;
    }
  }
}

/**
 * Prefer a complete `{"score": …}` object even when a larger scenes/topics JSON
 * appears earlier in the same assistant text.
 */
export function extractScoreJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    (!/"score"\s*:/i.test(trimmed) && !/"overallScore"\s*:/i.test(trimmed))
  ) {
    return null;
  }

  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(
    (match) => match[1]?.trim() ?? "",
  );
  const candidates = fencedBlocks.length > 0 ? [...fencedBlocks, trimmed] : [trimmed];

  for (const candidate of candidates) {
    const scorePattern = /"(?:overallScore|score)"\s*:/gi;
    let match: RegExpExecArray | null;
    while ((match = scorePattern.exec(candidate)) !== null) {
      const fromBrace = candidate.lastIndexOf("{", match.index);
      if (fromBrace < 0) {
        continue;
      }
      const balanced = extractBalancedJsonAt(candidate, fromBrace);
      if (!balanced) {
        continue;
      }
      try {
        const parsed = JSON.parse(balanced) as {
          score?: unknown;
          overallScore?: unknown;
        };
        const score = parsed.overallScore ?? parsed.score;
        const numeric =
          typeof score === "number"
            ? score
            : typeof score === "string"
              ? Number(score.trim().replace(",", "."))
              : NaN;
        if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) {
          return balanced;
        }
      } catch {
        // try next score occurrence
      }
    }
  }

  return null;
}
