"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requestThumbnailBatchCancel } from "@/lib/thumbnail-batch-cancel";
import {
  deleteThumbnailPromptMaster,
  listThumbnailPromptMasters,
  saveThumbnailPromptMaster,
  setDefaultThumbnailPromptMaster,
} from "@/lib/thumbnail-prompt-masters";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function listThumbnailPromptMastersAction(channelKey: string) {
  return listThumbnailPromptMasters(channelKey);
}

export async function saveThumbnailPromptMasterAction(formData: FormData) {
  const channelKey = emptyToNull(formData.get("channelKey"));
  const name = emptyToNull(formData.get("name"));
  const prompt = emptyToNull(formData.get("prompt"));
  const masterId = emptyToNull(formData.get("masterId"));
  const setAsDefault = formData.get("setAsDefault") === "on" || formData.get("setAsDefault") === "true";
  const videoId = emptyToNull(formData.get("videoId"));

  if (!channelKey || !name || !prompt) {
    throw new Error("Channel, name, and prompt are required.");
  }

  const result = await saveThumbnailPromptMaster({
    channelKey,
    name,
    prompt,
    masterId,
    setAsDefault,
  });

  if (videoId) {
    revalidatePath(`/videos/${videoId}`);
  }
  return result;
}

export async function setDefaultThumbnailPromptMasterAction(formData: FormData) {
  const channelKey = emptyToNull(formData.get("channelKey"));
  const masterId = emptyToNull(formData.get("masterId"));
  const videoId = emptyToNull(formData.get("videoId"));
  if (!channelKey || !masterId) {
    throw new Error("Channel and master id are required.");
  }
  const channel = await setDefaultThumbnailPromptMaster(channelKey, masterId);
  if (videoId) {
    revalidatePath(`/videos/${videoId}`);
  }
  return channel;
}

export async function deleteThumbnailPromptMasterAction(formData: FormData) {
  const channelKey = emptyToNull(formData.get("channelKey"));
  const masterId = emptyToNull(formData.get("masterId"));
  const videoId = emptyToNull(formData.get("videoId"));
  if (!channelKey || !masterId) {
    throw new Error("Channel and master id are required.");
  }
  const channel = await deleteThumbnailPromptMaster(channelKey, masterId);
  if (videoId) {
    revalidatePath(`/videos/${videoId}`);
  }
  return channel;
}

export async function selectVideoThumbnailPromptMasterAction(
  videoId: string,
  formData: FormData,
) {
  const masterId = emptyToNull(formData.get("masterId"));
  const masterName = emptyToNull(formData.get("masterName")) || masterId;
  if (!masterId) {
    throw new Error("Select a prompt master.");
  }

  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailConceptJson: {
        kind: "master",
        masterId,
        masterName,
      },
    },
  });
  revalidatePath(`/videos/${videoId}`);
  return { masterId, masterName };
}

export async function markThumbnailReadyAction(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: { thumbnailStatus: "ready" },
  });
  revalidatePath(`/videos/${videoId}`);
}

export async function resetThumbnailAction(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailStatus: "pending",
      thumbnailPrompt: null,
      thumbnailNotes: null,
      thumbnailImagePath: null,
      thumbnailImageUrl: null,
      thumbnailFileName: null,
      thumbnailConceptJson: Prisma.DbNull,
      thumbnailVariationsJson: Prisma.DbNull,
      thumbnailNegativePrompt: null,
    },
  });
  revalidatePath(`/videos/${videoId}`);
}

export async function cancelThumbnailBatchAction(videoId: string) {
  requestThumbnailBatchCancel(videoId);
  return { ok: true };
}
