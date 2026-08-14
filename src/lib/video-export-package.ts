import { prisma } from "@/lib/prisma";
import { getChannelProfile, getChannelTopicCategory } from "@/lib/channels-server";
import { getComputedVideoStatus } from "@/lib/status";
import {
  exportCuesToSrt,
  exportCuesToVtt,
  type FormattedSubtitleCue,
} from "@/lib/subtitles";
import {
  exportActiveWordCaptionsToAss,
  exportActiveWordCaptionsToJson,
} from "@/lib/subtitle-alignment";
import { getCaptionStylePreset } from "@/lib/caption-styles";

function parseJsonForExport(value: string | null) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseFormattedSubtitleCues(value: unknown): FormattedSubtitleCue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((cue) => {
      if (!cue || typeof cue !== "object") {
        return null;
      }

      const item = cue as Partial<FormattedSubtitleCue>;

      if (
        typeof item.index !== "number" ||
        typeof item.start !== "number" ||
        typeof item.end !== "number" ||
        typeof item.text !== "string" ||
        typeof item.rawText !== "string"
      ) {
        return null;
      }

      return {
        ...item,
        index: item.index,
        start: item.start,
        end: item.end,
        text: item.text,
        rawText: item.rawText,
      } as FormattedSubtitleCue;
    })
    .filter((cue): cue is FormattedSubtitleCue => Boolean(cue));
}

