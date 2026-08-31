"use server";

import { mkdir } from "node:fs/promises";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getChannelProfile } from "@/lib/channels-server";
import { generatedImagesDir } from "@/lib/generated-images-path";
import {
  isPipelineWorkerRunning,
} from "@/lib/pipeline-cancel";
import {
  enqueuePipelineVideo,
  isPipelineStep,
  pipelineStepLabel,
  restartPipelineQueueItemFromStep,
  type PipelineStep,
} from "@/lib/pipeline-queue";
import {
  getChannelPipelineDefaults,
  parsePipelineSettings,
  resolvePipelineSettings,
  saveChannelPipelineDefaults,
  saveVideoPipelineSettings,
  type PipelineSettings,
} from "@/lib/pipeline-settings";
import { normalizeVoiceoverSectionVoices } from "@/lib/voiceover-section-voices";
import {
  runPipelineWorkerLoop,
} from "@/lib/pipeline-worker";
import { prisma } from "@/lib/prisma";
import { getComputedVideoStatus } from "@/lib/status";

function topicIdeaToIdeaJson(topicIdea: {
  title: string;
  topic: string;
  category: string | null;
  angle: string | null;
  uniqueMechanism: string | null;
  scriptureAnchor?: string | null;
  centralQuestion?: string | null;
  commonMisunderstanding?: string | null;
  spiritualTurn?: string | null;
  trigger: string | null;
  promise: string | null;
  visualHook: string | null;
  thumbnailIdea: string | null;
  repetitionRisk: string | null;
  notes: string | null;
}) {
  return {
    title: topicIdea.title,
    topic: topicIdea.topic,
    category: topicIdea.category,
    angle: topicIdea.angle,
    uniqueMechanism: topicIdea.uniqueMechanism,
    scriptureAnchor: topicIdea.scriptureAnchor ?? null,
    centralQuestion: topicIdea.centralQuestion ?? null,
    commonMisunderstanding: topicIdea.commonMisunderstanding ?? null,
    spiritualTurn: topicIdea.spiritualTurn ?? null,
    trigger: topicIdea.trigger,
    promise: topicIdea.promise,
    visualHook: topicIdea.visualHook,
    thumbnailIdea: topicIdea.thumbnailIdea,
    repetitionRisk: topicIdea.repetitionRisk,
    notes: topicIdea.notes,
  };
}

async function ensureVideoFromTopicIdea(topicIdeaId: string) {
  const topicIdea = await prisma.topicIdea.findUnique({
    where: { id: topicIdeaId },
  });

  if (!topicIdea) {
    throw new Error("Topic idea not found.");
  }

  const channel = getChannelProfile(topicIdea.channelKey);
  if (!channel.topicSystem?.enabled) {
    throw new Error(`Topic queue is not enabled for ${channel.name}.`);
  }

  if (topicIdea.createdVideoId) {
    const existing = await prisma.video.findUnique({
      where: { id: topicIdea.createdVideoId },
      select: { id: true, channelKey: true, title: true },
    });
    if (existing) {
      return { video: existing, topicIdea, created: false as const };
    }
  }

  const ideaJson = JSON.stringify(topicIdeaToIdeaJson(topicIdea), null, 2);
  const newVideo = await prisma.$transaction(async (tx) => {
    const created = await tx.video.create({
      data: {
        channelKey: channel.key,
        topic: topicIdea.topic,
        topicCategory: topicIdea.category,
        title: topicIdea.title,
        ideaJson,
        status: getComputedVideoStatus({
          ideaJson,
          script: null,
          metadataJson: null,
          scenes: [],
        }),
      },
    });

    await tx.topicIdea.update({
      where: { id: topicIdeaId },
      data: {
        status: "selected",
        createdVideoId: created.id,
      },
    });

    return created;
  });

  await mkdir(generatedImagesDir(newVideo.id, newVideo.title), {
    recursive: true,
  });

  return {
    video: {
      id: newVideo.id,
      channelKey: newVideo.channelKey,
      title: newVideo.title,
    },
    topicIdea,
    created: true as const,
  };
}

export async function addTopicIdeaToPipelineQueue(topicIdeaId: string) {
  const { video, created } = await ensureVideoFromTopicIdea(topicIdeaId);
  const result = await enqueuePipelineVideo({
    videoId: video.id,
    channelKey: video.channelKey,
  });
  const { item, created: enqueued } = result;
  const startStep = item.currentStep;

  revalidatePath("/");
  revalidatePath("/videos/new");
  revalidatePath("/pipeline-queue");
  revalidatePath(`/videos/${video.id}`);

  const notice = !enqueued
    ? "advanced" in result && result.advanced
      ? `Updated queue start to ${pipelineStepLabel(startStep)}: ${video.title}.`
      : `Already in pipeline queue (${video.title}).`
    : "alreadyComplete" in result && result.alreadyComplete
      ? `Video already complete — marked done in queue: ${video.title}.`
      : created
        ? `Created video and added to pipeline queue at ${pipelineStepLabel(startStep)}: ${video.title}.`
        : `Added existing video to pipeline queue at ${pipelineStepLabel(startStep)}: ${video.title}.`;

  redirect(
    `/pipeline-queue?notice=${encodeURIComponent(notice)}&highlight=${encodeURIComponent(item.id)}`,
  );
}

