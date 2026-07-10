export type ChatGptGenerationMode =
  | "FULL_VIDEO"
  | "TEN_SCENE_TEST"
  | "HOOK_TEST"
  | "SEGMENTED_BY_PERCENT";

export const DEFAULT_SCENE_GENERATION_MODES: ChatGptGenerationMode[] = [
  "FULL_VIDEO",
  "TEN_SCENE_TEST",
  "HOOK_TEST",
];

export type ParsedHandoffScene = {
  order: number;
  scriptText: string;
  sceneType: "avatar" | "insert" | "space";
  visualPurpose: string;
  visualIdea: string;
  duration: number;
  imagePrompt: string;
  status: string;
  sourceSection?: string;
};

export type SceneHandoffValidation = {
  scenes: ParsedHandoffScene[];
  errors: string[];
  warnings: string[];
  summary: {
    totalScenes: number;
    avatarScenes: number;
    insertScenes: number;
    spaceScenes: number;
    averageDuration: number;
    totalDuration: number;
    mainHostScenes: number;
    supportingCharacterScenes: number;
    insertTaggedScenes: number;
    spaceTaggedScenes: number;
    hookScenes: number;
    bodyScenes: number;
    otherSectionScenes: number;
    sectionCounts: Record<string, number>;
  };
};

const sceneTypes = new Set(["avatar", "insert", "space"]);
const sceneFields = new Set([
  "order",
  "scene",
  "scriptText",
  "voiceover_context",
  "voiceoverContext",
  "narration",
  "voiceover",
  "sceneType",
  "scene_type",
  "visualPurpose",
  "narrative_meaning",
  "narrativeMeaning",
  "visualIdea",
  "visual_idea",
  "duration",
  "estimated_seconds",
  "estimatedSeconds",
  "imagePrompt",
  "prompt",
  "image_prompt",
  "status",
  "section",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function containsToken(scene: ParsedHandoffScene, token: string) {
  const haystack = `${scene.visualIdea} ${scene.imagePrompt}`.toLowerCase();
  return haystack.includes(token.toLowerCase());
}

function summarizeScenes(scenes: ParsedHandoffScene[]) {
  const totalDuration = scenes.reduce((total, scene) => total + scene.duration, 0);
  const sectionCounts = scenes.reduce<Record<string, number>>((counts, scene) => {
    const section = scene.sourceSection?.trim();

    if (!section) {
      return counts;
    }

    counts[section] = (counts[section] ?? 0) + 1;
    return counts;
  }, {});

  return {
    totalScenes: scenes.length,
    avatarScenes: scenes.filter((scene) => scene.sceneType === "avatar").length,
    insertScenes: scenes.filter((scene) => scene.sceneType === "insert").length,
    spaceScenes: scenes.filter((scene) => scene.sceneType === "space").length,
    averageDuration: scenes.length > 0 ? totalDuration / scenes.length : 0,
    totalDuration,
    mainHostScenes: scenes.filter((scene) => containsToken(scene, "MAIN HOST")).length,
    supportingCharacterScenes: scenes.filter((scene) =>
      containsToken(scene, "SUPPORTING CHARACTER"),
    ).length,
    insertTaggedScenes: scenes.filter((scene) => containsToken(scene, "INSERT")).length,
    spaceTaggedScenes: scenes.filter((scene) => containsToken(scene, "SPACE")).length,
    hookScenes: scenes.filter((scene) => scene.sourceSection?.toUpperCase() === "HOOK").length,
    bodyScenes: scenes.filter((scene) => scene.sourceSection?.toUpperCase() === "BODY").length,
    otherSectionScenes: scenes.filter(
      (scene) =>
        scene.sourceSection &&
        !["HOOK", "BODY"].includes(scene.sourceSection.toUpperCase()),
    ).length,
    sectionCounts,
  };
}

function matchingJsonEnd(text: string, startIndex: number) {
  const openingCharacter = text[startIndex];
  const closingCharacter = openingCharacter === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === openingCharacter) {
      depth += 1;
    } else if (character === closingCharacter) {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function scenesFromParsedResponse(parsed: unknown) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    isObject(parsed) &&
    Array.isArray(parsed.scenes)
  ) {
    return parsed.scenes;
  }

  throw new Error(
    'Parsed value must be either a JSON array or an object with a "scenes" array.',
  );
}

export function extractScenesFromHandoffResponse(rawResponse: string) {
  const text = rawResponse.trim();

  try {
    return scenesFromParsedResponse(JSON.parse(text));
  } catch {
    // Continue with extraction below. ChatGPT often wraps JSON in prose or fences.
  }

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "[" && text[index] !== "{") {
      continue;
    }

    const endIndex = matchingJsonEnd(text, index);

    if (endIndex === -1) {
      continue;
    }

    const candidate = text.slice(index, endIndex + 1);

    try {
      const parsed = JSON.parse(candidate);
      return scenesFromParsedResponse(parsed);
    } catch {
      continue;
    }
  }

  throw new Error(
    'Could not find valid scenes JSON in the pasted response. Paste a JSON array or an object with a "scenes" array.',
  );
}

