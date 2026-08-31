import { extractJsonPayload } from "@/lib/browser-automation/types";
import { repairUnescapedJsonStringQuotes } from "@/lib/chatgpt-scene-handoff";
import { resolveValidFishSpeechText } from "@/lib/fish-speech-tags";
import {
  inferPodcastImagePromptRole,
  normalizePodcastImagePrompt,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import { stripChatGptUiChrome } from "@/lib/script-writer-extract";
import { THE_GODS_WORD_CHANNEL_KEY } from "@/lib/the-gods-word-script-prompt";
import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";
import { clampSceneDurationSeconds } from "@/lib/visual-plan-script";

const ALLOWED_SCENE_TYPES = new Set(["avatar", "insert", "space"]);

export type VisualPlanFillPatch = {
  order: number;
  sceneType?: "avatar" | "insert" | "space";
  visualPurpose?: string;
  visualIdea?: string;
  imagePrompt?: string;
  duration?: number;
  /** Optional Fish directed speech (The God's Word). */
  fishSpeechText?: string;
};

export type VisualPlanFillValidation = {
  ok: boolean;
  errors: string[];
  patches: VisualPlanFillPatch[];
  rawText: string;
  tooLarge: boolean;
};

/**
 * Detect ChatGPT refusals / truncations caused by oversized JSON output.
 */
export function isVisualPlanOutputTooLarge(raw: string): boolean {
  const text = raw.trim();
  if (!text) {
    return false;
  }
  return (
    /too large to paste/i.test(text) ||
    /json array is too large/i.test(text) ||
    /could not return the complete/i.test(text) ||
    /cannot return the complete/i.test(text) ||
    /without truncation/i.test(text) ||
    /response (was|is) truncated/i.test(text) ||
    /output (was|is) truncated/i.test(text)
  );
}

/**
 * Reject the "one mega-scene covering the whole script" failure mode.
 */
export function isVisualPlanMegaSceneCollapse(
  scenes: Array<{ scriptText?: string | null }>,
): boolean {
  if (scenes.length !== 1) {
    return false;
  }
  const scriptText = scenes[0]?.scriptText?.trim() ?? "";
  return scriptText.length >= 1200;
}

function tryParseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (directError) {
    try {
      return {
        value: JSON.parse(repairUnescapedJsonStringQuotes(text)),
        error: null,
      };
    } catch {
      return {
        value: null,
        error:
          directError instanceof Error
            ? `Response is not parseable JSON: ${directError.message}`
            : "Response is not parseable JSON.",
      };
    }
  }
}

function asSceneType(value: unknown): "avatar" | "insert" | "space" | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return ALLOWED_SCENE_TYPES.has(trimmed)
    ? (trimmed as "avatar" | "insert" | "space")
    : null;
}

/**
 * Validate a chunk fill response: array of visual patches keyed by order.
 * scriptText is NOT required — the local skeleton already owns spoken text.
 */