export async function getVideoExportPackage(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        orderBy: { sortOrder: "asc" },
      },
      voiceoverSegments: {
        orderBy: { index: "asc" },
      },
      subtitleSegments: {
        orderBy: { index: "asc" },
      },
      renderDrafts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!video) {
    return null;
  }

  const computedStatus = getComputedVideoStatus(video);
  const channel = getChannelProfile(video.channelKey);
  const topicCategory = getChannelTopicCategory(channel.key, video.topicCategory);
  const subtitleCues = parseFormattedSubtitleCues(video.formattedSubtitleJson);
  const subtitleAss =
    video.styledSubtitleAss ??
    exportActiveWordCaptionsToAss(
      subtitleCues,
      getCaptionStylePreset(video.captionStylePreset),
    );
  const activeWordJson =
    video.styledSubtitleJson ?? exportActiveWordCaptionsToJson(subtitleCues);
  const segmentedVoiceoverReady =
    video.voiceoverSegments.length > 0 &&
    video.voiceoverSegments.every(
      (segment) =>
        segment.audioPath &&
        (segment.status === "generated" || segment.status === "ready"),
    );
  const scenes = video.scenes.map((scene) => ({
    id: scene.id,
    order: scene.sortOrder,
    scriptText: scene.scriptText,
    sceneType: scene.sceneType,
    visualPurpose: scene.visualPurpose,
    visualIdea: scene.visualIdea,
    duration: scene.duration,
    imagePrompt: scene.imagePrompt,
    imageUrl: scene.imageUrl,
    imageLocalPath: scene.imageLocalPath,
    imageStatus: scene.imageStatus,
    imageError: scene.imageError,
    imageBatchId: scene.imageBatchId,
    imageFileName: scene.imageFileName,
    voiceoverStatus: scene.voiceoverStatus,
    voiceoverLocalPath: scene.voiceoverLocalPath,
    voiceoverFileName: scene.voiceoverFileName,
    voiceoverDuration: scene.voiceoverDuration,
    voiceoverError: scene.voiceoverError,
    voiceoverProvider: scene.voiceoverProvider,
    voiceoverSettingsJson: scene.voiceoverSettingsJson,
    pauseAfterMs: scene.pauseAfterMs,
    status: scene.status,
  }));
  const latestRenderDraft = video.renderDrafts[0] ?? null;
  const parsedIdeaJson = parseJsonForExport(video.ideaJson);
  const topicIdeaId =
    parsedIdeaJson &&
    typeof parsedIdeaJson === "object" &&
    !Array.isArray(parsedIdeaJson) &&
    typeof (parsedIdeaJson as { topicIdeaId?: unknown }).topicIdeaId === "string"
      ? (parsedIdeaJson as { topicIdeaId: string }).topicIdeaId
      : null;
  const topicIdea = await prisma.topicIdea.findFirst({
    where: {
      channelKey: "wealth-insights",
      OR: [
        { createdVideoId: video.id },
        ...(topicIdeaId ? [{ id: topicIdeaId }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  return {
    id: video.id,
    channelKey: channel.key,
    channelName: channel.name,
    topic: video.topic,
    topicCategory: video.topicCategory,
    channelTopicSystem:
      channel.key === "wealth-insights" && topicCategory
        ? {
            categoryLabel: topicCategory.label,
            categoryDescription: topicCategory.description,
          }
        : null,
    title: video.title,
    status: computedStatus,
    ideaJson: parsedIdeaJson,
    topicIdea: topicIdea
      ? {
          id: topicIdea.id,
          category: topicIdea.category,
          title: topicIdea.title,
          topic: topicIdea.topic,
          angle: topicIdea.angle,
          uniqueMechanism: topicIdea.uniqueMechanism,
          scriptureAnchor: topicIdea.scriptureAnchor,
          centralQuestion: topicIdea.centralQuestion,
          commonMisunderstanding: topicIdea.commonMisunderstanding,
          spiritualTurn: topicIdea.spiritualTurn,
          trigger: topicIdea.trigger,
          promise: topicIdea.promise,
          visualHook: topicIdea.visualHook,
          thumbnailIdea: topicIdea.thumbnailIdea,
          repetitionRisk: topicIdea.repetitionRisk,
        }
      : null,
    script: video.script,
    scenes,
    voiceover: {
      mode: video.voiceoverAudioPath?.includes("voiceover_by_scene_master")
        ? "by_scene"
        : segmentedVoiceoverReady
          ? "by_segment"
          : "full_script",
      audioPath: video.voiceoverAudioPath,
      fileName: video.voiceoverFileName,
      durationSec: video.voiceoverDurationSec,
      status: video.voiceoverStatus,
      sceneDurationsUpdatedFromAudio: video.scenes.some(
        (scene) => scene.voiceoverDuration && scene.duration,
      ),
    },
    voiceoverSegments: video.voiceoverSegments.map((segment) => ({
      index: segment.index,
      sceneStartOrder: segment.sceneStartOrder,
      sceneEndOrder: segment.sceneEndOrder,
      text: segment.text,
      audioPath: segment.audioPath,
      fileName: segment.fileName,
      durationSec: segment.durationSec,
      status: segment.status,
      provider: segment.provider,
      voiceId: segment.voiceId,
      modelId: segment.modelId,
      outputFormat: segment.outputFormat,
    })),
    segmentedVoiceoverReady,
    subtitles: {
      rawFormat: video.rawSubtitleFormat,
      status: video.subtitleStatus,
      formattedSrt: subtitleCues.length > 0 ? exportCuesToSrt(subtitleCues) : null,
      formattedVtt: subtitleCues.length > 0 ? exportCuesToVtt(subtitleCues) : null,
      cues: subtitleCues,
    },
    subtitleSegments: video.subtitleSegments.map((segment) => ({
      index: segment.index,
      voiceoverSegmentId: segment.voiceoverSegmentId,
      sceneStartOrder: segment.sceneStartOrder,
      sceneEndOrder: segment.sceneEndOrder,
      status: segment.status,
      localCues: parseFormattedSubtitleCues(segment.localCuesJson),
      globalCues: parseFormattedSubtitleCues(segment.globalCuesJson),
      localSrt: segment.localSrt,
      globalSrt: segment.globalSrt,
      localVtt: segment.localVtt,
      globalVtt: segment.globalVtt,
      provider: segment.provider,
    })),
    combinedSubtitles: {
      status: video.subtitleStatus,
      cues: subtitleCues,
      srt: subtitleCues.length > 0 ? exportCuesToSrt(subtitleCues) : null,
      vtt: subtitleCues.length > 0 ? exportCuesToVtt(subtitleCues) : null,
      ass: subtitleCues.length > 0 ? subtitleAss : null,
      activeWordJson,
    },
    captions: {
      stylePreset: video.captionStylePreset,
      cues: subtitleCues,
      ass: subtitleCues.length > 0 ? subtitleAss : null,
      srt: subtitleCues.length > 0 ? exportCuesToSrt(subtitleCues) : null,
      vtt: subtitleCues.length > 0 ? exportCuesToVtt(subtitleCues) : null,
    },
    renderDraft: {
      status: video.renderDraftStatus,
      outputPath: latestRenderDraft?.outputPath ?? null,
      fileName: latestRenderDraft?.fileName ?? null,
      durationSec: latestRenderDraft?.durationSec ?? null,
      width: latestRenderDraft?.width ?? null,
      height: latestRenderDraft?.height ?? null,
      fps: latestRenderDraft?.fps ?? null,
      error: latestRenderDraft?.error ?? null,
    },
    thumbnail: {
      status: video.thumbnailStatus,
      conceptJson: video.thumbnailConceptJson,
      variations: video.thumbnailVariationsJson,
      prompt: video.thumbnailPrompt,
      negativePrompt: video.thumbnailNegativePrompt,
      imagePath: video.thumbnailImagePath,
      imageUrl: video.thumbnailImageUrl,
      fileName: video.thumbnailFileName,
      notes: video.thumbnailNotes,
    },
    metadataJson: parseJsonForExport(video.metadataJson),
    exportedAt: new Date().toISOString(),
  };
}