function firstTextValue(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return Number.NaN;
}

function normalizeSceneType(value: string) {
  const normalized = value.trim().toLowerCase();

  return sceneTypes.has(normalized) ? normalized : "";
}

function normalizeRawHandoffScene(rawScene: Record<string, unknown>, index: number) {
  const sceneType = normalizeSceneType(
    firstTextValue(rawScene.sceneType, rawScene.scene_type),
  );

  return {
    sourceOrder: firstFiniteNumber(rawScene.order, rawScene.scene),
    scriptText: firstTextValue(
      rawScene.scriptText,
      rawScene.voiceover_context,
      rawScene.voiceoverContext,
      rawScene.narration,
      rawScene.voiceover,
    ),
    sceneType,
    visualPurpose: firstTextValue(
      rawScene.visualPurpose,
      rawScene.narrative_meaning,
      rawScene.narrativeMeaning,
    ),
    visualIdea: firstTextValue(
      rawScene.visualIdea,
      rawScene.visual_idea,
    ),
    duration: firstFiniteNumber(
      rawScene.duration,
      rawScene.estimated_seconds,
      rawScene.estimatedSeconds,
    ),
    imagePrompt: firstTextValue(
      rawScene.imagePrompt,
      rawScene.prompt,
      rawScene.image_prompt,
    ),
    status: firstTextValue(rawScene.status) || "planned",
    section: firstTextValue(rawScene.section),
    fallbackOrder: index + 1,
  };
}