export function validateVisualPlanFillResponse(
  rawResponse: string,
  expectedOrders: number[],
): VisualPlanFillValidation {
  const rawText = rawResponse.trim();
  const tooLarge = isVisualPlanOutputTooLarge(rawText);

  if (!rawText) {
    return {
      ok: false,
      errors: ["Fill response is empty."],
      patches: [],
      rawText,
      tooLarge: false,
    };
  }

  if (tooLarge) {
    return {
      ok: false,
      errors: [
        "Fill response is too large for ChatGPT to paste inline. Split into smaller chunks.",
      ],
      patches: [],
      rawText,
      tooLarge: true,
    };
  }

  const cleaned = stripChatGptUiChrome(rawText);
  const payload = extractJsonPayload(cleaned) ?? cleaned;
  const parsed = tryParseJson(payload);
  if (parsed.error) {
    return {
      ok: false,
      errors: [parsed.error],
      patches: [],
      rawText,
      tooLarge: false,
    };
  }

  if (!Array.isArray(parsed.value)) {
    return {
      ok: false,
      errors: ["Fill response must be a JSON array of scene visual patches."],
      patches: [],
      rawText,
      tooLarge: false,
    };
  }

  const errors: string[] = [];
  const patches: VisualPlanFillPatch[] = [];
  const seen = new Set<number>();

  parsed.value.forEach((item, index) => {
    const label = `patches[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${label}: must be an object.`);
      return;
    }
    const record = item as Record<string, unknown>;
    const order = Number(record.order);
    if (!Number.isFinite(order) || order < 1) {
      errors.push(`${label}.order: must be a positive number.`);
      return;
    }
    if (seen.has(order)) {
      errors.push(`${label}.order: duplicate order ${order}.`);
      return;
    }
    seen.add(order);

    const visualIdea =
      typeof record.visualIdea === "string" ? record.visualIdea.trim() : "";
    const visualPurpose =
      typeof record.visualPurpose === "string"
        ? record.visualPurpose.trim()
        : "";
    const imagePrompt =
      typeof record.imagePrompt === "string" ? record.imagePrompt.trim() : "";

    if (!visualIdea) {
      errors.push(`${label}.visualIdea: required non-empty string.`);
    }
    if (!visualPurpose) {
      errors.push(`${label}.visualPurpose: required non-empty string.`);
    }
    if (!imagePrompt) {
      errors.push(`${label}.imagePrompt: required non-empty string.`);
    }

    const sceneType = asSceneType(record.sceneType);
    if (record.sceneType != null && !sceneType) {
      errors.push(`${label}.sceneType: must be avatar, insert, or space.`);
    }

    let duration: number | undefined;
    if (record.duration != null) {
      const numeric = Number(record.duration);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        errors.push(`${label}.duration: must be a positive number.`);
      } else {
        duration = clampSceneDurationSeconds(numeric);
      }
    }

    const fishSpeechText =
      typeof record.fishSpeechText === "string"
        ? record.fishSpeechText.trim()
        : undefined;

    patches.push({
      order: Math.floor(order),
      ...(sceneType ? { sceneType } : {}),
      ...(visualPurpose ? { visualPurpose } : {}),
      ...(visualIdea ? { visualIdea } : {}),
      ...(imagePrompt ? { imagePrompt } : {}),
      ...(duration != null ? { duration } : {}),
      ...(fishSpeechText ? { fishSpeechText } : {}),
    });
  });

  for (const order of expectedOrders) {
    if (!seen.has(order)) {
      errors.push(`Missing fill patch for order ${order}.`);
    }
  }

  for (const order of seen) {
    if (!expectedOrders.includes(order)) {
      errors.push(`Unexpected fill patch order ${order} (not in this chunk).`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, patches: [], rawText, tooLarge: false };
  }

  return { ok: true, errors: [], patches, rawText, tooLarge: false };
}

