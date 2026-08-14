"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  saveElevenLabsPreferences,
  saveNamedElevenLabsVoices,
  type ElevenLabsPreferenceSettings,
  type NamedElevenLabsVoice,
} from "@/lib/elevenlabs-preferences";
import {
  listGoogleTtsVoices,
  type GoogleTtsVoice,
} from "@/lib/google-tts";
import { prisma } from "@/lib/prisma";
import { normalizeVoiceoverSectionVoices } from "@/lib/voiceover-section-voices";

export async function saveElevenLabsPreferencesAction(
  settings: ElevenLabsPreferenceSettings,
) {
  await saveElevenLabsPreferences(settings);
}

export async function saveNamedElevenLabsVoicesAction(
  namedVoices: NamedElevenLabsVoice[],
) {
  await saveNamedElevenLabsVoices(namedVoices);
  revalidatePath("/");
}

export async function listGoogleTtsVoicesAction(options?: {
  languageCode?: string | null;
}): Promise<GoogleTtsVoice[]> {
  return listGoogleTtsVoices({
    languageCode: options?.languageCode ?? null,
  });
}

export async function getChirp3HdUsageSummaryAction() {
  const { getChirp3HdUsageSummary } = await import(
    "@/lib/google-tts-chirp-usage"
  );
  return getChirp3HdUsageSummary();
}

export async function saveVoiceoverSectionVoicesAction(
  videoId: string,
  sectionVoices: ReturnType<typeof normalizeVoiceoverSectionVoices>,
) {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      voiceoverSectionVoicesJson: normalizeVoiceoverSectionVoices(
        sectionVoices,
      ) as Prisma.InputJsonValue,
    },
  });
  revalidatePath(`/videos/${videoId}`);
}