export function validateHandoffScenes(rawScenes: unknown[]): SceneHandoffValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedScenes: ParsedHandoffScene[] = [];
  const seenOrders = new Set<number>();

  if (!Array.isArray(rawScenes)) {
    errors.push("Parsed value must be a JSON array.");
  }

  if (rawScenes.length === 0) {
    errors.push("Scenes array must include at least one scene.");
  }

  if (rawScenes.length > 250) {
    warnings.push(`Scene count is high (${rawScenes.length}). Confirm this is intentional.`);
  }

  rawScenes.forEach((rawScene, index) => {
    const sceneLabel = `Scene ${index + 1}`;

    if (!isObject(rawScene)) {
      errors.push(`${sceneLabel}: scene must be an object.`);
      return;
    }

    Object.keys(rawScene).forEach((field) => {
      if (!sceneFields.has(field)) {
        warnings.push(`${sceneLabel}: extra field "${field}" will be ignored.`);
      }
    });

    const normalizedScene = normalizeRawHandoffScene(rawScene, index);
    const orderValue = normalizedScene.sourceOrder;
    const sceneType = normalizedScene.sceneType;
    const durationValue = normalizedScene.duration;
    const status = normalizedScene.status;

    if (!Number.isFinite(orderValue)) {
      warnings.push(`${sceneLabel}.order: missing or invalid; normalized to ${normalizedScene.fallbackOrder}.`);
    } else if (seenOrders.has(orderValue)) {
      errors.push(`${sceneLabel}.order: duplicated order number ${orderValue}.`);
    } else {
      seenOrders.add(orderValue);
    }

    if (!normalizedScene.scriptText) {
      errors.push(`${sceneLabel}.scriptText: must be a non-empty string. Supported aliases: scriptText, voiceover_context.`);
    }

    if (!sceneType) {
      errors.push(`${sceneLabel}.sceneType: must be one of avatar, insert, space. Supported aliases: sceneType, scene_type.`);
    }

    if (!normalizedScene.visualPurpose) {
      warnings.push(`${sceneLabel}.visualPurpose: missing; supported aliases are visualPurpose and narrative_meaning.`);
    }

    if (!normalizedScene.visualIdea) {
      warnings.push(`${sceneLabel}.visualIdea: missing; supported aliases are visualIdea and visual_idea.`);
    }

    if (!Number.isFinite(durationValue) || durationValue <= 0) {
      errors.push(`${sceneLabel}.duration: must be a number greater than 0. Supported aliases: duration, estimated_seconds.`);
    }

    if (!normalizedScene.imagePrompt) {
      errors.push(`${sceneLabel}.imagePrompt: must be a non-empty string. Supported aliases: imagePrompt, prompt.`);
    }

    if (status !== "planned") {
      warnings.push(`${sceneLabel}.status: defaulted to planned.`);
    }

    normalizedScenes.push({
      order: index + 1,
      scriptText: normalizedScene.scriptText,
      sceneType: sceneType
        ? (sceneType as ParsedHandoffScene["sceneType"])
        : "avatar",
      visualPurpose: normalizedScene.visualPurpose,
      visualIdea: normalizedScene.visualIdea,
      duration: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 4,
      imagePrompt: normalizedScene.imagePrompt,
      status: "planned",
      sourceSection: normalizedScene.section || undefined,
    });
  });

  const expectedOrders = rawScenes.map((_, index) => index + 1);
  const actualOrders = rawScenes
    .map((scene) => (isObject(scene) ? Number(scene.order) : Number.NaN))
    .filter(Number.isFinite);

  if (
    actualOrders.length === expectedOrders.length &&
    actualOrders.some((order, index) => order !== expectedOrders[index])
  ) {
    warnings.push("Scene orders will be normalized to sequential order on import.");
  }

  return {
    scenes: normalizedScenes,
    errors,
    warnings,
    summary: summarizeScenes(normalizedScenes),
  };
}

export function parseAndValidateHandoffResponse(response: string) {
  return validateHandoffScenes(extractScenesFromHandoffResponse(response));
}

export function scenesToImportJson(scenes: ParsedHandoffScene[]) {
  return JSON.stringify(
    scenes.map(({ sourceSection: _sourceSection, ...scene }) => ({
      ...scene,
      duration: Math.max(1, Math.round(scene.duration)),
    })),
    null,
    2,
  );
}

export function validateSegmentPercentRange(
  startPercent: number,
  endPercent: number,
) {
  if (!Number.isFinite(startPercent) || !Number.isFinite(endPercent)) {
    return "Start and end percent must be valid numbers.";
  }

  if (startPercent < 0 || endPercent > 100) {
    return "Percent range must stay between 0 and 100.";
  }

  if (startPercent >= endPercent) {
    return "Start percent must be less than end percent.";
  }

  return null;
}

export type ScriptSegmentRange = {
  startPercent: number;
  endPercent: number;
  startChar: number;
  endChar: number;
  segmentLength: number;
  fullScriptLength: number;
  fragment: string;
  extractionWarning?: string;
  startCutReason?: ScriptCutReason;
  endCutReason?: ScriptCutReason;
};

export type ScriptCutReason =
  | "script-start"
  | "script-end"
  | "paragraph"
  | "newline"
  | "sentence"
  | "word"
  | "raw";

const PARAGRAPH_BREAK = "\n\n";
const BOUNDARY_SNAP_MAX_DISTANCE = 200;
const SUSPICIOUS_SEGMENT_THRESHOLD = 0.8;

type NormalizedScriptView = {
  normalized: string;
  /** Start index in the trimmed original for each normalized character. */
  normCharStartInOriginal: number[];
};

type CutCandidate = {
  normIndex: number;
  reason: ScriptCutReason;
  distance: number;
};

