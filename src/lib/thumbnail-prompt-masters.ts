import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type ThumbnailPromptMaster = {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

export type ChannelThumbnailPromptMasters = {
  defaultMasterId: string | null;
  masters: ThumbnailPromptMaster[];
};

type ThumbnailPromptMastersFile = {
  updatedAt: string;
  channels: Record<string, ChannelThumbnailPromptMasters>;
};

const RELATIVE_PATH = path.join("data", "channels", "thumbnail-prompt-masters.json");

function filePath() {
  return path.join(process.cwd(), RELATIVE_PATH);
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `tpm_${randomBytes(8).toString("hex")}`;
}

function emptyChannel(): ChannelThumbnailPromptMasters {
  return { defaultMasterId: null, masters: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeMaster(value: unknown): ThumbnailPromptMaster | null {
  if (!isObject(value)) {
    return null;
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const prompt = typeof value.prompt === "string" ? value.prompt : "";
  if (!id || !name || !prompt.trim()) {
    return null;
  }
  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim()
      ? value.createdAt
      : nowIso();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : createdAt;
  return { id, name, prompt, createdAt, updatedAt };
}

function normalizeChannel(value: unknown): ChannelThumbnailPromptMasters {
  if (!isObject(value)) {
    return emptyChannel();
  }
  const masters = (Array.isArray(value.masters) ? value.masters : [])
    .map(normalizeMaster)
    .filter((entry): entry is ThumbnailPromptMaster => Boolean(entry));
  const defaultMasterId =
    typeof value.defaultMasterId === "string" && value.defaultMasterId.trim()
      ? value.defaultMasterId.trim()
      : null;
  const validDefault =
    defaultMasterId && masters.some((master) => master.id === defaultMasterId)
      ? defaultMasterId
      : masters[0]?.id ?? null;
  return { defaultMasterId: validDefault, masters };
}

async function readFileSafe(): Promise<ThumbnailPromptMastersFile> {
  try {
    const raw = await readFile(filePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return { updatedAt: nowIso(), channels: {} };
    }
    const channelsRaw = isObject(parsed.channels) ? parsed.channels : {};
    const channels: Record<string, ChannelThumbnailPromptMasters> = {};
    for (const [key, value] of Object.entries(channelsRaw)) {
      const channelKey = key.trim();
      if (!channelKey) {
        continue;
      }
      channels[channelKey] = normalizeChannel(value);
    }
    return {
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
      channels,
    };
  } catch {
    return { updatedAt: nowIso(), channels: {} };
  }
}

async function writeFileSafe(data: ThumbnailPromptMastersFile) {
  await mkdir(path.dirname(filePath()), { recursive: true });
  const payload: ThumbnailPromptMastersFile = {
    updatedAt: nowIso(),
    channels: data.channels,
  };
  await writeFile(filePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function listThumbnailPromptMasters(channelKey: string) {
  const key = channelKey.trim();
  const file = await readFileSafe();
  return file.channels[key] ?? emptyChannel();
}

export async function getThumbnailPromptMaster(
  channelKey: string,
  masterId: string,
) {
  const channel = await listThumbnailPromptMasters(channelKey);
  return channel.masters.find((master) => master.id === masterId.trim()) ?? null;
}

export async function getDefaultThumbnailPromptMaster(channelKey: string) {
  const channel = await listThumbnailPromptMasters(channelKey);
  if (!channel.defaultMasterId) {
    return null;
  }
  return (
    channel.masters.find((master) => master.id === channel.defaultMasterId) ??
    null
  );
}

export async function saveThumbnailPromptMaster({
  channelKey,
  name,
  prompt,
  masterId,
  setAsDefault,
}: {
  channelKey: string;
  name: string;
  prompt: string;
  masterId?: string | null;
  setAsDefault?: boolean;
}) {
  const key = channelKey.trim();
  const cleanName = name.trim();
  const cleanPrompt = prompt.trim();
  if (!key) {
    throw new Error("Channel key is required.");
  }
  if (!cleanName) {
    throw new Error("Prompt master name is required.");
  }
  if (!cleanPrompt) {
    throw new Error("Prompt master text is required.");
  }

  const file = await readFileSafe();
  const channel = file.channels[key] ?? emptyChannel();
  const stamp = nowIso();
  const existingId = masterId?.trim() || "";
  let saved: ThumbnailPromptMaster;

  if (existingId) {
    const index = channel.masters.findIndex((master) => master.id === existingId);
    if (index < 0) {
      throw new Error("Prompt master not found.");
    }
    saved = {
      ...channel.masters[index]!,
      name: cleanName,
      prompt: cleanPrompt,
      updatedAt: stamp,
    };
    channel.masters[index] = saved;
  } else {
    saved = {
      id: newId(),
      name: cleanName,
      prompt: cleanPrompt,
      createdAt: stamp,
      updatedAt: stamp,
    };
    channel.masters = [saved, ...channel.masters];
  }

  if (setAsDefault || !channel.defaultMasterId) {
    channel.defaultMasterId = saved.id;
  }

  file.channels[key] = channel;
  await writeFileSafe(file);
  return { channel, master: saved };
}

export async function setDefaultThumbnailPromptMaster(
  channelKey: string,
  masterId: string,
) {
  const key = channelKey.trim();
  const id = masterId.trim();
  const file = await readFileSafe();
  const channel = file.channels[key] ?? emptyChannel();
  if (!channel.masters.some((master) => master.id === id)) {
    throw new Error("Prompt master not found.");
  }
  channel.defaultMasterId = id;
  file.channels[key] = channel;
  await writeFileSafe(file);
  return channel;
}

export async function deleteThumbnailPromptMaster(
  channelKey: string,
  masterId: string,
) {
  const key = channelKey.trim();
  const id = masterId.trim();
  const file = await readFileSafe();
  const channel = file.channels[key] ?? emptyChannel();
  const nextMasters = channel.masters.filter((master) => master.id !== id);
  if (nextMasters.length === channel.masters.length) {
    throw new Error("Prompt master not found.");
  }
  channel.masters = nextMasters;
  if (channel.defaultMasterId === id) {
    channel.defaultMasterId = nextMasters[0]?.id ?? null;
  }
  file.channels[key] = channel;
  await writeFileSafe(file);
  return channel;
}
