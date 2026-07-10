export const SCENE_PATCH_ALLOWED_FIELDS = [
  "visualPurpose",
  "visualIdea",
  "imagePrompt",
  "duration",
  "status",
  "sceneType",
] as const;

export type ScenePatchAllowedField = (typeof SCENE_PATCH_ALLOWED_FIELDS)[number];

export type ScenePatchRawItem = {
  id?: unknown;
  order?: unknown;
  scriptText?: unknown;
  visualPurpose?: unknown;
  visualIdea?: unknown;
  imagePrompt?: unknown;
  duration?: unknown;
  status?: unknown;
  sceneType?: unknown;
  [key: string]: unknown;
};

export type ScenePatchNormalizedItem = {
  id?: string;
  order?: number;
  scriptText?: string;
  visualPurpose?: string | null;
  visualIdea?: string | null;
  imagePrompt?: string | null;
  duration?: number | null;
  status?: string;
  sceneType?: string;
};

export type ScenePatchPreviewScene = {
  id: string;
  order: number;
  visualIdea: string | null;
  imagePrompt: string | null;
  scriptText: string;
};

export type ScenePatchPreviewRow = {
  key: string;
  targetSceneId: string | null;
  targetOrder: number | null;
  matchStatus: "matched" | "not_found" | "duplicate_order" | "invalid_patch_item";
  fieldsToUpdate: string[];
  warnings: string[];
  oldVisualIdea: string | null;
  newVisualIdea: string | null;
  oldImagePromptExists: boolean;
  newImagePromptExists: boolean;
  normalizedItem: ScenePatchNormalizedItem | null;
};

export type ScenePatchApplyItem = {
  sceneId: string;
  fields: {
    scriptText?: string;
    visualPurpose?: string | null;
    visualIdea?: string | null;
    imagePrompt?: string | null;
    duration?: number;
    status?: string;
    sceneType?: string;
  };
};

export type ScenePatchPreview = {
  patchVideoId: string | null;
  rows: ScenePatchPreviewRow[];
  totalCount: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateTargetCount: number;
  unmatchedCount: number;
  ignoredScriptTextCount: number;
  globalWarnings: string[];
};

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function optionalPositiveInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric);
}

export function normalizeScenePatchInput(rawText: string) {
  const parsed = JSON.parse(rawText) as unknown;

  if (Array.isArray(parsed)) {
    return {
      patchVideoId: null,
      patch: parsed,
    };
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "patch" in parsed &&
    Array.isArray((parsed as { patch?: unknown }).patch)
  ) {
    const patchObject = parsed as { videoId?: unknown; patch: unknown[] };
    return {
      patchVideoId:
        typeof patchObject.videoId === "string" ? patchObject.videoId : null,
      patch: patchObject.patch,
    };
  }

  throw new Error(
    'Patch JSON must be either an array or an object with a "patch" array.',
  );
}

export function normalizeScenePatchItem(rawItem: unknown) {
  if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
    return null;
  }

  const item = rawItem as ScenePatchRawItem;
  const normalized: ScenePatchNormalizedItem = {};

  if (typeof item.id === "string" && item.id.trim()) {
    normalized.id = item.id.trim();
  }

  const order = optionalPositiveInt(item.order);
  if (order) {
    normalized.order = order;
  }

  if (hasOwn(item, "scriptText") && typeof item.scriptText === "string") {
    normalized.scriptText = item.scriptText.trim();
  }

  if (hasOwn(item, "visualPurpose")) {
    normalized.visualPurpose = optionalString(item.visualPurpose);
  }

  if (hasOwn(item, "visualIdea")) {
    normalized.visualIdea = optionalString(item.visualIdea);
  }

  if (hasOwn(item, "imagePrompt")) {
    normalized.imagePrompt = optionalString(item.imagePrompt);
  }

  if (hasOwn(item, "duration")) {
    normalized.duration = optionalPositiveInt(item.duration);
  }

  if (hasOwn(item, "status") && typeof item.status === "string" && item.status.trim()) {
    normalized.status = item.status.trim();
  }

  if (hasOwn(item, "sceneType") && typeof item.sceneType === "string" && item.sceneType.trim()) {
    normalized.sceneType = item.sceneType.trim();
  }

  return normalized;
}