export function applyVisualPlanFillPatches(
  scenes: PodcastVisualPlanSkeletonScene[],
  patches: VisualPlanFillPatch[],
  options: {
    channelKey?: string;
    episodeContext?: string | null;
    title?: string | null;
    topicCategory?: string | null;
  } = {},
): PodcastVisualPlanSkeletonScene[] {
  const byOrder = new Map(patches.map((patch) => [patch.order, patch]));
  // Default to podcast normalization when channelKey is omitted (legacy callers/tests).
  const isPodcast =
    options.channelKey == null ||
    options.channelKey === "podcast-english-lessons";
  return scenes.map((scene) => {
    const patch = byOrder.get(scene.order);
    if (!patch) {
      return scene;
    }
    const visualPurpose = patch.visualPurpose ?? scene.visualPurpose;
    const visualIdea = patch.visualIdea ?? scene.visualIdea;
    const rawImagePrompt = patch.imagePrompt ?? scene.imagePrompt;
    if (!isPodcast) {
      const fishSpeechText =
        options.channelKey === THE_GODS_WORD_CHANNEL_KEY
          ? resolveValidFishSpeechText(scene.scriptText, patch.fishSpeechText)
          : null;
      return {
        ...scene,
        sceneType: patch.sceneType ?? scene.sceneType,
        visualPurpose,
        visualIdea,
        imagePrompt: rawImagePrompt,
        // Wealth fill-hybrid: app owns duration (hook ≤5.5s, body ≤8s).
        // ChatGPT patches must not reinflate beats past the local ceiling.
        duration:
          options.channelKey === "wealth-insights"
            ? scene.duration
            : (patch.duration ?? scene.duration),
        visualsFilled: true,
        ...(fishSpeechText ? { fishSpeechText } : {}),
      };
    }
    const role = inferPodcastImagePromptRole({
      speaker: scene.speaker,
      visualIdea,
      scriptText: scene.scriptText,
      sceneType: patch.sceneType ?? scene.sceneType,
    });
    return {
      ...scene,
      sceneType: patch.sceneType ?? scene.sceneType,
      visualPurpose,
      visualIdea,
      imagePrompt: normalizePodcastImagePrompt({
        role,
        imagePrompt: rawImagePrompt,
        visualIdea,
        visualPurpose,
        scriptText: scene.scriptText,
        episodeContext: options.episodeContext,
        title: options.title,
        topicCategory: options.topicCategory,
      }),
      duration: patch.duration ?? scene.duration,
      visualsFilled: true,
    };
  });
}

/**
 * Full visual-planner prompts embed the entire script under Current Video Data.
 * Hybrid fill already sends per-chunk scriptText — drop that blob so each
 * ChatGPT turn stays small enough for the composer (no 70k file attach).
 */
