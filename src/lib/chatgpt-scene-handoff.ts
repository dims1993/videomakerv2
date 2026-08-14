import {
  foldPauseCardScenesIntoPauseAfterMs,
  isNonSpokenCueVisualIdea,
  normalizePauseAfterMs,
} from "@/lib/podcast-pause-cues";
import {
  isPartCoverVisualIdea,
  sanitizePodcastAvatarScriptText,
} from "@/lib/podcast-part-covers";
import {
  clampSceneDurationSeconds,
  findStructuralMarkersInScriptText,
  stripStructuralMarkers,
  validateScriptCoverage,
  validateVisualIdeaPrefixes,
} from "@/lib/visual-plan-script";

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
  /** Silence after this scene when stitching voiceover (milliseconds). */
  pauseAfterMs?: number | null;
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
  "pauseAfterMs",
  "pause_after_ms",
  "pauseAfter",
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

function isLikelyJsonStringTerminator(text: string, quoteIndex: number) {
  const match = text.slice(quoteIndex + 1).match(/^\s*(.)/);
  const next = match?.[1];
  return next == null || next === "," || next === "}" || next === "]" || next === ":";
}

/**
 * ChatGPT visual plans often emit unescaped quotes inside imagePrompt, e.g.
 * `"imagePrompt":"Voiceover context:\n"The truck..."\n..."`.
 * Escape those interior quotes so JSON.parse can succeed.
 */
export function repairUnescapedJsonStringQuotes(raw: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];

    if (!inString) {
      result += character;
      if (character === '"') {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      result += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      if (isLikelyJsonStringTerminator(raw, index)) {
        result += character;
        inString = false;
      } else {
        result += '\\"';
      }
      continue;
    }

    result += character;
  }

  return result;
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

function tryParseScenesJson(candidate: string) {
  try {
    return scenesFromParsedResponse(JSON.parse(candidate));
  } catch {
    // Common ChatGPT defect: unescaped " inside imagePrompt / visualIdea strings.
  }

  try {
    return scenesFromParsedResponse(
      JSON.parse(repairUnescapedJsonStringQuotes(candidate)),
    );
  } catch {
    return null;
  }
}

export function extractScenesFromHandoffResponse(rawResponse: string) {
  const text = rawResponse.trim();
  const repairedText = repairUnescapedJsonStringQuotes(text);

  const direct = tryParseScenesJson(text) ?? tryParseScenesJson(repairedText);
  if (direct) {
    return direct;
  }

  // ChatGPT often wraps JSON in prose or fences.
  for (const source of [repairedText, text]) {
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== "[" && source[index] !== "{") {
        continue;
      }

      const endIndex = matchingJsonEnd(source, index);

      if (endIndex === -1) {
        continue;
      }

      const candidate = source.slice(index, endIndex + 1);
      const parsed = tryParseScenesJson(candidate);
      if (parsed) {
        return parsed;
      }
    }
  }

  throw new Error(
    'Could not find valid scenes JSON. If imagePrompt quotes voiceover with ", those inner quotes must be escaped as \\", or re-paste after regenerating. Paste a JSON array or an object with a "scenes" array.',
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
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (sceneTypes.has(normalized)) {
    return normalized;
  }

  // Keep taxonomy locked to avatar/insert/space, but map common ChatGPT inventions.
  const aliases: Record<string, "avatar" | "insert" | "space"> = {
    character: "avatar",
    characters: "avatar",
    host: "avatar",
    person: "avatar",
    people: "avatar",
    human: "avatar",
    presenter: "avatar",
    talkinghead: "avatar",
    object: "insert",
    objects: "insert",
    detail: "insert",
    closeup: "insert",
    closeups: "insert",
    card: "insert",
    cards: "insert",
    symbol: "insert",
    graphic: "insert",
    broll: "insert",
    cover: "insert",
    chaptercover: "insert",
    landscape: "space",
    establishing: "space",
    environment: "space",
    location: "space",
    place: "space",
    transition: "space",
    atmosphere: "space",
    wide: "space",
    establishingshot: "space",
  };

  return aliases[normalized] ?? "";
}

