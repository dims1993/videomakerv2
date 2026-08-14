import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  inferPodcastImagePromptRole,
  normalizePodcastImagePrompt,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-english-lessons-visual";
import {
  normalizeStoredImageOutputFolder,
  resolveImageOutputFolderAbsolute,
} from "@/lib/image-output-folder";
import {
  resolvePipelineSettings,
} from "@/lib/pipeline-settings";
import { prisma } from "@/lib/prisma";
import { cancelProcess } from "@/lib/process-runs";
import { isSceneRejected } from "@/lib/status";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";

export const imageStatuses = [
  "pending",
  "queued",
  "generating",
  "waiting_manual",
  "needs_retry",
  "downloaded",
  "attached",
  "failed",
] as const;

export type ImageStatus = (typeof imageStatuses)[number];

type PrepareImageBatchOptions = {
  name: string;
  outputFolder?: string | null;
  parallelCount: number;
  delayMs?: number;
  retryCount?: number;
};

type ImageBatchPayloadItem = {
  sceneId: string;
  sceneOrder: number;
  fileName: string;
  imagePrompt: string;
  scriptText: string;
  sceneType: string;
  videoId: string;
  videoTitle: string;
  batchId: string;
};

export class ImageBatchWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageBatchWorkflowError";
  }
}

export class ImageBatchCanceledError extends Error {
  constructor(public batchId: string) {
    super(`Image batch ${batchId} was canceled.`);
    this.name = "ImageBatchCanceledError";
  }
}

const activeImageBatchStatuses = new Set(["running"]);
const canceledImageBatchStatuses = new Set(["canceled", "cancelled"]);

export function isImageBatchCanceledStatus(status: string | null | undefined) {
  return Boolean(status && canceledImageBatchStatuses.has(status));
}

export async function assertImageBatchNotCanceled(batchId: string) {
  const batch = await prisma.imageBatch.findUnique({
    where: { id: batchId },
    select: { status: true },
  });

  if (!batch || isImageBatchCanceledStatus(batch.status)) {
    throw new ImageBatchCanceledError(batchId);
  }
}

function stuckUnattachedSceneWhere(videoId: string) {
  return {
    videoId,
    imageStatus: { in: ["queued", "generating", "waiting_manual", "needs_retry"] },
    imageUrl: null,
    imageLocalPath: null,
  };
}

/**
 * Marks an image batch canceled so the running Google Flow loop exits at the
 * next checkpoint. Safe to call from a Route Handler while Run Batch is still
 * in flight (Server Actions queue behind that long POST and never fire).
 */
export async function requestImageBatchCancel(options: {
  videoId: string;
  batchId: string;
  selectedSceneIds?: string[];
}) {
  const { videoId, batchId } = options;
  const selectedSceneIds = options.selectedSceneIds ?? [];

  const batch = await prisma.imageBatch.findFirst({
    where: { id: batchId, videoId },
    select: { id: true },
  });

  if (!batch) {
    return {
      ok: false as const,
      error: "Batch not found for this video.",
      resetCount: 0,
      selectedOrphanResetCount: 0,
      cancelledProcesses: 0,
    };
  }

  await prisma.imageBatch.update({
    where: { id: batchId },
    data: { status: "canceled" },
  });

  const resetResult = await prisma.scene.updateMany({
    where: {
      imageBatchId: batchId,
      ...stuckUnattachedSceneWhere(videoId),
    },
    data: {
      imageStatus: "pending",
      imageError: null,
      imageBatchId: null,
      imageFileName: null,
    },
  });

  await appendImageBatchLog(
    batchId,
    `Cancel requested: marked batch canceled and reset ${resetResult.count} queued/generating scenes. Flow automation will stop at the next checkpoint.`,
  );

  const runningProcesses = await prisma.processRun.findMany({
    where: {
      videoId,
      type: "asset_generation",
      status: { in: ["pending", "running"] },
    },
    select: { id: true },
  });

  for (const processRun of runningProcesses) {
    await cancelProcess(processRun.id);
  }

  let selectedOrphanResetCount = 0;

  if (resetResult.count === 0 && selectedSceneIds.length > 0) {
    const selectedStuckScenes = await prisma.scene.findMany({
      where: {
        id: { in: selectedSceneIds },
        ...stuckUnattachedSceneWhere(videoId),
      },
      select: { id: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });

    if (selectedStuckScenes.length > 0) {
      const sceneNumbers = selectedStuckScenes
        .map((scene) => scene.sortOrder)
        .join(", ");
      const selectedOrphanReset = await prisma.scene.updateMany({
        where: {
          id: { in: selectedStuckScenes.map((scene) => scene.id) },
          ...stuckUnattachedSceneWhere(videoId),
        },
        data: {
          imageStatus: "pending",
          imageError: null,
          imageBatchId: null,
          imageFileName: null,
        },
      });
      selectedOrphanResetCount = selectedOrphanReset.count;
      await appendImageBatchLog(
        batchId,
        `Canceled batch and reset ${selectedOrphanReset.count} selected stuck scenes from old batches. Scenes: ${sceneNumbers}`,
      );
    }
  }

  return {
    ok: true as const,
    resetCount: resetResult.count,
    selectedOrphanResetCount,
    cancelledProcesses: runningProcesses.length,
  };
}
const generatedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function storageRoot() {
  return path.join(process.cwd(), "storage");
}

function generatedImagesRoot() {
  return path.join(storageRoot(), "generated-images");
}

export function batchStorageDir() {
  return path.join(storageRoot(), "batches");
}

export function generatedImagesDir(videoId: string, videoTitle?: string | null) {
  const folderName = videoTitle?.trim()
    ? `${slugifyFilePart(videoTitle)}-images`
    : videoId;

  return path.join(generatedImagesRoot(), folderName);
}

export function slugifyFilePart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "video";
}

