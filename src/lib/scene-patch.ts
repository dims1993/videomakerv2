import {
  normalizePrependSceneType,
  type PrependSceneDraft,
} from "@/lib/scene-prepend";
import {
  hasAllowedWealthInsightsVisualIdeaPrefix,
  resolveWealthInsightsVisualMode,
} from "@/lib/wealth-insights-visual-mode";

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
  hasGeneratedImage?: boolean;
};

export type ScenePatchMatchStatus =
  | "matched"
  | "insert_prepend"
  | "not_found"
  | "duplicate_order"
  | "invalid_patch_item";

export type ScenePatchPreviewRow = {
  key: string;
  targetSceneId: string | null;
  targetOrder: number | null;
  matchStatus: ScenePatchMatchStatus;
  fieldsToUpdate: string[];
  warnings: string[];
  oldVisualIdea: string | null;
  newVisualIdea: string | null;
  oldImagePromptExists: boolean;
  newImagePromptExists: boolean;
  willClearImage: boolean;
  hasExistingImage: boolean;
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
  clearGeneratedImage: boolean;
  clearSceneVoiceover: boolean;
};

export type ScenePatchPreview = {
  patchVideoId: string | null;
  sourceFormat: "scene_patch" | "hook_replacement_converted";
  rows: ScenePatchPreviewRow[];
  totalCount: number;
  validCount: number;
  prependCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateTargetCount: number;
  unmatchedCount: number;
  ignoredScriptTextCount: number;
  clearImageCount: number;
  globalWarnings: string[];
};

const IMAGE_CLEARING_FIELDS = new Set([
  "visualPurpose",
  "visualIdea",
  "imagePrompt",
  "sceneType",
  "scriptText",
]);

export function scenePatchClearsGeneratedImage(
  fields: ScenePatchApplyItem["fields"] | string[],
) {
  if (Array.isArray(fields)) {
    return fields.some((field) => IMAGE_CLEARING_FIELDS.has(field));
  }

  return Object.keys(fields).some((field) => IMAGE_CLEARING_FIELDS.has(field));
}

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

/** Positive orders update existing scenes; negative orders prepend new scenes. */
function optionalSceneOrder(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return null;
  }

  return Math.round(numeric);
}

export function isPrependPatchOrder(order: number | null | undefined) {
  return typeof order === "number" && order < 0;
}

