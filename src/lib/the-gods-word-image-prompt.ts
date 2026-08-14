/**
 * God's Word imagePrompt assembly.
 * Style lock + negative locks are app-owned; ChatGPT writes only the variable body.
 *
 * Observed production pattern (Lazarus checkpoint + prior runs):
 * - ALL sceneTypes share the same style-lock prefix.
 * - avatar + space always end with no-visible-text + negatives.
 * - insert always ends with the same negatives; whether text is shown stays in the body
 *   ("No visible text…" vs "Use only this exact visible text: …").
 */

/** Exact style lock every God's Word imagePrompt must open with. */
export const THE_GODS_WORD_STYLE_LOCK =
  "16:9 horizontal hand-painted watercolor and ink Bible study illustration on warm off-white paper, soft sketch outlines, muted earth tones, wheat gold, olive green, dusty blue shadows, burnt umber soil, gentle parchment light, visible paper texture, loose brush texture, clean symbolic composition, calm reverent mood.";

/** Fixed no-text line for avatar / space (and default object inserts). */
export const THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK =
  "No visible text, captions, letters, or words.";

/**
 * Fixed negative lock appended to every scene.
 * Matches the repeated production suffix across avatar / insert / space.
 */
export const THE_GODS_WORD_NEGATIVE_LOCK =
  "No photorealism, no 3D render, no glossy digital art, no cinematic realism, no neon, no clutter, no watermark.";
export type GodsWordSceneType = "avatar" | "insert" | "space";

function normalizeSceneType(raw: string | null | undefined): GodsWordSceneType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "avatar" || value === "insert" || value === "space") {
    return value;
  }
  return "insert";
}

function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Remove app-owned prefix/suffix so we keep only ChatGPT's variable middle.
 * Safe to call on already-stripped bodies.
 */
export function extractGodsWordImagePromptBody(imagePrompt: string): string {
  let body = stripOuterQuotes(imagePrompt || "").replace(/\s+/g, " ").trim();
  if (!body) {
    return "";
  }

  const style = THE_GODS_WORD_STYLE_LOCK.replace(/\s+/g, " ").trim();
  if (body.toLowerCase().startsWith(style.toLowerCase())) {
    body = body.slice(style.length).replace(/^[\s.,;:—-]+/, "").trim();
  } else {
    // Tolerate minor style-lock drift (Bible-study vs Bible study, etc.).
    body = body
      .replace(
        /^16:9 horizontal hand-painted watercolor and ink[\s\S]*?calm reverent mood\.?\s*/i,
        "",
      )
      .trim();
  }

  // Strip trailing negatives (with or without leading "No visible text…").
  const negative = THE_GODS_WORD_NEGATIVE_LOCK.replace(/\s+/g, " ").trim();
  const noText = THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK.replace(/\s+/g, " ").trim();
  const negativeRe = new RegExp(
    `(?:${escapeRegExp(noText)}\\s*)?${escapeRegExp(negative)}\\.?\\s*$`,
    "i",
  );
  body = body.replace(negativeRe, "").trim();

  // Also strip looser negative tails ChatGPT may have written.
  body = body
    .replace(
      /\s*No photorealism[\s\S]*?(?:watermark|clutter)\.?\s*$/i,
      "",
    )
    .trim();

  return body.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Assemble the final production imagePrompt from sceneType + variable body.
 */
export function assembleGodsWordImagePrompt(options: {
  sceneType: string | null | undefined;
  body: string;
}): string {
  const sceneType = normalizeSceneType(options.sceneType);
  const body = extractGodsWordImagePromptBody(options.body);
  if (!body) {
    return [
      THE_GODS_WORD_STYLE_LOCK,
      sceneType === "insert"
        ? THE_GODS_WORD_NEGATIVE_LOCK
        : `${THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK} ${THE_GODS_WORD_NEGATIVE_LOCK}`,
    ].join(" ");
  }

  if (sceneType === "insert") {
    // Insert body owns the visible-text decision. App only adds style + negatives.
    const bodyHasTextPolicy =
      /no visible text/i.test(body) ||
      /use only this exact visible text/i.test(body) ||
      /exact readable visible title/i.test(body);
    const withPolicy = bodyHasTextPolicy
      ? body
      : `${body} ${THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK}`;
    return `${THE_GODS_WORD_STYLE_LOCK} ${withPolicy} ${THE_GODS_WORD_NEGATIVE_LOCK}`
      .replace(/\s+/g, " ")
      .trim();
  }

  // avatar + space: fixed no-text + negatives
  return `${THE_GODS_WORD_STYLE_LOCK} ${body} ${THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK} ${THE_GODS_WORD_NEGATIVE_LOCK}`
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeGodsWordImagePrompt(options: {
  sceneType: string | null | undefined;
  imagePrompt: string | null | undefined;
  visualIdea?: string | null;
}): string {
  const raw = options.imagePrompt?.trim() || options.visualIdea?.trim() || "";
  return assembleGodsWordImagePrompt({
    sceneType: options.sceneType,
    body: raw,
  });
}

export function normalizeGodsWordScenes<
  T extends {
    sceneType?: string | null;
    imagePrompt?: string | null;
    visualIdea?: string | null;
  },
>(scenes: T[]): T[] {
  return scenes.map((scene) => ({
    ...scene,
    imagePrompt: normalizeGodsWordImagePrompt({
      sceneType: scene.sceneType,
      imagePrompt: scene.imagePrompt,
      visualIdea: scene.visualIdea,
    }),
  }));
}

/** Compact continuity payload: send body-only imagePrompts to ChatGPT. */
export function compactGodsWordImagePromptForContinuity(
  imagePrompt: string | null | undefined,
): string {
  return extractGodsWordImagePromptBody(imagePrompt ?? "");
}

/**
 * Short contract block injected into section-hybrid context so ChatGPT stops
 * repeating style/negative locks inside every imagePrompt.
 * Intentionally does NOT paste the full lock strings (app-owned; saves request weight).
 */
export function buildGodsWordImagePromptBodyContract(): string {
  return [
    "## imagePrompt body-only contract (app assembles locks)",
    "",
    "The app owns the watercolor style-lock prefix and the photorealism/3D/watermark negatives.",
    "For avatar and space, the app also appends the no-visible-text line.",
    "Do NOT paste any of those locks into imagePrompt.",
    "",
    "imagePrompt = variable middle ONLY:",
    "- Direct concrete scene description for this scriptText.",
    "- One focal idea. Name the large elements.",
    "- For insert: include exactly one visible-text decision:",
    "  - No visible text, captions, letters, or words.",
    "  - OR Use only this exact visible text: [TEXT]. No other words.",
    "  - Chapter covers: Clean Bible-study chapter cover with exact readable visible title: [EXACT TITLE].",
    "- For avatar / space: describe the scene only — no style opener, no no-text line, no negatives.",
    "",
    "Target body length: about 40–80 words.",
    "Never open with 16:9 / watercolor / parchment style language.",
    "Never close with No photorealism / no 3D / no watermark.",
  ].join("\n");
}