export async function setPipelineQueueItemEnabled(
  itemId: string,
  enabled: boolean,
) {
  await prisma.pipelineQueueItem.update({
    where: { id: itemId },
    data: { enabled },
  });
  revalidatePath("/pipeline-queue");
}

export async function resumePipelineQueueItem(itemId: string) {
  const item = await prisma.pipelineQueueItem.findUnique({
    where: { id: itemId },
  });
  if (!item) {
    throw new Error("Queue item not found.");
  }
  if (!["paused", "failed", "cancelled"].includes(item.status)) {
    throw new Error("Only paused, failed, or cancelled items can be resumed.");
  }

  let unlockNotice = "";
  if (item.currentStep === "assets") {
    const { forceUnlockBusyImageScenes } = await import("@/lib/image-batches");
    const unlocked = await forceUnlockBusyImageScenes(item.videoId);
    if (unlocked.resetCount > 0) {
      unlockNotice = ` Unlocked ${unlocked.resetCount} stuck asset scene(s).`;
    }
  }

  await prisma.pipelineQueueItem.update({
    where: { id: itemId },
    data: {
      status: "queued",
      enabled: true,
      errorMessage: null,
      finishedAt: null,
    },
  });
  revalidatePath("/pipeline-queue");
  revalidatePath(`/videos/${item.videoId}`);

  redirect(
    `/pipeline-queue?notice=${encodeURIComponent(
      `Resumed at ${pipelineStepLabel(item.currentStep)}.${unlockNotice}`.trim(),
    )}&highlight=${encodeURIComponent(itemId)}`,
  );
}

export async function removePipelineQueueItem(itemId: string) {
  const item = await prisma.pipelineQueueItem.findUnique({
    where: { id: itemId },
    select: { status: true },
  });
  if (!item) {
    return;
  }
  if (item.status === "running") {
    throw new Error("Cannot remove a running queue item. Stop the worker first.");
  }

  await prisma.pipelineQueueItem.delete({ where: { id: itemId } });
  revalidatePath("/pipeline-queue");
}

export async function restartPipelineQueueItemFromStepAction(
  itemId: string,
  formData: FormData,
) {
  const stepRaw = formData.get("step")?.toString().trim() ?? "";
  if (!isPipelineStep(stepRaw)) {
    throw new Error("Pick a valid pipeline step to restart from.");
  }
  const step = stepRaw as PipelineStep;

  const result = await restartPipelineQueueItemFromStep({ itemId, step });
  revalidatePath("/pipeline-queue");
  revalidatePath(`/videos/${result.item.videoId}`);

  const cleared = result.clearedScenes
    ? ` Cleared ${result.deletedScenes} scene(s).`
    : result.clearedImageScenes > 0
      ? ` Cleared ${result.clearedImageScenes} image asset(s) for regen.`
      : "";
  const notice = `Restarted at ${pipelineStepLabel(step)}.${cleared}`;
  redirect(
    `/pipeline-queue?notice=${encodeURIComponent(notice)}&highlight=${encodeURIComponent(itemId)}`,
  );
}

export async function startPipelineQueueWorkerAction() {
  if (isPipelineWorkerRunning()) {
    return { ok: false as const, reason: "already_running" as const };
  }

  void runPipelineWorkerLoop().catch((error) => {
    console.error("[pipeline-queue-worker] crashed", error);
  });

  revalidatePath("/pipeline-queue");
  return { ok: true as const, started: true as const };
}

export async function stopPipelineQueueWorkerAction() {
  const { stopPipelineWorkerAndSafeguard } = await import(
    "@/lib/pipeline-stop"
  );
  const result = await stopPipelineWorkerAndSafeguard();
  revalidatePath("/pipeline-queue");
  return {
    ok: true as const,
    running: result.running,
    parkedItems: result.parkedItems,
    message: result.message,
  };
}

export async function getPipelineWorkerRunningAction() {
  return { running: isPipelineWorkerRunning() };
}

export async function ensureVideoQueuedFromId(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, channelKey: true, title: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }

  return enqueuePipelineVideo({
    videoId: video.id,
    channelKey: video.channelKey,
  });
}

