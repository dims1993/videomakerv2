import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { PodcastVisualPlanSkeletonScene } from "@/lib/visual-plan-skeleton";
import { VISUAL_PLAN_FILL_CHUNK_SIZE } from "@/lib/visual-plan-skeleton";

export const VISUAL_PLAN_HYBRID_CHECKPOINT_VERSION = 1 as const;
export const VISUAL_PLAN_SECTION_CHECKPOINT_VERSION = 2 as const;

export type VisualPlanHybridCheckpoint = {
  version: typeof VISUAL_PLAN_HYBRID_CHECKPOINT_VERSION;
  mode?: "fill";
  videoId: string;
  scriptHash: string;
  channelKey: string;
  chunkSize: number;
  scenes: PodcastVisualPlanSkeletonScene[];
  updatedAt: string;
};

export type VisualPlanSectionScene = {
  order: number;
  scriptText: string;
  sceneType: "avatar" | "insert" | "space";
  visualPurpose: string;
  visualIdea: string;
  duration: number;
  imagePrompt: string;
  status: "planned";
  pauseAfterMs?: number | null;
};

export type VisualPlanSectionCheckpoint = {
  version: typeof VISUAL_PLAN_SECTION_CHECKPOINT_VERSION;
  mode: "section_generate";
  videoId: string;
  scriptHash: string;
  channelKey: string;
  sectionIds: string[];
  completedSectionIds: string[];
  scenes: VisualPlanSectionScene[];
  updatedAt: string;
};

export type VisualPlanAnyCheckpoint =
  | VisualPlanHybridCheckpoint
  | VisualPlanSectionCheckpoint;

export type VisualPlanHybridCheckpointSummary = {
  filled: number;
  total: number;
  updatedAt: string;
  path: string;
  mode: "fill" | "section_generate";
  unit: "scenes" | "sections";
  /** True when a checkpoint file exists but the script hash no longer matches. */
  stale?: boolean;
};

function checkpointDir() {
  return path.join(process.cwd(), "data", "visual-plan-checkpoints");
}

export function visualPlanHybridCheckpointPath(videoId: string) {
  const safeId = videoId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(checkpointDir(), `${safeId}.json`);
}

export function hashVisualPlanScript(script: string) {
  return createHash("sha256").update(script).digest("hex");
}

export function countFilledVisualPlanScenes(
  scenes: PodcastVisualPlanSkeletonScene[],
) {
  return scenes.filter((scene) => scene.visualsFilled).length;
}

function isCompatibleSkeleton(
  skeleton: PodcastVisualPlanSkeletonScene[],
  checkpointScenes: PodcastVisualPlanSkeletonScene[],
) {
  if (skeleton.length !== checkpointScenes.length) {
    return false;
  }
  return skeleton.every((scene, index) => {
    const saved = checkpointScenes[index];
    return (
      saved != null &&
      saved.order === scene.order &&
      saved.speaker === scene.speaker &&
      saved.scriptText === scene.scriptText
    );
  });
}

/**
 * Re-apply previously filled visual fields onto a freshly built skeleton.
 * Returns the skeleton unchanged when the script no longer matches.
 */
export function mergeVisualPlanHybridCheckpoint(options: {
  skeleton: PodcastVisualPlanSkeletonScene[];
  checkpoint: VisualPlanAnyCheckpoint | null;
  scriptHash: string;
}): {
  scenes: PodcastVisualPlanSkeletonScene[];
  resumed: boolean;
  filledCount: number;
} {
  const { skeleton, checkpoint, scriptHash } = options;
  if (
    !checkpoint ||
    checkpoint.version !== VISUAL_PLAN_HYBRID_CHECKPOINT_VERSION ||
    checkpoint.scriptHash !== scriptHash ||
    !isCompatibleSkeleton(skeleton, checkpoint.scenes)
  ) {
    return {
      scenes: skeleton,
      resumed: false,
      filledCount: 0,
    };
  }

  const filledByOrder = new Map(
    checkpoint.scenes
      .filter((scene) => scene.visualsFilled)
      .map((scene) => [scene.order, scene] as const),
  );

  const scenes = skeleton.map((scene) => {
    const filled = filledByOrder.get(scene.order);
    if (!filled) {
      return scene;
    }
    return {
      ...scene,
      sceneType: filled.sceneType,
      visualPurpose: filled.visualPurpose,
      visualIdea: filled.visualIdea,
      imagePrompt: filled.imagePrompt,
      duration: filled.duration,
      visualsFilled: true,
    };
  });

  return {
    scenes,
    resumed: countFilledVisualPlanScenes(scenes) > 0,
    filledCount: countFilledVisualPlanScenes(scenes),
  };
}

export function chunkIsAlreadyFilled(
  chunk: PodcastVisualPlanSkeletonScene[],
  working: PodcastVisualPlanSkeletonScene[],
) {
  if (chunk.length === 0) {
    return true;
  }
  const byOrder = new Map(working.map((scene) => [scene.order, scene]));
  return chunk.every((scene) => byOrder.get(scene.order)?.visualsFilled === true);
}

