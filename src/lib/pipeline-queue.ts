import { prisma } from "@/lib/prisma";
import {
  resolvePipelineSettings,
  seedVideoPipelineSettingsIfMissing,
} from "@/lib/pipeline-settings";
import { isSceneIncludedInPipeline } from "@/lib/status";

export const PIPELINE_STEPS = [
  "script",
  "visual_plan",
  "assets",
  "voiceover",
  "subtitles",
  "render",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_ITEM_STATUSES = [
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type PipelineItemStatus = (typeof PIPELINE_ITEM_STATUSES)[number];

export function isPipelineStep(value: string): value is PipelineStep {
  return (PIPELINE_STEPS as readonly string[]).includes(value);
}

export function nextPipelineStep(
  step: PipelineStep,
): PipelineStep | "done" {
  const index = PIPELINE_STEPS.indexOf(step);
  if (index < 0 || index >= PIPELINE_STEPS.length - 1) {
    return "done";
  }
  return PIPELINE_STEPS[index + 1]!;
}

export function pipelineStepLabel(step: string) {
  switch (step) {
    case "script":
      return "Script";
    case "visual_plan":
      return "Visual Plan";
    case "assets":
      return "Assets";
    case "voiceover":
      return "Voiceover";
    case "subtitles":
      return "Subtitles";
    case "render":
      return "Render";
    case "done":
      return "Done";
    default:
      return step;
  }
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function sceneHasImageAsset(scene: {
  imageLocalPath?: string | null;
  imageUrl?: string | null;
  clipLocalPath?: string | null;
}) {
  return (
    hasText(scene.imageLocalPath) ||
    hasText(scene.imageUrl) ||
    hasText(scene.clipLocalPath)
  );
}

/**
 * Infer the first incomplete pipeline step from video progress.
 * Used when enqueueing so manually completed work (e.g. pasted script)
 * is not re-run — queue continues from visual_plan, assets, etc.
 */
export function inferPipelineStartStep(input: {
  script: string | null | undefined;
  scenes: Array<{
    status?: string | null;
    imagePrompt?: string | null;
    imageLocalPath?: string | null;
    imageUrl?: string | null;
    clipLocalPath?: string | null;
  }>;
  voiceoverStatus?: string | null;
  subtitleStatus?: string | null;
  renderDraftStatus?: string | null;
  generateSubtitles?: boolean;
}): PipelineStep | "done" {
  if (!hasText(input.script)) {
    return "script";
  }

  const included = input.scenes.filter((scene) =>
    isSceneIncludedInPipeline(scene.status),
  );

  if (included.length === 0) {
    return "visual_plan";
  }

  const allHavePrompts = included.every((scene) => hasText(scene.imagePrompt));
  if (!allHavePrompts) {
    return "visual_plan";
  }

  const needingAssets = included.filter(
    (scene) => hasText(scene.imagePrompt) && !sceneHasImageAsset(scene),
  );
  if (needingAssets.length > 0) {
    return "assets";
  }

  if ((input.voiceoverStatus ?? "").trim() !== "ready") {
    return "voiceover";
  }

  const generateSubtitles = input.generateSubtitles !== false;
  if (generateSubtitles && (input.subtitleStatus ?? "").trim() !== "ready") {
    return "subtitles";
  }

  if ((input.renderDraftStatus ?? "").trim() !== "rendered") {
    return "render";
  }

  return "done";
}

export async function resolveEnqueuePipelineStep(
  videoId: string,
): Promise<PipelineStep | "done"> {
  await seedVideoPipelineSettingsIfMissing(videoId);
  const settings = await resolvePipelineSettings(videoId);
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      script: true,
      voiceoverStatus: true,
      subtitleStatus: true,
      renderDraftStatus: true,
      scenes: {
        select: {
          status: true,
          imagePrompt: true,
          imageLocalPath: true,
          imageUrl: true,
          clipLocalPath: true,
        },
      },
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  return inferPipelineStartStep({
    script: video.script,
    scenes: video.scenes,
    voiceoverStatus: video.voiceoverStatus,
    subtitleStatus: video.subtitleStatus,
    renderDraftStatus: video.renderDraftStatus,
    generateSubtitles: settings.voiceover.generateSubtitles,
  });
}

export async function getNextSortOrder() {
  const latest = await prisma.pipelineQueueItem.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (latest?.sortOrder ?? 0) + 1;
}

export async function findActiveQueueItemForVideo(videoId: string) {
  return prisma.pipelineQueueItem.findFirst({
    where: {
      videoId,
      status: { in: ["queued", "running", "paused"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function enqueuePipelineVideo({
  videoId,
  channelKey,
}: {
  videoId: string;
  channelKey: string;
}) {
  const existing = await findActiveQueueItemForVideo(videoId);
  const startStep = await resolveEnqueuePipelineStep(videoId);

  if (existing) {
    // If the video progressed manually since enqueue (e.g. script pasted),
    // advance the queue pointer past completed steps.
    if (
      startStep !== "done" &&
      ["queued", "paused"].includes(existing.status) &&
      isPipelineStep(existing.currentStep)
    ) {
      const currentIndex = PIPELINE_STEPS.indexOf(existing.currentStep);
      const nextIndex = PIPELINE_STEPS.indexOf(startStep);
      if (nextIndex > currentIndex) {
        const updated = await prisma.pipelineQueueItem.update({
          where: { id: existing.id },
          data: {
            currentStep: startStep,
            status: "queued",
            enabled: true,
            errorMessage: null,
            finishedAt: null,
          },
        });
        return { item: updated, created: false as const, advanced: true as const };
      }
    }
    return { item: existing, created: false as const };
  }

  const sortOrder = await getNextSortOrder();
  await seedVideoPipelineSettingsIfMissing(videoId);

  if (startStep === "done") {
    const item = await prisma.pipelineQueueItem.create({
      data: {
        videoId,
        channelKey,
        enabled: false,
        status: "succeeded",
        currentStep: "done",
        sortOrder,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
    return { item, created: true as const, alreadyComplete: true as const };
  }

  const item = await prisma.pipelineQueueItem.create({
    data: {
      videoId,
      channelKey,
      enabled: true,
      status: "queued",
      currentStep: startStep,
      sortOrder,
    },
  });

  return { item, created: true as const, alreadyComplete: false as const };
}

/**
 * Only auto-start `queued` items.
 * `paused` means a step failed and must wait for an explicit Resume
 * (which sets status back to `queued`) — otherwise the worker infinite-retries.
 */
export async function pickNextQueueItem() {
  return prisma.pipelineQueueItem.findFirst({
    where: {
      enabled: true,
      status: "queued",
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      video: {
        select: {
          id: true,
          title: true,
          channelKey: true,
        },
      },
    },
  });
}

/**
 * Force a queue item back to an earlier (or same) pipeline step.
 * For script / visual_plan, clears scenes + visual-plan checkpoints so the
 * step can actually re-run instead of being skipped by infer logic.
 * For assets, clears image paths/status so Flow regenerates instead of
 * treating existing stills as complete and jumping to voiceover.
 */
export async function restartPipelineQueueItemFromStep({
  itemId,
  step,
}: {
  itemId: string;
  step: PipelineStep;
}) {
  const item = await prisma.pipelineQueueItem.findUnique({
    where: { id: itemId },
    include: {
      video: {
        select: { id: true, title: true },
      },
    },
  });
  if (!item) {
    throw new Error("Queue item not found.");
  }
  if (item.status === "running") {
    throw new Error("Cannot restart a running queue item. Stop the worker first.");
  }

  const clearScenes = step === "script" || step === "visual_plan";
  const clearImageAssets = step === "assets";
  let deletedScenes = 0;
  let clearedImageScenes = 0;

  if (clearScenes) {
    const deleted = await prisma.scene.deleteMany({
      where: { videoId: item.videoId },
    });
    deletedScenes = deleted.count;

    const { clearVisualPlanHybridCheckpoint } = await import(
      "@/lib/visual-plan-checkpoint"
    );
    await clearVisualPlanHybridCheckpoint(item.videoId).catch(() => undefined);

    if (step === "script") {
      const { clearScriptWriterCheckpoint } = await import(
        "@/lib/script-writer-checkpoint"
      );
      await clearScriptWriterCheckpoint(item.videoId).catch(() => undefined);
    }

    const { clearGeneratedImagesForVideo } = await import("@/lib/image-batches");
    await clearGeneratedImagesForVideo(item.videoId, item.video.title).catch(
      () => 0,
    );
  } else if (clearImageAssets) {
    // Assets only runs for scenes without a local/url/clip asset. Restarting
    // from assets must invalidate existing stills or the worker reports
    // "Assets already complete", quits Chrome, and advances to voiceover.
    const updatedScenes = await prisma.scene.updateMany({
      where: {
        videoId: item.videoId,
        status: { not: "rejected" },
      },
      data: {
        imageLocalPath: null,
        imageUrl: null,
        imageFileName: null,
        imageError: null,
        imageStatus: "pending",
        imageBatchId: null,
        status: "asset_needed",
      },
    });
    clearedImageScenes = updatedScenes.count;

    const { clearGeneratedImagesForVideo } = await import("@/lib/image-batches");
    await clearGeneratedImagesForVideo(item.videoId, item.video.title).catch(
      () => 0,
    );
  }

  const videoReset: {
    voiceoverStatus?: string;
    subtitleStatus?: string;
    renderDraftStatus?: string;
    voiceoverAudioPath?: null;
    voiceoverFileName?: null;
    voiceoverDurationSec?: null;
    rawSubtitleText?: null;
    formattedSubtitleText?: null;
    styledSubtitleAss?: null;
  } = {};

  if (PIPELINE_STEPS.indexOf(step) <= PIPELINE_STEPS.indexOf("voiceover")) {
    videoReset.voiceoverStatus = "pending";
    videoReset.voiceoverAudioPath = null;
    videoReset.voiceoverFileName = null;
    videoReset.voiceoverDurationSec = null;
  }
  if (PIPELINE_STEPS.indexOf(step) <= PIPELINE_STEPS.indexOf("subtitles")) {
    videoReset.subtitleStatus = "pending";
    videoReset.rawSubtitleText = null;
    videoReset.formattedSubtitleText = null;
    videoReset.styledSubtitleAss = null;
  }
  if (PIPELINE_STEPS.indexOf(step) <= PIPELINE_STEPS.indexOf("render")) {
    videoReset.renderDraftStatus = "pending";
  }

  if (Object.keys(videoReset).length > 0) {
    await prisma.video.update({
      where: { id: item.videoId },
      data: videoReset,
    });
  }

  const updated = await prisma.pipelineQueueItem.update({
    where: { id: itemId },
    data: {
      currentStep: step,
      status: "queued",
      enabled: true,
      errorMessage: null,
      finishedAt: null,
    },
  });

  return {
    item: updated,
    deletedScenes,
    clearedScenes: clearScenes,
    clearedImageScenes,
  };
}

export async function listPipelineQueueItems() {
  return prisma.pipelineQueueItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      video: {
        select: {
          id: true,
          title: true,
          channelKey: true,
          status: true,
        },
      },
    },
  });
}
