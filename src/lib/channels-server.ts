import {
  BUILTIN_CHANNELS,
  getDefaultChannelKey,
  type ChannelKey,
  type ChannelProfile,
} from "@/lib/channels";
import { loadCustomChannels } from "@/lib/channel-registry";

/** Built-in + custom channels from disk. Server-only (uses node:fs). */
export function listAllChannels(): ChannelProfile[] {
  const builtinKeys = new Set(BUILTIN_CHANNELS.map((channel) => channel.key));
  const custom = loadCustomChannels().filter(
    (channel) => !builtinKeys.has(channel.key),
  );
  return [...BUILTIN_CHANNELS, ...custom];
}

export function channelExists(channelKey: string | null | undefined) {
  const key = channelKey?.trim();
  if (!key) {
    return false;
  }
  return listAllChannels().some((channel) => channel.key === key);
}

export function getChannelProfile(channelKey: string | null | undefined) {
  const channels = listAllChannels();
  return (
    channels.find((channel) => channel.key === channelKey) ??
    channels.find((channel) => channel.key === getDefaultChannelKey()) ??
    channels[0]!
  );
}

export function getChannelOptions() {
  return listAllChannels().map(({ key, name, description }) => ({
    key,
    name,
    description,
  }));
}

export function isAudioOnlyChannel(channelKey: string | null | undefined) {
  return getChannelProfile(channelKey).pipelineMode === "audio_only";
}

export function getChannelTopicCategory(
  channelKey: string | null | undefined,
  categoryId: string | null | undefined,
) {
  const channel = getChannelProfile(channelKey);

  return (
    channel.topicSystem?.categories.find(
      (category) => category.id === categoryId,
    ) ?? null
  );
}

export function getSuggestedTopicCategory(
  channelKey: string | null | undefined,
  date = new Date(),
) {
  const channel = getChannelProfile(channelKey);
  const rotation = channel.topicSystem?.weeklyRotation ?? [];

  if (rotation.length === 0) {
    return null;
  }

  const mondayFirstIndex = (date.getDay() + 6) % 7;
  const categoryId = rotation[mondayFirstIndex % rotation.length];

  return getChannelTopicCategory(channel.key, categoryId);
}

export { getDefaultChannelKey };
export type { ChannelKey, ChannelProfile };
