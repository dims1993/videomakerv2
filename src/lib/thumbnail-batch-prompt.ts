/**
 * Build / parse the ChatGPT turns used for thumbnail prompt-master resolution
 * and image generation.
 */

export function buildThumbnailResolvePrompt({
  masterPrompt,
  videoTitle,
}: {
  masterPrompt: string;
  videoTitle: string;
}) {
  return [
    "You are filling a YouTube thumbnail IMAGE PROMPT template.",
    "Replace every variable / placeholder in the master prompt using the video title.",
    "Keep the structure, style instructions, aspect ratio, and constraints of the master prompt.",
    "Do not invent a different brief — only resolve variables.",
    "",
    "VIDEO TITLE:",
    videoTitle.trim() || "(untitled)",
    "",
    "MASTER PROMPT:",
    masterPrompt.trim(),
    "",
    "Return ONLY valid JSON (no markdown fences) with this shape:",
    '{"resolvedPrompt":"...full prompt with variables filled...","notes":"optional short note"}',
  ].join("\n");
}

export function buildThumbnailImageGeneratePrompt(resolvedPrompt: string) {
  return [
    "Generate a single YouTube thumbnail image now from this exact prompt.",
    "Do not ask clarifying questions. Do not return only text — produce the image.",
    "Use a 16:9 YouTube thumbnail composition when the prompt does not specify otherwise.",
    "",
    "IMAGE PROMPT:",
    resolvedPrompt.trim(),
  ].join("\n");
}

export function extractResolvedThumbnailPrompt(raw: string): {
  resolvedPrompt: string;
  notes: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("ChatGPT returned an empty resolve response.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    const parsed = JSON.parse(candidate) as {
      resolvedPrompt?: unknown;
      prompt?: unknown;
      notes?: unknown;
    };
    const resolved =
      (typeof parsed.resolvedPrompt === "string" && parsed.resolvedPrompt.trim()) ||
      (typeof parsed.prompt === "string" && parsed.prompt.trim()) ||
      "";
    if (resolved) {
      return {
        resolvedPrompt: resolved,
        notes:
          typeof parsed.notes === "string" && parsed.notes.trim()
            ? parsed.notes.trim()
            : null,
      };
    }
  } catch {
    // fall through to plain-text recovery
  }

  // If the model returned the filled prompt as plain text, accept it.
  if (candidate.length >= 40 && !candidate.startsWith("{")) {
    return { resolvedPrompt: candidate, notes: null };
  }

  throw new Error(
    "Could not parse resolved thumbnail prompt from ChatGPT (expected JSON with resolvedPrompt).",
  );
}

export type VideoThumbnailMasterSelection = {
  kind: "master";
  masterId: string;
  masterName: string;
};

export function parseVideoThumbnailMasterSelection(
  value: unknown,
): VideoThumbnailMasterSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== "master") {
    return null;
  }
  const masterId =
    typeof record.masterId === "string" ? record.masterId.trim() : "";
  const masterName =
    typeof record.masterName === "string" ? record.masterName.trim() : "";
  if (!masterId) {
    return null;
  }
  return {
    kind: "master",
    masterId,
    masterName: masterName || masterId,
  };
}