function fieldsToUpdate(item: ScenePatchNormalizedItem, allowScriptTextChanges: boolean) {
  const fields: string[] = [];

  if (allowScriptTextChanges && item.scriptText) {
    fields.push("scriptText");
  }
  if ("visualPurpose" in item) fields.push("visualPurpose");
  if ("visualIdea" in item) fields.push("visualIdea");
  if ("imagePrompt" in item) fields.push("imagePrompt");
  if ("duration" in item && item.duration !== null) fields.push("duration");
  if (item.status) fields.push("status");
  if (item.sceneType) fields.push("sceneType");

  return fields;
}

export function buildScenePatchPreview({
  rawText,
  scenes,
  channelKey,
  currentVideoId,
  allowScriptTextChanges,
}: {
  rawText: string;
  scenes: ScenePatchPreviewScene[];
  channelKey: string;
  currentVideoId: string;
  allowScriptTextChanges: boolean;
}): ScenePatchPreview {
  const { patchVideoId, patch } = normalizeScenePatchInput(rawText);
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const sceneByOrder = new Map(scenes.map((scene) => [scene.order, scene]));
  const targetCounts = new Map<string, number>();

  const rows = patch.map((rawItem, index) => {
    const normalizedItem = normalizeScenePatchItem(rawItem);
    const key = `patch-${index + 1}`;

    if (!normalizedItem || (!normalizedItem.id && !normalizedItem.order)) {
      return {
        key,
        targetSceneId: null,
        targetOrder: null,
        matchStatus: "invalid_patch_item" as const,
        fieldsToUpdate: [],
        warnings: ["Each patch item must include id or order."],
        oldVisualIdea: null,
        newVisualIdea: null,
        oldImagePromptExists: false,
        newImagePromptExists: false,
        normalizedItem: null,
      };
    }

    const targetScene =
      (normalizedItem.id ? sceneById.get(normalizedItem.id) : null) ??
      (normalizedItem.order ? sceneByOrder.get(normalizedItem.order) : null) ??
      null;
    const warnings: string[] = [];

    if (normalizedItem.scriptText && !allowScriptTextChanges) {
      warnings.push("Patch attempted to update scriptText. This was ignored.");
    }

    if (normalizedItem.imagePrompt !== undefined && !normalizedItem.imagePrompt) {
      warnings.push("imagePrompt was included but is empty.");
    }

    if (channelKey === "wealth-insights" && normalizedItem.visualIdea) {
      if (!normalizedItem.visualIdea.startsWith("MAIN HOST:")) {
        warnings.push('For Wealth Insights, visualIdea should preferably start with "MAIN HOST:".');
      }
    }

    if (normalizedItem.imagePrompt) {
      const requiredSections = [
        "Voiceover context:",
        "Narrative meaning:",
        "Must show:",
        "Style rules:",
        "Avoid:",
      ];

      for (const section of requiredSections) {
        if (!normalizedItem.imagePrompt.includes(section)) {
          warnings.push(`imagePrompt is missing "${section}"`);
        }
      }
    }

    if (!targetScene) {
      return {
        key,
        targetSceneId: normalizedItem.id ?? null,
        targetOrder: normalizedItem.order ?? null,
        matchStatus: "not_found" as const,
        fieldsToUpdate: fieldsToUpdate(normalizedItem, allowScriptTextChanges),
        warnings,
        oldVisualIdea: null,
        newVisualIdea: normalizedItem.visualIdea ?? null,
        oldImagePromptExists: false,
        newImagePromptExists: Boolean(normalizedItem.imagePrompt),
        normalizedItem,
      };
    }

    const targetKey = targetScene.id;
    targetCounts.set(targetKey, (targetCounts.get(targetKey) ?? 0) + 1);

    return {
      key,
      targetSceneId: targetScene.id,
      targetOrder: targetScene.order,
      matchStatus: "matched" as const,
      fieldsToUpdate: fieldsToUpdate(normalizedItem, allowScriptTextChanges),
      warnings,
      oldVisualIdea: targetScene.visualIdea,
      newVisualIdea: normalizedItem.visualIdea ?? targetScene.visualIdea,
      oldImagePromptExists: Boolean(targetScene.imagePrompt?.trim()),
      newImagePromptExists:
        normalizedItem.imagePrompt !== undefined
          ? Boolean(normalizedItem.imagePrompt)
          : Boolean(targetScene.imagePrompt?.trim()),
      normalizedItem,
    };
  });

  const finalRows = rows.map((row) => {
    if (
      row.matchStatus === "matched" &&
      row.targetSceneId &&
      (targetCounts.get(row.targetSceneId) ?? 0) > 1
    ) {
      return {
        ...row,
        matchStatus: "duplicate_order" as const,
        warnings: [...row.warnings, "Multiple patch items target the same scene."],
      };
    }

    return row;
  });

  const validCount = finalRows.filter((row) => row.matchStatus === "matched").length;
  const invalidCount = finalRows.filter(
    (row) => row.matchStatus === "invalid_patch_item" || row.matchStatus === "not_found",
  ).length;
  const duplicateTargetCount = finalRows.filter(
    (row) => row.matchStatus === "duplicate_order",
  ).length;
  const warningCount = finalRows.filter((row) => row.warnings.length > 0).length;
  const unmatchedCount = finalRows.filter((row) => row.matchStatus === "not_found").length;
  const ignoredScriptTextCount = finalRows.filter((row) =>
    row.warnings.some((warning) => warning.includes("scriptText")),
  ).length;
  const globalWarnings: string[] = [];

  if (patchVideoId && patchVideoId !== currentVideoId) {
    globalWarnings.push("Patch videoId does not match the current video.");
  }

  if (patch.length > 50) {
    globalWarnings.push(`This patch will update ${patch.length} scenes.`);
  }

  if (duplicateTargetCount > 0) {
    globalWarnings.push("Duplicate patch targets were detected.");
  }

  return {
    patchVideoId,
    rows: finalRows,
    totalCount: patch.length,
    validCount,
    warningCount,
    invalidCount,
    duplicateTargetCount,
    unmatchedCount,
    ignoredScriptTextCount,
    globalWarnings,
  };
}

