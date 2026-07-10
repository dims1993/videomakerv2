export const HOOK_PACING_PRESETS = {
  fast: {
    label: "Fast hook",
    targetRange: "3-4.5s",
    targetMinSeconds: 3,
    targetMaxSeconds: 4.5,
    maxSceneDurationSeconds: 5.5,
  },
  balanced: {
    label: "Balanced hook",
    targetRange: "4-5s",
    targetMinSeconds: 4,
    targetMaxSeconds: 5,
    maxSceneDurationSeconds: 6,
  },
  slow: {
    label: "Slow hook",
    targetRange: "5-6s",
    targetMinSeconds: 5,
    targetMaxSeconds: 6,
    maxSceneDurationSeconds: 7,
  },
} as const;

export type HookPacingPresetId = keyof typeof HOOK_PACING_PRESETS;

export type HookReplacementPatchScene = {
  scriptText: string;
  sceneType?: string | null;
  visualPurpose?: string | null;
  visualIdea?: string | null;
  duration?: number | null;
  imagePrompt?: string | null;
  status?: string | null;
};

export type HookReplacementPatch = {
  task: "hook_replacement_patch";
  videoId?: string;
  replace: {
    fromOrder: number;
    toOrder: number;
  };
  scenes: HookReplacementPatchScene[];
};

export type HookReplacementPreviewScene = {
  order: number;
  scriptText: string;
  duration: number | null;
  warnings: string[];
};

export type HookReplacementPreview = {
  patch: HookReplacementPatch;
  removedScenes: number;
  insertedScenes: number;
  oldHookDurationSeconds: number;
  newHookDurationSeconds: number;
  oldSceneCount: number;
  newSceneCount: number;
  newAverageDurationSeconds: number;
  warningsRemaining: number;
  narrationMatches: boolean;
  narrationWarning: string | null;
  duplicateAfterRangeCount: number;
  duplicateAfterRangeOrders: number[];
  duplicateAfterRangeWarning: string | null;
  globalWarnings: string[];
  replacementScenes: HookReplacementPreviewScene[];
};

export type HookReplacementCurrentScene = {
  order: number;
  scriptText: string;
  duration: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function positiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function positiveInt(value: unknown) {
  const numeric = positiveNumber(value);
  return numeric ? Math.round(numeric) : null;
}

export function normalizeNarrationText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function parseHookReplacementPatch(rawText: string): HookReplacementPatch {
  const parsed = JSON.parse(rawText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Hook replacement patch must be a JSON object.");
  }

  if (parsed.task !== "hook_replacement_patch") {
    throw new Error('Hook replacement patch task must be "hook_replacement_patch".');
  }

  if (!isRecord(parsed.replace)) {
    throw new Error("Hook replacement patch must include replace.fromOrder and replace.toOrder.");
  }

  const fromOrder = positiveInt(parsed.replace.fromOrder);
  const toOrder = positiveInt(parsed.replace.toOrder);

  if (!fromOrder || !toOrder || fromOrder > toOrder) {
    throw new Error("Hook replacement range must use valid fromOrder and toOrder values.");
  }

  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Hook replacement patch must include a non-empty scenes array.");
  }

  const scenes = parsed.scenes.map((rawScene, index) => {
    if (!isRecord(rawScene)) {
      throw new Error(`Replacement scene ${index + 1} must be an object.`);
    }

    const scriptText = cleanString(rawScene.scriptText);

    if (!scriptText) {
      throw new Error(`Replacement scene ${index + 1} must include scriptText.`);
    }

    return {
      scriptText,
      sceneType: optionalString(rawScene.sceneType),
      visualPurpose: optionalString(rawScene.visualPurpose),
      visualIdea: optionalString(rawScene.visualIdea),
      duration: positiveNumber(rawScene.duration),
      imagePrompt: optionalString(rawScene.imagePrompt),
      status: optionalString(rawScene.status),
    };
  });

  return {
    task: "hook_replacement_patch",
    videoId: typeof parsed.videoId === "string" ? parsed.videoId.trim() : undefined,
    replace: { fromOrder, toOrder },
    scenes,
  };
}