export function sceneImageFileName(videoTitle: string, sortOrder: number) {
  return `${slugifyFilePart(videoTitle)}--scene-${sortOrder
    .toString()
    .padStart(3, "0")}.png`;
}

export function stableSceneImageFileName(sceneId: string, extension = ".png") {
  const normalizedExtension = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  return `scene_${sceneId}${normalizedExtension}`;
}

export function localImageUrl(videoId: string, fileName: string) {
  return `/api/generated-images/${encodeURIComponent(videoId)}/${encodeURIComponent(
    fileName,
  )}`;
}

export async function removePreviousGeneratedImage(
  previousLocalPath: string | null | undefined,
  nextPath: string,
) {
  if (!previousLocalPath?.trim()) {
    return false;
  }

  const previousPath = path.resolve(process.cwd(), previousLocalPath);
  const resolvedNextPath = path.resolve(nextPath);
  const generatedRoot = path.resolve(generatedImagesRoot());

  if (previousPath === resolvedNextPath) {
    return false;
  }

  if (
    previousPath !== generatedRoot &&
    !previousPath.startsWith(`${generatedRoot}${path.sep}`)
  ) {
    return false;
  }

  const activeReferences = await prisma.scene.count({
    where: { imageLocalPath: previousLocalPath },
  });

  if (activeReferences > 1) {
    return false;
  }

  try {
    await unlink(previousPath);
    return true;
  } catch {
    return false;
  }
}

export async function clearGeneratedImagesForVideo(
  videoId: string,
  videoTitle?: string | null,
) {
  const folder = generatedImagesDir(videoId, videoTitle);
  let removed = 0;

  try {
    const entries = await readdir(folder, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();

      if (!generatedImageExtensions.has(extension)) {
        continue;
      }

      try {
        await unlink(path.join(folder, entry.name));
        removed += 1;
      } catch {
        // Keep going; stale files should not block scene replacement.
      }
    }
  } catch {
    return 0;
  }

  return removed;
}

export function parseSelectedSceneIds(value: FormDataEntryValue | null) {
  return (
    value
      ?.toString()
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Persist prompt textareas from the Assets UI before preparing a Flow batch.
 * Form field: promptOverrides = JSON object { [sceneId]: imagePrompt }
 */
export async function applyScenePromptOverridesFromForm(
  formData: FormData,
  sceneIds: string[],
) {
  const raw = formData.get("promptOverrides");
  if (typeof raw !== "string" || !raw.trim()) {
    return 0;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return 0;
  }

  const allowed = new Set(sceneIds);
  const updates: Array<{ id: string; imagePrompt: string }> = [];

  for (const [sceneId, prompt] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!allowed.has(sceneId) || typeof prompt !== "string") {
      continue;
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      continue;
    }

    updates.push({ id: sceneId, imagePrompt: trimmed });
  }

  if (updates.length === 0) {
    return 0;
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.scene.update({
        where: { id: update.id },
        data: { imagePrompt: update.imagePrompt },
      }),
    ),
  );

  return updates.length;
}