export async function loadVisualPlanHybridCheckpoint(
  videoId: string,
): Promise<VisualPlanAnyCheckpoint | null> {
  const filePath = visualPlanHybridCheckpointPath(videoId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as VisualPlanAnyCheckpoint;
    if (!parsed || parsed.videoId !== videoId) {
      return null;
    }
    if (
      parsed.version === VISUAL_PLAN_HYBRID_CHECKPOINT_VERSION &&
      Array.isArray(parsed.scenes)
    ) {
      return parsed;
    }
    if (
      parsed.version === VISUAL_PLAN_SECTION_CHECKPOINT_VERSION &&
      parsed.mode === "section_generate" &&
      Array.isArray(parsed.scenes) &&
      Array.isArray(parsed.sectionIds) &&
      Array.isArray(parsed.completedSectionIds)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveVisualPlanHybridCheckpoint(options: {
  videoId: string;
  scriptHash: string;
  channelKey: string;
  scenes: PodcastVisualPlanSkeletonScene[];
  chunkSize?: number;
}): Promise<string> {
  const dir = checkpointDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = visualPlanHybridCheckpointPath(options.videoId);
  const payload: VisualPlanHybridCheckpoint = {
    version: VISUAL_PLAN_HYBRID_CHECKPOINT_VERSION,
    mode: "fill",
    videoId: options.videoId,
    scriptHash: options.scriptHash,
    channelKey: options.channelKey,
    chunkSize: options.chunkSize ?? VISUAL_PLAN_FILL_CHUNK_SIZE,
    scenes: options.scenes,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export async function saveVisualPlanSectionCheckpoint(options: {
  videoId: string;
  scriptHash: string;
  channelKey: string;
  sectionIds: string[];
  completedSectionIds: string[];
  scenes: VisualPlanSectionScene[];
}): Promise<string> {
  const dir = checkpointDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = visualPlanHybridCheckpointPath(options.videoId);
  const payload: VisualPlanSectionCheckpoint = {
    version: VISUAL_PLAN_SECTION_CHECKPOINT_VERSION,
    mode: "section_generate",
    videoId: options.videoId,
    scriptHash: options.scriptHash,
    channelKey: options.channelKey,
    sectionIds: options.sectionIds,
    completedSectionIds: options.completedSectionIds,
    scenes: options.scenes,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function mergeVisualPlanSectionCheckpoint(options: {
  sectionIds: string[];
  checkpoint: VisualPlanAnyCheckpoint | null;
  scriptHash: string;
}): {
  completedSectionIds: string[];
  scenes: VisualPlanSectionScene[];
  resumed: boolean;
} {
  const { sectionIds, checkpoint, scriptHash } = options;
  if (
    !checkpoint ||
    checkpoint.version !== VISUAL_PLAN_SECTION_CHECKPOINT_VERSION ||
    checkpoint.mode !== "section_generate" ||
    checkpoint.scriptHash !== scriptHash
  ) {
    return { completedSectionIds: [], scenes: [], resumed: false };
  }

  const allowed = new Set(sectionIds);
  const completedSectionIds = checkpoint.completedSectionIds.filter((id) =>
    allowed.has(id),
  );
  // If section list changed, only keep scenes when every completed id is still valid
  // and order of sectionIds prefix matches.
  const checkpointPrefix = checkpoint.sectionIds.slice(
    0,
    completedSectionIds.length,
  );
  const currentPrefix = sectionIds.slice(0, completedSectionIds.length);
  const prefixMatches =
    checkpointPrefix.length === currentPrefix.length &&
    checkpointPrefix.every((id, index) => id === currentPrefix[index]);

  if (!prefixMatches) {
    return { completedSectionIds: [], scenes: [], resumed: false };
  }

  return {
    completedSectionIds,
    scenes: checkpoint.scenes,
    resumed: completedSectionIds.length > 0,
  };
}

export async function clearVisualPlanHybridCheckpoint(videoId: string) {
  const filePath = visualPlanHybridCheckpointPath(videoId);
  await fs.unlink(filePath).catch(() => undefined);
}

export async function getVisualPlanHybridCheckpointSummary(options: {
  videoId: string;
  script: string;
}): Promise<VisualPlanHybridCheckpointSummary | null> {
  const checkpoint = await loadVisualPlanHybridCheckpoint(options.videoId);
  if (!checkpoint) {
    return null;
  }
  const scriptHash = hashVisualPlanScript(options.script);
  const stale = checkpoint.scriptHash !== scriptHash;

  if (checkpoint.version === VISUAL_PLAN_SECTION_CHECKPOINT_VERSION) {
    return {
      filled: checkpoint.completedSectionIds.length,
      total: checkpoint.sectionIds.length,
      updatedAt: checkpoint.updatedAt,
      path: visualPlanHybridCheckpointPath(options.videoId),
      mode: "section_generate",
      unit: "sections",
      stale,
    };
  }

  return {
    filled: countFilledVisualPlanScenes(checkpoint.scenes),
    total: checkpoint.scenes.length,
    updatedAt: checkpoint.updatedAt,
    path: visualPlanHybridCheckpointPath(options.videoId),
    mode: "fill",
    unit: "scenes",
    stale,
  };
}
