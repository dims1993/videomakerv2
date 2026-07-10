import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";

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

const activeImageBatchStatuses = new Set(["running"]);
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
        select: { id: true, status: true },
      })
    : [];
  const batchStatusById = new Map(
    batches.map((batch) => [batch.id, batch.status]),
  );
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
  const busyScenes = video.scenes.filter(
    (scene) =>
      ["queued", "generating"].includes(scene.imageStatus) &&
      !recoveredBusySceneIds.has(scene.id),
  );
  const scenes = video.scenes.filter((scene) => scene.imagePrompt?.trim());

  if (scenes.length === 0) {
    throw new Error("Selected scenes do not have image prompts.");
  }

  if (busyScenes.length > 0) {
    const sceneNumbers = busyScenes.map((scene) => scene.sortOrder).join(", ");

    throw new ImageBatchWorkflowError(
      `Some selected scenes are already queued or generating. Cancel the current batch, reset stuck scenes, or select different scenes. Scenes already queued/generating: ${sceneNumbers}. Use Force reset selected scenes to unlock them.`,
    );
  }

  const outputFolder =
    options.outputFolder?.trim() || generatedImagesDir(videoId, video.title);

  await mkdir(batchStorageDir(), { recursive: true });
  await mkdir(outputFolder, { recursive: true });

  const batch = await prisma.imageBatch.create({
    data: {
      videoId,
      name: options.name.trim() || `Image batch ${new Date().toISOString()}`,
      status: "prepared",
      parallelCount: options.parallelCount,
      outputFolder,
      sceneIdsJson: JSON.stringify(scenes.map((scene) => scene.id)),
      sceneOrdersJson: JSON.stringify(scenes.map((scene) => scene.sortOrder)),
      expectedCount: scenes.length,
      logsJson: JSON.stringify(
        [
          { at: new Date().toISOString(), message: "batch created" },
          ...scenes.slice(0, 50).map((scene) => ({
            at: new Date().toISOString(),
            message: `scene queued: ${scene.sortOrder}`,
          })),
        ],
        null,
        2,
      ),
    },
  });

  const items: ImageBatchPayloadItem[] = scenes.map((scene) => ({
    sceneId: scene.id,
    sceneOrder: scene.sortOrder,
    fileName: stableSceneImageFileName(scene.id),
    imagePrompt: scene.imagePrompt?.trim() ?? "",
    scriptText: scene.scriptText,
    sceneType: scene.sceneType,
    videoId: video.id,
    videoTitle: video.title,
    batchId: batch.id,
  }));

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
          imageFileName: item.fileName,
          imageError: null,
        },
      }),
    ),
  ]);

  await appendImageBatchLog(batch.id, `queued ${items.length} scenes`);

  return { batchId: batch.id, payloadPath, items };
}

export async function getLatestImageBatch(videoId: string) {
  return prisma.imageBatch.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });
}