export function parsePositiveInt(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value?.toString() ?? "");

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function appendImageBatchLog(batchId: string, message: string) {
  const batch = await prisma.imageBatch.findUnique({
    where: { id: batchId },
    select: { logsJson: true },
  });

  if (!batch) {
    return;
  }

  let logs: Array<{ at: string; message: string }> = [];

  if (batch.logsJson) {
    try {
      logs = JSON.parse(batch.logsJson);
    } catch {
      logs = [];
    }
  }

  logs.push({ at: new Date().toISOString(), message });

  await prisma.imageBatch.update({
    where: { id: batchId },
    data: { logsJson: JSON.stringify(logs.slice(-100), null, 2) },
  });
}

async function appendLatestImageBatchLog(videoId: string, message: string) {
  const latestBatch = await prisma.imageBatch.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (latestBatch) {
    await appendImageBatchLog(latestBatch.id, message);
  }
}

async function recoverOrphanBusyScenes(
  videoId: string,
  scenes: Array<{
    id: string;
    sortOrder: number;
    imageStatus: string;
    imageUrl: string | null;
    imageLocalPath: string | null;
    imageBatchId: string | null;
  }>,
) {
  const busyScenes = scenes.filter((scene) =>
    ["queued", "generating"].includes(scene.imageStatus),
  );
  const batchIds = [
    ...new Set(
      busyScenes
        .map((scene) => scene.imageBatchId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const batches = batchIds.length
    ? await prisma.imageBatch.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, status: true, updatedAt: true },
      })
    : [];
  const batchStatusById = new Map(
    batches.map((batch) => [batch.id, batch.status]),
  );

  // A batch left as "running" after Next.js/worker death still blocks prepare.
  // Treat asset processRuns as live only if recently updated (zombies otherwise).
  const processFreshCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const liveAssetProcess = await prisma.processRun.findFirst({
    where: {
      videoId,
      status: "running",
      updatedAt: { gt: processFreshCutoff },
      OR: [
        { type: "asset_generation" },
        { type: "pipeline_assets" },
      ],
    },
    select: { id: true },
  });
  const orphanBatchIds: string[] = [];
  for (const batch of batches) {
    if (!activeImageBatchStatuses.has(batch.status)) {
      continue;
    }
    if (!liveAssetProcess) {
      orphanBatchIds.push(batch.id);
    }
  }
  if (orphanBatchIds.length > 0) {
    await prisma.imageBatch.updateMany({
      where: { id: { in: orphanBatchIds } },
      data: { status: "canceled" },
    });
    for (const batchId of orphanBatchIds) {
      batchStatusById.set(batchId, "canceled");
      await appendImageBatchLog(
        batchId,
        "Auto-canceled orphan running batch (no live asset worker / stale) before prepare.",
      );
    }
  }

  const recoverableScenes = busyScenes.filter((scene) => {
    if (scene.imageUrl || scene.imageLocalPath) {
      return false;
    }

    if (!scene.imageBatchId) {
      return true;
    }

    const batchStatus = batchStatusById.get(scene.imageBatchId);

    return !batchStatus || !activeImageBatchStatuses.has(batchStatus);
  });

  if (recoverableScenes.length === 0) {
    return new Set<string>();
  }

  await prisma.scene.updateMany({
    where: {
      id: { in: recoverableScenes.map((scene) => scene.id) },
      videoId,
      imageUrl: null,
      imageLocalPath: null,
      imageStatus: { in: ["queued", "generating"] },
    },
    data: {
      imageStatus: "pending",
      imageError: null,
      imageBatchId: null,
      imageFileName: null,
    },
  });

  const sceneNumbers = recoverableScenes
    .map((scene) => scene.sortOrder)
    .join(", ");

  await appendLatestImageBatchLog(
    videoId,
    `Auto-reset stale queued/generating scenes before prepare: ${sceneNumbers}`,
  );

  return new Set(recoverableScenes.map((scene) => scene.id));
}

/**
 * Pipeline Resume / Assets step: unlock scenes left in queued|generating after a
 * crashed or stopped Flow batch. Cancels active image batches for the video and
 * returns those scenes to pending so prepareImageBatchPayload can run again.
 */
