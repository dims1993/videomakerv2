import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  ChannelPipelineDefaults,
  ChannelPipelineMode,
  ChannelProfile,
  EditorialInstructions,
  TopicSystem,
} from "@/lib/channels";
import { parseChannelVoiceProfiles } from "@/lib/pipeline-settings";

export const CUSTOM_CHANNELS_REGISTRY_RELATIVE =
  "data/channels/custom-channels.json";

function registryAbsolutePath() {
  return path.join(process.cwd(), CUSTOM_CHANNELS_REGISTRY_RELATIVE);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function parseTopicSystem(value: unknown): TopicSystem | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const categoriesRaw = Array.isArray(value.categories) ? value.categories : [];
  const categories = categoriesRaw
    .map((entry) => {
      if (!isObject(entry)) {
        return null;
      }
      const id = text(entry.id);
      const label = text(entry.label);
      if (!id || !label) {
        return null;
      }
      return {
        id,
        label,
        description: text(entry.description) || label,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const lanesRaw = Array.isArray(value.outlierAngleLanes)
    ? value.outlierAngleLanes
    : [];
  const outlierAngleLanes = lanesRaw
    .map((entry) => {
      if (!isObject(entry)) {
        return null;
      }
      const id = text(entry.id);
      const label = text(entry.label);
      if (!id || !label) {
        return null;
      }
      const titlePatterns = stringList(entry.titlePatterns);
      if (titlePatterns.length === 0) {
        return null;
      }
      const avoid = stringList(entry.avoid);
      return {
        id,
        label,
        description: text(entry.description) || label,
        titlePatterns,
        ...(avoid.length > 0 ? { avoid } : {}),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return {
    enabled: value.enabled !== false && categories.length > 0,
    categories,
    weeklyRotation: stringList(value.weeklyRotation),
    ...(outlierAngleLanes.length > 0 ? { outlierAngleLanes } : {}),
  };
}

function parseEditorial(value: unknown): EditorialInstructions | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const role = text(value.role);
  const audience = text(value.audience);
  const niche = text(value.niche);
  if (!role || !audience || !niche) {
    return undefined;
  }
  return {
    role,
    audience,
    niche,
    style: stringList(value.style),
    originalityRules: stringList(value.originalityRules),
    overusedAngles: stringList(value.overusedAngles),
    requiredTopicFields: stringList(value.requiredTopicFields),
    ...(text(value.topicEngine) === "scripture_first"
      ? { topicEngine: "scripture_first" as const }
      : text(value.topicEngine) === "conversational_podcast"
        ? { topicEngine: "conversational_podcast" as const }
        : {}),
  };
}

export function parseCustomChannelProfile(
  value: unknown,
): ChannelProfile | null {
  if (!isObject(value)) {
    return null;
  }

  const key = text(value.key);
  const name = text(value.name);
  if (!key || !name) {
    return null;
  }

  const promptsRaw = isObject(value.prompts) ? value.prompts : null;
  if (!promptsRaw) {
    return null;
  }

  const angleBuilder = text(promptsRaw.angleBuilder);
  const scriptWriter = text(promptsRaw.scriptWriter);
  const scriptWriterScore = text(promptsRaw.scriptWriterScore) || undefined;
  const scriptWriterRevision =
    text(promptsRaw.scriptWriterRevision) || undefined;
  const visualPlanner = text(promptsRaw.visualPlanner);
  const metadataWriter = text(promptsRaw.metadataWriter);
  const projectBiblePath = text(value.projectBiblePath);
  const imagePromptBiblePath = text(value.imagePromptBiblePath);

  if (
    !angleBuilder ||
    !scriptWriter ||
    !visualPlanner ||
    !metadataWriter ||
    !projectBiblePath ||
    !imagePromptBiblePath
  ) {
    return null;
  }

  const pipelineModeRaw = text(value.pipelineMode);
  const pipelineMode: ChannelPipelineMode | undefined =
    pipelineModeRaw === "audio_only" || pipelineModeRaw === "full"
      ? pipelineModeRaw
      : undefined;

  const characterBiblePath = text(value.characterBiblePath) || undefined;
  const chatgptTopicConversationUrl =
    text(value.chatgptTopicConversationUrl) || undefined;
  const chatgptScriptConversationUrl =
    text(value.chatgptScriptConversationUrl) || undefined;
  const topicSystem = parseTopicSystem(value.topicSystem);
  const editorialInstructions = parseEditorial(value.editorialInstructions);
  const voiceoverSpeedDefault =
    typeof value.voiceoverSpeedDefault === "number" &&
    Number.isFinite(value.voiceoverSpeedDefault)
      ? value.voiceoverSpeedDefault
      : undefined;
  const voiceoverDefaultVoiceId =
    text(value.voiceoverDefaultVoiceId) || undefined;
  const voiceoverDefaultVoiceName =
    text(value.voiceoverDefaultVoiceName) || undefined;
  const voiceProfiles = parseChannelVoiceProfiles(value.voiceProfiles);
  const pipelineDefaults = isObject(value.pipelineDefaults)
    ? (value.pipelineDefaults as ChannelPipelineDefaults)
    : undefined;

  return {
    key,
    name,
    description: text(value.description) || name,
    projectBiblePath,
    imagePromptBiblePath,
    ...(characterBiblePath ? { characterBiblePath } : {}),
    ...(chatgptTopicConversationUrl
      ? { chatgptTopicConversationUrl }
      : {}),
    ...(chatgptScriptConversationUrl
      ? { chatgptScriptConversationUrl }
      : {}),
    ...(pipelineMode ? { pipelineMode } : {}),
    ...(voiceoverSpeedDefault != null ? { voiceoverSpeedDefault } : {}),
    ...(voiceoverDefaultVoiceId ? { voiceoverDefaultVoiceId } : {}),
    ...(voiceoverDefaultVoiceName ? { voiceoverDefaultVoiceName } : {}),
    ...(voiceProfiles.length > 0 ? { voiceProfiles } : {}),
    ...(pipelineDefaults ? { pipelineDefaults } : {}),
    ...(topicSystem ? { topicSystem } : {}),
    ...(editorialInstructions ? { editorialInstructions } : {}),
    prompts: {
      angleBuilder,
      scriptWriter,
      ...(scriptWriterScore ? { scriptWriterScore } : {}),
      ...(scriptWriterRevision ? { scriptWriterRevision } : {}),
      visualPlanner,
      metadataWriter,
    },
  };
}

export function loadCustomChannels(): ChannelProfile[] {
  const absolute = registryAbsolutePath();
  if (!existsSync(absolute)) {
    return [];
  }

  try {
    const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((entry) => parseCustomChannelProfile(entry))
      .filter((entry): entry is ChannelProfile => Boolean(entry));
  } catch {
    return [];
  }
}

export function saveCustomChannels(channels: ChannelProfile[]) {
  const absolute = registryAbsolutePath();
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(`${absolute}`, `${JSON.stringify(channels, null, 2)}\n`, "utf8");
}

export function upsertCustomChannel(profile: ChannelProfile) {
  const existing = loadCustomChannels().filter(
    (channel) => channel.key !== profile.key,
  );
  saveCustomChannels([...existing, profile]);
}

export function customChannelExists(key: string) {
  return loadCustomChannels().some((channel) => channel.key === key);
}
