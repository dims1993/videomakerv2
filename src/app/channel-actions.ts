"use server";

import { revalidatePath } from "next/cache";

import {
  ChannelScaffoldError,
  scaffoldNewChannel,
} from "@/lib/channel-scaffold";
import { registerChannelMaturePack } from "@/lib/channel-mature-pack";
import { getBuiltinChannelKeys } from "@/lib/channels";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim() ?? "";
  if (!value) {
    throw new ChannelScaffoldError(`${key} is required.`);
  }
  return value;
}

export async function createChannelAction(formData: FormData) {
  const pipelineModeRaw = formData.get("pipelineMode")?.toString().trim();
  const pipelineMode =
    pipelineModeRaw === "audio_only" ? "audio_only" : "full";

  try {
    const profile = await scaffoldNewChannel(
      {
        name: requiredText(formData, "name"),
        key: requiredText(formData, "key"),
        description: requiredText(formData, "description"),
        pipelineMode,
        audience: formData.get("audience")?.toString(),
        niche: formData.get("niche")?.toString(),
        categoryLabel: formData.get("categoryLabel")?.toString(),
      },
      { builtinKeys: getBuiltinChannelKeys() },
    );

    const maturePack = await registerChannelMaturePack({
      channelKey: profile.key,
      channelName: profile.name,
      pipelineMode: profile.pipelineMode ?? "full",
      formData,
    });

    revalidatePath("/");
    revalidatePath("/videos/new");
    revalidatePath("/channels/new");
    revalidatePath("/reference-library");

    return {
      key: profile.key,
      name: profile.name,
      pipelineMode: profile.pipelineMode ?? "full",
      maturePack,
    };
  } catch (error) {
    if (error instanceof ChannelScaffoldError) {
      throw error;
    }
    throw new ChannelScaffoldError(
      error instanceof Error ? error.message : "Could not create channel.",
    );
  }
}
