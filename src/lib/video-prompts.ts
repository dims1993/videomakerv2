import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  getChannelProfile,
  getChannelTopicCategory,
  type ChannelKey,
} from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import { getComputedVideoStatus } from "@/lib/status";

export type VideoPromptKind =
  | "angle-builder"
  | "script-writer"
  | "visual-planner"
  | "metadata-writer";

function parseJsonForPrompt(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getRecordString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function buildPrompt(sections: Array<[string, unknown]>) {
  return sections
    .map(([title, content]) => {
      const body =
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);
      return `# ${title}\n\n${body}`;
    })
    .join("\n\n---\n\n");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function getLinkedTopicIdea({
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
      trigger: true,
      promise: true,
      visualHook: true,
      thumbnailIdea: true,
      repetitionRisk: true,
      status: true,
    },
  });
}

function assignMissingText(
  target: Record<string, unknown>,
  key: string,
  value: string | null | undefined,
) {
  if (
    value &&
    (!target[key] || typeof target[key] !== "string" || !target[key].trim())
  ) {
    target[key] = value;
  }
}

function buildFlattenedCurrentIdeaJson({
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
    assignMissingText(flattenedIdea, "uniqueMechanism", linkedTopicIdea.uniqueMechanism);
    assignMissingText(flattenedIdea, "emotionalHook", linkedTopicIdea.trigger);
    assignMissingText(flattenedIdea, "mainPromise", linkedTopicIdea.promise);
    assignMissingText(flattenedIdea, "visualAnchor", linkedTopicIdea.visualHook);
    assignMissingText(flattenedIdea, "thumbnailIdea", linkedTopicIdea.thumbnailIdea);
    assignMissingText(flattenedIdea, "repetitionRisk", linkedTopicIdea.repetitionRisk);
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

function buildTopicSourceMetadata(
  linkedTopicIdea: Awaited<ReturnType<typeof getLinkedTopicIdea>>,
) {
  if (!linkedTopicIdea) {
    return null;
  }

  return {
    topicIdeaStatus: linkedTopicIdea.status,
    linkedTopicIdeaId: linkedTopicIdea.id,
  };
}

function getPresentIdeaJsonFields(
  parsedIdeaJson: unknown,
  fields: string[],
) {
  return fields.filter((field) => Boolean(getRecordString(parsedIdeaJson, field)));
}

function buildAvoidGuidance(parsedIdeaJson: unknown) {
  if (!isRecord(parsedIdeaJson)) {
    return null;
  }

  const avoid = parsedIdeaJson.avoid;

  if (Array.isArray(avoid)) {
    const items = avoid.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );

    if (items.length === 0) {
      return null;
    }

    return [
      "Avoid these topics or angles:",
      ...items.map((item) => `- ${item.trim()}`),
    ].join("\n");
  }

  if (typeof avoid === "string" && avoid.trim()) {
    return `Avoid these topics or angles:\n- ${avoid.trim()}`;
  }

  return null;
}

function buildWealthInsightsScriptGuidance(parsedIdeaJson: unknown) {
  const fields = [
    "workingTitle",
    "coreAngle",
    "uniqueMechanism",
    "emotionalHook",
    "mainPromise",
    "visualAnchor",
    "thumbnailIdea",
  ];
  const presentFields = getPresentIdeaJsonFields(parsedIdeaJson, fields);

  return [
    "Use the Current Idea JSON as the episode brief.",
    "",
    "Preserve these fields when present:",
    ...(presentFields.length > 0 ? presentFields : fields).map(
      (field) => `- ${field}`,
    ),
    "",
    "The script should explain the uniqueMechanism clearly and visually.",
    "Do not write generic finance content.",
    "Do not turn the script into financial advice.",
    "Do not tell the viewer what to buy, sell, borrow, refinance, invest in, or do.",
    "Return only the final narration script.",
  ].join("\n");
}

function buildGenericScriptGuidance(parsedIdeaJson: unknown) {
  const fields = [
    "workingTitle",
    "coreAngle",
    "emotionalHook",
    "mainPromise",
    "visualAnchor",
    "thumbnailIdea",
  ];
  const presentFields = getPresentIdeaJsonFields(parsedIdeaJson, fields);
  const avoidGuidance = buildAvoidGuidance(parsedIdeaJson);

  return [
    "Use the Current Idea JSON as the episode brief.",
    "",
    "Preserve these fields when present:",
    ...(presentFields.length > 0 ? presentFields : fields).map(
      (field) => `- ${field}`,
    ),
    "",
    ...(avoidGuidance ? [avoidGuidance, ""] : []),
    "Return only the final narration script.",
  ].join("\n");
}

function buildAdditionalScriptGuidance(
  channelKey: ChannelKey,
  parsedIdeaJson: unknown,
) {
  if (channelKey === "wealth-insights") {
    return buildWealthInsightsScriptGuidance(parsedIdeaJson);
  }

  return buildGenericScriptGuidance(parsedIdeaJson);
}

async function readProjectText(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

async function readOptionalProjectText(relativePath: string | undefined) {
  return relativePath ? readProjectText(relativePath) : null;
}

export async function getVideoPrompt(videoId: string, kind: VideoPromptKind) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!video) {
    return null;
  }

  const channel = getChannelProfile(video.channelKey);
  const [projectBible, imagePromptBible, characterBible] = await Promise.all([
    readProjectText(channel.projectBiblePath),
    readProjectText(channel.imagePromptBiblePath),
    readOptionalProjectText(channel.characterBiblePath),
  ]);
  const computedStatus = getComputedVideoStatus(video);
  const promptVideoData = {
    id: video.id,
    channelKey: channel.key,
    channelName: channel.name,
    topic: video.topic,
    topicCategory: video.topicCategory,
    title: video.title,
    status: computedStatus,
  };
  const topicCategory = getChannelTopicCategory(
    channel.key,
    video.topicCategory,
  );
  const topicCategoryPromptSection =
    channel.key === "wealth-insights" && topicCategory
      ? [
          [
            "Wealth Insights Topic Rotation",
            `This video belongs to the Wealth Insights topic category: ${topicCategory.label}.\n\nCategory description: ${topicCategory.description}\n\nGenerate an angle that fits this category and does not feel repetitive with recent topics. Do not apply this finance category system to other channels.`,
          ],
        ] as Array<[string, string]>
      : [];
  const scenesForPrompt = video.scenes.map((scene) => ({
    id: scene.id,
    order: scene.sortOrder,
    scriptText: scene.scriptText,
    sceneType: scene.sceneType,
    visualPurpose: scene.visualPurpose,
    visualIdea: scene.visualIdea,
    duration: scene.duration,
    imagePrompt: scene.imagePrompt,
    imageUrl: scene.imageUrl,
    status: scene.status,
  }));

  switch (kind) {
    case "angle-builder": {
      const angleBuilderPrompt = await readProjectText(
        channel.prompts.angleBuilder,
      );
      return buildPrompt([
        ["Channel Profile", channel],
        ["Project Bible", projectBible],
        ...topicCategoryPromptSection,
        ["Angle Builder Prompt", angleBuilderPrompt],
        [
          "Current Video Data",
          { ...promptVideoData, ideaJson: parseJsonForPrompt(video.ideaJson) },
        ],
      ]);
    }

    case "script-writer": {
      const scriptWriterPrompt = await readProjectText(
        channel.prompts.scriptWriter,
      );
      const parsedIdeaJson = parseJsonForPrompt(video.ideaJson);
      const linkedTopicIdea = await getLinkedTopicIdea({
        videoId: video.id,
        channelKey: channel.key,
        ideaJson: parsedIdeaJson,
      });
      const topicSourceMetadata = buildTopicSourceMetadata(linkedTopicIdea);
      const additionalScriptGuidance = buildAdditionalScriptGuidance(
        channel.key,
        parsedIdeaJson,
      );

      return buildPrompt([
        ["Channel Profile", channel],
        ["Project Bible", projectBible],
        ["Script Writer Prompt", scriptWriterPrompt],
        [
          "Current Idea JSON",
          buildFlattenedCurrentIdeaJson({
            video,
            parsedIdeaJson,
            linkedTopicIdea,
          }),
        ],
        ...(topicSourceMetadata
          ? ([["Topic Source Metadata", topicSourceMetadata]] as Array<
              [string, unknown]
            >)
          : []),
        ...(additionalScriptGuidance
          ? ([["Additional Script Guidance", additionalScriptGuidance]] as Array<
              [string, unknown]
            >)
          : []),
      ]);
    }

    case "visual-planner": {
      const visualPlannerPrompt = await readProjectText(
        channel.prompts.visualPlanner,
      );
      return buildPrompt([
        ["Channel Profile", channel],
        ["Project Bible", projectBible],
        ["Image Prompt Bible", imagePromptBible],
        ...(characterBible
          ? ([["Character Bible", characterBible]] as Array<[string, string]>)
          : []),
        ["Visual Planner Prompt", visualPlannerPrompt],
        [
          "Current Video Data",
          {
            ...promptVideoData,
            ideaJson: parseJsonForPrompt(video.ideaJson),
            script: video.script,
          },
        ],
      ]);
    }

    case "metadata-writer": {
      const metadataWriterPrompt = await readProjectText(
        channel.prompts.metadataWriter,
      );
      return buildPrompt([
        ["Channel Profile", channel],
        ["Project Bible", projectBible],
        ["Metadata Writer Prompt", metadataWriterPrompt],
        [
          "Current Video Package",
          {
            ...promptVideoData,
            ideaJson: parseJsonForPrompt(video.ideaJson),
            script: video.script,
            scenes: scenesForPrompt,
            metadataJson: parseJsonForPrompt(video.metadataJson),
          },
        ],
      ]);
    }
  }
}