export function normalizeScenePatchInput(rawText: string) {
  const parsed = JSON.parse(rawText) as unknown;

  if (Array.isArray(parsed)) {
    return {
      patchVideoId: null as string | null,
      patch: parsed,
      sourceFormat: "scene_patch" as const,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      'Patch JSON must be either an array or an object with a "patch" array.',
    );
  }

  const patchObject = parsed as {
    videoId?: unknown;
    task?: unknown;
    patch?: unknown;
    scenes?: unknown;
    replace?: unknown;
  };

  if (Array.isArray(patchObject.patch)) {
    return {
      patchVideoId:
        typeof patchObject.videoId === "string" ? patchObject.videoId : null,
      patch: patchObject.patch,
      sourceFormat: "scene_patch" as const,
    };
  }

  // Safe conversion: hook_replacement_patch with equal scene count → in-place
  // order updates. Different counts would renumber later scenes and risk image
  // mapping, so those are rejected here on purpose.
  if (patchObject.task === "hook_replacement_patch") {
    if (
      !patchObject.replace ||
      typeof patchObject.replace !== "object" ||
      Array.isArray(patchObject.replace) ||
      !Array.isArray(patchObject.scenes)
    ) {
      throw new Error(
        "hook_replacement_patch must include replace.fromOrder/toOrder and a scenes array.",
      );
    }

    const replace = patchObject.replace as {
      fromOrder?: unknown;
      toOrder?: unknown;
    };
    const fromOrder = optionalPositiveInt(replace.fromOrder);
    const toOrder = optionalPositiveInt(replace.toOrder);

    if (!fromOrder || !toOrder || fromOrder > toOrder) {
      throw new Error("hook_replacement_patch range is invalid.");
    }

    const expectedCount = toOrder - fromOrder + 1;

    if (patchObject.scenes.length !== expectedCount) {
      throw new Error(
        `Structural hook replacement is blocked to protect existing images (${patchObject.scenes.length} replacement scenes vs ${expectedCount} in range ${fromOrder}-${toOrder}). Use a same-length patch, or patch specific scenes by order/id so untouched scenes keep their images and Flow file mapping.`,
      );
    }

    return {
      patchVideoId:
        typeof patchObject.videoId === "string" ? patchObject.videoId : null,
      patch: patchObject.scenes.map((scene, index) => {
        const record =
          scene && typeof scene === "object" && !Array.isArray(scene)
            ? (scene as Record<string, unknown>)
            : {};
        const item: Record<string, unknown> = {
          order: fromOrder + index,
        };

        for (const key of [
          "scriptText",
          "sceneType",
          "visualPurpose",
          "visualIdea",
          "duration",
          "imagePrompt",
          "status",
        ] as const) {
          if (Object.prototype.hasOwnProperty.call(record, key)) {
            item[key] = record[key];
          }
        }

        return item;
      }),
      sourceFormat: "hook_replacement_converted" as const,
    };
  }

  throw new Error(
    'Patch JSON must be an array, { "patch": [...] }, or a same-length hook_replacement_patch.',
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

  const order = optionalSceneOrder(item.order);
  if (order !== null) {
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

function collectImagePromptWarnings(
  channelKey: string,
  normalizedItem: ScenePatchNormalizedItem,
  options?: { topicCategory?: string | null; ideaJson?: unknown },
) {
  const warnings: string[] = [];

  if (normalizedItem.imagePrompt !== undefined && !normalizedItem.imagePrompt) {
    warnings.push("imagePrompt was included but is empty.");
  }

  if (channelKey === "wealth-insights" && normalizedItem.visualIdea) {
    const mode = resolveWealthInsightsVisualMode({
      topicCategory: options?.topicCategory,
      ideaJson: options?.ideaJson,
    });
    if (
      !hasAllowedWealthInsightsVisualIdeaPrefix(normalizedItem.visualIdea, mode)
    ) {
      warnings.push(
        mode === "narrative_economics_stories"
          ? "For Narrative Economics Stories, visualIdea should usually start with CHARACTER_A:/CHARACTER_B:/CHARACTER_C:/CHARACTER_D:/MECHANISM:/EDITORIAL BOARD:/OBJECT DETAIL:/LOCATION BEAT: (or MAIN HOST: only if the recurring host is actually used)."
          : 'For Wealth Insights, visualIdea should preferably start with "MAIN HOST:", "STORY_CHARACTER:", "MAIN HOST + STORY:", or "STORY_PAIR:".',
      );
    }
  }

  if (normalizedItem.imagePrompt && channelKey === "wealth-insights") {
    const mode = resolveWealthInsightsVisualMode({
      topicCategory: options?.topicCategory,
      ideaJson: options?.ideaJson,
    });
    if (mode === "narrative_economics_stories") {
      const requiredSections = [
        "VISUAL STYLE LOCK:",
        "Voiceover context:",
        "Narrative meaning:",
        "Must show:",
        "Composition:",
        "Style rules:",
        "Avoid:",
      ];
      for (const section of requiredSections) {
        if (!normalizedItem.imagePrompt.includes(section)) {
          warnings.push(`imagePrompt is missing "${section}"`);
        }
      }
    } else {
      const requiredSections = [
        "Narrative meaning:",
        "Must show:",
        "Avoid:",
      ];
      for (const section of requiredSections) {
        if (!normalizedItem.imagePrompt.includes(section)) {
          warnings.push(`imagePrompt is missing "${section}"`);
        }
      }
      if (
        !normalizedItem.imagePrompt.includes("Educational beat:") &&
        !normalizedItem.imagePrompt.includes("Voiceover context:")
      ) {
        warnings.push(
          'imagePrompt is missing "Educational beat:" (or legacy "Voiceover context:")',
        );
      }
      if (
        !normalizedItem.imagePrompt.includes("Style:") &&
        !normalizedItem.imagePrompt.includes("Style rules:")
      ) {
        warnings.push('imagePrompt is missing "Style:" (or legacy "Style rules:")');
      }
    }
  }

  return warnings;
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
  const { patchVideoId, patch, sourceFormat } = normalizeScenePatchInput(rawText);
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const sceneByOrder = new Map(scenes.map((scene) => [scene.order, scene]));
  const targetCounts = new Map<string, number>();

  const rows = patch.map((rawItem, index) => {
    const normalizedItem = normalizeScenePatchItem(rawItem);
    const key = `patch-${index + 1}`;

    if (
      !normalizedItem ||
      (!normalizedItem.id && normalizedItem.order === undefined)
    ) {
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
        willClearImage: false,
        hasExistingImage: false,
        normalizedItem: null,
      };
    }

    // Negative order = insert at the start (existing scenes shift; images stay on ids).
    if (
      !normalizedItem.id &&
      isPrependPatchOrder(normalizedItem.order)
    ) {
      const warnings = collectImagePromptWarnings(channelKey, normalizedItem);
      const fields = [
        "scriptText",
        ...fieldsToUpdate(normalizedItem, true).filter(
          (field) => field !== "scriptText",
        ),
      ];

      if (!normalizedItem.scriptText?.trim()) {
        return {
          key,
          targetSceneId: null,
          targetOrder: normalizedItem.order ?? null,
          matchStatus: "invalid_patch_item" as const,
          fieldsToUpdate: fields,
          warnings: [
            ...warnings,
            "Prepend items (negative order) require scriptText.",
          ],
          oldVisualIdea: null,
          newVisualIdea: normalizedItem.visualIdea ?? null,
          oldImagePromptExists: false,
          newImagePromptExists: Boolean(normalizedItem.imagePrompt),
          willClearImage: false,
          hasExistingImage: false,
          normalizedItem,
        };
      }

      warnings.push(
        "Will insert before scene 1 and shift existing scene orders. Existing images stay on their scene ids.",
      );

      return {
        key,
        targetSceneId: null,
        targetOrder: normalizedItem.order ?? null,
        matchStatus: "insert_prepend" as const,
        fieldsToUpdate: fields,
        warnings,
        oldVisualIdea: null,
        newVisualIdea: normalizedItem.visualIdea ?? null,
        oldImagePromptExists: false,
        newImagePromptExists: Boolean(normalizedItem.imagePrompt),
        willClearImage: false,
        hasExistingImage: false,
        normalizedItem,
      };
    }

    const targetScene =
      (normalizedItem.id ? sceneById.get(normalizedItem.id) : null) ??
      (typeof normalizedItem.order === "number" && normalizedItem.order > 0
        ? sceneByOrder.get(normalizedItem.order)
        : null) ??
      null;
    const warnings = collectImagePromptWarnings(channelKey, normalizedItem);
    const fields = fieldsToUpdate(normalizedItem, allowScriptTextChanges);
    const willClearImage = scenePatchClearsGeneratedImage(fields);

    if (normalizedItem.scriptText && !allowScriptTextChanges) {
      warnings.push("Patch attempted to update scriptText. This was ignored.");
    }

    if (!targetScene) {
      return {
        key,
        targetSceneId: normalizedItem.id ?? null,
        targetOrder: normalizedItem.order ?? null,
        matchStatus: "not_found" as const,
        fieldsToUpdate: fields,
        warnings,
        oldVisualIdea: null,
        newVisualIdea: normalizedItem.visualIdea ?? null,
        oldImagePromptExists: false,
        newImagePromptExists: Boolean(normalizedItem.imagePrompt),
        willClearImage,
        hasExistingImage: false,
        normalizedItem,
      };
    }

    const targetKey = targetScene.id;
    targetCounts.set(targetKey, (targetCounts.get(targetKey) ?? 0) + 1);
    const hasExistingImage = Boolean(targetScene.hasGeneratedImage);

    if (willClearImage && hasExistingImage) {
      warnings.push(
        "Existing generated image for this scene will be cleared so it can be regenerated.",
      );
    }

    return {
      key,
      targetSceneId: targetScene.id,
      targetOrder: targetScene.order,
      matchStatus: "matched" as const,
      fieldsToUpdate: fields,
      warnings,
      oldVisualIdea: targetScene.visualIdea,
      newVisualIdea: normalizedItem.visualIdea ?? targetScene.visualIdea,
      oldImagePromptExists: Boolean(targetScene.imagePrompt?.trim()),
      newImagePromptExists:
        normalizedItem.imagePrompt !== undefined
          ? Boolean(normalizedItem.imagePrompt)
          : Boolean(targetScene.imagePrompt?.trim()),
      willClearImage,
      hasExistingImage,
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

  const prependCount = finalRows.filter(
    (row) => row.matchStatus === "insert_prepend",
  ).length;
  const matchedCount = finalRows.filter(
    (row) => row.matchStatus === "matched",
  ).length;
  const validCount = matchedCount + prependCount;
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
  const clearImageCount = finalRows.filter(
    (row) =>
      row.matchStatus === "matched" &&
      row.willClearImage &&
      row.hasExistingImage,
  ).length;
  const globalWarnings: string[] = [];

  if (patchVideoId && patchVideoId !== currentVideoId) {
    globalWarnings.push("Patch videoId does not match the current video.");
  }

  if (sourceFormat === "hook_replacement_converted") {
    globalWarnings.push(
      "Hook replacement patch converted to in-place updates by order (same scene count). Other scenes and their images are left untouched.",
    );
  }

  if (prependCount > 0) {
    globalWarnings.push(
      `${prependCount} scene(s) with negative order will be prepended. Existing scenes shift by ${prependCount}; their generated images stay attached. Positive-order updates apply first against current orders.`,
    );
  }

  if (patch.length > 50) {
    globalWarnings.push(`This patch will update ${patch.length} scenes.`);
  }

  if (duplicateTargetCount > 0) {
    globalWarnings.push("Duplicate patch targets were detected.");
  }

  if (clearImageCount > 0) {
    globalWarnings.push(
      `${clearImageCount} patched scene(s) will clear their generated images. Untouched scenes keep theirs.`,
    );
  }

  return {
    patchVideoId,
    sourceFormat,
    rows: finalRows,
    totalCount: patch.length,
    validCount,
    prependCount,
    warningCount,
    invalidCount,
    duplicateTargetCount,
    unmatchedCount,
    ignoredScriptTextCount,
    clearImageCount,
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
      row.matchStatus !== "matched" &&
      row.matchStatus !== "duplicate_order"
    ) {
      continue;
    }

    if (row.targetSceneId && row.normalizedItem) {
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
      items.push({
        sceneId,
        fields,
        clearGeneratedImage: scenePatchClearsGeneratedImage(fields),
        clearSceneVoiceover: Boolean(fields.scriptText),
      });
    }
  }

  return items;
}

export function buildScenePatchPrependItems(
  preview: ScenePatchPreview,
): PrependSceneDraft[] {
  const prependRows = preview.rows
    .filter(
      (row) =>
        row.matchStatus === "insert_prepend" &&
        row.normalizedItem?.scriptText?.trim(),
    )
    .sort((left, right) => {
      const leftOrder = left.normalizedItem?.order ?? 0;
      const rightOrder = right.normalizedItem?.order ?? 0;
      return leftOrder - rightOrder;
    });

  return prependRows.map((row) => {
    const item = row.normalizedItem!;
    return {
      scriptText: item.scriptText!.trim(),
      sceneType: normalizePrependSceneType(item.sceneType),
      visualPurpose: item.visualPurpose ?? null,
      visualIdea: item.visualIdea ?? null,
      imagePrompt: item.imagePrompt ?? null,
      duration: item.duration && item.duration > 0 ? item.duration : 8,
      status: item.status?.trim() || "planned",
      sourceOrder: item.order ?? null,
    };
  });
}
