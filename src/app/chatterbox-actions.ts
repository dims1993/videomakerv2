"use server";

import { revalidatePath } from "next/cache";

import {
  checkChatterboxHealth,
  CHATTERBOX_PROVIDER,
  listChatterboxPredefinedVoices,
  uploadChatterboxReferenceAudio,
} from "@/lib/chatterbox";
import {
  getChatterboxProcessStatus,
  startChatterboxServer,
  stopChatterboxServer,
} from "@/lib/chatterbox-process";
import {
  normalizeNamedVoices,
  readElevenLabsPreferences,
  saveNamedElevenLabsVoices,
} from "@/lib/elevenlabs-preferences";
import type { NamedElevenLabsVoice } from "@/lib/tts-voices";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function checkChatterboxHealthAction() {
  return checkChatterboxHealth();
}

export async function listChatterboxPredefinedVoicesAction() {
  return listChatterboxPredefinedVoices();
}

export async function getChatterboxProcessStatusAction() {
  return getChatterboxProcessStatus();
}

export async function startChatterboxServerAction() {
  return startChatterboxServer();
}

export async function stopChatterboxServerAction() {
  return stopChatterboxServer();
}

export async function addChatterboxPredefinedVoiceAction(input: {
  filename: string;
  name?: string | null;
}) {
  const filename = input.filename.trim();
  if (!filename) {
    throw new Error("Predefined voice filename is required.");
  }

  const available = await listChatterboxPredefinedVoices();
  const match = available.find(
    (voice) => voice.filename.toLowerCase() === filename.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `Predefined voice “${filename}” was not found on the Chatterbox server. Start Chatterbox and try again.`,
    );
  }

  const name =
    (typeof input.name === "string" && input.name.trim()) || match.displayName;

  const voice: NamedElevenLabsVoice = {
    name,
    voiceId: match.filename,
    provider: CHATTERBOX_PROVIDER,
    chatterboxMode: "predefined",
    predefinedVoiceId: match.filename,
  };

  const existing = await readElevenLabsPreferences();
  const withoutDuplicate = (existing?.namedVoices ?? []).filter(
    (entry) => entry.voiceId !== voice.voiceId,
  );
  const namedVoices = normalizeNamedVoices([voice, ...withoutDuplicate]);
  await saveNamedElevenLabsVoices(namedVoices);
  revalidatePath("/");

  return { voice, namedVoices };
}

export async function cloneChatterboxVoiceAction(formData: FormData) {
  const name = emptyToNull(formData.get("name"));
  if (!name) {
    throw new Error("Voice name is required.");
  }

  const sample = formData.get("sample");
  if (!(sample instanceof File) || sample.size < 1) {
    throw new Error("Reference audio sample is required.");
  }
  // Chatterbox rejects tiny/corrupt uploads; a few KB is never a real sample.
  if (sample.size < 8_000) {
    throw new Error(
      `Reference sample is too small (${sample.size} bytes). Use a clean 5–20s wav/mp3.`,
    );
  }

  const bytes = Buffer.from(await sample.arrayBuffer());
  if (bytes.byteLength < 8_000) {
    throw new Error(
      `Reference sample could not be read (${bytes.byteLength} bytes). Re-select the file and try again.`,
    );
  }

  const originalName = sample.name?.trim() || `${name}.wav`;
  console.info("[chatterbox-clone] uploading reference", {
    name,
    originalName,
    bytes: bytes.byteLength,
    type: sample.type || null,
  });

  const upload = await uploadChatterboxReferenceAudio({
    fileName: originalName,
    bytes,
    contentType: sample.type || undefined,
  });

  console.info("[chatterbox-clone] upload ok", upload);

  const voice: NamedElevenLabsVoice = {
    name,
    voiceId: upload.referenceFileName,
    provider: CHATTERBOX_PROVIDER,
    chatterboxMode: "clone",
    referenceFileName: upload.referenceFileName,
    localSamplePath: upload.localSamplePath,
  };

  const existing = await readElevenLabsPreferences();
  const withoutDuplicate = (existing?.namedVoices ?? []).filter(
    (entry) => entry.voiceId !== voice.voiceId,
  );
  const namedVoices = normalizeNamedVoices([voice, ...withoutDuplicate]);
  await saveNamedElevenLabsVoices(namedVoices);
  revalidatePath("/");

  return { voice, namedVoices };
}