function normalizeRawHandoffScene(rawScene: Record<string, unknown>, index: number) {
  const sceneType = normalizeSceneType(
    firstTextValue(rawScene.sceneType, rawScene.scene_type),
  );
  const rawScriptText = firstTextValue(
    rawScene.scriptText,
    rawScene.voiceover_context,
    rawScene.voiceoverContext,
    rawScene.narration,
    rawScene.voiceover,
  );
  const markers = findStructuralMarkersInScriptText(rawScriptText);
  const visualIdea = firstTextValue(
    rawScene.visualIdea,
    rawScene.visual_idea,
  );
  let scriptText = stripStructuralMarkers(rawScriptText);
  let strippedTrailingPartHeading = false;
  // PART N — TITLE / CLOSING / COLD OPEN belong to structure or dedicated inserts —
  // never stay glued onto avatar turns (would be spoken by TTS).
  if (!isPartCoverVisualIdea(visualIdea)) {
    const cleaned = sanitizePodcastAvatarScriptText(scriptText);
    strippedTrailingPartHeading = cleaned !== scriptText;
    scriptText = cleaned;
  }

  return {
    sourceOrder: firstFiniteNumber(rawScene.order, rawScene.scene),
    rawScriptText,
    markers,
    scriptText,
    strippedTrailingPartHeading,
    sceneType,
    visualPurpose: firstTextValue(
      rawScene.visualPurpose,
      rawScene.narrative_meaning,
      rawScene.narrativeMeaning,
    ),
    visualIdea,
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
    pauseAfterMs: normalizePauseAfterMs(
      rawScene.pauseAfterMs ?? rawScene.pause_after_ms ?? rawScene.pauseAfter,
    ),
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

    if (normalizedScene.markers.length > 0) {
      warnings.push(
        `${sceneLabel}.scriptText: removed structural marker(s) ${normalizedScene.markers.join(", ")} — labels are for covers/segmentation only and must not go to voiceover.`,
      );
    }
    if (normalizedScene.strippedTrailingPartHeading) {
      warnings.push(
        `${sceneLabel}.scriptText: removed trailing structural label (PART N — TITLE / CLOSING / COLD OPEN). Those are not spoken on avatar turns — PART covers use spoken "Part N. …"; CLOSING is followed by a MUSIC_BED insert with empty scriptText.`,
      );
    }

    const isNonSpokenCue = isNonSpokenCueVisualIdea(normalizedScene.visualIdea);
    const isVisualOnlyCover =
      !normalizedScene.scriptText &&
      (normalizedScene.visualIdea.trim().startsWith("Chapter cover:") ||
        /cover|title card|portada|introduction|reflection|prayer|closing/i.test(
          normalizedScene.visualPurpose,
        ) ||
        normalizedScene.markers.some((marker) =>
          /INTRODUCTION|CHAPTER COVER|REFLECTION AND PRAYER|CLOSING|CHAPTER\s+\d+|FINAL\s*[—\-:.]/i.test(
            marker,
          ),
        ));

    if (!normalizedScene.scriptText && !isVisualOnlyCover && !isNonSpokenCue) {
      errors.push(`${sceneLabel}.scriptText: must be a non-empty string after removing structural markers. Supported aliases: scriptText, voiceover_context.`);
    } else if (!normalizedScene.scriptText && isVisualOnlyCover) {
      warnings.push(
        `${sceneLabel}.scriptText: empty after removing markers — prefer pairing the cover with the spoken title/announcement (cover + voiceover), not a silent scene.`,
      );
    } else if (!normalizedScene.scriptText && isNonSpokenCue) {
      warnings.push(
        `${sceneLabel}.scriptText: empty non-spoken cue (${normalizedScene.visualIdea.split(":")[0] || "cue"}). PAUSE_CARD scenes fold into the previous scene pauseAfterMs on import; MUSIC_BED keeps an empty scriptText.`,
      );
    }

    if (
      normalizedScene.pauseAfterMs != null &&
      (!Number.isFinite(normalizedScene.pauseAfterMs) ||
        normalizedScene.pauseAfterMs < 0)
    ) {
      errors.push(
        `${sceneLabel}.pauseAfterMs: must be a non-negative number in milliseconds (e.g. 2000 for a 2s pause).`,
      );
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
    } else if (durationValue < 2) {
      warnings.push(`${sceneLabel}.duration: values below 2 seconds are clamped to 2 on import.`);
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
      duration:
        Number.isFinite(durationValue) && durationValue > 0
          ? clampSceneDurationSeconds(durationValue)
          : 4,
      imagePrompt: normalizedScene.imagePrompt,
      status: "planned",
      pauseAfterMs: normalizedScene.pauseAfterMs,
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

  for (const message of validateVisualIdeaPrefixes(normalizedScenes)) {
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  }

  const folded = foldPauseCardScenesIntoPauseAfterMs(normalizedScenes);
  if (folded.foldedCount > 0) {
    warnings.push(
      `Folded ${folded.foldedCount} PAUSE_CARD scene(s) into the previous scene pauseAfterMs (milliseconds).`,
    );
  }
  const scenes = folded.scenes.map((scene, index) => ({
    ...scene,
    order: index + 1,
  }));

  return {
    scenes,
    errors,
    warnings,
    summary: summarizeScenes(scenes),
  };
}

export function parseAndValidateHandoffResponse(
  response: string,
  options?: {
    expectedScript?: string;
    requireVisualIdeaPrefixes?: boolean;
  },
) {
  const validation = validateHandoffScenes(extractScenesFromHandoffResponse(response));

  if (options?.requireVisualIdeaPrefixes) {
    validation.errors.push(...validateVisualIdeaPrefixes(validation.scenes));
  }

  if (options?.expectedScript?.trim()) {
    const coverage = validateScriptCoverage(
      options.expectedScript,
      validation.scenes.map((scene) => scene.scriptText),
    );
    if (!coverage.ok) {
      validation.errors.push(`Script coverage: ${coverage.reason}`);
    }
  }

  return validation;
}

export function scenesToImportJson(scenes: ParsedHandoffScene[]) {
  return JSON.stringify(
    scenes.map(({ sourceSection: _sourceSection, ...scene }) => ({
      ...scene,
      duration: clampSceneDurationSeconds(scene.duration),
      ...(scene.pauseAfterMs != null
        ? { pauseAfterMs: scene.pauseAfterMs }
        : {}),
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