const cutReasonPriority: Record<ScriptCutReason, number> = {
  paragraph: 1,
  newline: 2,
  sentence: 3,
  word: 4,
  raw: 5,
  "script-start": 0,
  "script-end": 0,
};

function buildNormalizedScriptView(trimmed: string): NormalizedScriptView {
  const normCharStartInOriginal: number[] = [];
  let normalized = "";

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];

    if (character === "\r") {
      normalized += "\n";
      normCharStartInOriginal.push(index);

      if (trimmed[index + 1] === "\n") {
        index += 1;
      }

      continue;
    }

    normalized += character;
    normCharStartInOriginal.push(index);
  }

  return { normalized, normCharStartInOriginal };
}

function mapNormalizedStartToOriginal(
  normCharStartInOriginal: number[],
  normIndex: number,
): number {
  if (normIndex <= 0) {
    return 0;
  }

  if (normIndex >= normCharStartInOriginal.length) {
    return normCharStartInOriginal[normCharStartInOriginal.length - 1] ?? 0;
  }

  return normCharStartInOriginal[normIndex];
}

function mapNormalizedIndexToOriginalCut(
  trimmed: string,
  normCharStartInOriginal: number[],
  normIndex: number,
): number {
  if (normIndex <= 0) {
    return 0;
  }

  if (normIndex >= normCharStartInOriginal.length) {
    return trimmed.length;
  }

  return mapNormalizedStartToOriginal(normCharStartInOriginal, normIndex);
}

function contentStartsAfterSentenceTerminator(text: string, index: number) {
  const previous = text[index - 1];

  if (previous !== "." && previous !== "!" && previous !== "?") {
    return false;
  }

  const next = text[index];

  return !next || next === " " || next === "\n";
}

function collectCutCandidates(
  normalized: string,
  target: number,
  window: number,
): CutCandidate[] {
  const candidates: CutCandidate[] = [];
  const min = Math.max(0, target - window);
  const max = Math.min(normalized.length, target + window);

  const addCandidate = (normIndex: number, reason: ScriptCutReason) => {
    if (normIndex < 0 || normIndex > normalized.length) {
      return;
    }

    const distance = Math.abs(normIndex - target);

    if (reason !== "raw" && distance > window) {
      return;
    }

    candidates.push({ normIndex, reason, distance });
  };

  addCandidate(0, "paragraph");

  for (
    let cursor = normalized.indexOf(PARAGRAPH_BREAK);
    cursor !== -1;
    cursor = normalized.indexOf(PARAGRAPH_BREAK, cursor + PARAGRAPH_BREAK.length)
  ) {
    addCandidate(cursor + PARAGRAPH_BREAK.length, "paragraph");
  }

  for (let cursor = min; cursor <= max; cursor += 1) {
    if (normalized[cursor - 1] === "\n" && cursor >= 1) {
      addCandidate(cursor, "newline");
    }
  }

  for (let cursor = min; cursor <= max; cursor += 1) {
    if (contentStartsAfterSentenceTerminator(normalized, cursor)) {
      while (cursor < normalized.length && normalized[cursor] === " ") {
        cursor += 1;
      }

      addCandidate(cursor, "sentence");
    }
  }

  for (let cursor = min; cursor <= max; cursor += 1) {
    if (normalized[cursor - 1] === " " && cursor >= 1) {
      addCandidate(cursor, "word");
    }
  }

  addCandidate(target, "raw");

  return candidates;
}

function compareCutCandidates(
  left: CutCandidate,
  right: CutCandidate,
  target: number,
) {
  const leftPriority = cutReasonPriority[left.reason];
  const rightPriority = cutReasonPriority[right.reason];

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (left.distance !== right.distance) {
    return left.distance - right.distance;
  }

  const leftForward = left.normIndex >= target ? 0 : 1;
  const rightForward = right.normIndex >= target ? 0 : 1;

  if (leftForward !== rightForward) {
    return leftForward - rightForward;
  }

  return left.normIndex - right.normIndex;
}

function findBestCutNormIndex(normalized: string, target: number) {
  const candidates = collectCutCandidates(
    normalized,
    target,
    BOUNDARY_SNAP_MAX_DISTANCE,
  );

  if (candidates.length === 0) {
    return { normIndex: target, reason: "raw" as const };
  }

  candidates.sort((left, right) => compareCutCandidates(left, right, target));

  return {
    normIndex: candidates[0].normIndex,
    reason: candidates[0].reason,
  };
}