/** Form action: add current video to pipeline queue and open the queue page. */
export async function addVideoToPipelineQueue(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, channelKey: true, title: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }

  const result = await enqueuePipelineVideo({
    videoId: video.id,
    channelKey: video.channelKey,
  });
  const { item, created: enqueued } = result;
  const startStep = item.currentStep;

  revalidatePath("/pipeline-queue");
  revalidatePath(`/videos/${video.id}`);

  const notice = !enqueued
    ? "advanced" in result && result.advanced
      ? `Updated queue start to ${pipelineStepLabel(startStep)}: ${video.title}.`
      : `Already in pipeline queue (${video.title}).`
    : "alreadyComplete" in result && result.alreadyComplete
      ? `Video already complete — marked done in queue: ${video.title}.`
      : `Added to pipeline queue at ${pipelineStepLabel(startStep)}: ${video.title}.`;

  redirect(
    `/pipeline-queue?notice=${encodeURIComponent(notice)}&highlight=${encodeURIComponent(item.id)}`,
  );
}

function parsePipelineSettingsFormData(
  formData: FormData,
  fallback: PipelineSettings,
): PipelineSettings {
  const includeRefs = formData.get("includeReferenceTranscripts") === "on";
  const referenceDocumentIds = formData
    .getAll("referenceDocumentIds")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const visualModeRaw = formData.get("visualPlanMode")?.toString().trim();
  const visualMode =
    visualModeRaw === "library" || visualModeRaw === "hybrid"
      ? visualModeRaw
      : fallback.visualPlan.mode;
  const voiceId = formData.get("voiceId")?.toString().trim() || null;
  const voiceName = formData.get("voiceName")?.toString().trim() || null;
  const pauseRaw = formData.get("pauseAfterMs")?.toString().trim() ?? "";
  // Empty field = punctuation smart pauses (null). Do not fall back to a prior
  // flat pause — that silently bypassed per-scene punctuation for every channel.
  const pauseAfterMs =
    pauseRaw === ""
      ? null
      : (() => {
          const n = Number(pauseRaw);
          return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
        })();

  const imageOutputFolderField = formData.get("imageOutputFolder");
  const imageOutputFolder =
    imageOutputFolderField === null
      ? fallback.assets.imageOutputFolder
      : imageOutputFolderField.toString().trim() || null;

  const sectionVoicesRaw = formData
    .get("voiceoverSectionVoicesJson")
    ?.toString()
    .trim();
  let sectionVoices = fallback.voiceover.sectionVoices;
  if (sectionVoicesRaw) {
    try {
      const parsed = normalizeVoiceoverSectionVoices(
        JSON.parse(sectionVoicesRaw) as unknown,
      );
      if (Object.keys(parsed).length > 0) {
        sectionVoices = parsed;
      }
    } catch {
      // Keep fallback section voices when JSON is invalid.
    }
  }

  return parsePipelineSettings(
    {
      script: {
        includeReferenceTranscripts: includeRefs,
        referenceDocumentIds: includeRefs ? referenceDocumentIds : [],
      },
      visualPlan: {
        mode: visualMode,
        generationMode: "FULL_VIDEO",
        libraryId: formData.get("libraryId")?.toString().trim() || null,
      },
      assets: {
        imageOutputFolder,
      },
      voiceover: {
        voiceId,
        voiceName,
        ttsProvider:
          formData.get("ttsProvider")?.toString().trim() ||
          fallback.voiceover.ttsProvider,
        sectionVoices,
        pauseAfterMs,
        generateSubtitles: formData.get("generateSubtitles") === "on",
        alignmentProvider:
          formData.get("alignmentProvider")?.toString().trim() ||
          fallback.voiceover.alignmentProvider,
        captionStylePreset:
          formData.get("captionStylePreset")?.toString().trim() ||
          fallback.voiceover.captionStylePreset,
      },
      render: {
        burnCaptions: formData.get("burnCaptions") === "on",
        voiceSoundBars: formData.get("voiceSoundBars") === "on",
        voiceSoundBarsStyle:
          formData.get("voiceSoundBarsStyle")?.toString().trim() ||
          fallback.render.voiceSoundBarsStyle,
      },
    },
    fallback,
  );
}

export async function saveVideoPipelineSettingsAction(
  videoId: string,
  formData: FormData,
) {
  const fallback = await resolvePipelineSettings(videoId);
  const settings = parsePipelineSettingsFormData(formData, fallback);
  await saveVideoPipelineSettings(videoId, settings);
  revalidatePath("/pipeline-queue");
  revalidatePath(`/videos/${videoId}`);
  redirect(
    `/pipeline-queue?notice=${encodeURIComponent("Pipeline settings saved for this video.")}`,
  );
}

export async function saveChannelPipelineDefaultsAction(
  videoId: string,
  formData: FormData,
) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, channelKey: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }

  const fallback = getChannelPipelineDefaults(video.channelKey);
  const settings = parsePipelineSettingsFormData(formData, fallback);
  saveChannelPipelineDefaults(video.channelKey, settings, {
    updateSelectedVoicePause: true,
  });
  await saveVideoPipelineSettings(videoId, settings);
  revalidatePath("/pipeline-queue");
  revalidatePath(`/videos/${videoId}`);
  redirect(
    `/pipeline-queue?notice=${encodeURIComponent(
      `Saved as channel default for ${video.channelKey} (and this video).`,
    )}`,
  );
}
