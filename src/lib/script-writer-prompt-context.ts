import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getChannelProfile,
  getChannelTopicCategory,
  type ChannelProfile,
} from "@/lib/channels-server";
import {
  resolvePodcastEpisodeFormat,
  type PodcastEpisodeFormat,
} from "@/lib/podcast-english-lessons-script-shared";
import { prisma } from "@/lib/prisma";

export type ScriptWriterEpisodeMode =
  | "narrative_economics_stories"
  | "personal_finance_explainer"
  | "max_sara_conversation"
  | "emma_leo_lesson"
  | "other";

export type ScriptWriterEpisodeContext = {
  channelKey: string;
  channelName: string;
  videoTitle: string;
  topic: string;
  topicCategory: string | null;
  topicCategoryLabel: string | null;
  topicCategoryDescription: string | null;
  episodeMode: ScriptWriterEpisodeMode;
  /** Present for Podcast English Lessons; mirrors the active series format. */
  podcastEpisodeFormat?: PodcastEpisodeFormat | null;
};

export type ScriptWriterPromptContext = {
  video: {
    id: string;
    channelKey: string;
    title: string;
    topic: string;
    topicCategory: string | null;
    ideaJson: string | null;
  };
  channel: ChannelProfile;
  projectBible: string;
  currentIdeaJson: Record<string, unknown>;
  topicCategory: ReturnType<typeof getChannelTopicCategory>;
  episodeContext: ScriptWriterEpisodeContext;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecordString(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

export function parseJsonForPrompt(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function buildPromptSections(sections: Array<[string, unknown]>) {
  return sections
    .map(([title, content]) => {
      // Fence JSON so underscores (e.g. social_relationships) are not
      // interpreted/escaped as Markdown italics (social\_relationships).
      const body =
        typeof content === "string"
          ? content
          : `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``;
      return `# ${title}\n\n${body}`;
    })
    .join("\n\n---\n\n");
}

export async function readProjectText(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

function buildFallbackIdeaJson(video: {
  topic: string;
  topicCategory: string | null;
  title: string;
}) {
  return {
    rawIdea: video.topic,
    workingTitle: video.title,
    topicCategory: video.topicCategory,
  };
}

function assignMissingText(
  target: Record<string, unknown>,
  key: string,
  value: string | null | undefined,
) {
  if (
    value &&
    (!target[key] || typeof target[key] !== "string" || !String(target[key]).trim())
  ) {
    target[key] = value;
  }
}

export async function getLinkedTopicIdea({
  videoId,
  channelKey,
  ideaJson,
}: {
  videoId: string;
  channelKey: string;
  ideaJson: unknown;
}) {
  const topicIdeaId = getRecordString(ideaJson, "topicIdeaId");

  if (channelKey !== "wealth-insights" && !topicIdeaId) {
    return null;
  }

  return prisma.topicIdea.findFirst({
    where: {
      channelKey,
      OR: [
        { createdVideoId: videoId },
        ...(topicIdeaId ? [{ id: topicIdeaId }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      category: true,
      title: true,
      topic: true,
      angle: true,
      uniqueMechanism: true,
      scriptureAnchor: true,
      centralQuestion: true,
      commonMisunderstanding: true,
      spiritualTurn: true,
      trigger: true,
      promise: true,
      visualHook: true,
      thumbnailIdea: true,
      repetitionRisk: true,
      status: true,
    },
  });
}

export function buildFlattenedCurrentIdeaJson({
  video,
  parsedIdeaJson,
  linkedTopicIdea,
}: {
  video: {
    topic: string;
    topicCategory: string | null;
    title: string;
    ideaJson: string | null;
  };
  parsedIdeaJson: unknown;
  linkedTopicIdea: Awaited<ReturnType<typeof getLinkedTopicIdea>>;
}) {
  const fallbackIdea = buildFallbackIdeaJson(video);
  const flattenedIdea: Record<string, unknown> = isRecord(parsedIdeaJson)
    ? { ...parsedIdeaJson }
    : {};

  if (linkedTopicIdea) {
    assignMissingText(flattenedIdea, "topicIdeaId", linkedTopicIdea.id);
    assignMissingText(flattenedIdea, "rawIdea", linkedTopicIdea.topic);
    assignMissingText(flattenedIdea, "workingTitle", linkedTopicIdea.title);
    assignMissingText(flattenedIdea, "topicCategory", linkedTopicIdea.category);
    assignMissingText(flattenedIdea, "coreAngle", linkedTopicIdea.angle);
    assignMissingText(
      flattenedIdea,
      "uniqueMechanism",
      linkedTopicIdea.uniqueMechanism,
    );
    assignMissingText(
      flattenedIdea,
      "scriptureAnchor",
      linkedTopicIdea.scriptureAnchor,
    );
    assignMissingText(
      flattenedIdea,
      "centralQuestion",
      linkedTopicIdea.centralQuestion,
    );
    assignMissingText(
      flattenedIdea,
      "commonMisunderstanding",
      linkedTopicIdea.commonMisunderstanding,
    );
    assignMissingText(
      flattenedIdea,
      "spiritualTurn",
      linkedTopicIdea.spiritualTurn,
    );
    assignMissingText(flattenedIdea, "emotionalHook", linkedTopicIdea.trigger);
    assignMissingText(flattenedIdea, "mainPromise", linkedTopicIdea.promise);
    assignMissingText(flattenedIdea, "visualAnchor", linkedTopicIdea.visualHook);
    assignMissingText(
      flattenedIdea,
      "thumbnailIdea",
      linkedTopicIdea.thumbnailIdea,
    );
    assignMissingText(
      flattenedIdea,
      "repetitionRisk",
      linkedTopicIdea.repetitionRisk,
    );
  }

  assignMissingText(flattenedIdea, "rawIdea", fallbackIdea.rawIdea);
  assignMissingText(flattenedIdea, "workingTitle", fallbackIdea.workingTitle);
  assignMissingText(flattenedIdea, "topicCategory", fallbackIdea.topicCategory);

  if (!video.ideaJson?.trim()) {
    flattenedIdea.warning =
      "Warning: This video has limited Idea JSON. Add a richer idea before generating the final script for best results.";
  }

  if (typeof parsedIdeaJson === "string") {
    flattenedIdea.warning =
      "Warning: This video has limited Idea JSON. Add a richer idea before generating the final script for best results.";
    flattenedIdea.rawIdeaJson = parsedIdeaJson;
  }

  return flattenedIdea;
}

export function buildEpisodeContext({
  channel,
  video,
  topicCategory,
  currentIdeaJson,
  topicEngine,
}: {
  channel: Pick<ChannelProfile, "key" | "name"> & {
    editorialInstructions?: { topicEngine?: string | null } | null;
  };
  video: {
    title: string;
    topic: string;
    topicCategory: string | null;
  };
  topicCategory: { id: string; label: string; description: string } | null | undefined;
  currentIdeaJson: unknown;
  topicEngine?: string | null;
}) {
  const topicCategoryId = isRecord(currentIdeaJson)
    ? String(
        currentIdeaJson.topicCategory ??
          video.topicCategory ??
          topicCategory?.id ??
          "",
      ).trim()
    : String(video.topicCategory ?? topicCategory?.id ?? "").trim();

  const resolvedTopicCategory =
    topicCategoryId ||
    String(video.topicCategory ?? topicCategory?.id ?? "").trim() ||
    null;

  if (channel.key === "podcast-english-lessons") {
    const podcastEpisodeFormat = resolvePodcastEpisodeFormat({
      channelKey: channel.key,
      ideaJson: currentIdeaJson,
      topicEngine:
        topicEngine ?? channel.editorialInstructions?.topicEngine ?? null,
      title: video.title,
      topic: video.topic,
    });

    return {
      channelKey: channel.key,
      channelName: channel.name,
      videoTitle: video.title,
      topic: video.topic,
      topicCategory: resolvedTopicCategory,
      topicCategoryLabel: topicCategory?.label ?? null,
      topicCategoryDescription: topicCategory?.description ?? null,
      episodeMode: podcastEpisodeFormat,
      podcastEpisodeFormat,
    } satisfies ScriptWriterEpisodeContext;
  }

  const episodeMode: ScriptWriterEpisodeMode =
    channel.key === "wealth-insights" &&
    topicCategoryId === "narrative_economics_stories"
      ? "narrative_economics_stories"
      : channel.key === "wealth-insights"
        ? "personal_finance_explainer"
        : "other";

  return {
    channelKey: channel.key,
    channelName: channel.name,
    videoTitle: video.title,
    topic: video.topic,
    topicCategory: resolvedTopicCategory,
    topicCategoryLabel: topicCategory?.label ?? null,
    topicCategoryDescription: topicCategory?.description ?? null,
    episodeMode,
  } satisfies ScriptWriterEpisodeContext;
}

export async function getScriptWriterPromptContext(
  videoId: string,
): Promise<ScriptWriterPromptContext> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      channelKey: true,
      title: true,
      topic: true,
      topicCategory: true,
      ideaJson: true,
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  const channel = getChannelProfile(video.channelKey);
  const projectBible = await readProjectText(channel.projectBiblePath);
  const parsedIdeaJson = parseJsonForPrompt(video.ideaJson);
  const linkedTopicIdea = await getLinkedTopicIdea({
    videoId: video.id,
    channelKey: channel.key,
    ideaJson: parsedIdeaJson,
  });
  const currentIdeaJson = buildFlattenedCurrentIdeaJson({
    video,
    parsedIdeaJson,
    linkedTopicIdea,
  });
  const topicCategory = getChannelTopicCategory(
    channel.key,
    video.topicCategory,
  );
  const episodeContext = buildEpisodeContext({
    channel,
    video,
    topicCategory,
    currentIdeaJson,
    topicEngine: channel.editorialInstructions?.topicEngine,
  });

  return {
    video,
    channel,
    projectBible,
    currentIdeaJson,
    topicCategory,
    episodeContext,
  };
}