function resolveRawCutPointByPercent(
  trimmed: string,
  view: NormalizedScriptView,
  percent: number,
) {
  const targetNorm = Math.floor((view.normalized.length * percent) / 100);

  return mapNormalizedIndexToOriginalCut(
    trimmed,
    view.normCharStartInOriginal,
    targetNorm,
  );
}

export function resolveScriptCutPointByPercent(
  script: string,
  percent: number,
): { cutChar: number; reason: ScriptCutReason } {
  const trimmed = script.trim();

  if (!trimmed || percent <= 0) {
    return { cutChar: 0, reason: "script-start" };
  }

  if (percent >= 100) {
    return { cutChar: trimmed.length, reason: "script-end" };
  }

  const view = buildNormalizedScriptView(trimmed);
  const targetNorm = Math.floor((view.normalized.length * percent) / 100);
  const { normIndex, reason } = findBestCutNormIndex(view.normalized, targetNorm);

  return {
    cutChar: mapNormalizedIndexToOriginalCut(
      trimmed,
      view.normCharStartInOriginal,
      normIndex,
    ),
    reason,
  };
}

export function extractScriptSegmentByPercent(
  script: string,
  startPercent: number,
  endPercent: number,
): ScriptSegmentRange {
  const trimmed = script.trim();

  if (!trimmed) {
    return {
      startPercent,
      endPercent,
      startChar: 0,
      endChar: 0,
      segmentLength: 0,
      fullScriptLength: 0,
      fragment: "",
    };
  }

  const fullScriptLength = trimmed.length;
  const view = buildNormalizedScriptView(trimmed);
  const startCut = resolveScriptCutPointByPercent(trimmed, startPercent);
  const endCut = resolveScriptCutPointByPercent(trimmed, endPercent);

  let startChar = startCut.cutChar;
  let endChar = endCut.cutChar;
  let startCutReason = startCut.reason;
  let endCutReason = endCut.reason;
  let extractionWarning: string | undefined;

  if (startChar >= endChar) {
    startChar = resolveRawCutPointByPercent(trimmed, view, startPercent);
    endChar = Math.max(
      startChar,
      resolveRawCutPointByPercent(trimmed, view, endPercent),
    );
    startCutReason = "raw";
    endCutReason = "raw";
    extractionWarning =
      "Segment cut points collapsed to the same boundary; fell back to raw percent boundaries.";
  }

  const requestedRangePercent = endPercent - startPercent;
  const extractedRangePercent =
    fullScriptLength > 0 ? ((endChar - startChar) / fullScriptLength) * 100 : 0;

  if (
    requestedRangePercent < 50 &&
    extractedRangePercent > SUSPICIOUS_SEGMENT_THRESHOLD * 100
  ) {
    startChar = resolveRawCutPointByPercent(trimmed, view, startPercent);
    endChar = Math.max(
      startChar,
      resolveRawCutPointByPercent(trimmed, view, endPercent),
    );
    startCutReason = "raw";
    endCutReason = "raw";
    extractionWarning =
      "Segment boundary snapping produced an oversized slice; fell back to raw percent boundaries.";
  }

  endChar = Math.max(startChar, Math.min(endChar, fullScriptLength));

  const fragment = trimmed.slice(startChar, endChar).trim();

  if (!fragment && endPercent > startPercent) {
    extractionWarning =
      extractionWarning ??
      "Segment extraction returned no script text for the requested range.";
  }

  return {
    startPercent,
    endPercent,
    startChar,
    endChar,
    segmentLength: fragment.length,
    fullScriptLength,
    fragment,
    extractionWarning,
    startCutReason,
    endCutReason,
  };
}

export function parseScriptFromCurrentVideoData(
  currentVideoDataSection: string,
) {
  const trimmed = currentVideoDataSection.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as { script?: unknown };

    if (typeof parsed.script === "string" && parsed.script.trim()) {
      return parsed.script;
    }
  } catch {
    return null;
  }

  return null;
}