export function slimHybridVisualPlanContext(
  fullPrompt: string,
  options: { maxChars?: number; fallbackBlurb?: string } = {},
): string {
  const maxChars = options.maxChars ?? 12_000;
  const trimmed = fullPrompt.trim();
  if (!trimmed) {
    return (
      options.fallbackBlurb ??
      [
        "Follow the channel visual planner rules.",
        "Keep character/style identity locks consistent across scenes.",
        "no photorealism unless the channel requires it, no logos, no baked-in subtitles.",
      ].join(" ")
    );
  }

  const withoutVideoData = trimmed
    .replace(/\n*---\n*\n*# Current Video Data\n[\s\S]*$/i, "")
    .trim();

  if (withoutVideoData.length <= maxChars) {
    return withoutVideoData;
  }
  return `${withoutVideoData.slice(0, maxChars)}\n\n[Context truncated for chunk-fill size.]`;
}

/** Keep fill chunks inline in the ChatGPT composer (attachment mode starts at 8000). */
export const VISUAL_PLAN_FILL_INLINE_MAX_CHARS = 7500;

export function resolveFillChunkContextPrompt(options: {
  contextPrompt: string;
  hasContinuity: boolean;
}): string {
  const maxChars = options.hasContinuity ? 2200 : 5200;
  return slimHybridVisualPlanContext(options.contextPrompt, { maxChars });
}

export function buildVisualPlanFillChunkPrompt({
  contextPrompt,
  chunk,
  chunkIndex,
  totalChunks,
  previousTail,
  channelKey,
}: {
  contextPrompt: string;
  chunk: PodcastVisualPlanSkeletonScene[];
  chunkIndex: number;
  totalChunks: number;
  previousTail: PodcastVisualPlanSkeletonScene[];
  channelKey?: string;
}): string {
  const hasContinuity = previousTail.length > 0;
  let slimContext = resolveFillChunkContextPrompt({
    contextPrompt,
    hasContinuity,
  });

  const assemble = (ctx: string) =>
    buildVisualPlanFillChunkPromptBody({
      contextPrompt: ctx,
      chunk,
      chunkIndex,
      totalChunks,
      previousTail,
      channelKey,
    });

  let prompt = assemble(slimContext);
  if (prompt.length > VISUAL_PLAN_FILL_INLINE_MAX_CHARS) {
    const overhead = prompt.length - slimContext.length;
    const budget = Math.max(
      1200,
      VISUAL_PLAN_FILL_INLINE_MAX_CHARS - overhead - 100,
    );
    slimContext = slimHybridVisualPlanContext(contextPrompt, { maxChars: budget });
    prompt = assemble(slimContext);
  }

  return prompt;
}

function buildVisualPlanFillChunkPromptBody({
  contextPrompt,
  chunk,
  chunkIndex,
  totalChunks,
  previousTail,
  channelKey,
}: {
  contextPrompt: string;
  chunk: PodcastVisualPlanSkeletonScene[];
  chunkIndex: number;
  totalChunks: number;
  previousTail: PodcastVisualPlanSkeletonScene[];
  channelKey?: string;
}): string {
  const isPodcast = channelKey === "podcast-english-lessons";
  const expectedOrders = chunk.map((scene) => scene.order);
  const skeletonPayload = chunk.map((scene) => ({
    order: scene.order,
    speaker: scene.speaker,
    scriptText: scene.scriptText,
    sceneType: scene.sceneType,
    duration: scene.duration,
    pauseAfterMs: scene.pauseAfterMs,
    visualIdeaHint: scene.visualIdea,
  }));

  const continuity =
    previousTail.length > 0
      ? [
          "## Continuity (previous chunk tail — do not re-emit)",
          "",
          "Match these imagePrompt locks exactly (style, character, studio/environment, composition, negatives).",
          "Only change the short expression/gesture or beat-specific visual sentence for new scenes.",
          "",
          "```json",
          JSON.stringify(
            previousTail.map((scene) => ({
              order: scene.order,
              speaker: scene.speaker,
              visualIdea: scene.visualIdea,
              visualPurpose: scene.visualPurpose,
              imagePrompt: scene.imagePrompt,
            })),
          ),
          "```",
        ].join("\n")
      : "## Continuity\n\nThis is the first chunk.";

  const task = isPodcast
    ? [
        "## Task",
        "",
        "The scene skeleton was built locally from the podcast script (1 speaker turn = 1 scene).",
        "Fill ONLY the visual fields for the scenes in this chunk.",
        "Do NOT rewrite scriptText.",
        "Do NOT invent extra scenes.",
        "Do NOT omit any order listed below.",
      ].join("\n")
    : [
        "## Task",
        "",
        "The scene skeleton was built locally from the script (1 narration beat = 1 scene).",
        "Fill ONLY the visual fields for the scenes in this chunk.",
        "Do NOT rewrite scriptText.",
        "Do NOT invent extra scenes.",
        "Do NOT omit any order listed below.",
        "Follow the channel visualIdea format prefixes from the planner context.",
      ].join("\n");

  const outputRules = isPodcast
    ? [
        "## Output Requirements",
        "",
        "Return a JSON array only (no markdown, no commentary, no wrapper object).",
        `Return exactly ${expectedOrders.length} objects for orders: ${expectedOrders.join(", ")}.`,
        "Each object MUST include: order, sceneType, visualPurpose, visualIdea, imagePrompt.",
        "duration is optional (positive number); keep close to the skeleton estimate unless clearly wrong.",
        "Do NOT include scriptText.",
        "Do NOT include status.",
        "visualIdea MUST keep the speaker/music/part prefix (TEACHER_EMMA | …, STUDENT_LEO | …, MUSIC_BED | …, or PART_COVER | …).",
        "imagePrompt MUST copy STYLE / CHARACTER / STUDIO / COMPOSITION / NEGATIVE locks VERBATIM from the contract.",
        "Only the expression/gesture sentence may vary; never reinvent Emma, Leo, or the studio between chunks.",
        "Every avatar/music imagePrompt MUST include the hard no-visible-text negative (no letters, captions, or baked-in subtitles).",
        "PART_COVER scenes are owned locally — do not invent extra part covers; if one appears in Continuity, keep its title text rule.",
        "Paste the full JSON array inline in the assistant message.",
      ].join("\n")
    : [
        "## Output Requirements",
        "",
        "Return a JSON array only (no markdown, no commentary, no wrapper object).",
        `Return exactly ${expectedOrders.length} objects for orders: ${expectedOrders.join(", ")}.`,
        "Each object MUST include: order, sceneType, visualPurpose, visualIdea, imagePrompt.",
        "duration is optional (positive number); keep close to the skeleton estimate unless clearly wrong.",
        channelKey === THE_GODS_WORD_CHANNEL_KEY
          ? "For The God's Word: also include optional fishSpeechText (same spoken words as scriptText, with Fish [tags] only)."
          : "Do NOT invent fields beyond the fill contract.",
        "Do NOT include scriptText.",
        "Do NOT include status.",
        channelKey === "wealth-insights"
          ? 'visualIdea should start with "MAIN HOST:", "STORY_CHARACTER:", "MAIN HOST + STORY:", or "STORY_PAIR:" (or Narrative Economics prefixes when that mode is active).'
          : "visualIdea MUST start with an allowed channel format prefix from the planner context (e.g. MAIN HOST:, Narrative scene:, Object/detail insert:, Chapter cover:).",
        "Keep character/style/environment identity locks consistent with Continuity and the planner context.",
        "Do not bake captions, logos, or watermark text into imagePrompt unless the channel explicitly requires on-image title text.",
        "Paste the full JSON array inline in the assistant message.",
      ].join("\n");

  return [
    "GENERATE_VISUAL_PLAN_FILL_CHUNK",
    `# Visual Plan Fill Chunk ${chunkIndex + 1}/${totalChunks}`,
    task,
    continuity,
    ["## Channel / planner context", "", contextPrompt.trim()].join("\n"),
    [
      "## Skeleton scenes to fill (authoritative scriptText)",
      "",
      "```json",
      JSON.stringify(skeletonPayload),
      "```",
    ].join("\n"),
    outputRules,
  ].join("\n\n");
}

export function buildVisualPlanFillRepairPrompt({
  chunkIndex,
  totalChunks,
  expectedOrders,
  validationErrors,
  invalidResponse,
  channelKey,
}: {
  chunkIndex: number;
  totalChunks: number;
  expectedOrders: number[];
  validationErrors: string[];
  invalidResponse: string;
  channelKey?: string;
}): string {
  const truncatedInvalid =
    invalidResponse.length > 6000
      ? `${invalidResponse.slice(0, 6000)}\n…[truncated]`
      : invalidResponse;
  const isPodcast = channelKey === "podcast-english-lessons";

  return [
    "GENERATE_VISUAL_PLAN_FILL_CHUNK_REPAIR",
    `STRICT REPAIR — fill chunk ${chunkIndex + 1}/${totalChunks} failed validation.`,
    "Do not explain. Return JSON only.",
    "",
    "Validation errors:",
    ...validationErrors.slice(0, 12).map((error) => `- ${error}`),
    "",
    "Hard repair requirements:",
    "- Return a JSON array only.",
    `- Exactly one object per order: ${expectedOrders.join(", ")}.`,
    "- Each object fields: order, sceneType, visualPurpose, visualIdea, imagePrompt (duration optional).",
    "- Do NOT include scriptText or status.",
    isPodcast
      ? "- Keep TEACHER_EMMA / STUDENT_LEO / MUSIC_BED prefixes on visualIdea."
      : "- Keep an allowed channel visualIdea format prefix on every scene.",
    isPodcast
      ? "- Copy identity/studio/style locks verbatim; include hard no-visible-text negative on every imagePrompt."
      : "- Keep character/style/environment locks consistent with the planner context.",
    "",
    "Invalid response to repair:",
    truncatedInvalid,
  ].join("\n");
}