export function hookSceneWarnings(duration: number | null) {
  const warnings: string[] = [];

  if (duration !== null && duration >= 8) {
    warnings.push("8s+");
  } else if (duration !== null && duration > 6.5) {
    warnings.push("> 6.5s");
  } else if (duration !== null && duration > 5.5) {
    warnings.push("> 5.5s");
  }

  return warnings;
}

export function buildHookReplacementPreview({
  rawText,
  currentVideoId,
  selectedFromOrder,
  selectedToOrder,
  currentScenes,
}: {
  rawText: string;
  currentVideoId: string;
  selectedFromOrder: number;
  selectedToOrder: number;
  currentScenes: HookReplacementCurrentScene[];
}): HookReplacementPreview {
  const patch = parseHookReplacementPatch(rawText);
  const globalWarnings: string[] = [];

  if (patch.videoId && patch.videoId !== currentVideoId) {
    globalWarnings.push("Patch videoId does not match the current video.");
  }

  if (
    patch.replace.fromOrder !== selectedFromOrder ||
    patch.replace.toOrder !== selectedToOrder
  ) {
    globalWarnings.push(
      `Patch range ${patch.replace.fromOrder}-${patch.replace.toOrder} differs from the selected hook range ${selectedFromOrder}-${selectedToOrder}.`,
    );
  }

  const removed = currentScenes.filter(
    (scene) =>
      scene.order >= patch.replace.fromOrder && scene.order <= patch.replace.toOrder,
  );
  const oldHookDurationSeconds = removed.reduce(
    (total, scene) => total + Math.max(0, scene.duration ?? 0),
    0,
  );
  const newHookDurationSeconds = patch.scenes.reduce(
    (total, scene) => total + Math.max(0, scene.duration ?? 0),
    0,
  );
  const replacementScenes = patch.scenes.map((scene, index) => {
    const duration = scene.duration ?? null;

    return {
      order: patch.replace.fromOrder + index,
      scriptText: scene.scriptText,
      duration,
      warnings: hookSceneWarnings(duration),
    };
  });
  const originalNarration = normalizeNarrationText(
    removed.map((scene) => scene.scriptText).join(" "),
  );
  const replacementNarration = normalizeNarrationText(
    patch.scenes.map((scene) => scene.scriptText).join(" "),
  );
  const narrationMatches = originalNarration === replacementNarration;
  const warningsRemaining = replacementScenes.filter(
    (scene) => scene.warnings.length > 0,
  ).length;
  const replacementNarrationSet = new Set(
    patch.scenes.map((scene) => normalizeNarrationText(scene.scriptText)),
  );
  const duplicateAfterRangeOrders = currentScenes
    .filter((scene) => scene.order > patch.replace.toOrder)
    .filter((scene) => replacementNarrationSet.has(normalizeNarrationText(scene.scriptText)))
    .map((scene) => scene.order);
  const duplicateAfterRangeWarning =
    duplicateAfterRangeOrders.length > 0
      ? `Replacement scenes duplicate narration that still exists after the patch range: scenes ${duplicateAfterRangeOrders.join(", ")}. Expand the replace.toOrder range or remove the duplicate scenes before rendering.`
      : null;

  if (duplicateAfterRangeWarning) {
    globalWarnings.push(duplicateAfterRangeWarning);
  }

  return {
    patch,
    removedScenes: removed.length,
    insertedScenes: patch.scenes.length,
    oldHookDurationSeconds,
    newHookDurationSeconds,
    oldSceneCount: currentScenes.length,
    newSceneCount: currentScenes.length - removed.length + patch.scenes.length,
    newAverageDurationSeconds:
      patch.scenes.length > 0 ? newHookDurationSeconds / patch.scenes.length : 0,
    warningsRemaining,
    narrationMatches,
    narrationWarning: narrationMatches
      ? null
      : "Replacement hook narration does not exactly match the original hook text.",
    duplicateAfterRangeCount: duplicateAfterRangeOrders.length,
    duplicateAfterRangeOrders,
    duplicateAfterRangeWarning,
    globalWarnings,
    replacementScenes,
  };
}