export async function forceUnlockBusyImageScenes(videoId: string) {
  const activeBatches = await prisma.imageBatch.findMany({
    where: {
      videoId,
      status: { in: [...activeImageBatchStatuses] },
    },
    select: { id: true },
  });

  let canceledBatches = 0;
  if (activeBatches.length > 0) {
    const batchIds = activeBatches.map((batch) => batch.id);
    const canceled = await prisma.imageBatch.updateMany({
      where: { id: { in: batchIds } },
      data: { status: "canceled" },
    });
    canceledBatches = canceled.count;
    for (const batchId of batchIds) {
      await appendImageBatchLog(
        batchId,
        "Canceled by pipeline resume / assets unlock (stuck queued|generating scenes).",
      );
    }
  }

  // Stale asset process runs block orphan recovery and confuse the UI.
  const staleRuns = await prisma.processRun.findMany({
    where: {
      videoId,
      status: "running",
      OR: [{ type: "asset_generation" }, { type: "pipeline_assets" }],
    },
    select: { id: true },
  });
  for (const run of staleRuns) {
    await cancelProcess(run.id).catch(() => undefined);
  }

  const reset = await prisma.scene.updateMany({
    where: {
      videoId,
      imageStatus: { in: ["queued", "generating"] },
      imageUrl: null,
      imageLocalPath: null,
    },
    data: {
      imageStatus: "pending",
      imageError: null,
      imageBatchId: null,
      imageFileName: null,
    },
  });

  if (reset.count > 0 || canceledBatches > 0) {
    await appendLatestImageBatchLog(
      videoId,
      `Pipeline unlock: reset ${reset.count} stuck queued/generating scene(s), canceled ${canceledBatches} batch(es), cleared ${staleRuns.length} asset process run(s).`,
    );
  }

  return {
    resetCount: reset.count,
    canceledBatches,
    canceledProcessRuns: staleRuns.length,
  };
}

