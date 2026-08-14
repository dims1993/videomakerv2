import { extractJsonPayload } from "@/lib/browser-automation/types";
import {
  parseAndValidateHandoffResponse,
  repairUnescapedJsonStringQuotes,
  scenesToImportJson,
} from "@/lib/chatgpt-scene-handoff";
import {
  isMusicBedVisualIdea,
  isPauseCardVisualIdea,
} from "@/lib/podcast-pause-cues";
import { stripChatGptUiChrome } from "@/lib/script-writer-extract";
import {
  VISUAL_PLAN_CALL,
  extractVisualPlanScore,
  type VisualPlanCallType,
} from "@/lib/visual-plan-critique";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const VISUAL_PLAN_SCENE_REQUIRED_FIELDS = [
  "order",
  "scriptText",
  "sceneType",
  "visualPurpose",
  "visualIdea",
  "duration",
  "imagePrompt",
  "status",
] as const;

const ALLOWED_SCENE_TYPES = new Set(["avatar", "insert", "space"]);

export type VisualPlanScenesValidation = {
  ok: boolean;
  errors: string[];
  scenesJson: string | null;
  rawText: string;
};

export type VisualPlanEvaluationValidation = {
  ok: boolean;
  errors: string[];
  critique: ReturnType<typeof extractVisualPlanScore> | null;
  rawText: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function tryParseJson(text: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (directError) {
    // ChatGPT often leaves unescaped " inside imagePrompt voiceover lines.
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

/**
 * Strict structural validation for GENERATE / REVISE responses.
 */
export function validateVisualPlanScenesResponse(
  rawResponse: string,
): VisualPlanScenesValidation {
  const rawText = rawResponse.trim();
  const errors: string[] = [];

  if (!rawText) {
    return {
      ok: false,
      errors: ["Response is empty."],
      scenesJson: null,
      rawText,
    };
  }

  const cleaned = stripChatGptUiChrome(rawText);
  const payload = extractJsonPayload(cleaned) ?? cleaned;
  const parsed = tryParseJson(payload);
  if (parsed.error) {
    return {
      ok: false,
      errors: [parsed.error],
      scenesJson: null,
      rawText,
    };
  }

  if (!Array.isArray(parsed.value)) {
    errors.push(
      "Response must be a JSON array of scenes (no top-level object wrapper).",
    );
    return { ok: false, errors, scenesJson: null, rawText };
  }

  if (parsed.value.length === 0) {
    errors.push("Scenes JSON array is empty.");
  }

  parsed.value.forEach((item, index) => {
    const label = `scenes[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${label}: must be an object.`);
      return;
    }

    for (const field of VISUAL_PLAN_SCENE_REQUIRED_FIELDS) {
      if (!(field in item)) {
        errors.push(`${label}: missing required field "${field}".`);
      }
    }

    const scriptText =
      typeof item.scriptText === "string" ? item.scriptText.trim() : "";
    const visualIdea =
      typeof item.visualIdea === "string" ? item.visualIdea : "";
    const allowsEmptyScript =
      isMusicBedVisualIdea(visualIdea) || isPauseCardVisualIdea(visualIdea);
    if (!scriptText && !allowsEmptyScript) {
      errors.push(`${label}.scriptText: must be a non-empty string.`);
    }

    const sceneType =
      typeof item.sceneType === "string" ? item.sceneType.trim() : "";
    if (!ALLOWED_SCENE_TYPES.has(sceneType)) {
      errors.push(`${label}.sceneType: must be avatar, insert, or space.`);
    }

    if (typeof item.duration !== "number" || !Number.isFinite(item.duration)) {
      errors.push(`${label}.duration: must be a number.`);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors, scenesJson: null, rawText };
  }

  try {
    // Secondary import-schema check without channel-specific visualIdea prefixes.
    // Structural guards above already enforce the anti-hang contract.
    const handoff = parseAndValidateHandoffResponse(rawText, {
      requireVisualIdeaPrefixes: false,
    });
    if (handoff.errors.length > 0) {
      return {
        ok: false,
        errors: handoff.errors.slice(0, 8),
        scenesJson: null,
        rawText,
      };
    }
    if (handoff.scenes.length === 0) {
      return {
        ok: false,
        errors: ["ChatGPT returned no scenes in the visual plan response."],
        scenesJson: null,
        rawText,
      };
    }
    return {
      ok: true,
      errors: [],
      scenesJson: scenesToImportJson(handoff.scenes),
      rawText,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        error instanceof Error
          ? error.message
          : "Scenes JSON failed secondary schema validation.",
      ],
      scenesJson: null,
      rawText,
    };
  }
}

/**
 * Strict structural validation for EVALUATE responses.
 */
export function validateVisualPlanEvaluationResponse(
  rawResponse: string,
): VisualPlanEvaluationValidation {
  const rawText = rawResponse.trim();
  const errors: string[] = [];

  if (!rawText) {
    return {
      ok: false,
      errors: ["Response is empty."],
      critique: null,
      rawText,
    };
  }

  const cleaned = stripChatGptUiChrome(rawText);
  const payload = extractJsonPayload(cleaned) ?? cleaned;
  const parsed = tryParseJson(payload);
  if (parsed.error) {
    return {
      ok: false,
      errors: [parsed.error],
      critique: null,
      rawText,
    };
  }

  if (!isPlainObject(parsed.value)) {
    errors.push("Evaluation response must be a JSON object.");
    return { ok: false, errors, critique: null, rawText };
  }

  const overallScore = parsed.value.overallScore;
  if (typeof overallScore !== "number" || !Number.isFinite(overallScore)) {
    errors.push("overallScore must be a number.");
  } else if (overallScore < 0 || overallScore > 10) {
    errors.push("overallScore must be between 0 and 10.");
  }

  if (typeof parsed.value.passesThreshold !== "boolean") {
    errors.push("passesThreshold must be a boolean.");
  }

  if (!("revisionPriorities" in parsed.value)) {
    errors.push("revisionPriorities must exist.");
  } else if (!Array.isArray(parsed.value.revisionPriorities)) {
    errors.push("revisionPriorities must be an array.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, critique: null, rawText };
  }

  const critique = extractVisualPlanScore(rawText);
  if (critique.score == null) {
    return {
      ok: false,
      errors: ["Failed to extract overallScore from evaluation JSON."],
      critique: null,
      rawText,
    };
  }

  return { ok: true, errors: [], critique, rawText };
}

export function buildVisualPlanScenesRepairPrompt({
  callType,
  draftNumber,
  validationErrors,
  invalidResponse,
}: {
  callType: typeof VISUAL_PLAN_CALL.GENERATE | typeof VISUAL_PLAN_CALL.REVISE;
  draftNumber: number;
  validationErrors: string[];
  invalidResponse: string;
}) {
  const errorList = validationErrors.map((error) => `- ${error}`).join("\n");
  const clipped =
    invalidResponse.length > 12_000
      ? `${invalidResponse.slice(0, 12_000)}\n…[truncated]`
      : invalidResponse;

  return `${callType}_REPAIR
STRICT REPAIR — your previous ${callType} response for draft V${draftNumber} failed validation.
Do not advance. Do not evaluate. Do not explain.

Validation errors:
${errorList}

Hard repair requirements:
- Return parseable JSON only.
- Top-level value MUST be a JSON array of scenes.
- Do not wrap in an object.
- Do not return markdown or commentary.
- Every scene must include exactly these fields: ${VISUAL_PLAN_SCENE_REQUIRED_FIELDS.join(", ")}.
- sceneType must be one of: avatar, insert, space.
- scriptText must be a non-empty string.
- status must be "planned".
- Preserve exact scriptText coverage from the previous attempt when present.

Invalid response to repair:
${clipped}`;
}

/**
 * Repair a single section chunk when coverage / duration / order validation fails.
 * Does not ask the model to regenerate earlier completed sections.
 */
export function buildVisualPlanSectionChunkRepairPrompt({
  sectionIndex,
  totalSections,
  sectionLabel,
  sectionText,
  startOrder,
  validationErrors,
  invalidResponse,
  sceneDiagnostics,
}: {
  sectionIndex: number;
  totalSections: number;
  sectionLabel: string;
  sectionText: string;
  startOrder: number;
  validationErrors: string[];
  invalidResponse: string;
  sceneDiagnostics?: Array<{
    index: number;
    estimatedSeconds: number;
    declaredDuration: number;
    wordCount?: number;
    scriptText: string;
  }>;
}) {
  const errorList = validationErrors.map((error) => `- ${error}`).join("\n");
  const clippedResponse =
    invalidResponse.length > 12_000
      ? `${invalidResponse.slice(0, 12_000)}\n…[truncated]`
      : invalidResponse;
  const clippedSection =
    sectionText.length > 8_000
      ? `${sectionText.slice(0, 8_000)}\n…[truncated]`
      : sectionText;
  const isHook = sectionLabel.trim().toUpperCase() === "HOOK";
  const diagnosticsBlock =
    sceneDiagnostics && sceneDiagnostics.length > 0
      ? [
          "",
          "Scene duration diagnostics:",
          ...sceneDiagnostics.map((scene) => {
            const preview = scene.scriptText.replace(/\s+/g, " ").trim().slice(0, 160);
            const words =
              typeof scene.wordCount === "number"
                ? scene.wordCount
                : scene.scriptText.trim()
                  ? scene.scriptText.trim().split(/\s+/).filter(Boolean).length
                  : 0;
            return `- Scene ${scene.index}: ${words} words, estimated ${scene.estimatedSeconds.toFixed(1)}s, declared duration ${scene.declaredDuration}s — "${preview}${scene.scriptText.length > 160 ? "…" : ""}"`;
          }),
        ].join("\n")
      : "";

  return `GENERATE_VISUAL_PLAN_SECTION_CHUNK_REPAIR
STRICT REPAIR — Visual Plan Section ${sectionIndex}/${totalSections} ([${sectionLabel}]) failed validation.
Repair THIS section only. Do not regenerate earlier sections. Do not invent later sections.

Validation errors:
${errorList}
${diagnosticsBlock}

Hard repair requirements:
- Return a JSON array only for THIS section.
- Start scene order at ${startOrder} and number consecutively.
- Exact spoken coverage lock: concatenating every scene.scriptText (whitespace-normalized only) MUST equal the section script below.
- No omitted, duplicated, reordered, or paraphrased narration.
- Never copy structural bracket labels into scriptText.
- Keep schema fields exactly: ${VISUAL_PLAN_SCENE_REQUIRED_FIELDS.join(", ")}.
- sceneType must be avatar, insert, or space.
- status must be planned.
- Never emit a single-word scene. Avoid 1–3 word scenes unless exact short quote / word-study emphasis.
${
  isHook
    ? `- HOOK: about 3–6s and ~4–12 narrated words per scene.
- Split oversized hook scriptText at natural semantic/visual boundaries.
- Do NOT solve this by lowering the duration value alone.
- Do NOT delete narration, paraphrase, or merge offending narration into another oversized scene.
- Prefer aggressive hook micro-beats over body-style consolidation — but still merge one-word orphans.`
    : `- BODY/CHAPTER: moderate segmentation (NOT hard-hook micro-splits).
- Target about 15–25 narrated words and 5–8 seconds (soft floor 5–6s; prefer 6–8s; soft ceiling 8s).
- If a scene is too short (<5s or under word floor), MERGE same-claim neighbors.
- If a beat is too long (>8s estimated/declared), SPLIT only when claims need different visuals.
- Do not solve duration failures merely by lowering the duration field.
- Chapter covers / empty FINAL bumpers are exempt from body floors.`
}

Authoritative script section:
\`\`\`text
${clippedSection}
\`\`\`

Invalid section response to repair:
${clippedResponse}`;
}

export function buildVisualPlanEvaluationRepairPrompt({
  draftNumber,
  validationErrors,
  invalidResponse,
}: {
  draftNumber: number;
  validationErrors: string[];
  invalidResponse: string;
}) {
  const errorList = validationErrors.map((error) => `- ${error}`).join("\n");
  const clipped =
    invalidResponse.length > 12_000
      ? `${invalidResponse.slice(0, 12_000)}\n…[truncated]`
      : invalidResponse;

  return `${VISUAL_PLAN_CALL.EVALUATE}_REPAIR
STRICT REPAIR — your previous EVALUATE_VISUAL_PLAN response for draft V${draftNumber} failed validation.
Do not revise scenes. Do not advance. Do not explain.

Validation errors:
${errorList}

Hard repair requirements:
- Return parseable JSON object only.
- Do not return markdown or commentary.
- overallScore must be a number from 0 to 10.
- passesThreshold must be a boolean.
- revisionPriorities must exist (array; may be empty).
- Include the rest of the evaluation shape (criticalIssues, systemicIssues, sceneIssues, doNotChange, summary, categoryScores, threshold).

Invalid response to repair:
${clipped}`;
}

export async function saveFailedVisualPlanResponse({
  videoId,
  callType,
  draftNumber,
  rawText,
  validationErrors,
}: {
  videoId: string;
  callType: VisualPlanCallType | `${VisualPlanCallType}_REPAIR`;
  draftNumber: number;
  rawText: string;
  validationErrors: string[];
}): Promise<string> {
  const dir = path.join(process.cwd(), "data", "visual-plan-failures");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${videoId}-${callType}-V${draftNumber}-${stamp}.txt`;
  const filePath = path.join(dir, fileName);
  const body = [
    `callType: ${callType}`,
    `draftNumber: ${draftNumber}`,
    `videoId: ${videoId}`,
    `savedAt: ${new Date().toISOString()}`,
    "",
    "validationErrors:",
    ...validationErrors.map((error) => `- ${error}`),
    "",
    "rawResponse:",
    rawText,
    "",
  ].join("\n");
  await writeFile(filePath, body, "utf8");
  return filePath;
}
