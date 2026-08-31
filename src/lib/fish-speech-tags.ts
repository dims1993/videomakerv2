/**
 * Fish Audio S2 inline direction tags for The God's Word.
 * Tags live in a parallel field (fishSpeechText); scriptText stays clean.
 */

export const FISH_SPEECH_TEXT_KEY = "fishSpeechText" as const;

/** Strip Fish [direction] tags; keep spoken words only. */
export function stripFishSpeechTags(text: string): string {
  return text
    .replace(/\[[^\]]*]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Normalize for comparing tagged vs clean spoken text. */
export function normalizeSpokenForFishCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return fishSpeechText only when, after stripping tags, it matches scriptText.
 * Fail-soft: invalid / mismatched tags → null (caller uses clean spoken text).
 */
export function resolveValidFishSpeechText(
  scriptText: string,
  fishSpeechText: unknown,
): string | null {
  if (typeof fishSpeechText !== "string") {
    return null;
  }
  const tagged = fishSpeechText.trim();
  if (!tagged) {
    return null;
  }
  const clean = scriptText.trim();
  if (!clean) {
    return null;
  }
  const stripped = stripFishSpeechTags(tagged);
  if (
    normalizeSpokenForFishCompare(stripped) !==
    normalizeSpokenForFishCompare(clean)
  ) {
    return null;
  }
  return tagged;
}

export function fishSpeechTextFromVoiceoverSettings(
  settings: unknown,
): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = (settings as Record<string, unknown>)[FISH_SPEECH_TEXT_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Merge fishSpeechText into existing voiceoverSettingsJson (or start fresh). */
export function voiceoverSettingsWithFishSpeechText(
  existing: unknown,
  fishSpeechText: string | null,
): Record<string, unknown> | null {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (!fishSpeechText) {
    if (FISH_SPEECH_TEXT_KEY in base) {
      delete base[FISH_SPEECH_TEXT_KEY];
    }
    return Object.keys(base).length > 0 ? base : null;
  }
  return {
    ...base,
    [FISH_SPEECH_TEXT_KEY]: fishSpeechText,
  };
}

export const GODS_WORD_FISH_SPEECH_FILL_NOTES = [
  "## Fish speech direction (The God's Word)",
  "",
  "Also include optional `fishSpeechText` on every spoken scene (non-empty scriptText).",
  "Rules:",
  "- `fishSpeechText` must contain the SAME spoken words as `scriptText` (exact wording and order).",
  "- Insert Fish Audio S2 direction tags in square brackets only, e.g. `[sad]`, `[emphasis]`, `[short pause]`, `[warm]`, `[solemn]`, `[gentle]`.",
  "- Do NOT invent, omit, paraphrase, or reorder spoken words.",
  "- Prefer light tagging: one mood at the start and occasional `[emphasis]` / `[short pause]` on key turns.",
  "- Example: `[sad] A Christian [emphasis]sins again, [short pause]after promising God that this time would be different.`",
  "- For empty scriptText scenes, omit `fishSpeechText` or set it to \"\".",
  "- Never put Fish tags inside `scriptText`.",
].join("\n");