export function summarizePatchItemPreview(value: string | null | undefined, max = 120) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }

  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

export function buildScenePatchApplyItems(
  preview: ScenePatchPreview,
  allowScriptTextChanges: boolean,
) {
  const lastRowByTarget = new Map<string, ScenePatchPreviewRow>();

  for (const row of preview.rows) {
    if (
      row.matchStatus !== "invalid_patch_item" &&
      row.matchStatus !== "not_found" &&
      row.targetSceneId &&
      row.normalizedItem
    ) {
      lastRowByTarget.set(row.targetSceneId, row);
    }
  }

  const items: ScenePatchApplyItem[] = [];

  for (const [sceneId, row] of lastRowByTarget) {
    const item = row.normalizedItem;

    if (!item) {
      continue;
    }

    const fields: ScenePatchApplyItem["fields"] = {};

    if (allowScriptTextChanges && item.scriptText) {
      fields.scriptText = item.scriptText;
    }
    if ("visualPurpose" in item) {
      fields.visualPurpose = item.visualPurpose ?? null;
    }
    if ("visualIdea" in item) {
      fields.visualIdea = item.visualIdea ?? null;
    }
    if ("imagePrompt" in item) {
      fields.imagePrompt = item.imagePrompt ?? null;
    }
    if ("duration" in item && item.duration) {
      fields.duration = item.duration;
    }
    if (item.status) {
      fields.status = item.status;
    }
    if (item.sceneType) {
      fields.sceneType = item.sceneType;
    }

    if (
      !fields.status &&
      "imagePrompt" in fields &&
      fields.imagePrompt &&
      !("status" in fields)
    ) {
      fields.status = "planned";
    }

    if (Object.keys(fields).length > 0) {
      items.push({ sceneId, fields });
    }
  }

  return items;
}
