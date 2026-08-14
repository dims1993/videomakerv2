"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getChannelProfile, getDefaultChannelKey } from "@/lib/channels-server";
import {
  createReferenceDocument,
  updateReferenceDocument,
} from "@/lib/reference-documents";
import { prisma } from "@/lib/prisma";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function normalizeChannelKey(value: FormDataEntryValue | null) {
  const key = value?.toString().trim() || getDefaultChannelKey();
  return getChannelProfile(key).key;
}

export async function createReferenceDocumentAction(formData: FormData) {
  const channelKey = normalizeChannelKey(formData.get("channelKey"));
  const videoId = formData.get("videoId")?.toString().trim() || null;

  await createReferenceDocument({
    channelKey,
    videoId,
    type: formData.get("type")?.toString(),
    title: requiredText(formData, "title"),
    sourceName: formData.get("sourceName")?.toString() || null,
    sourceUrl: formData.get("sourceUrl")?.toString() || null,
    content: requiredText(formData, "content"),
    tagsJson: formData.get("tagsJson")?.toString() || null,
    isActive: formData.get("isActive")?.toString() !== "off",
  });

  revalidatePath("/reference-library");
  if (videoId) {
    revalidatePath(`/videos/${videoId}`);
  }
  redirect("/reference-library?saved=1");
}

export async function updateReferenceDocumentAction(
  id: string,
  formData: FormData,
) {
  const videoId = formData.get("videoId")?.toString().trim() || null;

  await updateReferenceDocument(id, {
    title: requiredText(formData, "title"),
    sourceName: formData.get("sourceName")?.toString() || null,
    sourceUrl: formData.get("sourceUrl")?.toString() || null,
    content: requiredText(formData, "content"),
    tagsJson: formData.get("tagsJson")?.toString() || null,
    type: formData.get("type")?.toString() || null,
    videoId,
    isActive: formData.get("isActive")?.toString() === "on",
  });

  revalidatePath("/reference-library");
  revalidatePath(`/reference-library/${id}`);
  redirect(`/reference-library/${id}?saved=1`);
}

export async function deleteReferenceDocumentAction(id: string) {
  await prisma.referenceDocument.delete({ where: { id } });
  revalidatePath("/reference-library");
  redirect("/reference-library?deleted=1");
}

export async function toggleReferenceDocumentActiveAction(id: string) {
  const existing = await prisma.referenceDocument.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Reference document not found.");
  }

  await prisma.referenceDocument.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });

  revalidatePath("/reference-library");
  revalidatePath(`/reference-library/${id}`);
}