export async function prepareImageBatchPayload(
  videoId: string,
  sceneIds: string[],
  options: PrepareImageBatchOptions,
) {
  if (sceneIds.length === 0) {
    throw new Error("Select at least one scene.");
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        where: { id: { in: sceneIds } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  const recoveredBusySceneIds = await recoverOrphanBusyScenes(
    videoId,
    video.scenes,
  );
  const activeScenes = video.scenes.filter(
    (scene) => !isSceneRejected(scene.status),
  );
  const rejectedSelected = video.scenes.filter((scene) =>
    isSceneRejected(scene.status),
  );
  const busyScenes = activeScenes.filter(
    (scene) =>
      ["queued", "generating"].includes(scene.imageStatus) &&
      !recoveredBusySceneIds.has(scene.id),
  );
  const scenes = activeScenes.filter((scene) => scene.imagePrompt?.trim());

  if (scenes.length === 0) {
    throw new Error(
      rejectedSelected.length > 0
        ? "Selected scenes are Rejected (or lack image prompts). Change Status away from Rejected to include them."
        : "Selected scenes do not have image prompts.",
    );
  }

  if (busyScenes.length > 0) {
    const sceneNumbers = busyScenes.map((scene) => scene.sortOrder).join(", ");

    throw new ImageBatchWorkflowError(
      `Some selected scenes are already queued or generating. Cancel the current batch, reset stuck scenes, or select different scenes. Scenes already queued/generating: ${sceneNumbers}. Use Force reset selected scenes to unlock them.`,
    );
  }

  const bibleOneYear = isBibleOneYearCategory(video.topicCategory);
  const podcastEnglishLessons =
    video.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;
  const podcastEpisodeContext = [
    video.title,
    video.topicCategory,
    video.script?.slice(0, 4000) ?? "",
    video.ideaJson?.slice(0, 2000) ?? "",
  ].join("\n");
  const settings = await resolvePipelineSettings(videoId);
  const preferredFolder =
    normalizeStoredImageOutputFolder(options.outputFolder) ??
    settings.assets.imageOutputFolder;
  const outputFolder = resolveImageOutputFolderAbsolute(
    preferredFolder,
    videoId,
    video.title,
  );
  // Prefer repo-relative in DB when possible (matches Visual Plan / Assets UI).
  const outputFolderStored =
    normalizeStoredImageOutputFolder(preferredFolder) ??
    normalizeStoredImageOutputFolder(outputFolder) ??
    outputFolder;

  await mkdir(batchStorageDir(), { recursive: true });
  await mkdir(outputFolder, { recursive: true });

  // Bible in One Year: imagePrompt is free-form. Store/send exactly as written.
  // Podcast: rebuild with fixed Emma/Leo/studio locks + hard no-text negative.
  const queueableScenes = scenes.map((scene) => {
    if (!podcastEnglishLessons) {
      return scene;
    }
    const imagePrompt = normalizePodcastImagePrompt({
      role: inferPodcastImagePromptRole({
        visualIdea: scene.visualIdea,
        scriptText: scene.scriptText,
        sceneType: scene.sceneType,
      }),
      imagePrompt: scene.imagePrompt,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
      scriptText: scene.scriptText,
      episodeContext: podcastEpisodeContext,
      title: video.title,
      topicCategory: video.topicCategory,
    });
    return { ...scene, imagePrompt };
  });

  const batch = await prisma.imageBatch.create({
    data: {
      videoId,
      name: options.name.trim() || `Image batch ${new Date().toISOString()}`,
      status: "prepared",
      parallelCount: options.parallelCount,
      outputFolder: outputFolderStored,
      sceneIdsJson: JSON.stringify(queueableScenes.map((scene) => scene.id)),
      sceneOrdersJson: JSON.stringify(
        queueableScenes.map((scene) => scene.sortOrder),
      ),
      expectedCount: queueableScenes.length,
      logsJson: JSON.stringify(
        [
          { at: new Date().toISOString(), message: "batch created" },
          ...(bibleOneYear
            ? [
                {
                  at: new Date().toISOString(),
                  message:
                    "bible-in-one-year: sending stored imagePrompt unchanged (free-form, no prompt validation gate)",
                },
              ]
            : []),
          ...(podcastEnglishLessons
            ? [
                {
                  at: new Date().toISOString(),
                  message:
                    "podcast-english-lessons: normalized imagePrompts with fixed character/studio locks and hard no-visible-text",
                },
              ]
            : []),
          ...queueableScenes.slice(0, 50).map((scene) => ({
            at: new Date().toISOString(),
            message: `scene queued: ${scene.sortOrder}`,
          })),
        ],
        null,
        2,
      ),
    },
  });

  const items: ImageBatchPayloadItem[] = queueableScenes.map((scene) => {
    return {
      sceneId: scene.id,
      sceneOrder: scene.sortOrder,
      fileName: stableSceneImageFileName(scene.id),
      imagePrompt: scene.imagePrompt ?? "",
      scriptText: scene.scriptText,
      sceneType: scene.sceneType,
      videoId: video.id,
      videoTitle: video.title,
      batchId: batch.id,
    };
  });

  const payload = {
    batchId: batch.id,
    videoId: video.id,
    videoTitle: video.title,
    outputFolder,
    parallelCount: options.parallelCount,
    delayMs: options.delayMs ?? 0,
    retryCount: options.retryCount ?? 0,
    items,
  };
  const payloadPath = path.join(batchStorageDir(), `${batch.id}.json`);
  const scenesWithExistingImages = queueableScenes.filter(
    (scene) => scene.imageUrl || scene.imageLocalPath,
  );

  await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf8");

  await prisma.$transaction([
    prisma.imageBatch.update({
      where: { id: batch.id },
      data: { payloadPath },
    }),
    ...items.map((item) =>
      prisma.scene.update({
        where: { id: item.sceneId },
        data: {
          imageStatus: "queued",
          imageBatchId: batch.id,
          imageUrl: null,
          imageLocalPath: null,
          imageFileName: item.fileName,
          imageError: null,
          status: "planned",
          ...(podcastEnglishLessons
            ? { imagePrompt: item.imagePrompt }
            : {}),
        },
      }),
    ),
  ]);

  await appendImageBatchLog(batch.id, `queued ${items.length} scenes`);
  if (scenesWithExistingImages.length > 0) {
    await appendImageBatchLog(
      batch.id,
      `cleared previous image references for ${scenesWithExistingImages.length} scene(s) before regeneration`,
    );
  }

  return { batchId: batch.id, payloadPath, items };
}

export async function getLatestImageBatch(videoId: string) {
  return prisma.imageBatch.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });
}
