"use server";

import { access, mkdir, readFile, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ImportScenesState } from "@/lib/action-types";
import { getChannelProfile, getDefaultChannelKey } from "@/lib/channels-server";
import { importDownloadedImagesFromFolder } from "@/lib/download-matcher";
import {
  CHATTERBOX_PROVIDER,
  generateChatterboxSpeech,
} from "@/lib/chatterbox";
import {
  alignElevenLabsAudioWithText,
  generateElevenLabsSpeech,
} from "@/lib/elevenlabs";
import {
  GOOGLE_TTS_PROVIDER,
  generateGoogleTtsSpeech,
  languageCodeFromVoiceName,
} from "@/lib/google-tts";
import {
  buildExpressiveVoiceoverText,
  mapPodcastActingCuesToScenes,
  resolveVoiceoverModelForActingCues,
} from "@/lib/podcast-acting-cues";
import {
  findNamedVoice,
  readElevenLabsPreferences,
  resolveChatterboxVoiceMode,
  resolveElevenLabsPreferenceSettings,
  resolveNamedVoiceProvider,
  saveElevenLabsPreferences,
  saveNamedElevenLabsVoices,
  settingsFromVoiceoverJson,
  type ElevenLabsPreferenceSettings,
  type NamedElevenLabsVoice,
} from "@/lib/elevenlabs-preferences";
import {
  generateThumbnailWithGoogleFlow,
  runGoogleFlowBatch,
} from "@/lib/google-flow";
import { getAudioDurationSec } from "@/lib/audio";
import {
  attachMusicBedFileToScenePaths,
  attachImportedMusicBedFileToScenePaths,
  MusicBedAttachError,
} from "@/lib/music-bed-attach";
import {
  getMusicBedPreset,
  isMusicBedScene,
  suggestMusicBedPresetId,
  MUSIC_BED_MIN_INTRO_SEC,
  MUSIC_BED_PROVIDER,
} from "@/lib/music-beds";
import {
  buildOverlapAwareSceneDurations,
  effectiveScenePauseAfterMs,
  musicBedOverlapsFromSteps,
  planMusicBedStitch,
  sceneVisualDurationSec,
} from "@/lib/music-bed-stitch";
import {
  appendImageBatchLog,
  applyScenePromptOverridesFromForm,
  clearGeneratedImagesForVideo,
  generatedImagesDir,
  ImageBatchWorkflowError,
  parsePositiveInt,
  parseSelectedSceneIds,
  prepareImageBatchPayload,
  removePreviousGeneratedImage,
  requestImageBatchCancel,
} from "@/lib/image-batches";
import {
  assignPodcastImageLibraryToVideo,
  importPodcastImageLibraryFromVideo,
  syncPodcastImageLibraryManifest,
  summarizePodcastImageLibrary,
} from "@/lib/podcast-image-library";
import { attachPodcastFolderStillToVideo } from "@/lib/podcast-folder-still";
import { insertPodcastPartCoversFromScript, stripLeakedPartHeadingsFromScenes } from "@/lib/podcast-part-cover-insert";
import { isPartCoverVisualIdea } from "@/lib/podcast-part-covers";
import {
  attachPodcastSectionClipsFromVisualIdeas,
} from "@/lib/podcast-video-library";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";
import { THE_GODS_WORD_CHANNEL_KEY } from "@/lib/the-gods-word-script-prompt";
import {
  displayImageOutputFolder,
  resolveImageOutputFolderAbsolute,
} from "@/lib/image-output-folder";
import {
  parseAlignmentProvider,
  resolvePipelineSettings,
  resolveVideoImageOutputFolderAbsolute,
  saveVideoImageOutputFolder,
  saveVideoPipelineSettings,
  type AlignmentProvider,
} from "@/lib/pipeline-settings";
import { prisma } from "@/lib/prisma";
import {
  alignWhisperXAudioWithText,
  normalizeWhisperXAlignment,
  WHISPERX_SUBTITLE_PROVIDER,
} from "@/lib/whisperx";
import {
  buildScenePatchApplyItems,
  buildScenePatchPrependItems,
  buildScenePatchPreview,
} from "@/lib/scene-patch";
import {
  sortExistingScenesForUpwardShift,
  sortScenesByOptionalOrder,
  type PrependSceneDraft,
} from "@/lib/scene-prepend";
import {
  buildHookReplacementPreview,
  parseHookReplacementPatch,
  normalizeNarrationText,
} from "@/lib/hook-replacement-patch";
import {
  cancelProcess,
  failProcess,
  finishProcess,
  startProcess,
  updateProcess,
} from "@/lib/process-runs";
import {
  ensureFfmpegAvailable,
  ensureFfmpegAssFilterAvailable,
  getMediaSummary,
  getRenderFfmpegDiagnostics,
  probeMedia,
  validateAudioFile,
} from "@/lib/render/ffmpeg";
import {
  renderCombinedVoiceoverAudio,
  stitchSceneVoiceoverAudio,
} from "@/lib/render/audio";
import {
  extractFittedClipAudio,
  ensureExclusiveSceneVoiceoverAudio,
  prepareExclusiveClipAudioForScene,
  replaceMasterAudioSegment,
  resolveSceneClipPath,
  sceneUsesExclusiveClipAudio,
  storeUploadedSceneClip,
  removePreviousSceneClip,
  isSupportedSceneClipExtension,
} from "@/lib/scene-clips";
import { renderImageSequenceVideo } from "@/lib/render/images";
import { shouldAttachVoiceSoundBars } from "@/lib/render/voice-sound-bars";
import { parseVoiceSoundBarsStyle } from "@/lib/render/voice-sound-bars-shared";
import {
  FinalRenderValidationError,
  renderFinalDraftVideo,
  writeRenderSubtitles,
} from "@/lib/render/final";
import { renderFinalVideoFileName } from "@/lib/render/output-name";
import {
  ensureRenderDir,
  renderRelativePath,
} from "@/lib/render/storage";
import { buildSceneTimelineFromSegments } from "@/lib/render/timing";
import {
  getComputedVideoStatus,
  isSceneRejected,
  sceneIncludedInPipelineWhere,
} from "@/lib/status";
import {
  exportCuesToSrt,
  exportCuesToVtt,
  formatSubtitleCuesForReadableCaptions,
  isSilentSubtitleVoiceoverText,
  parseSubtitleText,
  type FormattedSubtitleCue,
  type SubtitleInputFormat,
} from "@/lib/subtitles";
import {
  shouldRestorePreservedSubtitleCues,
  spokenTextForSubtitlePreserve,
  restoredSubtitleSegmentStatus,
  subtitleSegmentPreserveKey,
  type PreservedSubtitleSegmentSnapshot,
} from "@/lib/subtitle-segment-preserve";
import {
  ACTIVE_WORD_ASS_EVENT_OVERLAP_SEC,
  ACTIVE_WORD_ASS_TIMING_MODEL,
  analyzeActiveWordAssEvents,
  buildActiveWordCaptionCuesFromWords,
  exportActiveWordCaptionsToAss,
  exportCombinedCues,
  cleanSubtitleDisplayText,
  fitAlignedWordsToAudioDuration,
  normalizeElevenLabsAlignment,
  offsetCues,
  prepareAlignedWordsForCaptionStyle,
} from "@/lib/subtitle-alignment";
import { getCaptionStylePreset } from "@/lib/caption-styles";
import {
  applyVoiceoverPacingText,
  DEFAULT_VOICEOVER_PACING,
  VOICEOVER_PACE_PRESETS,
  VOICEOVER_PAUSE_STYLES,
  type VoiceoverPacePreset,
  type VoiceoverPauseStyle,
} from "@/lib/voiceover-pacing";
import {
  createSegmentsFromScenes as buildVoiceoverSegmentsFromScenes,
  createSingleSceneSegment,
  ensureVoiceoverSegmentsDir,
  splitSegmentAtSceneOrder,
  splitSegmentByScene,
  voiceoverSegmentFileName,
  voiceoverSegmentRelativePath,
  type VoiceoverSegmentDraft,
} from "@/lib/voiceover-segments";
import { stripStructuralMarkers } from "@/lib/visual-plan-script";
import {
  foldPauseCardScenesIntoPauseAfterMs,
  normalizePauseAfterMs,
} from "@/lib/podcast-pause-cues";
import {
  DEFAULT_SCENE_PAUSE_AFTER_MS,
  ensureSceneVoiceoversDir,
  getPauseAfterScene,
  normalizeSceneVoiceoverText,
  sceneVoiceoverFileName,
  sceneVoiceoverMasterRelativePath,
  sceneVoiceoverRelativePath,
} from "@/lib/voiceover-scenes";
import {
  prepareVoiceoverSpeechText,
  remapSpeechWordsToDisplay,
} from "@/lib/speech-text";
import { groupScenesByScriptSection, applyManualSectionRanges } from "@/lib/script-sections";
import {
  extractVoiceoverSectionRanges,
  normalizeVoiceoverSectionVoices,
  resolveSceneVoiceoverSettings,
} from "@/lib/voiceover-section-voices";
import {
  PODCAST_INTRO_SCENE_PAUSE_AFTER_MS,
  mapScenesToPodcastDeliveryModes,
  resolvePodcastHostKey,
  resolvePodcastSectionSpeakingRate,
  type PodcastDeliveryMode,
} from "@/lib/podcast-voice-profiles";
import { resolvePodcastEpisodeFormat } from "@/lib/podcast-english-lessons-script-shared";
import {
  buildBibleOneYearDayConfigFromPlan,
  extractBibleOneYearDayConfig,
  getBibleOneYearJourneyState,
  getBibleOneYearPlanDay,
  isBibleOneYearCategory,
  normalizeBibleOneYearDayConfig,
} from "@/lib/the-bible-in-one-year";
import {
  collectCoveredBibleOneYearDays,
  normalizeBibleOneYearSectionRange,
  suggestNextBibleOneYearSection,
} from "@/lib/the-bible-in-one-year-topic-batch";
import {
  buildThumbnailConcepts,
  buildThumbnailPrompt,
  normalizeOverlayText,
  parseThumbnailConcept,
  parseThumbnailConcepts,
  THUMBNAIL_NEGATIVE_PROMPT,
  type ThumbnailConcept,
} from "@/lib/thumbnail";
import {
  parseTopicBatchJson,
  persistTopicBatchIdeas,
} from "@/lib/topic-batch-import";
import { runTopicBatchViaBrowser, TopicBatchRunError } from "@/lib/topic-batch-run";
import { runScriptWriterViaBrowser } from "@/lib/script-writer-run";
import {
  ScriptWriterCanceledError,
  requestScriptWriterCancel,
} from "@/lib/script-writer-cancel";
import { runVisualPlanViaBrowser } from "@/lib/visual-plan-run";
import {
  clearVisualPlanHybridCheckpoint,
  getVisualPlanHybridCheckpointSummary,
} from "@/lib/visual-plan-checkpoint";
import {
  buildPodcastVisualPlanSkeleton,
  skeletonScenesToImportJson,
} from "@/lib/visual-plan-skeleton";
import {
  VisualPlanCanceledError,
  requestVisualPlanCancel,
} from "@/lib/visual-plan-cancel";
import {
  SceneVoiceoverCanceledError,
  clearSceneVoiceoverCancel,
  isSceneVoiceoverCancelRequested,
} from "@/lib/scene-voiceover-cancel";
import {
  sceneVoiceoverAudioHasUsableStream,
  sceneVoiceoverFileExists,
} from "@/lib/scene-voiceover-audio";
import type { RecentTopicContext } from "@/lib/topic-batch-prompt";
import { readTopicBatchDraft } from "@/lib/topic-batch-extract";

const emptyToNull = (value: FormDataEntryValue | null) => {
  const text = value?.toString().trim();
  return text ? text : null;
};

const validSceneTypes = new Set(["avatar", "insert", "space"]);

const requiredText = (formData: FormData, key: string) =>
  formData.get(key)?.toString().trim() ?? "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countAssDialogueEvents(assText: string | null | undefined) {
  return (assText?.match(/^Dialogue:/gm) ?? []).length;
}

function countActiveWordCues(styledSubtitleJson: unknown) {
  if (!isRecord(styledSubtitleJson) || !Array.isArray(styledSubtitleJson.cues)) {
    return 0;
  }

  return styledSubtitleJson.cues.length;
}

function activeWordCuesFromJson(styledSubtitleJson: unknown) {
  if (!isRecord(styledSubtitleJson) || !Array.isArray(styledSubtitleJson.cues)) {
    return [];
  }

  return styledSubtitleJson.cues as FormattedSubtitleCue[];
}

function isRedirectError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  return (
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

async function cleanupRenderDraftFiles(
  renderDirectory: string,
  extraFileNames: string[] = [],
) {
  const staleFileNames = [
    "draft.mp4",
    "scene_video.mp4",
    "draft_audio.mp3",
    "draft_audio.wav",
    "draft_subtitles.ass",
    "render_manifest.json",
    "render.log",
    ...extraFileNames,
  ];

  await Promise.all(
    [...new Set(staleFileNames)].map(async (fileName) => {
      try {
        await unlink(path.join(renderDirectory, fileName));
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) {
          throw error;
        }
      }
    }),
  );
}

function parseOptionalJsonField(
  value: FormDataEntryValue | null,
  fieldName: string,
) {
  const text = emptyToNull(value);

  if (!text) {
    return null;
  }

  try {
    JSON.parse(text);
    return text;
  } catch {
    throw new Error(`${fieldName} must be valid JSON or empty.`);
  }
}

const videoSchema = z.object({
  channelKey: z.string().min(1),
  topic: z.string().min(1),
  topicCategory: z.string().nullable(),
  title: z.string().min(1),
  ideaJson: z.string().nullable(),
});

function normalizeChannelKey(value: FormDataEntryValue | null) {
  const key = value?.toString().trim() || getDefaultChannelKey();

  return getChannelProfile(key).key;
}

function normalizeTopicCategory(
  channelKey: string,
  value: FormDataEntryValue | null,
) {
  const categoryId = emptyToNull(value);
  const channel = getChannelProfile(channelKey);

  if (!channel.topicSystem?.enabled || !categoryId) {
    return null;
  }

  return channel.topicSystem.categories.some(
    (category) => category.id === categoryId,
  )
    ? categoryId
    : null;
}

async function persistComputedVideoStatus(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      status: true,
      ideaJson: true,
      script: true,
      metadataJson: true,
      scenes: {
        select: {
          imagePrompt: true,
          status: true,
        },
      },
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  const computedStatus = getComputedVideoStatus(video);

  if (video.status !== computedStatus) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: computedStatus },
    });
  }

  return computedStatus;
}

function topicIdeaToIdeaJson(topicIdea: {
  id: string;
  category: string | null;
  title: string;
  topic: string;
  angle: string | null;
  uniqueMechanism: string | null;
  scriptureAnchor?: string | null;
  centralQuestion?: string | null;
  commonMisunderstanding?: string | null;
  spiritualTurn?: string | null;
  trigger: string | null;
  promise: string | null;
  visualHook: string | null;
  thumbnailIdea: string | null;
  repetitionRisk: string | null;
  notes?: string | null;
}) {
  let bibleOneYear: unknown = null;
  if (topicIdea.notes?.trim()) {
    try {
      const parsed = JSON.parse(topicIdea.notes) as {
        kind?: unknown;
        bibleOneYear?: unknown;
      };
      if (parsed.kind === "the_bible_in_one_year_day") {
        bibleOneYear = parsed.bibleOneYear ?? null;
      }
    } catch {
      bibleOneYear = null;
    }
  }

  return {
    source: "topic_queue",
    topicIdeaId: topicIdea.id,
    rawIdea: topicIdea.topic,
    workingTitle: topicIdea.title,
    topicCategory: topicIdea.category,
    coreAngle: topicIdea.angle,
    uniqueMechanism: topicIdea.uniqueMechanism,
    scriptureAnchor: topicIdea.scriptureAnchor ?? null,
    centralQuestion: topicIdea.centralQuestion ?? null,
    commonMisunderstanding: topicIdea.commonMisunderstanding ?? null,
    spiritualTurn: topicIdea.spiritualTurn ?? null,
    emotionalHook: topicIdea.trigger,
    mainPromise: topicIdea.promise,
    visualAnchor: topicIdea.visualHook,
    thumbnailIdea: topicIdea.thumbnailIdea,
    repetitionRisk: topicIdea.repetitionRisk,
    ...(bibleOneYear ? { bibleOneYear } : {}),
  };
}

function redirectToIdea(videoId: string, params: Record<string, string | number | null | undefined> = {}) {
  const searchParams = new URLSearchParams({ tab: "idea" });

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  redirect(`/videos/${videoId}?${searchParams.toString()}`);
}

function redirectToNewVideo(params: Record<string, string | number | null | undefined> = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  redirect(`/videos/new${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`);
}

export async function createVideo(formData: FormData) {
  const channelKey = normalizeChannelKey(formData.get("channelKey"));
  const data = videoSchema.parse({
    channelKey,
    topic: requiredText(formData, "topic"),
    topicCategory: normalizeTopicCategory(
      channelKey,
      formData.get("topicCategory"),
    ),
    title: requiredText(formData, "title"),
    ideaJson: parseOptionalJsonField(formData.get("ideaJson"), "ideaJson"),
  });

  const video = await prisma.video.create({
    data: {
      ...data,
      status: getComputedVideoStatus({ ...data, script: null, metadataJson: null, scenes: [] }),
    },
  });
  await mkdir(generatedImagesDir(video.id, video.title), { recursive: true });
  revalidatePath("/");
  if (getChannelProfile(channelKey).pipelineMode === "audio_only") {
    redirect(`/videos/${video.id}?tab=script`);
  }
  redirect(`/videos/${video.id}`);
}

export async function updateVideoIdea(videoId: string, formData: FormData) {
  const channelKey = normalizeChannelKey(formData.get("channelKey"));
  const data = videoSchema.parse({
    channelKey,
    topic: requiredText(formData, "topic"),
    topicCategory: normalizeTopicCategory(
      channelKey,
      formData.get("topicCategory"),
    ),
    title: requiredText(formData, "title"),
    ideaJson: parseOptionalJsonField(formData.get("ideaJson"), "ideaJson"),
  });

  await prisma.video.update({
    where: { id: videoId },
    data,
  });
  await persistComputedVideoStatus(videoId);

  // Keep refresh scoped to this video page — home list is not needed for idea edits.
  revalidatePath(`/videos/${videoId}`);
  redirectToIdea(videoId, { saved: "1" });
}

export async function mockGenerateIdea(videoId: string, formData: FormData) {
  const channelKey = normalizeChannelKey(formData.get("channelKey"));
  const topic = requiredText(formData, "topic");
  const title = requiredText(formData, "title");
  const topicCategory = normalizeTopicCategory(
    channelKey,
    formData.get("topicCategory"),
  );
  const topicCategoryInfo = getChannelProfile(channelKey).topicSystem?.categories.find(
    (category) => category.id === topicCategory,
  );
  const rawIdea = topic || "Untitled video idea";
  const workingTitle = title || rawIdea;

  const idea = {
    rawIdea,
    workingTitle,
    topicCategory,
    topicCategoryLabel: topicCategoryInfo?.label ?? null,
    coreAngle: `Explain why ${rawIdea.toLowerCase()} matters in a way that feels clear, practical, and emotionally relatable.`,
    viewerProblem:
      "The viewer has heard the topic before, but it still feels confusing or disconnected from daily life.",
    emotionalHook:
      "This seems simple from the outside, but the real-world experience feels more frustrating than expected.",
    centralQuestion: `What is really happening behind ${rawIdea.toLowerCase()}?`,
    mainPromise:
      "By the end, the viewer will have a clearer mental model and a more useful way to think about the decision.",
    simpleThesis:
      "The clearest answer comes from separating the headline from the mechanism underneath it.",
    whyNow:
      "People are trying to make sense of financial decisions while headlines, prices, and expectations keep moving.",
    visualAnchor:
      "A confusing public headline turning into a simple visual map of causes and consequences.",
    titleOptions: [
      workingTitle,
      `The Hidden Mechanism Behind ${workingTitle}`,
      `Why ${workingTitle} Feels So Confusing`,
      `What Most People Miss About ${workingTitle}`,
      `${workingTitle}, Explained Simply`,
    ],
    thumbnailConcepts: [
      {
        text: "WHY?",
        visual:
          "A confused viewer looking at two financial signals moving in opposite directions.",
      },
      {
        text: "NOT SO SIMPLE",
        visual:
          "A clean split-screen between a headline and the real mechanism underneath.",
      },
      {
        text: "LOOK HERE",
        visual: "A spotlight on the hidden part of a financial system.",
      },
    ],
    scriptDirection: {
      opening: "Start with a contradiction the viewer recognizes immediately.",
      middle: "Break the mechanism into simple parts with visual examples.",
      ending:
        "Close with a practical reframe that makes the topic easier to understand.",
    },
    avoid: [
      "Financial promises",
      "Generic motivation",
      "Fake urgency",
      "Overcomplicated terminology",
    ],
  };

  await prisma.video.update({
    where: { id: videoId },
    data: {
      topic: rawIdea,
      topicCategory,
      title: workingTitle,
      ideaJson: JSON.stringify(idea, null, 2),
    },
  });
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function importTopicBatch(formData: FormData) {
  const channelKey = normalizeChannelKey(formData.get("channelKey"));
  const channel = getChannelProfile(channelKey);

  if (!channel.topicSystem?.enabled) {
    throw new Error(`Topic batch import is not enabled for ${channel.name}.`);
  }

  const rawJson = requiredText(formData, "topicBatchJson");
  const selectedCategory = emptyToNull(formData.get("selectedCategory"));

  if (!rawJson) {
    throw new Error("Topic batch JSON is required.");
  }

  const normalizedTopics = parseTopicBatchJson(rawJson);
  const { importedCount, skippedCount } = await persistTopicBatchIdeas({
    channelKey,
    topics: normalizedTopics,
    source: "manual_chatgpt_batch",
  });

  const mismatchCount = selectedCategory
    ? normalizedTopics.filter((topic) => topic.category !== selectedCategory).length
    : 0;
  const mismatchNotice =
    mismatchCount > 0
      ? ` Some imported topics do not match the selected category.`
      : "";

  revalidatePath("/videos/new");
  redirectToNewVideo({
    channelKey,
    topicCategory: selectedCategory,
    topicQueueNotice: `Imported ${importedCount} topics, skipped ${skippedCount} duplicates.${mismatchNotice}`,
  });
}

async function loadRecentTopicContexts(channelKey: string): Promise<RecentTopicContext[]> {
  const recentTopicIdeas = await prisma.topicIdea.findMany({
    where: {
      channelKey,
      status: { in: ["selected", "used", "scripted", "produced"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      category: true,
      title: true,
      angle: true,
      uniqueMechanism: true,
      scriptureAnchor: true,
      centralQuestion: true,
      commonMisunderstanding: true,
      spiritualTurn: true,
      visualHook: true,
      thumbnailIdea: true,
    },
  });

  const recentVideos = await prisma.video.findMany({
    where: {
      channelKey,
      topicCategory: { not: null },
      ideaJson: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      topicCategory: true,
      ideaJson: true,
    },
  });

  const linkedVideoIds = new Set(
    (
      await prisma.topicIdea.findMany({
        where: {
          channelKey,
          createdVideoId: { not: null },
        },
        select: { createdVideoId: true },
      })
    )
      .map((topic) => topic.createdVideoId)
      .filter((id): id is string => Boolean(id)),
  );

  const fromVideos: RecentTopicContext[] = recentVideos
    .filter((video) => !linkedVideoIds.has(video.id))
    .map((video) => {
      try {
        const parsed = video.ideaJson ? (JSON.parse(video.ideaJson) as Record<string, unknown>) : null;
        return {
          category: video.topicCategory,
          title: video.title,
          angle:
            typeof parsed?.coreAngle === "string"
              ? parsed.coreAngle
              : typeof parsed?.angle === "string"
                ? parsed.angle
                : null,
          uniqueMechanism:
            typeof parsed?.uniqueMechanism === "string" ? parsed.uniqueMechanism : null,
          scriptureAnchor:
            typeof parsed?.scriptureAnchor === "string" ? parsed.scriptureAnchor : null,
          centralQuestion:
            typeof parsed?.centralQuestion === "string" ? parsed.centralQuestion : null,
          commonMisunderstanding:
            typeof parsed?.commonMisunderstanding === "string"
              ? parsed.commonMisunderstanding
              : null,
          spiritualTurn:
            typeof parsed?.spiritualTurn === "string" ? parsed.spiritualTurn : null,
          visualHook:
            typeof parsed?.visualAnchor === "string"
              ? parsed.visualAnchor
              : typeof parsed?.visualHook === "string"
                ? parsed.visualHook
                : null,
          thumbnailIdea:
            typeof parsed?.thumbnailIdea === "string" ? parsed.thumbnailIdea : null,
        };
      } catch {
        return {
          category: video.topicCategory,
          title: video.title,
          angle: null,
          uniqueMechanism: null,
          scriptureAnchor: null,
          centralQuestion: null,
          commonMisunderstanding: null,
          spiritualTurn: null,
          visualHook: null,
          thumbnailIdea: null,
        };
      }
    });

  return [...recentTopicIdeas, ...fromVideos].slice(0, 15);
}

export async function runTopicBatch(formData: FormData) {
  const channelKey = normalizeChannelKey(formData.get("channelKey"));
  const channel = getChannelProfile(channelKey);
  const selectedCategory = emptyToNull(formData.get("selectedCategory"));
  const countRaw = emptyToNull(formData.get("topicBatchCount")) ?? "14";
  const count = Number(countRaw);
  const startDayRaw = emptyToNull(formData.get("bibleOneYearStartDay"));
  const endDayRaw = emptyToNull(formData.get("bibleOneYearEndDay"));

  if (!channel.topicSystem?.enabled) {
    throw new Error(`Topic batch generation is not enabled for ${channel.name}.`);
  }

  try {
    const recentTopics = await loadRecentTopicContexts(channelKey);
    const coveredBibleTitles = await prisma.topicIdea.findMany({
      where: {
        channelKey,
        category: "the_bible_in_one_year",
      },
      select: { title: true },
      take: 400,
      orderBy: { createdAt: "asc" },
    });
    const coveredBibleOneYearDays = collectCoveredBibleOneYearDays(
      recentTopics,
      coveredBibleTitles.map((item) => item.title),
    );
    const bibleOneYearSection =
      selectedCategory === "the_bible_in_one_year" && startDayRaw && endDayRaw
        ? normalizeBibleOneYearSectionRange(Number(startDayRaw), Number(endDayRaw))
        : selectedCategory === "the_bible_in_one_year"
          ? suggestNextBibleOneYearSection(coveredBibleOneYearDays)
          : null;

    const result = await runTopicBatchViaBrowser({
      channelKey,
      count,
      selectedCategoryId: selectedCategory,
      recentTopics,
      bibleOneYearSection,
      coveredBibleOneYearDays,
    });

    revalidatePath("/videos/new");
    redirectToNewVideo({
      channelKey,
      topicCategory: selectedCategory,
      topicBatchDraft: "1",
      topicQueueNotice: bibleOneYearSection
        ? `Run Batch via ${result.providerKey}: imported ${result.importedCount} Bible-in-One-Year days (${bibleOneYearSection.startDay}–${bibleOneYearSection.endDay}), skipped ${result.skippedCount} duplicates (${result.totalCount} returned).`
        : `Run Batch via ${result.providerKey}: imported ${result.importedCount} topics, skipped ${result.skippedCount} duplicates (${result.totalCount} returned).`,
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Topic batch run failed.";
    const draft =
      error instanceof TopicBatchRunError && error.rawText
        ? error.rawText
        : (await readTopicBatchDraft(channelKey))?.rawText;

    revalidatePath("/videos/new");
    redirectToNewVideo({
      channelKey,
      topicCategory: selectedCategory,
      ...(draft ? { topicBatchDraft: "1" } : {}),
      topicQueueNotice: draft
        ? `Run Batch failed: ${message} Raw ChatGPT response was loaded into Import Topic Batch — fix JSON if needed, then Import Topics.`
        : `Run Batch failed: ${message}`,
    });
  }
}

/** @deprecated Prefer importTopicBatch */
export async function importWealthTopicBatch(formData: FormData) {
  if (!formData.get("channelKey")) {
    formData.set("channelKey", "wealth-insights");
  }

  return importTopicBatch(formData);
}

export async function selectTopicIdea(videoId: string, topicIdeaId: string) {
  await prisma.topicIdea.update({
    where: { id: topicIdeaId },
    data: { status: "selected" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToIdea(videoId, { selectedTopicIdeaId: topicIdeaId });
}

export async function archiveTopicIdea(videoId: string, topicIdeaId: string) {
  await prisma.topicIdea.update({
    where: { id: topicIdeaId },
    data: { status: "archived" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToIdea(videoId);
}

export async function markTopicIdeaUsed(videoId: string, topicIdeaId: string) {
  await prisma.topicIdea.update({
    where: { id: topicIdeaId },
    data: { status: "produced" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToIdea(videoId, { selectedTopicIdeaId: topicIdeaId });
}

export async function useTopicIdeaInCurrentVideo(videoId: string, topicIdeaId: string) {
  const [video, topicIdea] = await Promise.all([
    prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, channelKey: true },
    }),
    prisma.topicIdea.findUnique({
      where: { id: topicIdeaId },
    }),
  ]);

  if (!video) {
    throw new Error("Video not found.");
  }

  if (video.channelKey !== "wealth-insights") {
    throw new Error("Topic queue is only available for Wealth Insights videos.");
  }

  if (!topicIdea || topicIdea.channelKey !== "wealth-insights") {
    throw new Error("Topic idea not found.");
  }

  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: {
        topic: topicIdea.topic,
        title: topicIdea.title,
        topicCategory: topicIdea.category,
        ideaJson: JSON.stringify(topicIdeaToIdeaJson(topicIdea), null, 2),
      },
    }),
    prisma.topicIdea.update({
      where: { id: topicIdeaId },
      data: {
        status: "selected",
        createdVideoId: videoId,
      },
    }),
  ]);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  redirectToIdea(videoId, { selectedTopicIdeaId: topicIdeaId });
}

export async function archiveTopicIdeaFromCreate(topicIdeaId: string) {
  const topicIdea = await prisma.topicIdea.findUnique({
    where: { id: topicIdeaId },
    select: { channelKey: true },
  });

  await prisma.topicIdea.update({
    where: { id: topicIdeaId },
    data: { status: "archived" },
  });

  revalidatePath("/videos/new");
  redirectToNewVideo({
    channelKey: topicIdea?.channelKey,
  });
}

export async function createVideoFromTopicIdea(topicIdeaId: string) {
  const topicIdea = await prisma.topicIdea.findUnique({
    where: { id: topicIdeaId },
  });

  if (!topicIdea) {
    throw new Error("Topic idea not found.");
  }

  const channel = getChannelProfile(topicIdea.channelKey);

  if (!channel.topicSystem?.enabled) {
    throw new Error(`Topic queue is not enabled for ${channel.name}.`);
  }

  const ideaJson = JSON.stringify(topicIdeaToIdeaJson(topicIdea), null, 2);
  const newVideo = await prisma.$transaction(async (tx) => {
    const created = await tx.video.create({
      data: {
        channelKey: channel.key,
        topic: topicIdea.topic,
        topicCategory: topicIdea.category,
        title: topicIdea.title,
        ideaJson,
        status: getComputedVideoStatus({
          ideaJson,
          script: null,
          metadataJson: null,
          scenes: [],
        }),
      },
    });

    await tx.topicIdea.update({
      where: { id: topicIdeaId },
      data: {
        status: "selected",
        createdVideoId: created.id,
      },
    });

    return created;
  });

  await mkdir(generatedImagesDir(newVideo.id, newVideo.title), { recursive: true });
  revalidatePath("/");
  if (channel.pipelineMode === "audio_only") {
    redirect(
      `/videos/${newVideo.id}?tab=script&selectedTopicIdeaId=${encodeURIComponent(topicIdeaId)}`,
    );
  }
  redirectToIdea(newVideo.id, { selectedTopicIdeaId: topicIdeaId });
}

export async function updateVideoScript(videoId: string, formData: FormData) {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      script: emptyToNull(formData.get("script")),
    },
  });
  await persistComputedVideoStatus(videoId);

  revalidatePath(`/videos/${videoId}`);
  redirect(`/videos/${videoId}?tab=script&saved=1`);
}

export async function runScriptWriterBatch(videoId: string, formData?: FormData) {
  const includeReferenceTranscripts =
    formData?.get("includeReferenceTranscripts")?.toString() === "1" ||
    formData?.get("includeReferenceTranscripts")?.toString() === "on";
  const resetCheckpoint =
    formData?.get("resetCheckpoint")?.toString() === "1" ||
    formData?.get("resetCheckpoint")?.toString() === "on";
  const referenceDocumentIds = formData
    ? formData
        .getAll("referenceDocumentIds")
        .map((value) => value.toString().trim())
        .filter(Boolean)
    : [];

  try {
    const result = await runScriptWriterViaBrowser({
      videoId,
      includeReferenceTranscripts,
      referenceDocumentIds,
      resetCheckpoint,
    });
    const referenceNote = result.includedReferences
      ? ` References included (${result.referenceCount || "all active"}).`
      : " No reference transcripts included.";
    const resumeNote = result.resumed ? " Resumed from checkpoint." : "";
    const critiqueNote =
      result.briefReason?.trim()
        ? ` Critique: ${result.briefReason.trim()}`
        : "";
    const scoreLabel =
      typeof result.score === "number" ? result.score.toFixed(1) : "n/a";
    const versionNote = result.passed
      ? ` Saved ${result.version} (score ${scoreLabel} > ${result.passScore.toFixed(1)}).`
      : ` Saved ${result.version} after ${result.draftNumber} draft(s); last score ${scoreLabel} still ≤ ${result.passScore.toFixed(1)} (max ${result.maxDrafts}).`;
    revalidatePath(`/videos/${videoId}`);
    redirect(
      `/videos/${videoId}?tab=script&saved=1&scriptNotice=${encodeURIComponent(
        `Run Batch via ${result.providerKey}: script saved (${result.scriptLength} chars).${versionNote}${critiqueNote}${resumeNote}${referenceNote}`,
      )}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (error instanceof ScriptWriterCanceledError) {
      revalidatePath(`/videos/${videoId}`);
      redirect(
        `/videos/${videoId}?tab=script&scriptNotice=${encodeURIComponent(
          "Run Batch canceled. If a draft was saved, Run Batch again to resume from the checkpoint.",
        )}&scriptNoticeType=error`,
      );
    }

    const message =
      error instanceof Error ? error.message : "Script Writer Batch failed.";
    revalidatePath(`/videos/${videoId}`);
    redirect(
      `/videos/${videoId}?tab=script&scriptNotice=${encodeURIComponent(
        `Run Batch failed: ${message}`,
      )}&scriptNoticeType=error`,
    );
  }
}

export async function cancelScriptWriterBatch(videoId: string) {
  requestScriptWriterCancel(videoId);
  return { ok: true as const };
}

export async function runVisualPlanBatch(videoId: string, formData: FormData) {
  const prompt = String(formData.get("prompt") || "").trim();
  const importModeRaw = formData.get("importMode")?.toString();
  const importMode =
    importModeRaw === "append" || importModeRaw === "prepend"
      ? importModeRaw
      : "replace";
  const resetCheckpoint =
    formData.get("resetHybridCheckpoint")?.toString() === "1";

  try {
    const result = await runVisualPlanViaBrowser({
      videoId,
      prompt,
      resetCheckpoint,
    });

    const scenes = parseScenesImport(result.scenesJson);
    if (importMode === "append" || importMode === "prepend") {
      await createScenesFromImport(videoId, scenes, importMode);
    } else {
      await replaceImportedScenes(videoId, scenes);
    }
    await persistComputedVideoStatus(videoId);

    const hybridNote =
      "mode" in result && result.mode === "hybrid"
        ? `, hybrid chunks${
            "resumedFilledCount" in result &&
            typeof result.resumedFilledCount === "number" &&
            result.resumedFilledCount > 0
              ? `, resumed ${result.resumedFilledCount} filled`
              : ""
          }${
            "skippedChunks" in result &&
            typeof result.skippedChunks === "number" &&
            result.skippedChunks > 0
              ? `, skipped ${result.skippedChunks} done chunks`
              : ""
          }`
        : "";

    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
    redirect(
      `/videos/${videoId}?tab=visual-plan&assetNoticeType=success&assetNotice=${encodeURIComponent(
        `Run Batch via ${result.providerKey}: imported ${scenes.length} scenes (${importMode}${hybridNote}).`,
      )}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (error instanceof VisualPlanCanceledError) {
      const checkpoint = await getVisualPlanHybridCheckpointSummary({
        videoId,
        script:
          (
            await prisma.video.findUnique({
              where: { id: videoId },
              select: { script: true },
            })
          )?.script ?? "",
      });
      const unitLabel =
        checkpoint?.unit === "sections" ? "sections" : "scenes";
      const resumeNote = checkpoint
        ? ` Progress saved: ${checkpoint.filled}/${checkpoint.total} ${unitLabel} — Run Batch again to resume.`
        : "";
      revalidatePath(`/videos/${videoId}`);
      redirect(
        `/videos/${videoId}?tab=visual-plan&assetNoticeType=error&assetNotice=${encodeURIComponent(
          `Visual Plan Run Batch canceled.${resumeNote}`,
        )}`,
      );
    }

    const message =
      error instanceof Error ? error.message : "Visual Plan Batch failed.";
    const rawText =
      error &&
      typeof error === "object" &&
      "rawText" in error &&
      typeof (error as { rawText?: unknown }).rawText === "string"
        ? (error as { rawText: string }).rawText
        : null;
    const debugPath =
      error &&
      typeof error === "object" &&
      "debugPath" in error &&
      typeof (error as { debugPath?: unknown }).debugPath === "string"
        ? (error as { debugPath: string }).debugPath
        : null;

    const debugNote = debugPath
      ? ` Debug saved: ${debugPath}.`
      : rawText
        ? " Raw response was not imported — paste it manually if needed."
        : "";

    const videoScript =
      (
        await prisma.video.findUnique({
          where: { id: videoId },
          select: { script: true },
        })
      )?.script ?? "";
    const checkpoint = await getVisualPlanHybridCheckpointSummary({
      videoId,
      script: videoScript,
    });
    const unitLabel =
      checkpoint?.unit === "sections" ? "sections" : "scenes";
    const resumeNote = checkpoint
      ? checkpoint.filled > 0
        ? ` Progress saved: ${checkpoint.filled}/${checkpoint.total} ${unitLabel} — Run Batch again to resume.`
        : ` Checkpoint present (0/${checkpoint.total} ${unitLabel} done) — Run Batch again to retry.`
      : " No hybrid progress was saved yet.";

    revalidatePath(`/videos/${videoId}`);
    redirect(
      `/videos/${videoId}?tab=visual-plan&assetNoticeType=error&assetNotice=${encodeURIComponent(
        `Run Batch failed: ${message}.${debugNote}${resumeNote}`,
      )}`,
    );
  }
}

export async function clearVisualPlanHybridProgress(videoId: string) {
  await clearVisualPlanHybridCheckpoint(videoId);
  revalidatePath(`/videos/${videoId}`);
  redirect(
    `/videos/${videoId}?tab=visual-plan&assetNoticeType=success&assetNotice=${encodeURIComponent(
      "Cleared hybrid visual-plan progress. The next Run Batch starts from the beginning.",
    )}`,
  );
}

/**
 * Podcast library-first path: build scenes locally from script labels
 * (no ChatGPT), replace the visual plan, attach images from the chosen
 * folder when possible, then fill remaining Emma/Leo/music stills from the
 * image library.
 */
export async function buildPodcastScenesFromScript(
  videoId: string,
  imageOutputFolder?: string | null,
) {
  let savedFolder: string | null = null;
  if (imageOutputFolder != null && String(imageOutputFolder).trim()) {
    savedFolder = await saveVideoImageOutputFolder(
      videoId,
      String(imageOutputFolder),
    );
    const videoMeta = await prisma.video.findUnique({
      where: { id: videoId },
      select: { title: true },
    });
    await mkdir(
      resolveImageOutputFolderAbsolute(savedFolder, videoId, videoMeta?.title),
      { recursive: true },
    );
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      channelKey: true,
      script: true,
      title: true,
      topicCategory: true,
      ideaJson: true,
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  if (video.channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    redirectToVisualPlan(
      videoId,
      "error",
      "Build scenes from script is only for Podcast English Lessons.",
    );
  }

  const script = video.script?.trim() ?? "";
  if (!script) {
    redirectToVisualPlan(
      videoId,
      "error",
      "Add a podcast script with [INTRO]/[EMMA]/[LEO]/[PART …] labels first.",
    );
  }

  const processId = await startProcess({
    type: "visual_plan_generation",
    videoId,
    title: "Building podcast scenes from script",
    description:
      "Local skeleton → import scenes → folder attach → library fill.",
    totalSteps: 5,
    currentStep: "Parsing script skeleton",
  });

  try {
    const episodeContext = [
      video.title,
      video.topicCategory,
      script.slice(0, 4000),
      video.ideaJson?.slice(0, 2000) ?? "",
    ].join("\n");
    const skeleton = buildPodcastVisualPlanSkeleton(script, {
      title: video.title,
      topicCategory: video.topicCategory,
      episodeContext,
    });
    if (skeleton.scenes.length === 0) {
      throw new Error(
        "No scenes could be built from the script. Check [EMMA]/[LEO]/[INTRO]/[LESSON]/[PART N - TITLE]/[CLOSING]/[FINAL] labels.",
      );
    }

    await updateProcess(processId, {
      currentStep: "Importing skeleton scenes",
      stepIndex: 2,
      totalSteps: 5,
      logMessage: `${skeleton.scenes.length} scenes (${skeleton.spokenTurnCount} spoken, ${skeleton.musicBedCount} music beds).`,
    });

    const scenes = parseScenesImport(skeletonScenesToImportJson(skeleton.scenes));
    await replaceImportedScenes(videoId, scenes);
    await clearVisualPlanHybridCheckpoint(videoId).catch(() => undefined);

    const settings = await resolvePipelineSettings(videoId);
    const folderForAttach =
      savedFolder ?? settings.assets.imageOutputFolder;
    const sourceFolderAbs = resolveImageOutputFolderAbsolute(
      folderForAttach,
      videoId,
      video.title,
    );

    await updateProcess(processId, {
      currentStep: "Attaching episode still from folder",
      stepIndex: 3,
      totalSteps: 5,
      logMessage: `Source folder: ${sourceFolderAbs}`,
    });

    let folderNote = "No folder still found — will use Emma/Leo library.";
    let folderAssigned = 0;
    try {
      const folderResult = await attachPodcastFolderStillToVideo(videoId, {
        folderPath: folderForAttach,
        overwrite: true,
      });
      folderAssigned = folderResult.assigned;
      if (folderAssigned > 0) {
        folderNote = `Episode still "${folderResult.sourceFileName}" attached to ${folderAssigned} scene(s); skipped Flow covers ${folderResult.skippedFlowOnly}, section clips ${folderResult.skippedSectionClip}.`;
      } else {
        folderNote = `Folder had no usable stills at ${folderResult.sourceFolder} — will use Emma/Leo library.`;
      }
    } catch (error) {
      folderNote = `Folder still skipped: ${
        error instanceof Error ? error.message : "folder unavailable"
      } (${folderForAttach ?? sourceFolderAbs}) — will use Emma/Leo library.`;
    }

    await updateProcess(processId, {
      currentStep:
        folderAssigned > 0
          ? "Skipping library (folder still applied)"
          : "Filling from image library",
      stepIndex: 4,
      totalSteps: 5,
      logMessage: folderNote,
    });

    let libraryNote =
      folderAssigned > 0
        ? "Library skipped (folder still covers spoken/music scenes)."
        : "Library fill skipped (empty pool or unavailable).";
    if (folderAssigned === 0) {
      try {
        const library = await assignPodcastImageLibraryToVideo(videoId, {
          overwrite: true,
          minGap: 3,
        });
        libraryNote = [
          `Library assigned ${library.assigned} scene(s)`,
          `skipped Flow-only ${library.skippedFlowOnly}`,
          `pool Emma ${library.libraryCounts.emma} / Leo ${library.libraryCounts.leo} / Music ${library.libraryCounts.music}`,
        ].join("; ");
      } catch (error) {
        libraryNote = `Library fill skipped: ${
          error instanceof Error ? error.message : "unavailable"
        }`;
      }
    }

    await persistComputedVideoStatus(videoId);
    await finishProcess(processId, {
      logMessage: `Imported ${scenes.length} scenes. ${folderNote}. ${libraryNote}`,
    });

    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
    redirectToVisualPlan(
      videoId,
      "success",
      `Built ${scenes.length} scenes from script. ${folderNote}. ${libraryNote}. PART covers still need Flow when ready; music beds attach on Voiceover.`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Build podcast scenes from script failed.";
    await failProcess(processId, { errorMessage: message });
    redirectToVisualPlan(videoId, "error", message);
  }
}

export async function cancelVisualPlanBatch(videoId: string) {
  requestVisualPlanCancel(videoId);
  return { ok: true as const };
}

export async function updateVideoStatus(videoId: string, formData: FormData) {
  const status = String(formData.get("status") || "");

  if (!status) {
    throw new Error("Status is required.");
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { status },
  });
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function mockGenerateScript(videoId: string) {
  const processId = await startProcess({
    type: "script_generation",
    videoId,
    title: "Generating script",
    totalSteps: 4,
    currentStep: "Loading idea",
  });

  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        topic: true,
        title: true,
        ideaJson: true,
      },
    });

    if (!video) {
      throw new Error("Video not found.");
    }

    await updateProcess(processId, {
      currentStep: "Parsing idea JSON",
      stepIndex: 2,
      totalSteps: 4,
      logMessage: "Loaded video idea context.",
    });

    let coreAngle = `Explain ${video.topic} clearly.`;
    let mainPromise = "Make the topic easier to understand.";
    let visualAnchor = "A simple visual map that turns confusion into clarity.";

    if (video.ideaJson) {
      try {
        const idea = JSON.parse(video.ideaJson) as {
          coreAngle?: string;
          mainPromise?: string;
          visualAnchor?: string;
        };
        coreAngle = idea.coreAngle || coreAngle;
        mainPromise = idea.mainPromise || mainPromise;
        visualAnchor = idea.visualAnchor || visualAnchor;
      } catch {
        await updateProcess(processId, {
          logMessage: "Idea JSON was invalid; using fallback script structure.",
          logLevel: "warning",
        });
      }
    }

    await updateProcess(processId, {
      currentStep: "Drafting script",
      stepIndex: 3,
      totalSteps: 4,
    });

    const script = [
      `The first thing to understand about ${video.topic} is that the headline is usually simpler than the reality behind it.`,
      "",
      coreAngle,
      "",
      "That gap is where most of the confusion comes from. People see one signal, one number, or one announcement, and naturally assume it explains the whole situation.",
      "",
      "But in real financial decisions, the final outcome is usually built from several moving parts. Some move quickly. Some move slowly. Some respond directly. Others respond through expectations, risk, incentives, and timing.",
      "",
      `The promise of this video is simple: ${mainPromise}`,
      "",
      "A useful way to picture it is this:",
      "",
      visualAnchor,
      "",
      "Once you separate the headline from the mechanism, the situation starts to feel less random. It may still be frustrating, but it becomes easier to understand.",
      "",
      "And that is the point. Not to predict the future. Not to pretend every decision is easy. But to build a clearer mental model, so the viewer can think about the topic with less noise and more confidence.",
    ].join("\n");

    await updateProcess(processId, {
      currentStep: "Saving script",
      stepIndex: 4,
      totalSteps: 4,
    });

    await prisma.video.update({
      where: { id: videoId },
      data: {
        script,
      },
    });
    await persistComputedVideoStatus(videoId);
    await finishProcess(processId, { logMessage: "Script saved." });

    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Script generation failed."),
    });
    throw error;
  }
}

export async function updateVideoMetadata(videoId: string, formData: FormData) {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      metadataJson: parseOptionalJsonField(
        formData.get("metadataJson"),
        "metadataJson",
      ),
    },
  });
  await persistComputedVideoStatus(videoId);

  revalidatePath(`/videos/${videoId}`);
  redirect(`/videos/${videoId}?tab=metadata&saved=1`);
}

export async function mockGenerateMetadata(videoId: string) {
  const processId = await startProcess({
    type: "metadata_generation",
    videoId,
    title: "Generating metadata",
    totalSteps: 4,
    currentStep: "Loading video",
  });

  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        scenes: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!video) {
      throw new Error("Video not found.");
    }

    await updateProcess(processId, {
      currentStep: "Building chapter list",
      stepIndex: 2,
      totalSteps: 4,
      logMessage: `Loaded ${video.scenes.length} scenes.`,
    });

    const tags = [
      "personal finance",
      "money explained",
      "finance education",
      "economics",
      video.topic.toLowerCase(),
    ];

    const chapters = video.scenes.map((scene, index) => {
      const elapsedSeconds = video.scenes
        .slice(0, index)
        .reduce((total, item) => total + (item.duration ?? 5), 0);
      const minutes = Math.floor(elapsedSeconds / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");

      return {
        timestamp: `${minutes}:${seconds}`,
        title: scene.visualIdea || scene.scriptText.slice(0, 60),
      };
    });

    await updateProcess(processId, {
      currentStep: "Drafting metadata",
      stepIndex: 3,
      totalSteps: 4,
    });

    const metadata = {
      primaryTitle: video.title,
      alternateTitles: [
        `Why ${video.title} Feels So Confusing`,
        `${video.title}, Explained Simply`,
        `What Most People Miss About ${video.title}`,
        `The Hidden Mechanism Behind ${video.title}`,
        `A Clearer Way To Understand ${video.title}`,
      ],
      thumbnail: {
        text: "EXPLAINED",
        concept:
          "A clean before-and-after visual: confusion on one side, a simple mechanism map on the other.",
        visualPrompt: `2D animated finance explainer thumbnail about ${video.topic}, clear contrast between confusing headline and simple visual explanation, clean cinematic composition, 16:9`,
      },
      description: `A clear, visual explanation of ${video.topic}. This video focuses on understanding the mechanism behind the headline, without hype, predictions, or financial promises.`,
      chapters,
      tags,
      pinnedComment:
        "What part of this topic felt most confusing before watching?",
      notes: "Mock metadata generated locally for pipeline testing.",
    };

    await updateProcess(processId, {
      currentStep: "Saving metadata",
      stepIndex: 4,
      totalSteps: 4,
    });

    await prisma.video.update({
      where: { id: videoId },
      data: {
        metadataJson: JSON.stringify(metadata, null, 2),
      },
    });
    await persistComputedVideoStatus(videoId);
    await finishProcess(processId, { logMessage: "Metadata saved." });

    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Metadata generation failed."),
    });
    throw error;
  }
}

function thumbnailAvoidList(formData: FormData) {
  return requiredText(formData, "thumbnailAvoid")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function thumbnailConceptFromForm(formData: FormData): ThumbnailConcept {
  const overlayText = normalizeOverlayText(requiredText(formData, "thumbnailOverlayText"));
  const activeConceptId = requiredText(formData, "thumbnailActiveConceptId");
  const conceptId =
    activeConceptId === "B" || activeConceptId === "C" ? activeConceptId : "A";

  return {
    id: conceptId,
    name: overlayText ? `${overlayText} Custom` : "Custom Thumbnail Concept",
    thumbnailHook: requiredText(formData, "thumbnailHook"),
    overlayText: overlayText || "NOT READY",
    mainEmotion: requiredText(formData, "thumbnailMainEmotion") || "surprised realization",
    mainHostPose:
      requiredText(formData, "thumbnailMainHostPose") ||
      "main host reacting with a clear expressive pose",
    primaryObject:
      requiredText(formData, "thumbnailPrimaryObject") ||
      "oversized finance symbol connected to the video's main idea",
    secondaryObject:
      requiredText(formData, "thumbnailSecondaryObject") ||
      "a few simple money or pressure symbols",
    visualTension:
      requiredText(formData, "thumbnailVisualTension") ||
      "the finance symbol feels more important than it first appears",
    composition: "host on one side, one oversized finance object on the other, huge text above",
    colorAccent: requiredText(formData, "thumbnailColorAccent") || "green",
    whyItWorks: "It uses one character, one large symbol, and a short readable hook.",
  };
}

function thumbnailBriefFromConcept(concept: ThumbnailConcept, avoid: string[]) {
  return {
    thumbnailHook: concept.thumbnailHook,
    mainEmotion: concept.mainEmotion,
    mainHostPose: concept.mainHostPose,
    primaryObject: concept.primaryObject,
    secondaryObject: concept.secondaryObject,
    overlayText: normalizeOverlayText(concept.overlayText),
    visualTension: concept.visualTension,
    colorAccent: concept.colorAccent,
    avoid,
  };
}

export async function saveThumbnailBrief(videoId: string, formData: FormData) {
  const concept = thumbnailConceptFromForm(formData);

  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailConceptJson: thumbnailBriefFromConcept(
        concept,
        thumbnailAvoidList(formData),
      ) as Prisma.InputJsonValue,
      thumbnailStatus: "brief_ready",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", "Thumbnail brief saved.");
}

export async function generateThumbnailConcepts(videoId: string) {
  const processId = await startProcess({
    type: "thumbnail_generation",
    videoId,
    title: "Generating thumbnail concepts",
    totalSteps: 3,
    currentStep: "Loading video",
  });

  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });

    if (!video) {
      throw new Error("Video not found.");
    }

    await updateProcess(processId, {
      currentStep: "Building concept variations",
      stepIndex: 2,
      totalSteps: 3,
    });
    const concepts = buildThumbnailConcepts(video);

    await prisma.video.update({
      where: { id: videoId },
      data: {
        thumbnailVariationsJson: concepts as Prisma.InputJsonValue,
        thumbnailConceptJson: concepts[0] as Prisma.InputJsonValue,
        thumbnailStatus: "brief_ready",
      },
    });
    await finishProcess(processId, {
      result: { concepts: concepts.length },
      logMessage: "Thumbnail concepts saved.",
    });

    revalidatePath(`/videos/${videoId}`);
    redirectToThumbnail(videoId, "success", "Generated 3 thumbnail concepts.");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Thumbnail concept generation failed."),
    });
    throw error;
  }
}

export async function selectThumbnailConcept(videoId: string, formData: FormData) {
  const selectedId = requiredText(formData, "thumbnailConceptId");
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { thumbnailVariationsJson: true },
  });
  const concepts = parseThumbnailConcepts(video?.thumbnailVariationsJson);
  const selectedConcept = concepts.find((concept) => concept.id === selectedId);

  if (!selectedConcept) {
    redirectToThumbnail(videoId, "error", "Select a generated thumbnail concept.");
  }

  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailConceptJson: selectedConcept as Prisma.InputJsonValue,
      thumbnailStatus: "brief_ready",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", `Selected Concept ${selectedConcept.id}.`);
}

export async function generateThumbnailPrompt(videoId: string, formData: FormData) {
  const processId = await startProcess({
    type: "thumbnail_generation",
    videoId,
    title: "Generating thumbnail prompt",
    totalSteps: 4,
    currentStep: "Loading thumbnail brief",
  });

  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });

    if (!video) {
      throw new Error("Video not found.");
    }

    await updateProcess(processId, {
      currentStep: "Selecting thumbnail concept",
      stepIndex: 2,
      totalSteps: 4,
    });
    const formConcept = thumbnailConceptFromForm(formData);
    const storedConcept = parseThumbnailConcept(video.thumbnailConceptJson);
    const concept =
      formConcept.thumbnailHook || formConcept.overlayText !== "NOT READY"
        ? formConcept
        : storedConcept ?? buildThumbnailConcepts(video)[0];
    const avoid = thumbnailAvoidList(formData);

    await updateProcess(processId, {
      currentStep: "Building prompt",
      stepIndex: 3,
      totalSteps: 4,
    });
    const prompt = buildThumbnailPrompt(concept, avoid.join(", "));

    await updateProcess(processId, {
      currentStep: "Saving prompt",
      stepIndex: 4,
      totalSteps: 4,
    });
    await prisma.video.update({
      where: { id: videoId },
      data: {
        thumbnailConceptJson: concept as Prisma.InputJsonValue,
        thumbnailPrompt: prompt,
        thumbnailNegativePrompt: THUMBNAIL_NEGATIVE_PROMPT,
        thumbnailStatus: "prompt_ready",
      },
    });
    await finishProcess(processId, { logMessage: "Thumbnail prompt saved." });

    revalidatePath(`/videos/${videoId}`);
    redirectToThumbnail(videoId, "success", "Thumbnail prompt generated.");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Thumbnail prompt generation failed."),
    });
    throw error;
  }
}

export async function generateThumbnailImageWithFlow(
  videoId: string,
  formData: FormData,
) {
  const processId = await startProcess({
    type: "thumbnail_generation",
    videoId,
    title: "Generating thumbnail with Google Flow",
    totalSteps: 5,
    currentStep: "Loading thumbnail brief",
  });

  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });

    if (!video) {
      throw new Error("Video not found.");
    }

    await updateProcess(processId, {
      currentStep: "Building thumbnail prompt",
      stepIndex: 2,
      totalSteps: 5,
    });
    const formConcept = thumbnailConceptFromForm(formData);
    const storedConcept = parseThumbnailConcept(video.thumbnailConceptJson);
    const concept =
      formConcept.thumbnailHook || formConcept.overlayText !== "NOT READY"
        ? formConcept
        : storedConcept ?? buildThumbnailConcepts(video)[0];
    const avoid = thumbnailAvoidList(formData);
    const prompt = buildThumbnailPrompt(concept, avoid.join(", "));

    await updateProcess(processId, {
      currentStep: "Generating image in Google Flow",
      stepIndex: 3,
      totalSteps: 5,
      logMessage: `Overlay: ${concept.overlayText}`,
    });
    const generated = await generateThumbnailWithGoogleFlow({
      videoId,
      prompt,
      fileName: "thumbnail.png",
    });

    await updateProcess(processId, {
      currentStep: "Saving final thumbnail",
      stepIndex: 5,
      totalSteps: 5,
      logMessage: `Saved ${generated.fileName} (${generated.sizeBytes} bytes).`,
    });
    await prisma.video.update({
      where: { id: videoId },
      data: {
        thumbnailConceptJson: concept as Prisma.InputJsonValue,
        thumbnailPrompt: prompt,
        thumbnailNegativePrompt: THUMBNAIL_NEGATIVE_PROMPT,
        thumbnailImagePath: generated.localPath,
        thumbnailImageUrl: generated.imageUrl,
        thumbnailFileName: generated.fileName,
        thumbnailNotes: `Generated with Google Flow media ${generated.mediaId}`,
        thumbnailStatus: "image_imported",
      },
    });
    await finishProcess(processId, {
      result: generated,
      logMessage: "Thumbnail image generated with Google Flow.",
    });

    revalidatePath(`/videos/${videoId}`);
    redirectToThumbnail(videoId, "success", "Thumbnail generated with Google Flow.");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Thumbnail Flow generation failed."),
    });
    throw error;
  }
}

export async function saveThumbnailFinal(videoId: string, formData: FormData) {
  const imagePath = emptyToNull(formData.get("thumbnailImagePath"));
  const imageUrl = emptyToNull(formData.get("thumbnailImageUrl"));
  const fileName = emptyToNull(formData.get("thumbnailFileName"));
  const notes = emptyToNull(formData.get("thumbnailNotes"));

  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailImagePath: imagePath,
      thumbnailImageUrl: imageUrl,
      thumbnailFileName: fileName,
      thumbnailNotes: notes,
      thumbnailStatus: imagePath || imageUrl ? "image_imported" : "prompt_ready",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", "Final thumbnail details saved.");
}

export async function markThumbnailBriefReady(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: { thumbnailStatus: "brief_ready" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", "Thumbnail brief marked ready.");
}

export async function markThumbnailPromptReady(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: { thumbnailStatus: "prompt_ready" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", "Thumbnail prompt marked ready.");
}

export async function markThumbnailReady(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: { thumbnailStatus: "ready" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", "Thumbnail marked ready.");
}

export async function resetThumbnail(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailStatus: "pending",
      thumbnailConceptJson: Prisma.JsonNull,
      thumbnailVariationsJson: Prisma.JsonNull,
      thumbnailPrompt: null,
      thumbnailNegativePrompt: null,
      thumbnailImagePath: null,
      thumbnailImageUrl: null,
      thumbnailFileName: null,
      thumbnailNotes: null,
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToThumbnail(videoId, "success", "Thumbnail reset.");
}

export async function deleteVideo(videoId: string, formData?: FormData) {
  if (formData?.get("confirmProjectDelete")?.toString() !== "on") {
    throw new Error("Confirm project deletion before applying.");
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        select: {
          imageLocalPath: true,
          voiceoverLocalPath: true,
        },
      },
      imageBatches: {
        select: {
          outputFolder: true,
          payloadPath: true,
        },
      },
      voiceoverSegments: {
        select: { audioPath: true },
      },
      renderDrafts: {
        select: { outputPath: true },
      },
    },
  });

  if (!video) {
    revalidatePath("/");
    redirect("/");
  }

  const projectStoragePaths = collectVideoProjectStoragePaths(video);

  await removeVideoProjectStorage(projectStoragePaths);

  await prisma.topicIdea.updateMany({
    where: { createdVideoId: videoId },
    data: { createdVideoId: null },
  });

  await prisma.video.delete({
    where: { id: videoId },
  });

  revalidatePath("/");
  redirect("/");
}

type VideoProjectForDeletion = {
  id: string;
  title: string;
  voiceoverAudioPath: string | null;
  thumbnailImagePath: string | null;
  scenes: Array<{
    imageLocalPath: string | null;
    voiceoverLocalPath: string | null;
  }>;
  imageBatches: Array<{
    outputFolder: string;
    payloadPath: string | null;
  }>;
  voiceoverSegments: Array<{
    audioPath: string | null;
  }>;
  renderDrafts: Array<{
    outputPath: string | null;
  }>;
};

type VideoProjectStoragePaths = {
  recursiveDirs: string[];
  filePaths: string[];
  emptyDirs: string[];
};

function storagePath(...parts: string[]) {
  return path.join(process.cwd(), "storage", ...parts);
}

function isInsideStorage(filePath: string) {
  const storageRoot = path.resolve(process.cwd(), "storage");
  const resolvedPath = path.resolve(filePath);

  return (
    resolvedPath === storageRoot ||
    resolvedPath.startsWith(`${storageRoot}${path.sep}`)
  );
}

function addStoredPath(paths: Set<string>, value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return;
  }

  const resolvedPath = path.isAbsolute(text)
    ? path.resolve(text)
    : path.resolve(process.cwd(), text);

  if (isInsideStorage(resolvedPath)) {
    paths.add(resolvedPath);
  }
}

function addStoredFileAndParentDir(
  filePaths: Set<string>,
  emptyDirs: Set<string>,
  value: string | null | undefined,
) {
  const text = value?.trim();

  if (!text) {
    return;
  }

  const resolvedPath = path.isAbsolute(text)
    ? path.resolve(text)
    : path.resolve(process.cwd(), text);

  if (isInsideStorage(resolvedPath)) {
    filePaths.add(resolvedPath);
    emptyDirs.add(path.dirname(resolvedPath));
  }
}

function collectVideoProjectStoragePaths(
  video: VideoProjectForDeletion,
): VideoProjectStoragePaths {
  const recursiveDirs = new Set<string>();
  const filePaths = new Set<string>();
  const emptyDirs = new Set<string>();

  recursiveDirs.add(storagePath("renders", video.id));
  recursiveDirs.add(storagePath("voiceovers", video.id));
  recursiveDirs.add(storagePath("thumbnails", video.id));
  emptyDirs.add(generatedImagesDir(video.id, video.title));
  emptyDirs.add(generatedImagesDir(video.id));

  addStoredFileAndParentDir(filePaths, emptyDirs, video.voiceoverAudioPath);
  addStoredFileAndParentDir(filePaths, emptyDirs, video.thumbnailImagePath);

  for (const scene of video.scenes) {
    addStoredFileAndParentDir(filePaths, emptyDirs, scene.imageLocalPath);
    addStoredFileAndParentDir(filePaths, emptyDirs, scene.voiceoverLocalPath);
  }

  for (const segment of video.voiceoverSegments) {
    addStoredFileAndParentDir(filePaths, emptyDirs, segment.audioPath);
  }

  for (const draft of video.renderDrafts) {
    addStoredFileAndParentDir(filePaths, emptyDirs, draft.outputPath);
  }

  for (const batch of video.imageBatches) {
    addStoredPath(emptyDirs, batch.outputFolder);
    addStoredFileAndParentDir(filePaths, emptyDirs, batch.payloadPath);
  }

  return {
    recursiveDirs: [...recursiveDirs].filter(isInsideStorage),
    filePaths: [...filePaths].filter(isInsideStorage),
    emptyDirs: [...emptyDirs].filter(isInsideStorage),
  };
}

async function removeVideoProjectStorage(paths: VideoProjectStoragePaths) {
  for (const filePath of paths.filePaths.sort((a, b) => b.length - a.length)) {
    if (!isInsideStorage(filePath)) {
      continue;
    }

    try {
      await rm(filePath, { force: true });
    } catch {
      // Keep deleting other project files; one locked file should not stop cleanup.
    }
  }

  for (const directory of paths.recursiveDirs.sort(
    (a, b) => b.length - a.length,
  )) {
    if (!isInsideStorage(directory)) {
      continue;
    }

    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      // Keep deleting other project files; one locked directory should not stop cleanup.
    }
  }

  for (const directory of paths.emptyDirs.sort((a, b) => b.length - a.length)) {
    if (!isInsideStorage(directory)) {
      continue;
    }

    try {
      await rmdir(directory);
    } catch {
      // Non-empty folders may still belong to another project with the same title.
    }
  }
}

const sceneSchema = z.object({
  sortOrder: z.coerce.number().int().positive(),
  scriptText: z.string().min(1),
  sceneType: z.string().min(1),
  visualPurpose: z.string().nullable(),
  visualIdea: z.string().nullable(),
  imagePrompt: z.string().nullable(),
  duration: z.coerce.number().int().positive().nullable(),
  imageUrl: z.string().nullable(),
  status: z.string().min(1),
});

function sceneDataFromForm(formData: FormData) {
  return sceneDataFromValues({
    order: formData.get("order"),
    scriptText: formData.get("scriptText"),
    sceneType: formData.get("sceneType"),
    visualPurpose: formData.get("visualPurpose"),
    visualIdea: formData.get("visualIdea"),
    imagePrompt: formData.get("imagePrompt"),
    duration: formData.get("duration"),
    imageUrl: formData.get("imageUrl"),
    status: formData.get("status"),
  });
}

function sceneDataFromValues(values: {
  order: FormDataEntryValue | null;
  scriptText: FormDataEntryValue | null;
  sceneType: FormDataEntryValue | null;
  visualPurpose: FormDataEntryValue | null;
  visualIdea: FormDataEntryValue | null;
  imagePrompt: FormDataEntryValue | null;
  duration: FormDataEntryValue | null;
  imageUrl: FormDataEntryValue | null;
  status: FormDataEntryValue | null;
}) {
  const durationValue = emptyToNull(values.duration);

  return sceneSchema.parse({
    sortOrder: values.order?.toString().trim() ?? "",
    scriptText: values.scriptText?.toString().trim() ?? "",
    sceneType: values.sceneType?.toString().trim() ?? "",
    visualPurpose: emptyToNull(values.visualPurpose),
    visualIdea: emptyToNull(values.visualIdea),
    imagePrompt: emptyToNull(values.imagePrompt),
    duration: durationValue ? Number(durationValue) : null,
    imageUrl: emptyToNull(values.imageUrl),
    status: values.status?.toString().trim() || "planned",
  });
}

async function reindexScenesForVideo(videoId: string) {
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  });

  await prisma.$transaction(
    scenes.map((scene, index) =>
      prisma.scene.update({
        where: { id: scene.id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );
}

async function invalidateSceneStructureArtifacts(videoId: string) {
  await syncSceneVoiceoversToSubtitleSegments(videoId, {
    preserveSubtitles: false,
  });
  await prisma.video.update({
    where: { id: videoId },
    data: {
      voiceoverAudioPath: null,
      voiceoverFileName: null,
      voiceoverStatus: "needs_update",
      subtitleStatus: "needs_update",
      formattedSubtitleJson: Prisma.JsonNull,
      formattedSubtitleText: null,
      styledSubtitleJson: Prisma.JsonNull,
      styledSubtitleAss: null,
      renderDraftStatus: "pending",
    },
  });
}

async function markScenePromptOutdated(sceneId: string) {
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      imagePrompt: null,
      status: "planned",
    },
  });
}

async function markScenesPromptOutdated(sceneIds: string[]) {
  if (sceneIds.length === 0) {
    return;
  }

  await prisma.scene.updateMany({
    where: { id: { in: sceneIds } },
    data: {
      imagePrompt: null,
      status: "planned",
    },
  });
}

const splitHookSceneItemSchema = z.object({
  scriptText: z.string().min(1),
  duration: z.coerce.number().int().positive(),
  visualIdea: z.string().optional().nullable(),
});

const splitHookSceneSchema = z.object({
  parts: z.array(splitHookSceneItemSchema).min(2).max(3),
});

export async function addScene(videoId: string, formData: FormData) {
  await prisma.scene.create({
    data: {
      ...sceneDataFromForm(formData),
      videoId,
    },
  });
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

const importedSceneSchema = z.object({
  // Allow negative orders so prepend patches/imports can sort (-16 … -1) before 1+.
  order: z.coerce.number().int().optional(),
  // Empty allowed for visual-only covers after structural markers are stripped.
  scriptText: z.string(),
  sceneType: z.string().optional().nullable(),
  visualPurpose: z.string().optional().nullable(),
  visualIdea: z.string().optional().nullable(),
  imagePrompt: z.string().optional().nullable(),
  duration: z.coerce.number().positive().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  /** Silence after this scene when stitching (milliseconds). */
  pauseAfterMs: z.coerce.number().nonnegative().optional().nullable(),
  pause_after_ms: z.coerce.number().nonnegative().optional().nullable(),
});

const importedScenesSchema = z.array(importedSceneSchema).min(1);

type ImportedScene = z.infer<typeof importedSceneSchema>;
type NormalizedImportedScene = {
  sortOrder: number;
  scriptText: string;
  sceneType: string;
  visualPurpose: string | null;
  visualIdea: string | null;
  imagePrompt: string | null;
  duration: number;
  imageUrl: string | null;
  status: string;
  pauseAfterMs: number | null;
};

const importSceneChunkSize = 50;

function parseJsonInput(rawJson: string, fieldLabel: string) {
  try {
    return JSON.parse(rawJson);
  } catch {
    throw new Error(`${fieldLabel} must be valid JSON.`);
  }
}

function scenesFromParsedJson(parsedJson: unknown) {
  if (Array.isArray(parsedJson)) {
    return parsedJson;
  }

  if (
    parsedJson &&
    typeof parsedJson === "object" &&
    "scenes" in parsedJson &&
    Array.isArray((parsedJson as { scenes?: unknown }).scenes)
  ) {
    return (parsedJson as { scenes: unknown[] }).scenes;
  }

  throw new Error(
    'Scenes JSON must be either a raw JSON array or an object with a "scenes" array.',
  );
}

function zodImportErrorMessage(error: z.ZodError) {
  const issue = error.issues[0];

  if (!issue) {
    return "Scenes JSON is invalid.";
  }

  const [sceneIndex, field] = issue.path;
  const sceneLabel =
    typeof sceneIndex === "number" ? `Scene ${sceneIndex + 1}` : "Scenes JSON";
  const fieldLabel = typeof field === "string" ? `.${field}` : "";

  return `${sceneLabel}${fieldLabel}: ${issue.message}`;
}

function rawRecordText(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function rawRecordNumber(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = record[key];
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return undefined;
}

function normalizeRawImportedSceneShape(rawScene: unknown) {
  if (!rawScene || typeof rawScene !== "object" || Array.isArray(rawScene)) {
    return rawScene;
  }

  const record = rawScene as Record<string, unknown>;
  const rawScript =
    rawRecordText(
      record,
      "scriptText",
      "voiceover_context",
      "voiceoverContext",
      "narration",
      "voiceover",
    ) ?? (typeof record.scriptText === "string" ? record.scriptText : "");

  return {
    ...record,
    scriptText: stripStructuralMarkers(rawScript),
    sceneType:
      rawRecordText(record, "sceneType", "scene_type") ?? record.sceneType,
    visualPurpose:
      rawRecordText(
        record,
        "visualPurpose",
        "narrative_meaning",
        "narrativeMeaning",
      ) ?? record.visualPurpose,
    visualIdea:
      rawRecordText(record, "visualIdea", "visual_idea") ?? record.visualIdea,
    imagePrompt:
      rawRecordText(record, "imagePrompt", "prompt", "image_prompt") ??
      record.imagePrompt,
    duration:
      rawRecordNumber(record, "duration", "estimated_seconds", "estimatedSeconds") ??
      record.duration,
    pauseAfterMs:
      rawRecordNumber(record, "pauseAfterMs", "pause_after_ms", "pauseAfter") ??
      record.pauseAfterMs,
  };
}

function normalizeImportedScenes(rawScenes: unknown[]) {
  const normalizedRawScenes = rawScenes.map(normalizeRawImportedSceneShape);
  const parsedScenes = importedScenesSchema.safeParse(normalizedRawScenes);

  if (!parsedScenes.success) {
    throw new Error(zodImportErrorMessage(parsedScenes.error));
  }

  const orderedScenes = sortScenesByOptionalOrder(parsedScenes.data);

  const normalized = orderedScenes.map((scene, index) =>
    normalizeImportedScene(scene, index),
  );

  const folded = foldPauseCardScenesIntoPauseAfterMs(
    normalized.map((scene) => ({
      ...scene,
      visualIdea: scene.visualIdea ?? "",
    })),
  );

  return folded.scenes.map((scene, index) => ({
    ...scene,
    sortOrder: index + 1,
    visualIdea: scene.visualIdea || null,
  }));
}

function normalizeImportedScene(
  scene: ImportedScene,
  index: number,
): NormalizedImportedScene {
  const sceneType = scene.sceneType?.trim() ?? "";
  const duration = scene.duration
    ? Math.max(1, Math.round(scene.duration))
    : 8;

  return {
    sortOrder: index + 1,
    scriptText: scene.scriptText.trim(),
    sceneType: validSceneTypes.has(sceneType) ? sceneType : "avatar",
    visualPurpose: scene.visualPurpose?.trim() || null,
    visualIdea: scene.visualIdea?.trim() || null,
    imagePrompt: scene.imagePrompt?.trim() || null,
    duration,
    imageUrl: scene.imageUrl?.trim() || null,
    status: scene.status?.trim() || "planned",
    pauseAfterMs: normalizePauseAfterMs(
      scene.pauseAfterMs ?? scene.pause_after_ms,
    ),
  };
}

function parseScenesImport(rawJson: string, fieldLabel = "Scenes JSON") {
  const parsedJson = parseJsonInput(rawJson, fieldLabel);
  return normalizeImportedScenes(scenesFromParsedJson(parsedJson));
}

function sceneCreateData(videoId: string, scenes: NormalizedImportedScene[]) {
  return scenes.map((scene) => ({
    videoId,
    sortOrder: scene.sortOrder,
    scriptText: scene.scriptText,
    sceneType: scene.sceneType,
    visualPurpose: scene.visualPurpose,
    visualIdea: scene.visualIdea,
    imagePrompt: scene.imagePrompt,
    duration: scene.duration,
    imageUrl: scene.imageUrl,
    status: scene.status,
    pauseAfterMs: scene.pauseAfterMs,
  }));
}

function sceneCreateManyOperations(
  videoId: string,
  scenes: NormalizedImportedScene[],
) {
  const operations = [];

  for (let index = 0; index < scenes.length; index += importSceneChunkSize) {
    operations.push(
      prisma.scene.createMany({
        data: sceneCreateData(
          videoId,
          scenes.slice(index, index + importSceneChunkSize),
        ),
      }),
    );
  }

  return operations;
}

async function replaceImportedScenes(
  videoId: string,
  scenes: NormalizedImportedScene[],
) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true },
  });

  await clearGeneratedImagesForVideo(videoId, video?.title);
  await prisma.$transaction([
    prisma.scene.deleteMany({
      where: { videoId },
    }),
    ...sceneCreateManyOperations(videoId, scenes),
  ]);
  await maybeAttachPodcastSectionClips(videoId);
}

async function maybeAttachPodcastSectionClips(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true },
  });
  if (video?.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    return attachPodcastSectionClipsFromVisualIdeas(videoId);
  }
  if (video?.channelKey === THE_GODS_WORD_CHANNEL_KEY) {
    const { ensureAndAttachGodsWordFinalSectionClip } = await import(
      "@/lib/gods-word-video-library"
    );
    try {
      return await ensureAndAttachGodsWordFinalSectionClip(videoId);
    } catch (error) {
      console.warn(
        "[import] Gods Word FINAL clip attach skipped:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
  return null;
}

export async function importScenes(
  videoId: string,
  _previousState: ImportScenesState,
  formData: FormData,
): Promise<ImportScenesState> {
  const processId = await startProcess({
    type: "visual_plan_generation",
    videoId,
    title: "Importing visual plan",
    description: "Parsing and saving Visual Planner scenes.",
    totalSteps: 5,
    currentStep: "Reading pasted JSON",
  });
  const rawScenesJson = requiredText(formData, "scenesJson");
  const importModeRaw = formData.get("importMode")?.toString();
  const importMode =
    importModeRaw === "append" || importModeRaw === "prepend"
      ? importModeRaw
      : "replace";

  try {
    await updateProcess(processId, {
      currentStep: "Parsing JSON",
      stepIndex: 2,
      totalSteps: 5,
    });
    const scenes = parseScenesImport(rawScenesJson);
    await updateProcess(processId, {
      currentStep: "Validating scene schema",
      stepIndex: 3,
      totalSteps: 5,
      logMessage: `Validated ${scenes.length} scenes.`,
    });
    if (importMode === "append" || importMode === "prepend") {
      await createScenesFromImport(videoId, scenes, importMode);
    } else {
      await replaceImportedScenes(videoId, scenes);
    }
    await updateProcess(processId, {
      currentStep: "Saving visual plan",
      stepIndex: 4,
      totalSteps: 5,
    });
    await persistComputedVideoStatus(videoId);
    await finishProcess(processId, {
      result: { scenes: scenes.length, importMode },
      logMessage:
        importMode === "append"
          ? `Appended ${scenes.length} scenes.`
          : importMode === "prepend"
            ? `Prepended ${scenes.length} scenes.`
            : `Imported ${scenes.length} scenes.`,
    });

    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);

    return {
      status: "success",
      message:
        importMode === "append"
          ? `Appended ${scenes.length} scenes to the existing visual plan.`
          : importMode === "prepend"
            ? `Prepended ${scenes.length} scenes. Existing scenes were shifted and kept their images.`
            : `Imported ${scenes.length} scenes and replaced the existing visual plan.`,
    };
  } catch (error) {
    await failProcess(processId, {
      errorMessage:
        error instanceof Error
          ? error.message
          : "Scenes JSON could not be imported.",
      logMessage: "Visual plan import failed.",
    });
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Scenes JSON could not be imported.",
    };
  }
}

export async function importMockScenes(videoId: string, formData: FormData) {
  const rawScenesJson = requiredText(formData, "mockScenesJson");
  const scenes = parseScenesImport(rawScenesJson);

  await replaceImportedScenes(videoId, scenes);
  await persistComputedVideoStatus(videoId);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

async function prependScenesToVideo(
  videoId: string,
  scenes: PrependSceneDraft[],
) {
  if (scenes.length === 0) {
    return;
  }

  const existingScenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const insertCount = scenes.length;
  const shiftTargets = sortExistingScenesForUpwardShift(existingScenes);

  await prisma.$transaction(async (tx) => {
    for (const scene of shiftTargets) {
      await tx.scene.update({
        where: { id: scene.id },
        data: { sortOrder: scene.sortOrder + insertCount },
      });
    }

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      await tx.scene.create({
        data: {
          videoId,
          sortOrder: index + 1,
          scriptText: scene.scriptText,
          sceneType: scene.sceneType,
          visualPurpose: scene.visualPurpose,
          visualIdea: scene.visualIdea,
          imagePrompt: scene.imagePrompt,
          duration: scene.duration,
          status: scene.status,
          pauseAfterMs: scene.pauseAfterMs ?? null,
        },
      });
    }
  });

  await invalidateSceneStructureArtifacts(videoId);
}

async function createScenesFromImport(
  videoId: string,
  scenes: NormalizedImportedScene[],
  mode: "replace" | "append" | "prepend",
) {
  if (mode === "prepend") {
    await prependScenesToVideo(
      videoId,
      scenes.map((scene) => ({
        scriptText: scene.scriptText,
        sceneType: scene.sceneType,
        visualPurpose: scene.visualPurpose,
        visualIdea: scene.visualIdea,
        imagePrompt: scene.imagePrompt,
        duration: scene.duration,
        status: scene.status,
        pauseAfterMs: scene.pauseAfterMs,
        sourceOrder: scene.sortOrder,
      })),
    );
    await persistComputedVideoStatus(videoId);
    await maybeAttachPodcastSectionClips(videoId);
    return;
  }

  const existingMaxOrder =
    mode === "append"
      ? await prisma.scene.aggregate({
          where: { videoId },
          _max: { sortOrder: true },
        })
      : null;
  const orderOffset = existingMaxOrder?._max.sortOrder ?? 0;

  const scenesWithOrder = scenes.map((scene, index) => ({
    ...scene,
    sortOrder:
      mode === "append" ? orderOffset + index + 1 : scene.sortOrder,
  }));

  const createManyOperations = sceneCreateManyOperations(
    videoId,
    scenesWithOrder,
  );

  if (mode === "replace") {
    await prisma.$transaction([
      prisma.scene.deleteMany({
        where: { videoId },
      }),
      ...createManyOperations,
    ]);
    await persistComputedVideoStatus(videoId);
    await maybeAttachPodcastSectionClips(videoId);
    return;
  }

  await prisma.$transaction([
    ...createManyOperations,
  ]);
  await persistComputedVideoStatus(videoId);
  await maybeAttachPodcastSectionClips(videoId);
}

export async function importVisualPlanJson(
  videoId: string,
  mode: "replace" | "append" | "prepend",
  formData: FormData,
) {
  const rawVisualPlanJson = requiredText(formData, "visualPlanJson");
  const scenes = parseScenesImport(rawVisualPlanJson, "Visual Plan JSON");

  await createScenesFromImport(videoId, scenes, mode);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function importScenePatch(videoId: string, formData: FormData) {
  const patchJson = requiredText(formData, "patchJson");
  const allowScriptTextChanges =
    formData.get("allowScriptTextChanges")?.toString() === "on";
  const confirmLargePatch =
    formData.get("confirmLargePatch")?.toString() === "on";
  const confirmDuplicateTargets =
    formData.get("confirmDuplicateTargets")?.toString() === "on";
  const confirmClearImages =
    formData.get("confirmClearImages")?.toString() === "on";
  const channelKey = requiredText(formData, "channelKey");

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      visualIdea: true,
      imagePrompt: true,
      imageLocalPath: true,
      imageFileName: true,
      imageUrl: true,
    },
  });

  const preview = buildScenePatchPreview({
    rawText: patchJson,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      order: scene.sortOrder,
      scriptText: scene.scriptText,
      visualIdea: scene.visualIdea,
      imagePrompt: scene.imagePrompt,
      hasGeneratedImage: Boolean(
        scene.imageLocalPath || scene.imageFileName || scene.imageUrl,
      ),
    })),
    channelKey,
    currentVideoId: videoId,
    allowScriptTextChanges,
  });

  if (preview.totalCount > 50 && !confirmLargePatch) {
    throw new Error("Large patch confirmation is required for more than 50 items.");
  }

  if (preview.duplicateTargetCount > 0 && !confirmDuplicateTargets) {
    throw new Error("Duplicate target confirmation is required before applying this patch.");
  }

  if (preview.clearImageCount > 0 && !confirmClearImages) {
    throw new Error(
      "Confirm clearing generated images on patched scenes before applying this patch.",
    );
  }

  const updates = buildScenePatchApplyItems(preview, allowScriptTextChanges);
  const prepends = buildScenePatchPrependItems(preview);

  if (updates.length === 0 && prepends.length === 0) {
    throw new Error("No valid scene patch items were found to apply.");
  }

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  // Apply positive-order / id updates first so they target current orders,
  // then prepend negative-order scenes and shift everything else.
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((update) => {
        const imageReset = update.clearGeneratedImage
          ? {
              imageUrl: null,
              imageLocalPath: null,
              imageFileName: null,
              imageStatus: "pending",
              imageError: null,
              imageBatchId: null,
            }
          : {};
        const voiceoverReset = update.clearSceneVoiceover
          ? {
              voiceoverStatus: "pending",
              voiceoverError: null,
              voiceoverLocalPath: null,
              voiceoverFileName: null,
              voiceoverDuration: null,
              voiceoverProvider: null,
              voiceoverSettingsJson: Prisma.JsonNull,
            }
          : {};

        return prisma.scene.update({
          where: { id: update.sceneId },
          data: {
            ...update.fields,
            ...imageReset,
            ...voiceoverReset,
          },
        });
      }),
    );

    // Only patched scenes lose image DB refs. Files for untouched scenes stay put.
    // Flow maps images by scene id (`scene_<id>.png`), so order/classification for
    // the rest of the video remains stable.
    for (const update of updates) {
      if (!update.clearGeneratedImage) {
        continue;
      }

      const existing = sceneById.get(update.sceneId);
      if (existing?.imageLocalPath) {
        await removePreviousGeneratedImage(
          existing.imageLocalPath,
          path.join(process.cwd(), "storage", "generated-images", "__patched__"),
        );
      }
    }
  }

  if (prepends.length > 0) {
    await prependScenesToVideo(videoId, prepends);
  }

  await persistComputedVideoStatus(videoId);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  const parts = [
    updates.length > 0 ? `updated ${updates.length}` : null,
    prepends.length > 0 ? `prepended ${prepends.length}` : null,
  ].filter(Boolean);
  redirectToVisualPlan(
    videoId,
    "success",
    `Applied patch (${parts.join(", ")}). Untouched scenes and their images were preserved.`,
  );
}

export async function importHookReplacementPatch(videoId: string, formData: FormData) {
  const patchJson = requiredText(formData, "patchJson");
  const selectedFromOrder = parsePositiveInt(formData.get("selectedFromOrder"), 0);
  const selectedToOrder = parsePositiveInt(formData.get("selectedToOrder"), 0);
  const confirmNarrationMismatch =
    formData.get("confirmNarrationMismatch")?.toString() === "on";
  const confirmNarrationOverlap =
    formData.get("confirmNarrationOverlap")?.toString() === "on";
  const patch = parseHookReplacementPatch(patchJson);

  if (patch.videoId && patch.videoId !== videoId) {
    throw new Error("Hook replacement patch videoId does not match the current video.");
  }

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
  });
  const removedScenes = scenes.filter(
    (scene) =>
      scene.sortOrder >= patch.replace.fromOrder &&
      scene.sortOrder <= patch.replace.toOrder,
  );

  if (removedScenes.length === 0) {
    throw new Error("No scenes were found in the selected hook replacement range.");
  }

  const preview = buildHookReplacementPreview({
    rawText: patchJson,
    currentVideoId: videoId,
    selectedFromOrder,
    selectedToOrder,
    currentScenes: scenes.map((scene) => ({
      order: scene.sortOrder,
      scriptText: scene.scriptText,
      duration: scene.duration,
    })),
  });

  if (!preview.narrationMatches && !confirmNarrationMismatch) {
    throw new Error(
      "Replacement hook narration does not exactly match the original hook text.",
    );
  }

  if (preview.duplicateAfterRangeCount > 0 && !confirmNarrationOverlap) {
    throw new Error(
      preview.duplicateAfterRangeWarning ??
        "Replacement hook narration duplicates scenes after the patch range.",
    );
  }

  const originalNarration = normalizeNarrationText(
    removedScenes.map((scene) => scene.scriptText).join(" "),
  );
  const replacementNarration = normalizeNarrationText(
    patch.scenes.map((scene) => scene.scriptText).join(" "),
  );

  if (originalNarration !== replacementNarration && !confirmNarrationMismatch) {
    throw new Error(
      "Replacement hook narration does not exactly match the original hook text.",
    );
  }

  const firstRemovedScene = removedScenes[0];
  const keptScenes = scenes.filter(
    (scene) =>
      scene.sortOrder < patch.replace.fromOrder ||
      scene.sortOrder > patch.replace.toOrder,
  );
  const replacementCreateData = patch.scenes.map((scene, index) => ({
    videoId,
    sortOrder: patch.replace.fromOrder + index,
    scriptText: scene.scriptText.trim(),
    sceneType: validSceneTypes.has(scene.sceneType?.trim() ?? "")
      ? scene.sceneType?.trim() ?? "avatar"
      : "avatar",
    visualPurpose: scene.visualPurpose?.trim() || null,
    visualIdea: scene.visualIdea?.trim() || null,
    imagePrompt: scene.imagePrompt?.trim() || null,
    duration: Math.round(scene.duration ?? firstRemovedScene?.duration ?? 4),
    imageUrl: null,
    status: "planned",
  }));
  const finalKeptOrders = new Map<string, number>();
  let nextOrder = 1;

  for (const scene of keptScenes) {
    if (scene.sortOrder < patch.replace.fromOrder) {
      finalKeptOrders.set(scene.id, nextOrder);
      nextOrder += 1;
    }
  }

  nextOrder += replacementCreateData.length;

  for (const scene of keptScenes) {
    if (scene.sortOrder > patch.replace.toOrder) {
      finalKeptOrders.set(scene.id, nextOrder);
      nextOrder += 1;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const scene of keptScenes) {
      await tx.scene.update({
        where: { id: scene.id },
        data: { sortOrder: -scene.sortOrder },
      });
    }

    await tx.scene.deleteMany({
      where: {
        videoId,
        sortOrder: {
          gte: patch.replace.fromOrder,
          lte: patch.replace.toOrder,
        },
      },
    });

    for (const scene of replacementCreateData) {
      await tx.scene.create({ data: scene });
    }

    for (const scene of keptScenes) {
      const sortOrder = finalKeptOrders.get(scene.id);

      if (!sortOrder) {
        continue;
      }

      await tx.scene.update({
        where: { id: scene.id },
        data: { sortOrder },
      });
    }
  });

  await invalidateSceneStructureArtifacts(videoId);
  await persistComputedVideoStatus(videoId);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function markSceneForPromptRegeneration(
  sceneId: string,
  videoId: string,
) {
  await markScenePromptOutdated(sceneId);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function mergeSceneWithPrevious(
  sceneId: string,
  videoId: string,
) {
  const currentScene = await prisma.scene.findUnique({
    where: { id: sceneId },
  });

  if (!currentScene) {
    throw new Error("Scene not found.");
  }

  const previousScene = await prisma.scene.findFirst({
    where: {
      videoId,
      sortOrder: { lt: currentScene.sortOrder },
    },
    orderBy: { sortOrder: "desc" },
  });

  if (!previousScene) {
    throw new Error("There is no previous scene to merge.");
  }

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: previousScene.id },
      data: {
        scriptText: `${previousScene.scriptText.trim()} ${currentScene.scriptText.trim()}`.trim(),
        duration: (previousScene.duration ?? 0) + (currentScene.duration ?? 0),
        visualIdea: [previousScene.visualIdea, currentScene.visualIdea]
          .filter((value) => value?.trim())
          .join("\n\n"),
        imagePrompt: null,
        status: "planned",
      },
    }),
    prisma.scene.delete({
      where: { id: currentScene.id },
    }),
  ]);

  await reindexScenesForVideo(videoId);
  await persistComputedVideoStatus(videoId);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function mergeSceneWithNext(sceneId: string, videoId: string) {
  const currentScene = await prisma.scene.findUnique({
    where: { id: sceneId },
  });

  if (!currentScene) {
    throw new Error("Scene not found.");
  }

  const nextScene = await prisma.scene.findFirst({
    where: {
      videoId,
      sortOrder: { gt: currentScene.sortOrder },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (!nextScene) {
    throw new Error("There is no next scene to merge.");
  }

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: currentScene.id },
      data: {
        scriptText: `${currentScene.scriptText.trim()} ${nextScene.scriptText.trim()}`.trim(),
        duration: (currentScene.duration ?? 0) + (nextScene.duration ?? 0),
        visualIdea: [currentScene.visualIdea, nextScene.visualIdea]
          .filter((value) => value?.trim())
          .join("\n\n"),
        imagePrompt: null,
        status: "planned",
      },
    }),
    prisma.scene.delete({
      where: { id: nextScene.id },
    }),
  ]);

  await reindexScenesForVideo(videoId);
  await persistComputedVideoStatus(videoId);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function splitHookScene(
  sceneId: string,
  videoId: string,
  formData: FormData,
) {
  const originalScene = await prisma.scene.findUnique({
    where: { id: sceneId },
  });

  if (!originalScene) {
    throw new Error("Scene not found.");
  }

  const splitCount = Number(formData.get("splitCount")?.toString() ?? "2");
  if (![2, 3].includes(splitCount)) {
    throw new Error("Split count must be 2 or 3.");
  }

  const rawParts = Array.from({ length: splitCount }, (_, index) => ({
    scriptText: formData.get(`splitScriptText${index + 1}`)?.toString().trim() ?? "",
    duration: formData.get(`splitDuration${index + 1}`)?.toString() ?? "",
    visualIdea:
      formData.get(`splitVisualIdea${index + 1}`)?.toString().trim() ?? "",
  }));
  const parsed = splitHookSceneSchema.parse({ parts: rawParts });
  const originalNormalized = originalScene.scriptText.replace(/\s+/g, " ").trim();
  const recombined = parsed.parts
    .map((part) => part.scriptText.replace(/\s+/g, " ").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (originalNormalized !== recombined) {
    throw new Error("Split text must preserve the exact narration wording.");
  }

  const laterScenes = await prisma.scene.findMany({
    where: {
      videoId,
      sortOrder: { gt: originalScene.sortOrder },
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const scene of laterScenes.sort((a, b) => b.sortOrder - a.sortOrder)) {
      await tx.scene.update({
        where: { id: scene.id },
        data: { sortOrder: scene.sortOrder + splitCount - 1 },
      });
    }

    await tx.scene.update({
      where: { id: originalScene.id },
      data: {
        sortOrder: originalScene.sortOrder,
        scriptText: parsed.parts[0]?.scriptText.trim() ?? originalScene.scriptText,
        duration: parsed.parts[0]?.duration ?? originalScene.duration,
        visualIdea: parsed.parts[0]?.visualIdea?.trim() || null,
        imagePrompt: null,
        status: "planned",
      },
    });

    for (let index = 1; index < parsed.parts.length; index += 1) {
      const part = parsed.parts[index];

      await tx.scene.create({
        data: {
          videoId,
          sortOrder: originalScene.sortOrder + index,
          scriptText: part.scriptText.trim(),
          sceneType: originalScene.sceneType,
          visualPurpose: originalScene.visualPurpose,
          visualIdea: part.visualIdea?.trim() || null,
          imagePrompt: null,
          duration: part.duration,
          imageUrl: null,
          status: "planned",
        },
      });
    }
  });

  await reindexScenesForVideo(videoId);
  await persistComputedVideoStatus(videoId);
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

function mockImageUrlForScene(sortOrder: number, sceneType: string) {
  const label = encodeURIComponent(`Scene ${sortOrder} - ${sceneType}`);
  return `https://placehold.co/1280x720/png?text=${label}`;
}

export async function mockCreateImages(videoId: string) {
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      sceneType: true,
    },
  });

  await prisma.$transaction([
    ...scenes.map((scene) =>
      prisma.scene.update({
        where: { id: scene.id },
        data: {
          imageUrl: mockImageUrlForScene(scene.sortOrder, scene.sceneType),
          imageStatus: "attached",
          imageError: null,
          status: "asset_ready",
        },
      }),
    ),
  ]);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

function imageBatchOptionsFromForm(formData: FormData) {
  return {
    name:
      emptyToNull(formData.get("batchName")) ??
      `Image batch ${new Date().toLocaleString("en")}`,
    outputFolder: emptyToNull(formData.get("outputFolder")),
    parallelCount: Math.min(parsePositiveInt(formData.get("parallelCount"), 4), 8),
    delayMs: parsePositiveInt(formData.get("delayMs"), 0),
    retryCount: parsePositiveInt(formData.get("retryCount"), 0),
  };
}

async function persistImageOutputFolderFromForm(
  videoId: string,
  formData: FormData,
) {
  const folder = emptyToNull(formData.get("outputFolder"));
  if (!folder) {
    return null;
  }
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true },
  });
  const stored = await saveVideoImageOutputFolder(videoId, folder);
  await mkdir(
    resolveImageOutputFolderAbsolute(stored, videoId, video?.title),
    { recursive: true },
  );
  return stored;
}

/**
 * Save the video-level image attach/output folder from Visual Plan.
 * Used by Flow prepare and rebuild-from-script.
 */
export async function saveVideoImageOutputFolderAction(
  videoId: string,
  formData: FormData,
) {
  const folder =
    emptyToNull(formData.get("imageOutputFolder")) ??
    emptyToNull(formData.get("outputFolder"));
  const stored = await saveVideoImageOutputFolder(videoId, folder);
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true },
  });
  await mkdir(
    resolveImageOutputFolderAbsolute(stored, videoId, video?.title),
    { recursive: true },
  );
  revalidatePath(`/videos/${videoId}`);
  redirectToVisualPlan(
    videoId,
    "success",
    `Image folder saved: ${stored ?? "default generated-images folder"}.`,
  );
}

/**
 * Client-callable save (no redirect) so Rebuild can persist folder first.
 */
export async function updateVideoImageOutputFolder(
  videoId: string,
  folder: string,
) {
  const stored = await saveVideoImageOutputFolder(videoId, folder);
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { title: true },
  });
  await mkdir(
    resolveImageOutputFolderAbsolute(stored, videoId, video?.title),
    { recursive: true },
  );
  revalidatePath(`/videos/${videoId}`);
  return {
    imageOutputFolder: stored,
    displayFolder: displayImageOutputFolder(stored, videoId, video?.title),
  };
}

function redirectToAssets(
  videoId: string,
  type: "error" | "success",
  message: string,
): never {
  redirect(
    `/videos/${videoId}?tab=assets&assetNoticeType=${type}&assetNotice=${encodeURIComponent(
      message,
    )}`,
  );
}

function redirectToVisualPlan(
  videoId: string,
  type: "error" | "success",
  message: string,
): never {
  redirect(
    `/videos/${videoId}?tab=visual-plan&assetNoticeType=${type}&assetNotice=${encodeURIComponent(
      message,
    )}`,
  );
}

function redirectToVoiceover(
  videoId: string,
  type: "error" | "success",
  message: string,
): never {
  const id = videoId.trim();
  if (!id) {
    throw new Error(
      `Voiceover redirect missing video id: ${message}`,
    );
  }
  redirect(
    `/videos/${id}?tab=voiceover&voiceoverNoticeType=${type}&voiceoverNotice=${encodeURIComponent(
      message,
    )}`,
  );
}

function voiceoverSegmentIdFromActionArgs(
  segmentIdOrFormData: string | FormData,
  formData?: FormData,
) {
  if (typeof segmentIdOrFormData === "string") {
    return {
      segmentId: segmentIdOrFormData.trim(),
      formData,
      videoIdHint: formData?.get("videoId")?.toString().trim() || "",
    };
  }

  // formAction sometimes delivers FormData as the only argument.
  return {
    segmentId:
      segmentIdOrFormData.get("voiceoverSegmentId")?.toString().trim() || "",
    formData: segmentIdOrFormData,
    videoIdHint: segmentIdOrFormData.get("videoId")?.toString().trim() || "",
  };
}

function redirectToRenderDraft(
  videoId: string,
  type: "error" | "success",
  message: string,
): never {
  redirect(
    `/videos/${videoId}?tab=render-draft&renderNoticeType=${type}&renderNotice=${encodeURIComponent(
      message,
    )}`,
  );
}

function redirectToThumbnail(
  videoId: string,
  type: "error" | "success",
  message: string,
): never {
  redirect(
    `/videos/${videoId}?tab=thumbnail&thumbnailNoticeType=${type}&thumbnailNotice=${encodeURIComponent(
      message,
    )}`,
  );
}

function parseSubtitleFormat(value: FormDataEntryValue | null): SubtitleInputFormat {
  const format = value?.toString().trim().toLowerCase();

  if (format === "srt" || format === "vtt") {
    return format;
  }

  return "auto";
}

function parseOptionalDuration(value: FormDataEntryValue | null) {
  const duration = emptyToNull(value);

  if (!duration) {
    return null;
  }

  const parsedDuration = Number(duration);

  if (!Number.isFinite(parsedDuration) || parsedDuration < 0) {
    throw new Error("Voiceover duration must be a positive number or empty.");
  }

  return parsedDuration;
}

function parseOptionalFloat(value: FormDataEntryValue | null, fallback: number) {
  const text = emptyToNull(value);

  if (!text) {
    return fallback;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseVoiceoverGenerationOptions(formData: FormData) {
  return {
    voiceId: emptyToNull(formData.get("voiceId")),
    modelId: emptyToNull(formData.get("modelId")),
    outputFormat:
      emptyToNull(formData.get("outputFormat")) ?? "mp3_44100_128",
    stability: parseOptionalFloat(formData.get("stability"), 0.5),
    similarityBoost: parseOptionalFloat(formData.get("similarityBoost"), 0.75),
    speed: parseOptionalFloat(formData.get("speed"), 0.85),
  };
}

function parseVoiceoverSectionVoicesFromForm(formData: FormData) {
  const raw = emptyToNull(formData.get("voiceoverSectionVoicesJson"));
  if (!raw) {
    return null;
  }

  try {
    return normalizeVoiceoverSectionVoices(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function persistVoiceoverGenerationOptions(formData: FormData) {
  const generationOptions = parseVoiceoverGenerationOptions(formData);

  await saveElevenLabsPreferences({
    voiceId: generationOptions.voiceId ?? undefined,
    voiceName: emptyToNull(formData.get("voiceName")) ?? undefined,
    modelId: generationOptions.modelId ?? undefined,
    outputFormat: generationOptions.outputFormat,
    stability: generationOptions.stability,
    similarityBoost: generationOptions.similarityBoost,
    speed: generationOptions.speed,
  });

  return generationOptions;
}

export async function saveBibleOneYearDayConfigAction(
  videoId: string,
  formData: FormData,
) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      ideaJson: true,
      topicCategory: true,
      channelKey: true,
      title: true,
      topic: true,
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  if (!isBibleOneYearCategory(video.topicCategory)) {
    throw new Error("This video is not using The Bible in One Year category.");
  }

  const chapterBlocksRaw = formData.get("chapterBlocksJson")?.toString() ?? "[]";
  let chapterBlocks: unknown = [];
  try {
    chapterBlocks = JSON.parse(chapterBlocksRaw);
  } catch {
    throw new Error("Chapter blocks JSON is invalid.");
  }

  const dayConfig = normalizeBibleOneYearDayConfig({
    dayNumber: Number(formData.get("dayNumber")),
    journeyAction: formData.get("journeyAction"),
    todayReadingDisplay: formData.get("todayReadingDisplay"),
    nextReadingDisplay: formData.get("nextReadingDisplay"),
    listeningFocus: formData.get("listeningFocus"),
    reflectionMainThought: formData.get("reflectionMainThought"),
    reflectionApplication: formData.get("reflectionApplication"),
    prayerPoints: String(formData.get("prayerPoints") ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    chapterBlocks,
  });

  if (!dayConfig) {
    throw new Error("Bible in One Year day config is incomplete.");
  }

  let ideaJson: Record<string, unknown> = {};
  if (video.ideaJson?.trim()) {
    try {
      const parsed = JSON.parse(video.ideaJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        ideaJson = parsed as Record<string, unknown>;
      }
    } catch {
      ideaJson = {};
    }
  }

  ideaJson.bibleOneYear = dayConfig;
  ideaJson.topicCategory = video.topicCategory;
  ideaJson.workingTitle =
    typeof ideaJson.workingTitle === "string" && ideaJson.workingTitle.trim()
      ? ideaJson.workingTitle
      : `The Bible in One Year — Day ${dayConfig.dayNumber}`;

  await prisma.video.update({
    where: { id: videoId },
    data: {
      ideaJson: JSON.stringify(ideaJson, null, 2),
      title: `The Bible in One Year — Day ${dayConfig.dayNumber}`,
      topic: dayConfig.todayReadingDisplay || video.topic,
    },
  });

  revalidatePath(`/videos/${videoId}`);
}

export async function loadBibleOneYearPlanDayAction(
  videoId: string,
  dayNumber: number,
) {
  const planDay = await getBibleOneYearPlanDay(dayNumber);
  if (!planDay) {
    throw new Error(`No reading-plan entry found for day ${dayNumber}.`);
  }

  const journey = await getBibleOneYearJourneyState();
  const dayConfig = buildBibleOneYearDayConfigFromPlan(planDay, {
    journeyAction: dayNumber === 1 ? "begin" : "continue",
  });

  const formData = new FormData();
  formData.set("dayNumber", String(dayConfig.dayNumber));
  formData.set("journeyAction", dayConfig.journeyAction);
  formData.set("todayReadingDisplay", dayConfig.todayReadingDisplay);
  formData.set("nextReadingDisplay", dayConfig.nextReadingDisplay);
  formData.set("listeningFocus", dayConfig.listeningFocus);
  formData.set("reflectionMainThought", dayConfig.reflectionMainThought);
  formData.set("reflectionApplication", dayConfig.reflectionApplication);
  formData.set("prayerPoints", dayConfig.prayerPoints.join("\n"));
  formData.set("chapterBlocksJson", JSON.stringify(dayConfig.chapterBlocks));

  await saveBibleOneYearDayConfigAction(videoId, formData);

  return {
    dayConfig,
    journey,
  };
}

function parseVoiceoverSegmentOptions(formData: FormData) {
  return {
    maxScenesPerSegment: parsePositiveInt(
      formData.get("maxScenesPerSegment"),
      8,
    ),
    maxCharsPerSegment: parsePositiveInt(
      formData.get("maxCharsPerSegment"),
      900,
    ),
    maxEstimatedSeconds: parsePositiveInt(
      formData.get("maxEstimatedSeconds"),
      75,
    ),
  };
}

function parseVoiceoverPacingOptions(formData: FormData) {
  const pacePreset = formData.get("pacePreset")?.toString();
  const pauseStyle = formData.get("pauseStyle")?.toString();

  return {
    pacePreset: VOICEOVER_PACE_PRESETS.includes(
      pacePreset as VoiceoverPacePreset,
    )
      ? (pacePreset as VoiceoverPacePreset)
      : DEFAULT_VOICEOVER_PACING.pacePreset,
    pauseStyle: VOICEOVER_PAUSE_STYLES.includes(
      pauseStyle as VoiceoverPauseStyle,
    )
      ? (pauseStyle as VoiceoverPauseStyle)
      : DEFAULT_VOICEOVER_PACING.pauseStyle,
  };
}

function durationChangeSummary(oldDuration: number | null, newDuration: number | null) {
  if (!oldDuration || !newDuration) {
    return "Duration change unavailable.";
  }

  const change = newDuration - oldDuration;
  const percent = (change / oldDuration) * 100;
  const sign = change >= 0 ? "+" : "";

  return `Old: ${oldDuration.toFixed(1)}s. New: ${newDuration.toFixed(1)}s. Change: ${sign}${change.toFixed(1)}s / ${sign}${percent.toFixed(1)}%.`;
}

function totalDuration(segments: Array<{ durationSec: number | null }>) {
  return segments.reduce((total, segment) => total + (segment.durationSec ?? 0), 0);
}

function selectedVoiceoverSegmentIds(formData: FormData) {
  return formData
    .getAll("selectedVoiceoverSegmentIds")
    .map((value) => value.toString())
    .filter(Boolean);
}

function selectedSceneVoiceoverOrders(formData: FormData) {
  return formData
    .getAll("selectedSceneVoiceoverOrders")
    .map((value) => Number(value.toString()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function scenesForVoiceover(videoId: string) {
  return prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
    },
  });
}

function createVoiceoverSegmentData(
  videoId: string,
  draft: VoiceoverSegmentDraft,
) {
  return {
    videoId,
    index: draft.index,
    sceneStartOrder: draft.sceneStartOrder,
    sceneEndOrder: draft.sceneEndOrder,
    text: draft.text,
  };
}

async function createVoiceoverSegmentDrafts(
  videoId: string,
  drafts: VoiceoverSegmentDraft[],
) {
  for (const draft of drafts) {
    await prisma.voiceoverSegment.create({
      data: createVoiceoverSegmentData(videoId, draft),
    });
  }
}

async function snapshotPreservableSubtitleSegments(videoId: string) {
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: {
      sceneStartOrder: true,
      sceneEndOrder: true,
      text: true,
      pacedTextUsed: true,
      subtitleSegment: {
        select: {
          provider: true,
          rawAlignmentJson: true,
          localCuesJson: true,
          localSrt: true,
          localVtt: true,
          status: true,
        },
      },
    },
  });

  const snapshots = new Map<string, PreservedSubtitleSegmentSnapshot>();
  for (const segment of segments) {
    const subtitle = segment.subtitleSegment;
    if (!subtitle) {
      continue;
    }
    snapshots.set(
      subtitleSegmentPreserveKey(segment.sceneStartOrder, segment.sceneEndOrder),
      {
        sceneStartOrder: segment.sceneStartOrder,
        sceneEndOrder: segment.sceneEndOrder,
        spokenText: spokenTextForSubtitlePreserve(
          segment.text,
          segment.pacedTextUsed,
        ),
        provider: subtitle.provider,
        rawAlignmentJson: subtitle.rawAlignmentJson,
        localCuesJson: subtitle.localCuesJson,
        localSrt: subtitle.localSrt,
        localVtt: subtitle.localVtt,
        status: subtitle.status,
      },
    );
  }
  return snapshots;
}

async function ensureExclusiveClipVoiceoverPathsForVideo(videoId: string) {
  const exclusiveScenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
      clipMuted: false,
      clipLocalPath: { not: null },
      voiceoverStatus: { in: ["generated", "attached"] },
      OR: [{ voiceoverLocalPath: null }, { voiceoverLocalPath: "" }],
    },
    select: {
      id: true,
      clipLocalPath: true,
      clipFileName: true,
      voiceoverDuration: true,
      duration: true,
    },
  });

  let repaired = 0;
  for (const scene of exclusiveScenes) {
    const targetDurationSec =
      scene.voiceoverDuration && scene.voiceoverDuration > 0
        ? scene.voiceoverDuration
        : Math.max(0.5, scene.duration ?? 5);
    const audio = await ensureExclusiveSceneVoiceoverAudio({
      videoId,
      sceneId: scene.id,
      clipLocalPath: scene.clipLocalPath,
      clipFileName: scene.clipFileName,
      targetDurationSec,
    });
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverLocalPath: audio.relativePath,
        voiceoverFileName: audio.fileName,
        voiceoverStatus: "attached",
        voiceoverError: null,
      },
    });
    repaired += 1;
  }
  return repaired;
}

async function syncSceneVoiceoversToSubtitleSegments(
  videoId: string,
  options: { preserveSubtitles?: boolean } = {},
) {
  const preserveSubtitles = options.preserveSubtitles !== false;
  const preserved = preserveSubtitles
    ? await snapshotPreservableSubtitleSegments(videoId)
    : new Map<string, PreservedSubtitleSegmentSnapshot>();

  await ensureExclusiveClipVoiceoverPathsForVideo(videoId);

  const scenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
      voiceoverLocalPath: { not: null },
      voiceoverStatus: { in: ["generated", "attached"] },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      sortOrder: true,
      scriptText: true,
      visualIdea: true,
      voiceoverLocalPath: true,
      voiceoverFileName: true,
      voiceoverDuration: true,
      voiceoverProvider: true,
      pauseAfterMs: true,
      clipLocalPath: true,
      clipMuted: true,
    },
  });

  await prisma.voiceoverSegment.deleteMany({ where: { videoId } });

  if (scenes.length === 0) {
    return { sceneCount: 0, restoredSubtitles: 0 };
  }

  const introByBedOrder = new Map<number, number>();
  const stitchPlan = planMusicBedStitch(
    scenes.map((scene) => {
      const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
      return {
        isMusicBed:
          !exclusiveClip &&
          (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
            isMusicBedScene(scene)),
        pauseAfterMs: scene.pauseAfterMs,
        durationSec: scene.voiceoverDuration ?? 0,
      };
    }),
  );
  for (const overlap of musicBedOverlapsFromSteps(stitchPlan)) {
    const bed = scenes[overlap.bedIndex];
    if (bed) {
      introByBedOrder.set(bed.sortOrder, overlap.introSec);
    }
  }

  await prisma.voiceoverSegment.createMany({
    data: scenes.map((scene, index) => {
      const displayText = normalizeSceneVoiceoverText(scene.scriptText);
      const speech = prepareVoiceoverSpeechText(displayText);
      const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
      const isMusicBed =
        !exclusiveClip &&
        (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
          isMusicBedScene(scene));
      const visualDuration = sceneVisualDurationSec({
        voiceoverDuration: scene.voiceoverDuration,
        pauseAfterMs: scene.pauseAfterMs,
        isMusicBed,
        introSec: introByBedOrder.get(scene.sortOrder),
      });

      return {
        videoId,
        index: index + 1,
        sceneStartOrder: scene.sortOrder,
        sceneEndOrder: scene.sortOrder,
        text: displayText,
        pacedTextUsed: speech.spokenText,
        provider: scene.voiceoverProvider ?? "elevenlabs",
        audioPath: scene.voiceoverLocalPath,
        fileName: scene.voiceoverFileName,
        durationSec: visualDuration,
        status: "generated",
        error: null,
      };
    }),
  });

  const createdSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: {
      id: true,
      index: true,
      sceneStartOrder: true,
      sceneEndOrder: true,
      text: true,
      pacedTextUsed: true,
    },
    orderBy: { index: "asc" },
  });

  let restoredSubtitles = 0;
  for (const segment of createdSegments) {
    const nextSpoken = spokenTextForSubtitlePreserve(
      segment.text,
      segment.pacedTextUsed,
    );

    if (isSilentSubtitleVoiceoverText(nextSpoken)) {
      await prisma.subtitleSegment.upsert({
        where: { voiceoverSegmentId: segment.id },
        create: {
          videoId,
          voiceoverSegmentId: segment.id,
          index: segment.index,
          sceneStartOrder: segment.sceneStartOrder,
          sceneEndOrder: segment.sceneEndOrder,
          provider: "silent_skip",
          rawAlignmentJson: Prisma.JsonNull,
          localCuesJson: [],
          localSrt: "",
          localVtt: "",
          status: "ready",
          error: null,
        },
        update: {
          index: segment.index,
          sceneStartOrder: segment.sceneStartOrder,
          sceneEndOrder: segment.sceneEndOrder,
          provider: "silent_skip",
          rawAlignmentJson: Prisma.JsonNull,
          localCuesJson: [],
          localSrt: "",
          localVtt: "",
          status: "ready",
          error: null,
        },
      });
      continue;
    }

    const snapshot = preserved.get(
      subtitleSegmentPreserveKey(segment.sceneStartOrder, segment.sceneEndOrder),
    );
    if (!snapshot) {
      continue;
    }

    const cueCount = parseSubtitleCuesJson(snapshot.localCuesJson).length;
    if (
      !shouldRestorePreservedSubtitleCues({
        previousSpokenText: snapshot.spokenText,
        nextSpokenText: nextSpoken,
        cueCount,
        previousStatus: snapshot.status,
      })
    ) {
      continue;
    }

    await prisma.subtitleSegment.create({
      data: {
        videoId,
        voiceoverSegmentId: segment.id,
        index: segment.index,
        sceneStartOrder: segment.sceneStartOrder,
        sceneEndOrder: segment.sceneEndOrder,
        provider: snapshot.provider ?? "elevenlabs_forced_alignment",
        rawAlignmentJson:
          snapshot.rawAlignmentJson === null ||
          snapshot.rawAlignmentJson === undefined
            ? Prisma.JsonNull
            : (snapshot.rawAlignmentJson as Prisma.InputJsonValue),
        localCuesJson:
          snapshot.localCuesJson === null ||
          snapshot.localCuesJson === undefined
            ? Prisma.JsonNull
            : (snapshot.localCuesJson as Prisma.InputJsonValue),
        localSrt: snapshot.localSrt,
        localVtt: snapshot.localVtt,
        status: restoredSubtitleSegmentStatus(snapshot.status),
        error: null,
      },
    });
    restoredSubtitles += 1;
  }

  return { sceneCount: scenes.length, restoredSubtitles };
}

async function refreshVoiceoverSegmentDurationsFromScenes(videoId: string) {
  await ensureExclusiveClipVoiceoverPathsForVideo(videoId);

  const scenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
      voiceoverLocalPath: { not: null },
      voiceoverStatus: { in: ["generated", "attached"] },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      sortOrder: true,
      voiceoverDuration: true,
      voiceoverProvider: true,
      visualIdea: true,
      pauseAfterMs: true,
      clipLocalPath: true,
      clipMuted: true,
    },
  });

  if (scenes.length === 0) {
    return 0;
  }

  const introByBedOrder = new Map<number, number>();
  const stitchPlan = planMusicBedStitch(
    scenes.map((scene) => {
      const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
      return {
        isMusicBed:
          !exclusiveClip &&
          (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
            isMusicBedScene(scene)),
        pauseAfterMs: scene.pauseAfterMs,
        durationSec: scene.voiceoverDuration ?? 0,
      };
    }),
  );
  for (const overlap of musicBedOverlapsFromSteps(stitchPlan)) {
    const bed = scenes[overlap.bedIndex];
    if (bed) {
      introByBedOrder.set(bed.sortOrder, overlap.introSec);
    }
  }

  const sceneByOrder = new Map(scenes.map((scene) => [scene.sortOrder, scene]));
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: {
      id: true,
      sceneStartOrder: true,
      sceneEndOrder: true,
    },
  });

  let updated = 0;
  for (const segment of segments) {
    if (segment.sceneStartOrder !== segment.sceneEndOrder) {
      continue;
    }
    const scene = sceneByOrder.get(segment.sceneStartOrder);
    if (!scene) {
      continue;
    }
    const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
    const isMusicBed =
      !exclusiveClip &&
      (scene.voiceoverProvider === MUSIC_BED_PROVIDER || isMusicBedScene(scene));
    const durationSec = sceneVisualDurationSec({
      voiceoverDuration: scene.voiceoverDuration,
      pauseAfterMs: scene.pauseAfterMs,
      isMusicBed,
      introSec: introByBedOrder.get(scene.sortOrder),
    });
    await prisma.voiceoverSegment.update({
      where: { id: segment.id },
      data: { durationSec },
    });
    updated += 1;
  }

  return updated;
}

async function maybeRecombineSubtitlesAfterVoiceoverSync(videoId: string) {
  const previous = await prisma.video.findUnique({
    where: { id: videoId },
    select: { subtitleStatus: true },
  });
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    include: {
      subtitleSegment: {
        select: {
          status: true,
          localCuesJson: true,
        },
      },
    },
  });

  if (segments.length === 0) {
    return { recombined: false, restoredReady: false };
  }

  const allLocallyReady = segments.every((segment) => {
    const silent = isSilentSubtitleVoiceoverText(
      spokenTextForSubtitlePreserve(segment.text, segment.pacedTextUsed),
    );
    const subtitle = segment.subtitleSegment;
    if (!subtitle || !["formatted", "ready"].includes(subtitle.status)) {
      return false;
    }
    if (silent) {
      return true;
    }
    return parseSubtitleCuesJson(subtitle.localCuesJson).length > 0;
  });

  if (!allLocallyReady) {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        subtitleStatus: "needs_update",
        renderDraftStatus: "pending",
      },
    });
    return { recombined: false, restoredReady: false };
  }

  const nextStatus =
    previous?.subtitleStatus === "ready" ? "ready" : "formatted";
  await combineSegmentSubtitlesForVideo(videoId, nextStatus);
  return { recombined: true, restoredReady: nextStatus === "ready" };
}

async function reindexVoiceoverSegments(videoId: string) {
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    orderBy: [
      { sceneStartOrder: "asc" },
      { sceneEndOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: { id: true },
  });

  for (const [index, segment] of segments.entries()) {
    await prisma.voiceoverSegment.update({
      where: { id: segment.id },
      data: { index: index + 1 },
    });
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function markVoiceoverSegmentGenerationError(
  segmentId: string,
  message: string,
) {
  try {
    await prisma.voiceoverSegment.update({
      where: { id: segmentId },
      data: { status: "error", error: message },
    });
  } catch {
    // Preserve the original generation failure for the caller. A failed error
    // marker should not hide the problem that made regeneration stop.
  }
}

async function generateAndSaveVoiceoverSegment(
  segmentId: string,
  formData: FormData,
  options: { allowOverwrite?: boolean } = {},
) {
  const generationOptions = await persistVoiceoverGenerationOptions(formData);
  const pacingOptions = parseVoiceoverPacingOptions(formData);
  const segment = await prisma.voiceoverSegment.findUnique({
    where: { id: segmentId },
  });

  if (!segment) {
    throw new Error("Voiceover segment not found.");
  }

  if (segment.audioPath && !options.allowOverwrite) {
    throw new Error("Segment audio already exists. Use Regenerate to overwrite it.");
  }

  await prisma.voiceoverSegment.update({
    where: { id: segmentId },
    data: { status: "generating", error: null },
  });

  try {
    const originalText = segment.text;
    let pacedText: string;

    try {
      pacedText = applyVoiceoverPacingText(originalText, pacingOptions);
    } catch (error) {
      throw new Error(
        `Could not apply voiceover pacing: ${errorMessage(
          error,
          "pacing preprocessor failed",
        )}`,
      );
    }

    const speech = prepareVoiceoverSpeechText(pacedText);
    const spokenText = speech.spokenText;

    const audio = await generateElevenLabsSpeech({
      text: spokenText,
      ...generationOptions,
    });
    const directory = await ensureVoiceoverSegmentsDir(segment.videoId);
    const fileName = voiceoverSegmentFileName(segment);
    const filePath = path.join(directory, fileName);

    await writeFile(filePath, audio);

    const durationSec = await getAudioDurationSec(filePath);
    const audioPath = voiceoverSegmentRelativePath(segment.videoId, fileName);

    try {
      await prisma.voiceoverSegment.update({
        where: { id: segmentId },
        data: {
          provider: "elevenlabs",
          voiceId: generationOptions.voiceId,
          modelId: generationOptions.modelId,
          outputFormat: generationOptions.outputFormat,
          pacedTextUsed: spokenText,
          audioPath,
          fileName,
          durationSec,
          status: "generated",
          error: null,
        },
      });
    } catch (error) {
      const message = `Generated audio, but could not save segment metadata: ${errorMessage(
        error,
        "database update failed",
      )}`;

      await markVoiceoverSegmentGenerationError(segmentId, message);
      throw new Error(message);
    }

    await invalidateSubtitlesForVideo(segment.videoId);

    return {
      videoId: segment.videoId,
      fileName,
      oldDurationSec: segment.durationSec,
      newDurationSec: durationSec,
      durationSummary: durationChangeSummary(segment.durationSec, durationSec),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate voiceover segment.";

    await markVoiceoverSegmentGenerationError(segmentId, message);

    throw new Error(message);
  }
}

async function generateVoiceoverForScenes(
  videoId: string,
  formData: FormData,
  options: {
    selectedOrders?: number[];
    missingOnly?: boolean;
    retryFailedOnly?: boolean;
    overwrite?: boolean;
    processId?: string;
  } = {},
) {
  const generationOptions = await persistVoiceoverGenerationOptions(formData);
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      script: true,
      voiceoverSectionVoicesJson: true,
      channelKey: true,
      title: true,
      topic: true,
      topicCategory: true,
      ideaJson: true,
    },
  });
  const selectedOrders = new Set(options.selectedOrders ?? []);
  let scenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
      ...(selectedOrders.size > 0
        ? { sortOrder: { in: [...selectedOrders] } }
        : {}),
      ...(options.retryFailedOnly
        ? { voiceoverStatus: { in: ["failed", "needs_retry"] } }
        : {}),
      // missingOnly is resolved after load (path may be set but file gone).
    },
    orderBy: { sortOrder: "asc" },
  });

  if (options.missingOnly) {
    const needing = [];
    for (const scene of scenes) {
      if (sceneUsesExclusiveClipAudio(scene)) {
        continue;
      }
      const status = scene.voiceoverStatus ?? "";
      if (status === "failed" || status === "needs_retry") {
        needing.push(scene);
        continue;
      }
      const check = await sceneVoiceoverFileExists(scene.voiceoverLocalPath);
      if (!check.ok) {
        needing.push(scene);
      }
    }
    scenes = needing;
  }

  if (scenes.length === 0) {
    throw new Error("No scenes found for by-scene voiceover.");
  }

  // Prefer the live Section Voices panel payload (may be unsaved) over DB.
  const sectionVoicesFromForm = parseVoiceoverSectionVoicesFromForm(formData);
  const sectionVoices =
    sectionVoicesFromForm ??
    normalizeVoiceoverSectionVoices(video?.voiceoverSectionVoicesJson);

  if (sectionVoicesFromForm) {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        voiceoverSectionVoicesJson:
          sectionVoicesFromForm as Prisma.InputJsonValue,
      },
    });
  }

  // Always map sections against the full scene list so selected regenerations
  // get the same section assignment as a full run.
  const allScenesForSections = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true, scriptText: true, visualIdea: true },
  });
  const autoSceneSectionAssignments = video?.script?.trim()
    ? groupScenesByScriptSection({
        script: video.script,
        scenes: allScenesForSections,
      })
    : allScenesForSections.map((scene) => ({
        sortOrder: scene.sortOrder,
        sectionId: "section-1",
        sectionLabel: "Full script",
        sectionKind: "other" as const,
      }));
  const sceneSectionAssignments = applyManualSectionRanges({
    autoAssignments: autoSceneSectionAssignments,
    ranges: extractVoiceoverSectionRanges(sectionVoices),
  });
  const sectionBySortOrder = new Map(
    sceneSectionAssignments.map((assignment) => [
      assignment.sortOrder,
      assignment,
    ]),
  );
  const channel = getChannelProfile(video?.channelKey);
  const podcastEpisodeFormat =
    video?.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY
      ? resolvePodcastEpisodeFormat({
          channelKey: video.channelKey,
          ideaJson: video.ideaJson,
          topicEngine: channel.editorialInstructions?.topicEngine,
          title: video.title,
          topic: video.topic,
        })
      : null;
  const applyMaxSaraVoiceProfiles =
    podcastEpisodeFormat === "max_sara_conversation";
  const podcastDeliveryBySortOrder = applyMaxSaraVoiceProfiles
    ? mapScenesToPodcastDeliveryModes(allScenesForSections)
    : null;
  const actingCuesBySortOrder = video?.script?.trim()
    ? mapPodcastActingCuesToScenes({
        script: video.script,
        scenes: allScenesForSections,
      })
    : new Map();
  const prefsForCatalog = await readElevenLabsPreferences();
  const namedVoices = prefsForCatalog?.namedVoices ?? [];
  const formTtsProviderRaw = emptyToNull(formData.get("ttsProvider"));
  const formTtsProvider =
    formTtsProviderRaw === "chatterbox" ||
    formTtsProviderRaw === "elevenlabs" ||
    formTtsProviderRaw === "google"
      ? formTtsProviderRaw
      : null;
  const fallbackVoice = {
    voiceId: generationOptions.voiceId ?? "",
    voiceName: emptyToNull(formData.get("voiceName")) ?? undefined,
    provider: resolveNamedVoiceProvider(
      namedVoices,
      generationOptions.voiceId ?? "",
      formTtsProvider,
    ),
  };

  const directory = await ensureSceneVoiceoversDir(videoId);
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let cumulativeTimeSec = 0;

  clearSceneVoiceoverCancel(videoId);

  async function isCanceledNow() {
    if (isSceneVoiceoverCancelRequested(videoId)) {
      return true;
    }
    if (!options.processId) {
      return false;
    }
    const run = await prisma.processRun.findUnique({
      where: { id: options.processId },
      select: { status: true },
    });
    return run?.status === "cancelled";
  }

  async function throwIfCanceled() {
    if (!(await isCanceledNow())) {
      return;
    }
    await prisma.video.update({
      where: { id: videoId },
      data: {
        voiceoverAudioPath: null,
        voiceoverFileName: null,
        voiceoverStatus: generated > 0 || failed > 0 ? "partial" : "pending",
        renderDraftStatus: "pending",
      },
    });
    if (generated > 0) {
      await syncSceneVoiceoversToSubtitleSegments(videoId, {
        preserveSubtitles: true,
      });
      await maybeRecombineSubtitlesAfterVoiceoverSync(videoId);
    }
    clearSceneVoiceoverCancel(videoId);
    throw new SceneVoiceoverCanceledError(
      `Scene voiceover generation canceled after ${generated} generated, ${skipped} skipped, ${failed} failed.`,
      { generated, skipped, failed },
    );
  }

  for (const [index, scene] of scenes.entries()) {
    await throwIfCanceled();

    const cleanText = normalizeSceneVoiceoverText(scene.scriptText);
    const speech = prepareVoiceoverSpeechText(cleanText);
    const actingCues = actingCuesBySortOrder.get(scene.sortOrder) ?? [];
    const spokenText = buildExpressiveVoiceoverText(
      speech.spokenText,
      actingCues,
    );
    const modelId = resolveVoiceoverModelForActingCues(
      actingCues,
      generationOptions.modelId,
    );
    await updateProcess(options.processId, {
      status: "running",
      currentStep: `Generating scene ${index + 1} of ${scenes.length}`,
      stepIndex: index + 1,
      totalSteps: scenes.length,
      logMessage: `Scene ${scene.sortOrder}: ${spokenText.slice(0, 120)}`,
    });

    if (!spokenText) {
      skipped += 1;
      await updateProcess(options.processId, {
        logMessage: `Skipped scene ${scene.sortOrder}: empty narration text.`,
        logLevel: "warning",
      });
      continue;
    }

    if (scene.voiceoverLocalPath && !options.overwrite && !options.missingOnly) {
      const existing = await sceneVoiceoverFileExists(scene.voiceoverLocalPath);
      if (existing.ok) {
        skipped += 1;
        cumulativeTimeSec += scene.voiceoverDuration ?? 0;
        await updateProcess(options.processId, {
          logMessage: `Skipped scene ${scene.sortOrder}: audio already exists.`,
        });
        continue;
      }
      // Stale DB path (file deleted) — regenerate instead of skipping.
      await updateProcess(options.processId, {
        logMessage: `Scene ${scene.sortOrder}: voiceover path is set but file is missing; regenerating.`,
        logLevel: "warning",
      });
    }

    if (options.missingOnly && scene.voiceoverLocalPath) {
      await updateProcess(options.processId, {
        logMessage: `Scene ${scene.sortOrder}: regenerating missing/invalid voiceover.`,
        logLevel: "warning",
      });
    }

    const pauseAfterMs = getPauseAfterScene({
      scriptText: cleanText,
      sortOrder: scene.sortOrder,
      index,
      cumulativeTimeSec,
      existingPauseAfterMs: scene.pauseAfterMs,
    });

    const sectionAssignment = sectionBySortOrder.get(scene.sortOrder);
    const deliveryMode: PodcastDeliveryMode =
      podcastDeliveryBySortOrder?.get(scene.sortOrder) ?? "main";
    const introGapMs =
      applyMaxSaraVoiceProfiles &&
      deliveryMode === "intro" &&
      (scene.pauseAfterMs == null ||
        !Number.isFinite(scene.pauseAfterMs) ||
        scene.pauseAfterMs <= DEFAULT_SCENE_PAUSE_AFTER_MS)
        ? PODCAST_INTRO_SCENE_PAUSE_AFTER_MS
        : null;
    const effectivePauseAfterMs = introGapMs ?? pauseAfterMs;

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverStatus: "pending",
        voiceoverError: null,
        pauseAfterMs: effectivePauseAfterMs,
      },
    });

    try {
      const resolvedVoice = resolveSceneVoiceoverSettings({
        sectionKind: sectionAssignment?.sectionKind ?? "other",
        sectionVoices,
        fallback: fallbackVoice,
      });
      const voiceProvider = resolveNamedVoiceProvider(
        namedVoices,
        resolvedVoice.voiceId || generationOptions.voiceId || "",
        resolvedVoice.provider,
      );
      const namedVoice = findNamedVoice(
        namedVoices,
        resolvedVoice.voiceId || generationOptions.voiceId || "",
      );
      const podcastHost = applyMaxSaraVoiceProfiles
        ? resolvePodcastHostKey({
            voiceId: resolvedVoice.voiceId || generationOptions.voiceId,
            sectionKind: sectionAssignment?.sectionKind,
          })
        : null;
      const podcastSectionSpeed =
        podcastHost != null
          ? resolvePodcastSectionSpeakingRate({
              host: podcastHost,
              mode: deliveryMode,
              explicitSpeed: resolvedVoice.speed,
              spokenText: speech.spokenText,
            })
          : null;
      const sceneGenerationOptions = {
        ...generationOptions,
        voiceId: resolvedVoice.voiceId || generationOptions.voiceId,
        modelId,
        // eleven_v3 audio tags are more reliable without a forced speed override.
        // Otherwise prefer per-speaker/section speed (e.g. slower Leo) over global.
        ...(actingCues.length > 0 && voiceProvider === "elevenlabs"
          ? { speed: null }
          : podcastSectionSpeed != null
            ? { speed: podcastSectionSpeed }
            : resolvedVoice.speed != null
              ? { speed: resolvedVoice.speed }
              : {}),
      };
      const abortController = new AbortController();
      const cancelPoll = setInterval(() => {
        void isCanceledNow().then((canceled) => {
          if (canceled) {
            abortController.abort();
          }
        });
      }, 400);

      let audio: Buffer;
      try {
        if (voiceProvider === CHATTERBOX_PROVIDER) {
          const chatterboxMode = resolveChatterboxVoiceMode(namedVoice);
          const predefinedVoiceId =
            namedVoice?.predefinedVoiceId?.trim() ||
            (chatterboxMode === "predefined"
              ? resolvedVoice.voiceId || generationOptions.voiceId || ""
              : "");
          const referenceFileName =
            namedVoice?.referenceFileName?.trim() ||
            (chatterboxMode === "clone"
              ? resolvedVoice.voiceId || generationOptions.voiceId || ""
              : "");
          // Chatterbox: speak clean text only (no ElevenLabs acting tags).
          audio = await generateChatterboxSpeech({
            text: speech.spokenText,
            voiceMode: chatterboxMode,
            predefinedVoiceId:
              chatterboxMode === "predefined" ? predefinedVoiceId : undefined,
            referenceFileName:
              chatterboxMode === "clone" ? referenceFileName : undefined,
            speed:
              podcastSectionSpeed != null
                ? podcastSectionSpeed
                : resolvedVoice.speed != null
                  ? resolvedVoice.speed
                  : generationOptions.speed,
            signal: abortController.signal,
          });
        } else if (voiceProvider === GOOGLE_TTS_PROVIDER) {
          const googleVoiceId =
            resolvedVoice.voiceId || generationOptions.voiceId || "";
          const googleConfig = namedVoice?.googleConfig;
          audio = await generateGoogleTtsSpeech({
            text: speech.spokenText,
            voiceId: googleVoiceId,
            languageCode:
              googleConfig?.languageCode ||
              namedVoice?.googleLanguageCode ||
              languageCodeFromVoiceName(googleVoiceId),
            // Max/Sara section rates beat flat catalog speakingRate so intro
            // can be livelier than Word Tour / closing without one flat style.
            speed:
              podcastSectionSpeed != null
                ? podcastSectionSpeed
                : googleConfig?.speakingRate != null
                  ? googleConfig.speakingRate
                  : resolvedVoice.speed != null
                    ? resolvedVoice.speed
                    : generationOptions.speed,
            audioEncoding: googleConfig?.audioEncoding,
            signal: abortController.signal,
          });
        } else {
          audio = await generateElevenLabsSpeech({
            text: spokenText,
            ...sceneGenerationOptions,
            signal: abortController.signal,
          });
        }
      } finally {
        clearInterval(cancelPoll);
      }

      await throwIfCanceled();

      const fileName = sceneVoiceoverFileName({
        sceneId: scene.id,
      });
      const filePath = path.join(directory, fileName);

      await writeFile(filePath, audio);

      const durationSec = await getAudioDurationSec(filePath);
      const voiceoverLocalPath = sceneVoiceoverRelativePath(videoId, fileName);

      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          voiceoverStatus: "generated",
          voiceoverLocalPath,
          voiceoverFileName: fileName,
          voiceoverDuration: durationSec,
          voiceoverError: null,
          voiceoverProvider: voiceProvider,
          voiceoverSettingsJson: {
            voiceId: sceneGenerationOptions.voiceId,
            voiceName: resolvedVoice.voiceName ?? namedVoice?.name,
            provider: voiceProvider,
            chatterboxMode:
              voiceProvider === CHATTERBOX_PROVIDER
                ? resolveChatterboxVoiceMode(namedVoice)
                : undefined,
            predefinedVoiceId:
              voiceProvider === CHATTERBOX_PROVIDER &&
              resolveChatterboxVoiceMode(namedVoice) === "predefined"
                ? namedVoice?.predefinedVoiceId ?? resolvedVoice.voiceId
                : undefined,
            referenceFileName:
              voiceProvider === CHATTERBOX_PROVIDER &&
              resolveChatterboxVoiceMode(namedVoice) === "clone"
                ? namedVoice?.referenceFileName ?? resolvedVoice.voiceId
                : undefined,
            googleLanguageCode:
              voiceProvider === GOOGLE_TTS_PROVIDER
                ? namedVoice?.googleConfig?.languageCode ||
                  namedVoice?.googleLanguageCode ||
                  languageCodeFromVoiceName(
                    resolvedVoice.voiceId || generationOptions.voiceId || "",
                  )
                : undefined,
            googleConfig:
              voiceProvider === GOOGLE_TTS_PROVIDER
                ? namedVoice?.googleConfig
                : undefined,
            modelId: voiceProvider === "elevenlabs" ? modelId : undefined,
            outputFormat: generationOptions.outputFormat,
            stability: generationOptions.stability,
            similarityBoost: generationOptions.similarityBoost,
            speed:
              actingCues.length > 0 && voiceProvider === "elevenlabs"
                ? null
                : (podcastSectionSpeed ??
                  resolvedVoice.speed ??
                  generationOptions.speed),
            sectionKind: sectionAssignment?.sectionKind ?? "other",
            sectionLabel: sectionAssignment?.sectionLabel ?? null,
            podcastDeliveryMode: applyMaxSaraVoiceProfiles
              ? deliveryMode
              : undefined,
            podcastHost: podcastHost ?? undefined,
            actingCues:
              voiceProvider === "elevenlabs"
                ? actingCues.map((cue: { audioTag: string }) => cue.audioTag)
                : [],
          } as Prisma.InputJsonValue,
          pauseAfterMs: effectivePauseAfterMs,
        },
      });
      generated += 1;
      cumulativeTimeSec +=
        (durationSec ?? 0) + effectivePauseAfterMs / 1000;
      const voiceLabel =
        resolvedVoice.voiceName?.trim() ||
        namedVoice?.name?.trim() ||
        sceneGenerationOptions.voiceId ||
        "default voice";
      const cueLabel =
        voiceProvider === "elevenlabs" && actingCues.length > 0
          ? ` + ${actingCues.map((cue: { audioTag: string }) => cue.audioTag).join(" ")} via ${modelId}`
          : "";
      const deliveryLabel =
        applyMaxSaraVoiceProfiles && podcastHost
          ? ` · ${podcastHost}/${deliveryMode}@${(
              podcastSectionSpeed ??
              resolvedVoice.speed ??
              generationOptions.speed ??
              1
            ).toFixed(2)}`
          : "";
      await updateProcess(options.processId, {
        logMessage: `Generated scene ${scene.sortOrder} with ${voiceProvider} · ${voiceLabel} [${sectionAssignment?.sectionKind ?? "other"}]${deliveryLabel}${cueLabel} (${(durationSec ?? 0).toFixed(1)}s).`,
        logLevel: "success",
      });
    } catch (error) {
      if (error instanceof SceneVoiceoverCanceledError) {
        throw error;
      }
      if (await isCanceledNow()) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: {
            voiceoverStatus: "needs_retry",
            voiceoverError: "Canceled before audio finished.",
          },
        });
        await throwIfCanceled();
      }
      failed += 1;
      const message = errorMessage(error, "Could not generate scene voiceover.");
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          voiceoverStatus: "failed",
          voiceoverError: message,
        },
      });
      await updateProcess(options.processId, {
        logMessage: `Scene ${scene.sortOrder} failed: ${message}`,
        logLevel: "error",
      });
    }
  }

  await prisma.video.update({
    where: { id: videoId },
    data: {
      voiceoverAudioPath: null,
      voiceoverFileName: null,
      voiceoverStatus: failed > 0 ? "partial" : "generated",
      renderDraftStatus: "pending",
    },
  });
  await syncSceneVoiceoversToSubtitleSegments(videoId, {
    preserveSubtitles: true,
  });
  await maybeRecombineSubtitlesAfterVoiceoverSync(videoId);

  clearSceneVoiceoverCancel(videoId);
  return { generated, skipped, failed };
}

async function handleSceneVoiceoverCancel(
  processId: string,
  videoId: string,
  error: SceneVoiceoverCanceledError,
): Promise<never> {
  // Process may already be cancelled by the cancel-batch API — keep that status.
  const run = await prisma.processRun.findUnique({
    where: { id: processId },
    select: { status: true },
  });
  if (run?.status !== "cancelled") {
    await cancelProcess(processId);
  }
  await updateProcess(processId, {
    logMessage: error.message,
    logLevel: "warning",
  });
  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "error", error.message);
}

export async function generateSceneVoiceovers(videoId: string, formData: FormData) {
  const sceneCount = await prisma.scene.count({ where: { videoId } });
  const processId = await startProcess({
    type: "scene_voiceover_generation",
    videoId,
    title: "Generating scene voiceovers",
    description: `${sceneCount} scenes queued for ElevenLabs.`,
    totalSteps: Math.max(sceneCount, 1),
    currentStep: "Preparing scene narration",
  });

  let result: Awaited<ReturnType<typeof generateVoiceoverForScenes>>;
  let autoStitch: Awaited<ReturnType<typeof maybeAutoStitchAfterSceneVoiceovers>> =
    null;
  const stitchOptions = autoStitchOptionsFromForm(formData);
  try {
    result = await generateVoiceoverForScenes(videoId, formData, {
      overwrite: formData.get("overwriteSceneVoiceovers") === "on",
      processId,
    });
    await finishProcess(processId, {
      result,
      logMessage: `Scene voiceovers complete: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed.`,
    });
    autoStitch = await safeMaybeAutoStitchAfterSceneVoiceovers(
      videoId,
      result,
      processId,
      stitchOptions,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof SceneVoiceoverCanceledError) {
      await handleSceneVoiceoverCancel(processId, videoId, error);
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Scene voiceover generation failed."),
    });
    redirectToVoiceover(
      videoId,
      "error",
      errorMessage(error, "Scene voiceover generation failed."),
    );
  }

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    result.failed > 0 ? "error" : "success",
    `Scene voiceovers: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed.${autoStitchStatusSuffix(
      autoStitch,
      stitchOptions,
      result.failed,
    )}`,
  );
}

export async function generateSelectedSceneVoiceovers(
  videoId: string,
  formData: FormData,
) {
  const selectedOrders = selectedSceneVoiceoverOrders(formData);

  if (selectedOrders.length === 0) {
    redirectToVoiceover(videoId, "error", "Select scenes to generate.");
  }

  const processId = await startProcess({
    type: "scene_voiceover_generation",
    videoId,
    title: "Generating selected scene voiceovers",
    description: `${selectedOrders.length} selected scenes queued for ElevenLabs.`,
    totalSteps: selectedOrders.length,
    currentStep: "Preparing selected scenes",
  });

  let result: Awaited<ReturnType<typeof generateVoiceoverForScenes>>;
  let autoStitch: Awaited<ReturnType<typeof maybeAutoStitchAfterSceneVoiceovers>> =
    null;
  const stitchOptions = autoStitchOptionsFromForm(formData);
  try {
    result = await generateVoiceoverForScenes(videoId, formData, {
      selectedOrders,
      overwrite: true,
      processId,
    });
    await finishProcess(processId, { result });
    autoStitch = await safeMaybeAutoStitchAfterSceneVoiceovers(
      videoId,
      result,
      processId,
      stitchOptions,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof SceneVoiceoverCanceledError) {
      await handleSceneVoiceoverCancel(processId, videoId, error);
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Selected scene voiceover generation failed."),
    });
    redirectToVoiceover(
      videoId,
      "error",
      errorMessage(error, "Selected scene voiceover generation failed."),
    );
  }

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    result.failed > 0 ? "error" : "success",
    `Selected scene voiceovers: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed.${autoStitchStatusSuffix(
      autoStitch,
      stitchOptions,
      result.failed,
    )}`,
  );
}

export async function updateSelectedScenePauses(
  videoId: string,
  formData: FormData,
) {
  const selectedOrders = selectedSceneVoiceoverOrders(formData);

  if (selectedOrders.length === 0) {
    redirectToVoiceover(videoId, "error", "Select one or more scenes to update pause.");
  }

  const rawPause = formData.get("scenePauseAfterMs")?.toString().trim() ?? "";
  const pauseAfterMs = Number(rawPause);

  if (!Number.isFinite(pauseAfterMs) || pauseAfterMs < 0) {
    redirectToVoiceover(
      videoId,
      "error",
      "Pause must be a number of milliseconds (0 or greater).",
    );
  }

  const roundedPauseMs = Math.round(pauseAfterMs);
  const scenes = await prisma.scene.findMany({
    where: {
      videoId,
      sortOrder: { in: selectedOrders },
    },
    select: {
      id: true,
      sortOrder: true,
      voiceoverDuration: true,
      duration: true,
    },
  });

  if (scenes.length === 0) {
    redirectToVoiceover(videoId, "error", "No matching selected scenes found.");
  }

  const updateDurations = formData.get("updateSceneDurationsFromAudio") === "on";

  await prisma.$transaction(
    scenes.map((scene) => {
      const nextDuration =
        updateDurations && scene.voiceoverDuration !== null
          ? Math.max(
              1,
              Math.ceil(scene.voiceoverDuration + roundedPauseMs / 1000),
            )
          : undefined;

      return prisma.scene.update({
        where: { id: scene.id },
        data: {
          pauseAfterMs: roundedPauseMs,
          ...(nextDuration === undefined ? {} : { duration: nextDuration }),
        },
      });
    }),
  );

  // Pause changes only affect timeline offsets — keep local caption cues and
  // recombine the global track in place (no subtitle wipe).
  await refreshVoiceoverSegmentDurationsFromScenes(videoId);
  const subtitleRefresh = await maybeRecombineSubtitlesAfterVoiceoverSync(
    videoId,
  );

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Updated pause to ${roundedPauseMs}ms on ${scenes.length} scene(s). Re-stitch the master voiceover to apply pacing.${
      subtitleRefresh.recombined
        ? " Existing subtitles were kept and recombined with the new offsets."
        : ""
    }`,
  );
}

function musicBedPresetSelectionsFromForm(formData: FormData) {
  const byOrder = new Map<number, string>();

  for (const [key, value] of formData.entries()) {
    const match = /^musicBedPresetByOrder\[(\d+)\]$/.exec(key);
    if (!match) {
      continue;
    }
    const order = Number(match[1]);
    const presetId = String(value ?? "").trim();
    if (Number.isFinite(order) && presetId) {
      byOrder.set(order, presetId);
    }
  }

  return byOrder;
}

async function attachMusicBedsForOrders({
  videoId,
  orders,
  presetByOrder,
  useSuggestedWhenMissing,
}: {
  videoId: string;
  orders: number[];
  presetByOrder: Map<number, string>;
  useSuggestedWhenMissing: boolean;
}) {
  const scenes = await prisma.scene.findMany({
    where: { videoId, sortOrder: { in: orders } },
    orderBy: { sortOrder: "asc" },
  });

  if (scenes.length === 0) {
    throw new Error("No matching MUSIC_BED scenes found.");
  }

  let attached = 0;
  const failures: string[] = [];

  for (const scene of scenes) {
    if (!isMusicBedScene(scene)) {
      failures.push(`Scene ${scene.sortOrder}: not a MUSIC_BED scene.`);
      continue;
    }

    const presetId =
      presetByOrder.get(scene.sortOrder) ||
      (useSuggestedWhenMissing
        ? suggestMusicBedPresetId({
            visualIdea: scene.visualIdea,
            visualPurpose: scene.visualPurpose,
          })
        : "");
    const preset = getMusicBedPreset(presetId);
    if (!preset) {
      failures.push(`Scene ${scene.sortOrder}: unknown music bed preset.`);
      continue;
    }

    try {
      const result = await attachMusicBedFileToScenePaths({
        videoId,
        sceneId: scene.id,
        preset,
        visualIdea: scene.visualIdea,
        visualPurpose: scene.visualPurpose,
        sceneDurationSec: scene.duration,
      });

      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          voiceoverStatus: "attached",
          voiceoverLocalPath: result.relativePath,
          voiceoverFileName: result.fileName,
          voiceoverDuration: result.durationSec,
          voiceoverError: null,
          voiceoverProvider: MUSIC_BED_PROVIDER,
          voiceoverSettingsJson: result.settings as Prisma.InputJsonValue,
          // Beds crossfade into the next spoken scene; no trailing silence.
          pauseAfterMs: 0,
          ...(result.durationSec != null
            ? {
                duration: Math.max(1, Math.ceil(result.durationSec)),
              }
            : {}),
        },
      });
      attached += 1;
    } catch (error) {
      const message =
        error instanceof MusicBedAttachError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not attach music bed.";
      failures.push(`Scene ${scene.sortOrder}: ${message}`);
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          voiceoverStatus: "failed",
          voiceoverError: message,
        },
      });
    }
  }

  return { attached, failures };
}

export async function attachMusicBedsToScenes(
  videoId: string,
  sceneOrder: number,
  formData: FormData,
) {
  const order = Number(sceneOrder);
  const orders = Number.isFinite(order) && order >= 1 ? [Math.floor(order)] : [];

  if (orders.length === 0) {
    redirectToVoiceover(videoId, "error", "No MUSIC_BED scene selected to attach.");
  }

  try {
    const result = await attachMusicBedsForOrders({
      videoId,
      orders,
      presetByOrder: musicBedPresetSelectionsFromForm(formData),
      useSuggestedWhenMissing: true,
    });

    revalidatePath(`/videos/${videoId}`);
    if (result.attached === 0) {
      redirectToVoiceover(
        videoId,
        "error",
        result.failures[0] ?? "Could not attach music beds.",
      );
    }

    const failureNote =
      result.failures.length > 0
        ? ` ${result.failures.length} failed: ${result.failures[0]}`
        : "";
    redirectToVoiceover(
      videoId,
      result.failures.length > 0 ? "error" : "success",
      `Attached Freesound beds on ${result.attached} scene(s).${failureNote} Re-stitch the master when ready.`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectToVoiceover(
      videoId,
      "error",
      error instanceof Error ? error.message : "Could not attach music beds.",
    );
  }
}

export async function importMusicBedAudioToScene(
  videoId: string,
  sceneOrder: number,
  formData: FormData,
) {
  const order = Number(sceneOrder);
  if (!Number.isFinite(order) || order < 1) {
    redirectToVoiceover(videoId, "error", "No MUSIC_BED scene selected to import.");
  }

  const scene = await prisma.scene.findFirst({
    where: { videoId, sortOrder: Math.floor(order) },
  });

  if (!scene || !isMusicBedScene(scene)) {
    redirectToVoiceover(
      videoId,
      "error",
      `Scene ${Math.floor(order)} is not a MUSIC_BED scene.`,
    );
  }

  const file = formData.get("musicBedAudio");
  if (!(file instanceof File)) {
    redirectToVoiceover(
      videoId,
      "error",
      "Choose an audio file (mp3, wav, m4a, ogg, or flac) to import.",
    );
  }

  try {
    const suggestedPreset = getMusicBedPreset(
      suggestMusicBedPresetId({
        visualIdea: scene.visualIdea,
        visualPurpose: scene.visualPurpose,
      }),
    );
    // Visual-planner bed intros are short (a few seconds). If duration was
    // inflated by a previous full-file import, fall back to the preset default.
    const plannerDuration =
      typeof scene.duration === "number" &&
      Number.isFinite(scene.duration) &&
      scene.duration > 0 &&
      scene.duration <= 12
        ? scene.duration
        : (suggestedPreset?.defaultDurationSec ?? MUSIC_BED_MIN_INTRO_SEC);

    const result = await attachImportedMusicBedFileToScenePaths({
      videoId,
      sceneId: scene.id,
      file,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
      sceneDurationSec: plannerDuration,
    });

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverStatus: "attached",
        voiceoverLocalPath: result.relativePath,
        voiceoverFileName: result.fileName,
        voiceoverDuration: result.durationSec,
        voiceoverError: null,
        voiceoverProvider: MUSIC_BED_PROVIDER,
        voiceoverSettingsJson: result.settings as Prisma.InputJsonValue,
        pauseAfterMs: 0,
        // Restore/keep the planner intro duration (not the full source length).
        duration: Math.max(1, Math.ceil(plannerDuration)),
      },
    });

    revalidatePath(`/videos/${videoId}`);
    redirectToVoiceover(
      videoId,
      "success",
      `Imported music bed on scene ${scene.sortOrder} (trimmed to ${result.durationSec?.toFixed(1) ?? "?"}s; stitch adds the underlay fade under the next scene). Re-stitch when ready.`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof MusicBedAttachError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not import music bed audio.";
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        voiceoverStatus: "failed",
        voiceoverError: message,
      },
    });
    redirectToVoiceover(videoId, "error", `Scene ${scene.sortOrder}: ${message}`);
  }
}

export async function attachSceneClipVideo(
  videoId: string,
  sceneOrder: number,
  formData: FormData,
) {
  const order = Number(sceneOrder);
  if (!Number.isFinite(order) || order < 1) {
    redirectToVoiceover(videoId, "error", "No scene selected for clip upload.");
  }

  const scene = await prisma.scene.findFirst({
    where: { videoId, sortOrder: Math.floor(order) },
  });
  if (!scene) {
    redirectToVoiceover(videoId, "error", `Scene ${Math.floor(order)} not found.`);
  }

  const file = formData.get("sceneClipVideo");
  if (!(file instanceof File) || file.size <= 0) {
    redirectToVoiceover(
      videoId,
      "error",
      "Choose a video file (mp4, mov, webm, mkv, or m4v).",
    );
  }
  if (!isSupportedSceneClipExtension(file.name)) {
    redirectToVoiceover(
      videoId,
      "error",
      "Unsupported video type. Use mp4, mov, webm, mkv, or m4v.",
    );
  }

  const mutedValues = formData.getAll("clipMuted").map(String);
  const clipMuted = mutedValues.includes("1");

  try {
    const tempDir = path.join(process.cwd(), "storage", "tmp");
    await mkdir(tempDir, { recursive: true });
    const tempPath = path.join(
      tempDir,
      `upload-clip-${scene.id}-${Date.now()}${path.extname(file.name) || ".mp4"}`,
    );
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    const stored = await storeUploadedSceneClip({
      videoId,
      sceneId: scene.id,
      sourcePath: tempPath,
      originalFileName: file.name,
    });
    try {
      await unlink(tempPath);
    } catch {
      // ignore temp cleanup
    }

    await removePreviousSceneClip(scene.clipLocalPath, stored.relativePath);
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        clipLocalPath: stored.relativePath,
        clipFileName: stored.fileName,
        clipMuted,
      },
    });

    revalidatePath(`/videos/${videoId}`);
    redirectToVoiceover(
      videoId,
      "success",
      `Attached video clip on scene ${scene.sortOrder}${
        clipMuted ? " (muted — music bed audio)" : " (clip audio only — no music bed)"
      }. Render fits it to the scene duration.`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectToVoiceover(
      videoId,
      "error",
      error instanceof Error ? error.message : "Could not attach scene clip.",
    );
  }
}

export async function clearSceneClipVideo(
  videoId: string,
  sceneOrder: number,
  _formData: FormData,
) {
  const order = Number(sceneOrder);
  const scene = await prisma.scene.findFirst({
    where: { videoId, sortOrder: Math.floor(order) },
  });
  if (!scene) {
    redirectToVoiceover(videoId, "error", "Scene not found.");
  }

  await removePreviousSceneClip(scene.clipLocalPath);
  await prisma.scene.update({
    where: { id: scene.id },
    data: {
      clipLocalPath: null,
      clipFileName: null,
    },
  });
  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Cleared video clip on scene ${scene.sortOrder}. Still image will be used again.`,
  );
}

export async function updateSceneClipMuted(
  videoId: string,
  sceneOrder: number,
  formData: FormData,
) {
  const order = Number(sceneOrder);
  const scene = await prisma.scene.findFirst({
    where: { videoId, sortOrder: Math.floor(order) },
  });
  if (!scene) {
    redirectToVoiceover(videoId, "error", "Scene not found.");
  }
  if (!scene.clipLocalPath?.trim()) {
    redirectToVoiceover(
      videoId,
      "error",
      `Scene ${scene.sortOrder} has no video clip attached.`,
    );
  }

  const mutedValues = formData.getAll("clipMuted").map(String);
  const clipMuted = mutedValues.includes("1");
  await prisma.scene.update({
    where: { id: scene.id },
    data: { clipMuted },
  });
  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Scene ${scene.sortOrder} clip ${
      clipMuted
        ? "muted (music bed only)"
        : "unmuted (clip audio only — re-stitch or re-render draft)"
    }.`,
  );
}

export async function attachSuggestedMusicBeds(
  videoId: string,
  _formData: FormData,
) {
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    select: {
      sortOrder: true,
      visualIdea: true,
      scriptText: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  const orders = scenes
    .filter((scene) => isMusicBedScene(scene))
    .map((scene) => scene.sortOrder);

  if (orders.length === 0) {
    redirectToVoiceover(videoId, "error", "No MUSIC_BED scenes found on this video.");
  }

  try {
    const result = await attachMusicBedsForOrders({
      videoId,
      orders,
      presetByOrder: new Map(),
      useSuggestedWhenMissing: true,
    });

    revalidatePath(`/videos/${videoId}`);
    if (result.attached === 0) {
      redirectToVoiceover(
        videoId,
        "error",
        result.failures[0] ??
          "Could not attach suggested beds. Set FREESOUND_API_KEY or add local MP3 overrides under data/music-beds/freesound/.",
      );
    }

    const failureNote =
      result.failures.length > 0
        ? ` ${result.failures.length} failed: ${result.failures[0]}`
        : "";
    redirectToVoiceover(
      videoId,
      result.failures.length > 0 ? "error" : "success",
      `Attached suggested Freesound beds on ${result.attached} MUSIC_BED scene(s).${failureNote}`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectToVoiceover(
      videoId,
      "error",
      error instanceof Error ? error.message : "Could not attach suggested music beds.",
    );
  }
}

export async function generateMissingSceneVoiceovers(
  videoId: string,
  formData: FormData,
) {
  const candidateScenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
    },
    select: {
      sortOrder: true,
      voiceoverLocalPath: true,
      voiceoverStatus: true,
      voiceoverProvider: true,
      visualIdea: true,
      clipLocalPath: true,
      clipMuted: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const missingOrders: number[] = [];
  for (const scene of candidateScenes) {
    if (sceneUsesExclusiveClipAudio(scene)) {
      continue;
    }
    const status = scene.voiceoverStatus ?? "";
    if (status === "failed" || status === "needs_retry") {
      missingOrders.push(scene.sortOrder);
      continue;
    }
    const check = await sceneVoiceoverFileExists(scene.voiceoverLocalPath);
    if (!check.ok) {
      missingOrders.push(scene.sortOrder);
    }
  }

  if (missingOrders.length === 0) {
    redirectToVoiceover(videoId, "success", "No missing scene voiceovers found.");
  }

  const processId = await startProcess({
    type: "scene_voiceover_generation",
    videoId,
    title: "Generating missing scene voiceovers",
    description: `${missingOrders.length} missing scenes queued (including stale/missing files).`,
    totalSteps: missingOrders.length,
    currentStep: "Preparing missing scenes",
  });

  let result: Awaited<ReturnType<typeof generateVoiceoverForScenes>>;
  let autoStitch: Awaited<ReturnType<typeof maybeAutoStitchAfterSceneVoiceovers>> =
    null;
  const stitchOptions = autoStitchOptionsFromForm(formData);
  try {
    result = await generateVoiceoverForScenes(videoId, formData, {
      missingOnly: true,
      overwrite: false,
      processId,
    });
    await finishProcess(processId, { result });
    autoStitch = await safeMaybeAutoStitchAfterSceneVoiceovers(
      videoId,
      result,
      processId,
      stitchOptions,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof SceneVoiceoverCanceledError) {
      await handleSceneVoiceoverCancel(processId, videoId, error);
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Missing scene voiceover generation failed."),
    });
    redirectToVoiceover(
      videoId,
      "error",
      errorMessage(error, "Missing scene voiceover generation failed."),
    );
  }

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    result.failed > 0 ? "error" : "success",
    `Missing scene voiceovers: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed.${autoStitchStatusSuffix(
      autoStitch,
      stitchOptions,
      result.failed,
    )}`,
  );
}

export async function retryFailedSceneVoiceovers(
  videoId: string,
  formData: FormData,
) {
  const failedCount = await prisma.scene.count({
    where: { videoId, voiceoverStatus: { in: ["failed", "needs_retry"] } },
  });
  const processId = await startProcess({
    type: "scene_voiceover_generation",
    videoId,
    title: "Retrying failed scene voiceovers",
    description: `${failedCount} failed scenes queued.`,
    totalSteps: Math.max(failedCount, 1),
    currentStep: "Preparing failed scenes",
  });

  let result: Awaited<ReturnType<typeof generateVoiceoverForScenes>>;
  let autoStitch: Awaited<ReturnType<typeof maybeAutoStitchAfterSceneVoiceovers>> =
    null;
  const stitchOptions = autoStitchOptionsFromForm(formData);
  try {
    result = await generateVoiceoverForScenes(videoId, formData, {
      retryFailedOnly: true,
      overwrite: true,
      processId,
    });
    await finishProcess(processId, { result });
    autoStitch = await safeMaybeAutoStitchAfterSceneVoiceovers(
      videoId,
      result,
      processId,
      stitchOptions,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (error instanceof SceneVoiceoverCanceledError) {
      await handleSceneVoiceoverCancel(processId, videoId, error);
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Retry failed scene voiceovers failed."),
    });
    redirectToVoiceover(
      videoId,
      "error",
      errorMessage(error, "Retry failed scene voiceovers failed."),
    );
  }

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    result.failed > 0 ? "error" : "success",
    `Retried scene voiceovers: ${result.generated} generated, ${result.skipped} skipped, ${result.failed} failed.${autoStitchStatusSuffix(
      autoStitch,
      stitchOptions,
      result.failed,
    )}`,
  );
}

/**
 * Repair exclusive SECTION_CLIP / unmuted clip scenes missing voiceoverLocalPath,
 * then rebuild subtitle segment offsets so captions do not burn over bumpers.
 */
export async function repairExclusiveClipSubtitleTimeline(videoId: string) {
  const repaired = await ensureExclusiveClipVoiceoverPathsForVideo(videoId);
  const sync = await syncSceneVoiceoversToSubtitleSegments(videoId, {
    preserveSubtitles: true,
  });
  await refreshVoiceoverSegmentDurationsFromScenes(videoId);
  const subtitleRefresh = await maybeRecombineSubtitlesAfterVoiceoverSync(
    videoId,
  );
  try {
    revalidatePath(`/videos/${videoId}`);
  } catch {
    // Allowed when called outside a Next request (scripts / one-off repair).
  }
  return {
    repairedExclusiveAudio: repaired,
    sceneCount: sync.sceneCount,
    restoredSubtitles: sync.restoredSubtitles,
    recombined: subtitleRefresh.recombined,
  };
}


async function areAllPipelineSceneVoiceoversReady(videoId: string) {
  const scenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
    },
    select: {
      voiceoverStatus: true,
      voiceoverLocalPath: true,
      voiceoverProvider: true,
      visualIdea: true,
      clipLocalPath: true,
      clipMuted: true,
    },
  });

  if (scenes.length === 0) {
    return false;
  }

  for (const scene of scenes) {
    if (sceneUsesExclusiveClipAudio(scene)) {
      if (!(scene.clipLocalPath?.trim() || scene.voiceoverLocalPath?.trim())) {
        return false;
      }
      continue;
    }
    const status = scene.voiceoverStatus ?? "";
    if (status !== "generated" && status !== "attached") {
      return false;
    }
    const check = await sceneVoiceoverFileExists(scene.voiceoverLocalPath);
    if (!check.ok) {
      return false;
    }
  }

  return true;
}

async function runStitchSceneVoiceovers(
  videoId: string,
  options: {
    updateSceneDurationsFromAudio?: boolean;
    processTitle?: string;
  } = {},
) {
  const processId = await startProcess({
    type: "voiceover_stitching",
    videoId,
    title: options.processTitle ?? "Stitching scene voiceover",
    totalSteps: 5,
    currentStep: "Checking FFmpeg",
  });

  try {
    await ensureFfmpegAvailable();
    await updateProcess(processId, {
      currentStep: "Loading generated scene clips",
      stepIndex: 2,
      totalSteps: 5,
    });

    await ensureExclusiveClipVoiceoverPathsForVideo(videoId);

    const scenes = await prisma.scene.findMany({
      where: {
        videoId,
        ...sceneIncludedInPipelineWhere(),
        voiceoverLocalPath: { not: null },
        OR: [
          { voiceoverStatus: { in: ["generated", "attached"] } },
          {
            voiceoverProvider: MUSIC_BED_PROVIDER,
            voiceoverError: { contains: "NEXT_REDIRECT" },
          },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });

    const healIds = scenes
      .filter(
        (scene) =>
          scene.voiceoverStatus === "failed" &&
          scene.voiceoverProvider === MUSIC_BED_PROVIDER &&
          scene.voiceoverLocalPath,
      )
      .map((scene) => scene.id);
    if (healIds.length > 0) {
      await prisma.scene.updateMany({
        where: { id: { in: healIds } },
        data: { voiceoverStatus: "attached", voiceoverError: null },
      });
    }

    if (scenes.length === 0) {
      throw new Error("No generated scene voiceovers found.");
    }

    const invalidScenes: Array<{ id: string; sortOrder: number; reason: string }> =
      [];
    for (const scene of scenes) {
      if (sceneUsesExclusiveClipAudio(scene)) {
        continue;
      }
      const check = await sceneVoiceoverAudioHasUsableStream(
        scene.voiceoverLocalPath,
      );
      if (!check.ok) {
        invalidScenes.push({
          id: scene.id,
          sortOrder: scene.sortOrder,
          reason: check.reason ?? "invalid_audio",
        });
      }
    }

    if (invalidScenes.length > 0) {
      await prisma.scene.updateMany({
        where: { id: { in: invalidScenes.map((scene) => scene.id) } },
        data: {
          voiceoverStatus: "needs_retry",
          voiceoverError:
            "Missing or invalid voiceover audio file on disk (regenerate).",
        },
      });
      const sample = invalidScenes
        .slice(0, 12)
        .map((scene) => scene.sortOrder)
        .join(", ");
      const more =
        invalidScenes.length > 12
          ? ` (+${invalidScenes.length - 12} more)`
          : "";
      throw new Error(
        `Cannot stitch: ${invalidScenes.length} scene(s) missing usable voiceover audio (scenes ${sample}${more}). Use “Generate missing scene voiceovers” — other scenes are unchanged.`,
      );
    }

    await updateProcess(processId, {
      currentStep: "Combining audio clips",
      stepIndex: 3,
      totalSteps: 5,
      logMessage: `Stitching ${scenes.length} scene clips.`,
    });
    const outputRelativePath = sceneVoiceoverMasterRelativePath(videoId);
    await ensureSceneVoiceoversDir(videoId);
    const stitchClips = [];
    for (const scene of scenes) {
      const isMusicBed =
        scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
        isMusicBedScene(scene);
      const useExclusiveClip = sceneUsesExclusiveClipAudio(scene);

      if (useExclusiveClip) {
        const targetDurationSec =
          scene.voiceoverDuration && scene.voiceoverDuration > 0
            ? scene.voiceoverDuration
            : Math.max(0.5, scene.duration ?? 5);
        const clipAudioPath =
          scene.voiceoverLocalPath?.trim() ||
          (await prepareExclusiveClipAudioForScene({
            videoId,
            sceneId: scene.id,
            clipLocalPath: scene.clipLocalPath,
            clipFileName: scene.clipFileName,
            targetDurationSec,
          }));
        if (!scene.voiceoverLocalPath?.trim()) {
          await prisma.scene.update({
            where: { id: scene.id },
            data: {
              voiceoverLocalPath: clipAudioPath,
              voiceoverFileName: path.basename(clipAudioPath),
              voiceoverStatus: "attached",
              voiceoverError: null,
            },
          });
        }
        stitchClips.push({
          sortOrder: scene.sortOrder,
          audioPath: clipAudioPath,
          pauseAfterMs: scene.pauseAfterMs,
          isMusicBed: false,
        });
        continue;
      }

      stitchClips.push({
        sortOrder: scene.sortOrder,
        audioPath: scene.voiceoverLocalPath,
        pauseAfterMs: scene.pauseAfterMs,
        isMusicBed,
      });
    }

    const stitched = await stitchSceneVoiceoverAudio(
      videoId,
      stitchClips,
      outputRelativePath,
    );

    const introByBedOrder = new Map(
      stitched.overlaps.map((overlap) => [
        overlap.bedSortOrder,
        overlap.introSec,
      ]),
    );
    const shouldUpdateAllDurations = options.updateSceneDurationsFromAudio === true;
    const durationUpdates = scenes.flatMap((scene) => {
      const useExclusiveClip = sceneUsesExclusiveClipAudio(scene);
      const isMusicBed =
        !useExclusiveClip &&
        (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
          isMusicBedScene(scene));
      const introSec = introByBedOrder.get(scene.sortOrder);
      if (!shouldUpdateAllDurations && introSec == null) {
        return [];
      }

      const pauseAfterMs = effectiveScenePauseAfterMs({
        isMusicBed,
        pauseAfterMs: scene.pauseAfterMs,
      });
      const visualDuration = sceneVisualDurationSec({
        voiceoverDuration: scene.voiceoverDuration,
        pauseAfterMs,
        isMusicBed,
        introSec,
      });

      return [
        prisma.scene.update({
          where: { id: scene.id },
          data: {
            pauseAfterMs,
            duration:
              visualDuration == null
                ? scene.duration
                : Math.max(1, Math.ceil(visualDuration)),
          },
        }),
      ];
    });

    if (durationUpdates.length > 0) {
      await updateProcess(processId, {
        currentStep: "Updating scene durations",
        stepIndex: 4,
        totalSteps: 5,
      });
      await prisma.$transaction(durationUpdates);
    }

    await updateProcess(processId, {
      currentStep: "Saving master voiceover",
      stepIndex: 5,
      totalSteps: 5,
    });
    await syncSceneVoiceoversToSubtitleSegments(videoId, {
      preserveSubtitles: true,
    });
    const subtitleRefresh = await maybeRecombineSubtitlesAfterVoiceoverSync(
      videoId,
    );

    await prisma.video.update({
      where: { id: videoId },
      data: {
        voiceoverAudioPath: outputRelativePath,
        voiceoverFileName: path.basename(outputRelativePath),
        voiceoverDurationSec: stitched.durationSec,
        voiceoverStatus: "ready",
        ...(subtitleRefresh.recombined
          ? {}
          : { subtitleStatus: "needs_update" }),
        renderDraftStatus: "pending",
      },
    });
    await finishProcess(processId, {
      result: { durationSec: stitched.durationSec, scenes: scenes.length },
      logMessage: `Master voiceover ready (${stitched.durationSec.toFixed(1)}s)${
        stitched.musicBedOverlaps > 0
          ? ` with ${stitched.musicBedOverlaps} music-bed underlay fade(s)`
          : ""
      }${
        subtitleRefresh.recombined
          ? "; existing scene subtitles preserved and recombined."
          : ""
      }.`,
    });

    return {
      durationSec: stitched.durationSec,
      sceneCount: scenes.length,
      recombinedSubtitles: subtitleRefresh.recombined,
    };
  } catch (error) {
    await failProcess(processId, {
      errorMessage: errorMessage(error, "Voiceover stitching failed."),
    });
    throw error;
  }
}

async function maybeAutoStitchAfterSceneVoiceovers(
  videoId: string,
  generation: { failed: number },
  options: {
    enabled?: boolean;
    updateSceneDurationsFromAudio?: boolean;
  } = {},
) {
  if (options.enabled === false) {
    return null;
  }
  if (generation.failed > 0) {
    return null;
  }
  if (!(await areAllPipelineSceneVoiceoversReady(videoId))) {
    return null;
  }
  return runStitchSceneVoiceovers(videoId, {
    updateSceneDurationsFromAudio:
      options.updateSceneDurationsFromAudio === true,
    processTitle: "Auto-stitching scene voiceover",
  });
}

/** Never fails the voiceover generation job if stitch cannot complete. */
async function safeMaybeAutoStitchAfterSceneVoiceovers(
  videoId: string,
  generation: { failed: number },
  processId?: string,
  options: {
    enabled?: boolean;
    updateSceneDurationsFromAudio?: boolean;
  } = {},
) {
  try {
    return await maybeAutoStitchAfterSceneVoiceovers(
      videoId,
      generation,
      options,
    );
  } catch (stitchError) {
    if (isRedirectError(stitchError)) {
      throw stitchError;
    }
    if (processId) {
      await updateProcess(processId, {
        logMessage: `Voiceovers generated, but auto-stitch skipped: ${errorMessage(
          stitchError,
          "stitch failed",
        )}`,
        logLevel: "warning",
      });
    }
    return null;
  }
}

function autoStitchOptionsFromForm(formData: FormData) {
  return {
    enabled: formData.get("autoStitchMasterVoiceover") === "on",
    updateSceneDurationsFromAudio:
      formData.get("updateSceneDurationsFromAudio") === "on",
  };
}

function autoStitchStatusSuffix(
  autoStitch: { durationSec: number } | null,
  options: { enabled?: boolean },
  generationFailed: number,
) {
  if (autoStitch) {
    return ` Auto-stitched master (${autoStitch.durationSec.toFixed(1)}s).`;
  }
  if (options.enabled === false) {
    return " Auto-stitch off — run Stitch master voiceover when ready.";
  }
  if (generationFailed === 0) {
    return " Master not auto-stitched yet — run Stitch when all scenes are ready.";
  }
  return "";
}

export async function stitchSceneVoiceovers(videoId: string, formData: FormData) {
  try {
    const result = await runStitchSceneVoiceovers(videoId, {
      updateSceneDurationsFromAudio:
        formData.get("updateSceneDurationsFromAudio") === "on",
    });
    revalidatePath(`/videos/${videoId}`);
    redirectToVoiceover(
      videoId,
      "success",
      `Stitched scene voiceover master (${result.durationSec.toFixed(1)}s).`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    revalidatePath(`/videos/${videoId}`);
    redirectToVoiceover(
      videoId,
      "error",
      errorMessage(error, "Voiceover stitching failed."),
    );
  }
}

function subtitleTextFromCues(cues: FormattedSubtitleCue[]) {
  return cues.map((cue) => cue.text).join("\n\n");
}

async function invalidateSubtitlesForVideo(videoId: string) {
  // Keep local scene cue JSON and segment status so a later stitch/sync can
  // restore them. Only clear the combined video-level track.
  await prisma.video.update({
    where: { id: videoId },
    data: {
      subtitleStatus: "needs_update",
      formattedSubtitleJson: Prisma.JsonNull,
      formattedSubtitleText: null,
      styledSubtitleJson: Prisma.JsonNull,
      styledSubtitleAss: null,
      renderDraftStatus: "pending",
    },
  });
}

function resolveStoredAudioPath(audioPath: string) {
  const normalized = audioPath.replace(/\\/g, "/");
  const storagePrefix = "storage/voiceovers/";

  if (!normalized.startsWith(storagePrefix)) {
    throw new Error("Segment audio path is outside voiceover storage.");
  }

  const resolvedPath = path.resolve(process.cwd(), normalized);
  const voiceoversRoot = path.resolve(process.cwd(), "storage", "voiceovers");

  if (!resolvedPath.startsWith(`${voiceoversRoot}${path.sep}`)) {
    throw new Error("Segment audio path is invalid.");
  }

  return resolvedPath;
}

function parseSubtitleCuesJson(value: unknown): FormattedSubtitleCue[] {
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

function defaultCaptionPresetForVideo(video: {
  channelKey: string;
  captionStylePreset: string;
}) {
  if (video.captionStylePreset && video.captionStylePreset !== "active_word_highlight") {
    return video.captionStylePreset;
  }

  return video.channelKey === "wealth-insights"
    ? "clean_active_word"
    : video.channelKey === "the-gods-word"
      ? "godsword_style"
      : video.captionStylePreset;
}

async function rebuildSubtitleSegmentsFromStoredAlignment(
  videoId: string,
  captionStylePreset: string,
) {
  const stylePreset = getCaptionStylePreset(captionStylePreset);
  const segments = await prisma.subtitleSegment.findMany({
    where: { videoId },
    orderBy: { index: "asc" },
    select: {
      id: true,
      index: true,
      rawAlignmentJson: true,
      voiceoverSegment: {
        select: {
          text: true,
          pacedTextUsed: true,
          durationSec: true,
          sceneStartOrder: true,
        },
      },
    },
  });

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    select: {
      sortOrder: true,
      voiceoverDuration: true,
      pauseAfterMs: true,
    },
  });
  const sceneByOrder = new Map(scenes.map((scene) => [scene.sortOrder, scene]));

  for (const segment of segments) {
    const displayText = segment.voiceoverSegment?.text ?? "";
    const pacedText = segment.voiceoverSegment?.pacedTextUsed ?? "";
    if (
      isSilentSubtitleVoiceoverText(
        spokenTextForSubtitlePreserve(displayText, pacedText),
      )
    ) {
      await prisma.subtitleSegment.update({
        where: { id: segment.id },
        data: {
          provider: "silent_skip",
          rawAlignmentJson: Prisma.JsonNull,
          localCuesJson: [],
          localSrt: "",
          localVtt: "",
          status: "ready",
          error: null,
        },
      });
      continue;
    }

    const spokenWords = normalizeElevenLabsAlignment(segment.rawAlignmentJson);

    if (spokenWords.length === 0) {
      continue;
    }

    const scene = sceneByOrder.get(
      segment.voiceoverSegment?.sceneStartOrder ?? -1,
    );
    const audioDurationSec =
      scene?.voiceoverDuration ??
      Math.max(
        0,
        (segment.voiceoverSegment?.durationSec ?? 0) -
          Math.max(0, (scene?.pauseAfterMs ?? 0) / 1000),
      );

    const speech = prepareVoiceoverSpeechText(displayText);
    const remapped = remapSpeechWordsToDisplay(spokenWords, speech.replacements);
    const words = prepareAlignedWordsForCaptionStyle(
      fitAlignedWordsToAudioDuration(remapped, audioDurationSec),
      stylePreset,
      displayText,
    );

    const localCues = buildActiveWordCaptionCuesFromWords(words, stylePreset);
    await prisma.subtitleSegment.update({
      where: { id: segment.id },
      data: {
        localCuesJson: localCues,
        localSrt: exportCuesToSrt(localCues),
        localVtt: exportCuesToVtt(localCues),
        status: "formatted",
        error: null,
      },
    });
  }
}

async function combineSegmentSubtitlesForVideo(
  videoId: string,
  nextStatus: "formatted" | "ready" = "formatted",
) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      channelKey: true,
      captionStylePreset: true,
      scenes: {
        orderBy: { sortOrder: "asc" },
        select: {
          sortOrder: true,
          voiceoverDuration: true,
          pauseAfterMs: true,
          duration: true,
        },
      },
    },
  });

  if (!video) {
    redirectToVoiceover(videoId, "error", "Video not found.");
  }

  const voiceoverSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    orderBy: [{ index: "asc" }, { sceneStartOrder: "asc" }],
    include: { subtitleSegment: true },
  });

  if (voiceoverSegments.length === 0) {
    redirectToVoiceover(videoId, "error", "No voiceover segments found.");
  }

  const missingSubtitleSegment = voiceoverSegments.find((segment) => {
    const subtitleSegment = segment.subtitleSegment;
    const cues = parseSubtitleCuesJson(subtitleSegment?.localCuesJson);
    const silent = isSilentSubtitleVoiceoverText(
      segment.pacedTextUsed || segment.text,
    );

    return (
      !segment.audioPath ||
      !subtitleSegment ||
      (!silent && cues.length === 0) ||
      !["formatted", "ready"].includes(subtitleSegment.status)
    );
  });

  if (missingSubtitleSegment) {
    redirectToVoiceover(
      videoId,
      "error",
      `Missing formatted subtitles for voiceover segment ${missingSubtitleSegment.index}.`,
    );
  }

  let offset = 0;
  let nextCueIndex = 1;
  const combinedCues: FormattedSubtitleCue[] = [];
  const sceneByOrder = new Map(video.scenes.map((scene) => [scene.sortOrder, scene]));
  const stylePresetId = defaultCaptionPresetForVideo(video);
  const stylePreset = getCaptionStylePreset(stylePresetId);

  for (const segment of voiceoverSegments) {
    const subtitleSegment = segment.subtitleSegment;

    if (!subtitleSegment) {
      continue;
    }

    const localCues = parseSubtitleCuesJson(subtitleSegment.localCuesJson);
    const globalCues = offsetCues(localCues, offset, nextCueIndex);
    const localMaxEnd = localCues.reduce(
      (maxEnd, cue) => Math.max(maxEnd, cue.end),
      0,
    );
    const globalExport = exportCombinedCues(globalCues);

    await prisma.subtitleSegment.update({
      where: { id: subtitleSegment.id },
      data: {
        globalCuesJson: globalCues,
        globalSrt: globalExport.srt,
        globalVtt: globalExport.vtt,
      },
    });

    combinedCues.push(...globalCues);
    nextCueIndex += globalCues.length;
    const scene = sceneByOrder.get(segment.sceneStartOrder);
    // Prefer segment.durationSec — it already subtracts music-bed crossfade overlap.
    offset +=
      segment.durationSec ??
      (scene?.voiceoverDuration !== null && scene?.voiceoverDuration !== undefined
        ? scene.voiceoverDuration + Math.max(0, (scene.pauseAfterMs ?? 0) / 1000)
        : scene?.duration ?? null) ??
      localMaxEnd;
  }

  const combinedExport = {
    cues: combinedCues,
    srt: exportCuesToSrt(combinedCues),
    vtt: exportCuesToVtt(combinedCues),
    ass: exportActiveWordCaptionsToAss(combinedCues, stylePreset),
    activeWordJson: {
      style: stylePreset.id,
      styleOptions: stylePreset,
      cues: combinedCues,
    },
  };

  await prisma.video.update({
    where: { id: videoId },
    data: {
      rawSubtitleFormat: "generated",
      formattedSubtitleJson: combinedExport.cues,
      formattedSubtitleText: combinedExport.srt,
      styledSubtitleJson: combinedExport.activeWordJson as Prisma.InputJsonValue,
      styledSubtitleAss: combinedExport.ass,
      captionStylePreset: stylePreset.id,
      subtitleStatus: nextStatus,
      renderDraftStatus: "pending",
    },
  });

  return combinedCues;
}

async function resolveSubtitleAlignmentProvider(
  videoId: string,
  preferred?: AlignmentProvider | null,
): Promise<AlignmentProvider> {
  if (preferred) {
    return preferred;
  }
  const settings = await resolvePipelineSettings(videoId);
  return settings.voiceover.alignmentProvider;
}

async function generateSubtitlesForVoiceoverSegment(
  segmentId: string,
  options?: { alignmentProvider?: AlignmentProvider | null },
) {
  const segment = await prisma.voiceoverSegment.findUnique({
    where: { id: segmentId },
  });

  if (!segment) {
    throw new Error("Voiceover segment not found.");
  }

  if (!["generated", "ready"].includes(segment.status) || !segment.audioPath) {
    throw new Error("Generate and review segment audio before subtitles.");
  }

  const alignmentText =
    segment.pacedTextUsed?.trim() || segment.text.trim();
  const alignmentProvider = await resolveSubtitleAlignmentProvider(
    segment.videoId,
    options?.alignmentProvider,
  );

  // SECTION_CLIP / music beds / other empty-script scenes: no captions,
  // but keep a ready subtitle job so global offsets stay in sync.
  if (isSilentSubtitleVoiceoverText(alignmentText)) {
    await prisma.subtitleSegment.upsert({
      where: { voiceoverSegmentId: segment.id },
      create: {
        videoId: segment.videoId,
        voiceoverSegmentId: segment.id,
        index: segment.index,
        sceneStartOrder: segment.sceneStartOrder,
        sceneEndOrder: segment.sceneEndOrder,
        provider: "silent_skip",
        rawAlignmentJson: Prisma.JsonNull,
        localCuesJson: [],
        localSrt: "",
        localVtt: "",
        status: "ready",
        error: null,
      },
      update: {
        index: segment.index,
        sceneStartOrder: segment.sceneStartOrder,
        sceneEndOrder: segment.sceneEndOrder,
        provider: "silent_skip",
        rawAlignmentJson: Prisma.JsonNull,
        localCuesJson: [],
        localSrt: "",
        localVtt: "",
        status: "ready",
        error: null,
      },
    });

    return {
      videoId: segment.videoId,
      segmentIndex: segment.index,
      cueCount: 0,
      silent: true as const,
    };
  }

  await prisma.subtitleSegment.upsert({
    where: { voiceoverSegmentId: segment.id },
    create: {
      videoId: segment.videoId,
      voiceoverSegmentId: segment.id,
      index: segment.index,
      sceneStartOrder: segment.sceneStartOrder,
      sceneEndOrder: segment.sceneEndOrder,
      status: "aligning",
      error: null,
    },
    update: {
      index: segment.index,
      sceneStartOrder: segment.sceneStartOrder,
      sceneEndOrder: segment.sceneEndOrder,
      status: "aligning",
      error: null,
    },
  });

  try {
    const video = await prisma.video.findUnique({
      where: { id: segment.videoId },
      select: { channelKey: true, captionStylePreset: true },
    });
    const audioFilePath = resolveStoredAudioPath(segment.audioPath);
    const rawAlignmentJson =
      alignmentProvider === "whisperx"
        ? await alignWhisperXAudioWithText({
            audioFilePath,
            text: alignmentText,
          })
        : await alignElevenLabsAudioWithText({
            audioFilePath,
            text: alignmentText,
          });
    const spokenWords =
      alignmentProvider === "whisperx"
        ? normalizeWhisperXAlignment(rawAlignmentJson)
        : normalizeElevenLabsAlignment(rawAlignmentJson);

    if (spokenWords.length === 0) {
      throw new Error("Forced alignment did not return word timestamps.");
    }

    const speech = prepareVoiceoverSpeechText(segment.text);
    const remapped = remapSpeechWordsToDisplay(spokenWords, speech.replacements);

    const stylePreset = getCaptionStylePreset(
      video
        ? defaultCaptionPresetForVideo(video)
        : "active_word_highlight",
    );
    const words = prepareAlignedWordsForCaptionStyle(
      remapped,
      stylePreset,
      segment.text,
    );
    const localCues = buildActiveWordCaptionCuesFromWords(words, stylePreset);
    const localSrt = exportCuesToSrt(localCues);
    const localVtt = exportCuesToVtt(localCues);
    const providerLabel =
      alignmentProvider === "whisperx"
        ? WHISPERX_SUBTITLE_PROVIDER
        : "elevenlabs_forced_alignment";

    await prisma.subtitleSegment.update({
      where: { voiceoverSegmentId: segment.id },
      data: {
        provider: providerLabel,
        rawAlignmentJson: rawAlignmentJson as Prisma.InputJsonValue,
        localCuesJson: localCues,
        localSrt,
        localVtt,
        status: "formatted",
        error: null,
      },
    });

    return {
      videoId: segment.videoId,
      segmentIndex: segment.index,
      cueCount: localCues.length,
      silent: false as const,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate subtitles for segment.";

    await prisma.subtitleSegment.update({
      where: { voiceoverSegmentId: segment.id },
      data: {
        status: "error",
        error: message,
      },
    });

    throw new Error(message);
  }
}

export async function updateSubtitleStylePreset(videoId: string, formData: FormData) {
  const presetId = requiredText(formData, "captionStylePreset");

  await prisma.video.update({
    where: { id: videoId },
    data: { captionStylePreset: presetId },
  });

  await rebuildSubtitleSegmentsFromStoredAlignment(videoId, presetId);
  await combineSegmentSubtitlesForVideo(videoId, "formatted");
  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", `Subtitle style updated to ${presetId}.`);
}

export async function applyCleanSubtitlePunctuation(videoId: string) {
  await prisma.video.update({
    where: { id: videoId },
    data: { captionStylePreset: "clean_active_word" },
  });

  await rebuildSubtitleSegmentsFromStoredAlignment(videoId, "clean_active_word");
  await combineSegmentSubtitlesForVideo(videoId, "formatted");
  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Applied clean subtitle punctuation.");
}

async function parseRawSubtitlesForVideo(
  videoId: string,
  formData: FormData,
) {
  const rawSubtitleText = requiredText(formData, "rawSubtitleText");
  const rawSubtitleFormat = parseSubtitleFormat(formData.get("rawSubtitleFormat"));
  const cues = parseSubtitleText(rawSubtitleText, rawSubtitleFormat);

  if (cues.length === 0) {
    redirectToVoiceover(
      videoId,
      "error",
      "Could not parse subtitles. Please check that the text is valid SRT or VTT.",
    );
  }

  return {
    rawSubtitleText,
    rawSubtitleFormat,
    cues,
  };
}

export async function saveVoiceoverInfo(videoId: string, formData: FormData) {
  const voiceoverAudioPath = emptyToNull(formData.get("voiceoverAudioPath"));
  const voiceoverFileName =
    emptyToNull(formData.get("voiceoverFileName")) ??
    (voiceoverAudioPath ? path.basename(voiceoverAudioPath) : null);
  const voiceoverDurationSec = parseOptionalDuration(
    formData.get("voiceoverDurationSec"),
  );

  await prisma.video.update({
    where: { id: videoId },
    data: {
      voiceoverAudioPath,
      voiceoverFileName,
      voiceoverDurationSec,
      voiceoverStatus: voiceoverAudioPath || voiceoverFileName ? "imported" : "pending",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Voiceover information saved.");
}

export async function markVoiceoverReady(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      voiceoverAudioPath: true,
      voiceoverFileName: true,
    },
  });

  if (!video?.voiceoverAudioPath && !video?.voiceoverFileName) {
    redirectToVoiceover(
      videoId,
      "error",
      "Add a voiceover path or filename before marking voiceover ready.",
    );
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { voiceoverStatus: "ready" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Voiceover marked ready.");
}

export async function markSceneVoiceoverQaOk(videoId: string, formData: FormData) {
  const sceneId = requiredText(formData, "sceneId");

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      voiceoverStatus: "generated",
      voiceoverError: null,
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Scene voiceover marked OK.");
}

export async function markSceneVoiceoverNeedsReview(
  videoId: string,
  formData: FormData,
) {
  const sceneId = requiredText(formData, "sceneId");

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      voiceoverStatus: "needs_review",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Scene voiceover marked for review.");
}

function sceneDurationFromVoiceover(scene: {
  duration: number | null;
  voiceoverDuration: number | null;
  pauseAfterMs: number | null;
  isMusicBed?: boolean;
  introSec?: number;
}) {
  const visualDuration = sceneVisualDurationSec({
    voiceoverDuration: scene.voiceoverDuration,
    pauseAfterMs: scene.pauseAfterMs,
    isMusicBed: scene.isMusicBed,
    introSec: scene.introSec,
  });

  if (visualDuration == null) {
    return scene.duration;
  }

  return Math.max(1, Math.ceil(visualDuration));
}

export async function updateSceneDurationFromVoiceover(
  videoId: string,
  formData: FormData,
) {
  const sceneId = requiredText(formData, "sceneId");
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: {
      duration: true,
      voiceoverDuration: true,
      pauseAfterMs: true,
    },
  });

  if (!scene?.voiceoverDuration) {
    redirectToVoiceover(videoId, "error", "Scene has no voiceover duration.");
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      duration: sceneDurationFromVoiceover(scene),
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Scene duration updated from audio.");
}

export async function updateAllSceneDurationsFromVoiceover(videoId: string) {
  const scenes = await prisma.scene.findMany({
    where: {
      videoId,
      voiceoverDuration: { not: null },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      duration: true,
      voiceoverDuration: true,
      pauseAfterMs: true,
      voiceoverProvider: true,
      visualIdea: true,
    },
  });

  const introByBedOrder = new Map<number, number>();
  const stitchPlan = planMusicBedStitch(
    scenes.map((scene) => ({
      isMusicBed:
        scene.voiceoverProvider === MUSIC_BED_PROVIDER || isMusicBedScene(scene),
      pauseAfterMs: scene.pauseAfterMs,
      durationSec: scene.voiceoverDuration ?? 0,
    })),
  );
  for (const overlap of musicBedOverlapsFromSteps(stitchPlan)) {
    const bed = scenes[overlap.bedIndex];
    if (bed) {
      introByBedOrder.set(bed.sortOrder, overlap.introSec);
    }
  }

  await prisma.$transaction(
    scenes.map((scene) => {
      const isMusicBed =
        scene.voiceoverProvider === MUSIC_BED_PROVIDER || isMusicBedScene(scene);
      const pauseAfterMs = effectiveScenePauseAfterMs({
        isMusicBed,
        pauseAfterMs: scene.pauseAfterMs,
      });

      return prisma.scene.update({
        where: { id: scene.id },
        data: {
          pauseAfterMs,
          duration: sceneDurationFromVoiceover({
            ...scene,
            pauseAfterMs,
            isMusicBed,
            introSec: introByBedOrder.get(scene.sortOrder),
          }),
        },
      });
    }),
  );

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Updated ${scenes.length} scene duration(s) from audio.`,
  );
}

export async function createVoiceoverSegments(
  videoId: string,
  formData: FormData,
) {
  const existingCount = await prisma.voiceoverSegment.count({
    where: { videoId },
  });

  if (existingCount > 0) {
    redirectToVoiceover(
      videoId,
      "error",
      "Voiceover segments already exist. Clear segments before creating a new set.",
    );
  }

  const scenes = await scenesForVoiceover(videoId);
  const drafts = buildVoiceoverSegmentsFromScenes(
    scenes,
    parseVoiceoverSegmentOptions(formData),
  );

  if (drafts.length === 0) {
    redirectToVoiceover(
      videoId,
      "error",
      "No scene narration text found for voiceover segments.",
    );
  }

  await createVoiceoverSegmentDrafts(videoId, drafts);
  await invalidateSubtitlesForVideo(videoId);

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", `Created ${drafts.length} voiceover segments.`);
}

export async function generateVoiceoverSegment(
  segmentId: string,
  formData: FormData,
) {
  let result: Awaited<ReturnType<typeof generateAndSaveVoiceoverSegment>>;

  try {
    result = await generateAndSaveVoiceoverSegment(segmentId, formData);
  } catch (error) {
    const segment = await prisma.voiceoverSegment.findUnique({
      where: { id: segmentId },
      select: { videoId: true },
    });

    redirectToVoiceover(
      segment?.videoId ?? "",
      "error",
      error instanceof Error
        ? error.message
        : "Could not generate voiceover segment.",
    );
  }

  revalidatePath(`/videos/${result.videoId}`);
  redirectToVoiceover(
    result.videoId,
    "success",
    `Generated ${result.fileName}. ${result.durationSummary} Voiceover changed. Subtitles and render draft need to be regenerated.`,
  );
}

export async function regenerateVoiceoverSegment(
  segmentId: string,
  formData: FormData,
) {
  let result: Awaited<ReturnType<typeof generateAndSaveVoiceoverSegment>>;

  try {
    result = await generateAndSaveVoiceoverSegment(segmentId, formData, {
      allowOverwrite: true,
    });
  } catch (error) {
    const segment = await prisma.voiceoverSegment.findUnique({
      where: { id: segmentId },
      select: { videoId: true },
    });

    redirectToVoiceover(
      segment?.videoId ?? "",
      "error",
      error instanceof Error
        ? error.message
        : "Could not regenerate voiceover segment.",
    );
  }

  revalidatePath(`/videos/${result.videoId}`);
  redirectToVoiceover(
    result.videoId,
    "success",
    `Regenerated ${result.fileName}. ${result.durationSummary} Voiceover changed. Subtitles and render draft need to be regenerated.`,
  );
}

export async function regenerateSelectedVoiceoverSegments(
  videoId: string,
  formData: FormData,
) {
  const selectedIds = selectedVoiceoverSegmentIds(formData);

  if (selectedIds.length === 0) {
    redirectToVoiceover(videoId, "error", "Select at least one voiceover segment.");
  }

  const beforeSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: { durationSec: true },
  });
  const beforeTotal = totalDuration(beforeSegments);
  const summaries: string[] = [];

  for (const segmentId of selectedIds) {
    try {
      const result = await generateAndSaveVoiceoverSegment(segmentId, formData, {
        allowOverwrite: true,
      });

      summaries.push(`Segment ${summaries.length + 1}: ${result.durationSummary}`);
    } catch (error) {
      revalidatePath(`/videos/${videoId}`);
      redirectToVoiceover(
        videoId,
        "error",
        `Stopped after ${summaries.length} regenerated segment(s): ${
          error instanceof Error ? error.message : "generation failed"
        }`,
      );
    }
  }

  const afterSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: { durationSec: true },
  });
  const afterTotal = totalDuration(afterSegments);

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Regenerated ${summaries.length} selected segment(s). Total old: ${beforeTotal.toFixed(1)}s. Total new: ${afterTotal.toFixed(1)}s. Voiceover changed. Subtitles and render draft need to be regenerated.`,
  );
}

export async function regenerateAllVoiceoverSegmentsWithPacing(
  videoId: string,
  formData: FormData,
) {
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    orderBy: { index: "asc" },
    select: { id: true },
  });

  if (segments.length === 0) {
    redirectToVoiceover(videoId, "error", "No voiceover segments to regenerate.");
  }

  const beforeSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: { durationSec: true },
  });
  const beforeTotal = totalDuration(beforeSegments);
  let regeneratedCount = 0;

  for (const segment of segments) {
    try {
      await generateAndSaveVoiceoverSegment(segment.id, formData, {
        allowOverwrite: true,
      });
      regeneratedCount += 1;
    } catch (error) {
      revalidatePath(`/videos/${videoId}`);
      redirectToVoiceover(
        videoId,
        "error",
        `Stopped after ${regeneratedCount} regenerated segment(s): ${
          error instanceof Error ? error.message : "generation failed"
        }`,
      );
    }
  }

  const afterSegments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: { durationSec: true },
  });
  const afterTotal = totalDuration(afterSegments);

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Regenerated all ${regeneratedCount} voiceover segment(s). Total old: ${beforeTotal.toFixed(1)}s. Total new: ${afterTotal.toFixed(1)}s. Voiceover changed. Subtitles and render draft need to be regenerated.`,
  );
}

export async function generatePendingVoiceoverSegments(
  videoId: string,
  formData: FormData,
) {
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId, status: "pending" },
    orderBy: { index: "asc" },
    select: { id: true },
  });

  if (segments.length === 0) {
    redirectToVoiceover(videoId, "error", "No pending voiceover segments to generate.");
  }

  let generatedCount = 0;

  for (const segment of segments) {
    try {
      await generateAndSaveVoiceoverSegment(segment.id, formData);
      generatedCount += 1;
    } catch (error) {
      revalidatePath(`/videos/${videoId}`);
      redirectToVoiceover(
        videoId,
        "error",
        `Stopped after ${generatedCount} generated segment(s): ${
          error instanceof Error ? error.message : "generation failed"
        }`,
      );
    }
  }

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", `Generated ${generatedCount} segment(s).`);
}

export async function markVoiceoverSegmentReady(segmentId: string) {
  const segment = await prisma.voiceoverSegment.findUnique({
    where: { id: segmentId },
    select: { videoId: true, audioPath: true },
  });

  if (!segment) {
    throw new Error("Voiceover segment not found.");
  }

  if (!segment.audioPath) {
    redirectToVoiceover(
      segment.videoId,
      "error",
      "Generate segment audio before marking it ready.",
    );
  }

  await prisma.voiceoverSegment.update({
    where: { id: segmentId },
    data: { status: "ready" },
  });

  revalidatePath(`/videos/${segment.videoId}`);
  redirectToVoiceover(segment.videoId, "success", "Voiceover segment marked ready.");
}

export async function splitVoiceoverSegmentIntoScenes(segmentId: string) {
  const segment = await prisma.voiceoverSegment.findUnique({
    where: { id: segmentId },
  });

  if (!segment) {
    throw new Error("Voiceover segment not found.");
  }

  const scenes = await scenesForVoiceover(segment.videoId);
  const drafts = splitSegmentByScene(segment, scenes);

  if (drafts.length < 2) {
    redirectToVoiceover(
      segment.videoId,
      "error",
      "This segment cannot be split into smaller scene segments.",
    );
  }

  await prisma.voiceoverSegment.delete({ where: { id: segmentId } });
  await createVoiceoverSegmentDrafts(segment.videoId, drafts);
  await reindexVoiceoverSegments(segment.videoId);
  await invalidateSubtitlesForVideo(segment.videoId);

  revalidatePath(`/videos/${segment.videoId}`);
  redirectToVoiceover(
    segment.videoId,
    "success",
    `Split segment into ${drafts.length} single-scene segments.`,
  );
}

export async function splitVoiceoverSegmentAtScene(
  segmentId: string,
  formData: FormData,
) {
  const splitSceneOrder = parsePositiveInt(formData.get("splitSceneOrder"), 0);
  const segment = await prisma.voiceoverSegment.findUnique({
    where: { id: segmentId },
  });

  if (!segment) {
    throw new Error("Voiceover segment not found.");
  }

  const scenes = await scenesForVoiceover(segment.videoId);
  const drafts = splitSegmentAtSceneOrder(segment, splitSceneOrder, scenes);

  if (drafts.length !== 2) {
    redirectToVoiceover(
      segment.videoId,
      "error",
      "Choose a scene inside the segment range, after the first scene.",
    );
  }

  await prisma.voiceoverSegment.delete({ where: { id: segmentId } });
  await createVoiceoverSegmentDrafts(segment.videoId, drafts);
  await reindexVoiceoverSegments(segment.videoId);
  await invalidateSubtitlesForVideo(segment.videoId);

  revalidatePath(`/videos/${segment.videoId}`);
  redirectToVoiceover(segment.videoId, "success", "Split segment into two parts.");
}

export async function createVoiceoverSegmentForScene(
  videoId: string,
  formData: FormData,
) {
  const sceneOrder = parsePositiveInt(formData.get("sceneOrder"), 0);
  const scene = await prisma.scene.findUnique({
    where: {
      videoId_sortOrder: {
        videoId,
        sortOrder: sceneOrder,
      },
    },
    select: { sortOrder: true, scriptText: true },
  });

  if (!scene?.scriptText.trim()) {
    redirectToVoiceover(videoId, "error", "Scene narration text was not found.");
  }

  const draft = createSingleSceneSegment(scene);
  await prisma.voiceoverSegment.create({
    data: createVoiceoverSegmentData(videoId, {
      ...draft,
      index: await prisma.voiceoverSegment.count({ where: { videoId } }) + 1,
    }),
  });
  await reindexVoiceoverSegments(videoId);
  await invalidateSubtitlesForVideo(videoId);

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", `Created a segment for scene ${sceneOrder}.`);
}

export async function deleteVoiceoverSegment(segmentId: string) {
  const segment = await prisma.voiceoverSegment.findUnique({
    where: { id: segmentId },
    select: { videoId: true },
  });

  if (!segment) {
    throw new Error("Voiceover segment not found.");
  }

  await prisma.voiceoverSegment.delete({ where: { id: segmentId } });
  await reindexVoiceoverSegments(segment.videoId);
  await invalidateSubtitlesForVideo(segment.videoId);

  revalidatePath(`/videos/${segment.videoId}`);
  redirectToVoiceover(segment.videoId, "success", "Voiceover segment deleted.");
}

export async function clearVoiceoverSegments(videoId: string) {
  await prisma.voiceoverSegment.deleteMany({ where: { videoId } });
  await invalidateSubtitlesForVideo(videoId);

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Voiceover segment rows cleared. Audio files were kept.");
}

export async function markSegmentedVoiceoverReady(videoId: string) {
  const segments = await prisma.voiceoverSegment.findMany({
    where: { videoId },
    select: { audioPath: true, status: true },
  });
  const allSegmentsReady =
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment.audioPath &&
        (segment.status === "generated" || segment.status === "ready"),
    );

  if (!allSegmentsReady) {
    redirectToVoiceover(
      videoId,
      "error",
      "All voiceover segments need generated audio before marking segmented voiceover ready.",
    );
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { voiceoverStatus: "ready" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Segmented voiceover marked ready.");
}

function alignmentProviderFromFormData(formData?: FormData) {
  if (!formData) {
    return null;
  }
  const raw = formData.get("alignmentProvider");
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  return parseAlignmentProvider(raw);
}

async function persistAlignmentProviderPreference(
  videoId: string,
  alignmentProvider: AlignmentProvider,
) {
  const settings = await resolvePipelineSettings(videoId);
  if (settings.voiceover.alignmentProvider === alignmentProvider) {
    return;
  }
  await saveVideoPipelineSettings(videoId, {
    ...settings,
    voiceover: {
      ...settings.voiceover,
      alignmentProvider,
    },
  });
}

export async function generateSubtitlesForSegment(
  voiceoverSegmentIdOrFormData: string | FormData,
  formData?: FormData,
) {
  const {
    segmentId: voiceoverSegmentId,
    formData: data,
    videoIdHint,
  } = voiceoverSegmentIdFromActionArgs(voiceoverSegmentIdOrFormData, formData);

  let result: { videoId: string; segmentIndex: number; cueCount: number };
  const preferred = alignmentProviderFromFormData(data);

  try {
    if (!voiceoverSegmentId) {
      throw new Error(
        "Voiceover segment not found — refresh the page (stitch may have rebuilt segments).",
      );
    }
    const segment = await prisma.voiceoverSegment.findUnique({
      where: { id: voiceoverSegmentId },
      select: { videoId: true },
    });
    if (segment && preferred) {
      await persistAlignmentProviderPreference(segment.videoId, preferred);
    }
    result = await generateSubtitlesForVoiceoverSegment(voiceoverSegmentId, {
      alignmentProvider: preferred,
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const segment = voiceoverSegmentId
      ? await prisma.voiceoverSegment.findUnique({
          where: { id: voiceoverSegmentId },
          select: { videoId: true, index: true },
        })
      : null;

    const videoId = segment?.videoId || videoIdHint;
    if (!videoId) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Subtitle generation failed (missing video context). Refresh and try again.",
      );
    }

    redirectToVoiceover(
      videoId,
      "error",
      `Segment ${segment?.index ?? ""} subtitle generation failed: ${
        error instanceof Error ? error.message : "alignment failed"
      }`.replace(/\s+/g, " ").trim(),
    );
  }

  revalidatePath(`/videos/${result.videoId}`);
  redirectToVoiceover(
    result.videoId,
    "success",
    `Generated ${result.cueCount} subtitle cues for segment ${result.segmentIndex}.`,
  );
}

export async function regenerateSubtitlesForSegment(
  voiceoverSegmentIdOrFormData: string | FormData,
  formData?: FormData,
) {
  await generateSubtitlesForSegment(voiceoverSegmentIdOrFormData, formData);
}

/** Single form action for per-row subtitle buttons (avoids N bound actions in RSC HTML). */
export async function dispatchSegmentSubtitleRowAction(formData: FormData) {
  const raw = formData.get("subtitleRowAction")?.toString().trim() || "";
  const separator = raw.indexOf("|");
  const intent = separator >= 0 ? raw.slice(0, separator) : raw;
  const targetId = separator >= 0 ? raw.slice(separator + 1) : "";

  switch (intent) {
    case "generate":
    case "regenerate": {
      if (targetId) {
        formData.set("voiceoverSegmentId", targetId);
      }
      return intent === "generate"
        ? generateSubtitlesForSegment(formData)
        : regenerateSubtitlesForSegment(formData);
    }
    case "mark-ready": {
      if (targetId) {
        formData.set("subtitleSegmentId", targetId);
      }
      return markSubtitleSegmentReady(formData);
    }
    default: {
      const videoId = formData.get("videoId")?.toString().trim() || "";
      if (videoId) {
        redirectToVoiceover(videoId, "error", "Unknown subtitle row action.");
      }
      throw new Error("Unknown subtitle row action.");
    }
  }
}

export async function generateSubtitlesForAllReadySegments(
  videoId: string,
  formData?: FormData,
) {
  const preferred = alignmentProviderFromFormData(formData);
  if (preferred) {
    await persistAlignmentProviderPreference(videoId, preferred);
  }
  const alignmentProvider =
    preferred ??
    (await resolvePipelineSettings(videoId)).voiceover.alignmentProvider;

  const segmentCount = await prisma.voiceoverSegment.count({ where: { videoId } });
  const processId = await startProcess({
    type: "subtitle_generation",
    videoId,
    title: "Generating scene subtitles",
    description: `${segmentCount} subtitle jobs queued (${alignmentProvider}).`,
    totalSteps: Math.max(segmentCount + 2, 3),
    currentStep: "Checking voiceover readiness",
  });

  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { voiceoverStatus: true },
    });

    if (video?.voiceoverStatus !== "ready") {
      throw new Error("Mark voiceover segments ready before generating final subtitles.");
    }

    await updateProcess(processId, {
      currentStep: "Loading scene subtitle jobs",
      stepIndex: 1,
      totalSteps: Math.max(segmentCount + 2, 3),
    });
    const segments = await prisma.voiceoverSegment.findMany({
      where: { videoId },
      orderBy: { index: "asc" },
      select: {
        id: true,
        index: true,
        status: true,
        audioPath: true,
        sceneStartOrder: true,
      },
    });
    const invalidSegment = segments.find(
      (segment) =>
        !segment.audioPath || !["generated", "ready"].includes(segment.status),
    );

    if (segments.length === 0 || invalidSegment) {
      throw new Error(
        invalidSegment
          ? `Voiceover segment ${invalidSegment.index} is not ready for subtitles.`
          : "No voiceover segments found.",
      );
    }

    let generatedCount = 0;

    for (const segment of segments) {
      await updateProcess(processId, {
        currentStep: `Aligning scene ${segment.sceneStartOrder}`,
        stepIndex: generatedCount + 2,
        totalSteps: segments.length + 2,
        logMessage: `Generating subtitles for scene ${segment.sceneStartOrder} (${alignmentProvider}).`,
      });
      try {
        const result = await generateSubtitlesForVoiceoverSegment(segment.id, {
          alignmentProvider,
        });
        generatedCount += 1;
        await updateProcess(processId, {
          logMessage: result.silent
            ? `Scene ${segment.sceneStartOrder}: silent / no captions (timeline offset kept).`
            : `Scene ${segment.sceneStartOrder} subtitles generated.`,
          logLevel: "success",
        });
      } catch (error) {
        revalidatePath(`/videos/${videoId}`);
        throw new Error(
          `Stopped at segment ${segment.index}: ${
            error instanceof Error ? error.message : "alignment failed"
          }`,
        );
      }
    }

    await updateProcess(processId, {
      currentStep: "Combining global captions",
      stepIndex: segments.length + 2,
      totalSteps: segments.length + 2,
    });

    // Same outcome as "Mark Subtitles Ready": all local jobs ready + video.subtitleStatus ready.
    const subtitleSegments = await prisma.subtitleSegment.findMany({
      where: { videoId },
      select: {
        id: true,
        localCuesJson: true,
        voiceoverSegment: {
          select: { text: true, pacedTextUsed: true },
        },
      },
    });
    const readySegmentIds = subtitleSegments
      .filter((segment) => {
        const silent = isSilentSubtitleVoiceoverText(
          segment.voiceoverSegment?.pacedTextUsed ||
            segment.voiceoverSegment?.text,
        );
        return (
          silent || parseSubtitleCuesJson(segment.localCuesJson).length > 0
        );
      })
      .map((segment) => segment.id);

    if (readySegmentIds.length > 0) {
      await prisma.subtitleSegment.updateMany({
        where: { id: { in: readySegmentIds } },
        data: { status: "ready" },
      });
    }

    const cues = await combineSegmentSubtitlesForVideo(videoId, "ready");
    await finishProcess(processId, {
      result: { generatedCount, cueCount: cues.length },
      logMessage: `Generated, combined, and marked ready ${generatedCount} scene subtitle(s) (${cues.length} cues).`,
    });

    revalidatePath(`/videos/${videoId}`);
    redirectToVoiceover(
      videoId,
      "success",
      `Generated subtitles for ${generatedCount} segment(s), combined them, and marked subtitles ready (${cues.length} cues).`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Subtitle generation failed."),
    });
    redirectToVoiceover(
      videoId,
      "error",
      errorMessage(error, "Subtitle generation failed."),
    );
  }
}

export async function combineSegmentSubtitles(videoId: string) {
  const cues = await combineSegmentSubtitlesForVideo(videoId, "formatted");

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Combined ${cues.length} global subtitle cues.`,
  );
}

export async function markSubtitleSegmentReady(
  subtitleSegmentIdOrFormData: string | FormData,
  formData?: FormData,
) {
  const subtitleSegmentId =
    typeof subtitleSegmentIdOrFormData === "string"
      ? subtitleSegmentIdOrFormData.trim()
      : subtitleSegmentIdOrFormData.get("subtitleSegmentId")?.toString().trim() ||
        "";

  if (!subtitleSegmentId) {
    const videoIdHint =
      (typeof subtitleSegmentIdOrFormData === "string"
        ? formData
        : subtitleSegmentIdOrFormData
      )
        ?.get("videoId")
        ?.toString()
        .trim() || "";
    if (videoIdHint) {
      redirectToVoiceover(
        videoIdHint,
        "error",
        "Subtitle segment not found — refresh the page.",
      );
    }
    throw new Error("Subtitle segment not found.");
  }

  const subtitleSegment = await prisma.subtitleSegment.findUnique({
    where: { id: subtitleSegmentId },
    select: {
      videoId: true,
      localCuesJson: true,
      voiceoverSegment: {
        select: { text: true, pacedTextUsed: true },
      },
    },
  });

  if (!subtitleSegment) {
    throw new Error("Subtitle segment not found.");
  }

  const silent = isSilentSubtitleVoiceoverText(
    subtitleSegment.voiceoverSegment?.pacedTextUsed ||
      subtitleSegment.voiceoverSegment?.text,
  );

  if (
    !silent &&
    parseSubtitleCuesJson(subtitleSegment.localCuesJson).length === 0
  ) {
    redirectToVoiceover(
      subtitleSegment.videoId,
      "error",
      "Generate local subtitle cues before marking the segment ready.",
    );
  }

  await prisma.subtitleSegment.update({
    where: { id: subtitleSegmentId },
    data: { status: "ready", error: null },
  });

  revalidatePath(`/videos/${subtitleSegment.videoId}`);
  redirectToVoiceover(subtitleSegment.videoId, "success", "Subtitle segment marked ready.");
}

export async function markAllSubtitleSegmentsReady(videoId: string) {
  const subtitleSegments = await prisma.subtitleSegment.findMany({
    where: { videoId },
    select: {
      id: true,
      localCuesJson: true,
      voiceoverSegment: {
        select: { text: true, pacedTextUsed: true },
      },
    },
  });
  const readySegmentIds = subtitleSegments
    .filter((segment) => {
      const silent = isSilentSubtitleVoiceoverText(
        segment.voiceoverSegment?.pacedTextUsed ||
          segment.voiceoverSegment?.text,
      );
      return (
        silent || parseSubtitleCuesJson(segment.localCuesJson).length > 0
      );
    })
    .map((segment) => segment.id);

  if (readySegmentIds.length === 0) {
    redirectToVoiceover(videoId, "error", "No formatted subtitle segments found.");
  }

  await prisma.subtitleSegment.updateMany({
    where: { id: { in: readySegmentIds } },
    data: { status: "ready" },
  });
  const cues = await combineSegmentSubtitlesForVideo(videoId, "ready");

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", `Marked subtitles ready with ${cues.length} cues.`);
}

function parseRenderOptions(formData: FormData) {
  const imageFit: "cover" | "contain" = formData.get("imageFit")?.toString() === "contain"
    ? "contain"
    : "cover";

  return {
    width: parsePositiveInt(formData.get("renderWidth"), 1920),
    height: parsePositiveInt(formData.get("renderHeight"), 1080),
    fps: parsePositiveInt(formData.get("renderFps"), 30),
    imageFit,
    burnCaptions: formData.get("burnCaptions") === "on",
    voiceSoundBars: formData.get("voiceSoundBars") === "on",
    voiceSoundBarsStyle: parseVoiceSoundBarsStyle(
      formData.get("voiceSoundBarsStyle")?.toString(),
    ),
  };
}

async function fileExists(filePath: string | null | undefined) {
  if (!filePath) {
    return false;
  }

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isUsableSceneImage(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function resolveSceneImagePath(scene: {
  sortOrder: number;
  imageLocalPath: string | null;
  imageFileName: string | null;
}, video: { id: string; title: string }) {
  const candidates = [
    scene.imageLocalPath ? path.resolve(process.cwd(), scene.imageLocalPath) : null,
    scene.imageFileName
      ? path.join(generatedImagesDir(video.id, video.title), scene.imageFileName)
      : null,
    scene.imageFileName
      ? path.join(generatedImagesDir(video.id), scene.imageFileName)
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await isUsableSceneImage(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveStoredAudioPathForRender(audioPath: string) {
  const normalized = audioPath.replace(/\\/g, "/");
  const resolved = path.resolve(process.cwd(), normalized);
  const storageRoot = path.resolve(process.cwd(), "storage");

  if (!resolved.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Stored audio path is outside local storage.");
  }

  return resolved;
}

function exactSceneRenderDuration(scene: {
  duration: number | null;
  voiceoverDuration: number | null;
  pauseAfterMs: number | null;
  introSec?: number;
  isMusicBed?: boolean;
}) {
  const visualDuration = sceneVisualDurationSec({
    voiceoverDuration: scene.voiceoverDuration,
    pauseAfterMs: scene.pauseAfterMs,
    isMusicBed: scene.isMusicBed,
    introSec: scene.introSec,
  });

  if (visualDuration != null) {
    return visualDuration;
  }

  return scene.duration;
}

async function loadRenderReadiness(videoId: string, burnCaptions = true) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      scenes: {
        orderBy: { sortOrder: "asc" },
      },
      voiceoverSegments: {
        orderBy: { index: "asc" },
      },
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  if (video.scenes.length === 0) {
    throw new Error("Cannot render: no scenes found.");
  }

  const scenesWithImages = await Promise.all(
    video.scenes
      .filter((scene) => !isSceneRejected(scene.status))
      .map(async (scene) => {
      const renderClipPath = await resolveSceneClipPath(scene, video.id);
      const renderImagePath = await resolveSceneImagePath(scene, video);
      return {
        ...scene,
        renderClipPath,
        renderImagePath,
        hasVisual: Boolean(renderClipPath || renderImagePath),
      };
    }),
  );

  if (scenesWithImages.length === 0) {
    throw new Error(
      "Cannot render: no active scenes found (all scenes may be Rejected).",
    );
  }

  if (!scenesWithImages.some((scene) => scene.hasVisual)) {
    throw new Error("Cannot render: no scene images or clips found.");
  }

  const missingVisuals = scenesWithImages.filter((scene) => !scene.hasVisual);

  if (missingVisuals.length > 0) {
    throw new Error(
      `Cannot render: missing images/clips for scenes ${missingVisuals
        .map((scene) => scene.sortOrder)
        .join(", ")}.`,
    );
  }

  const hasMasterVoiceover = Boolean(
    video.voiceoverAudioPath?.includes("voiceover_by_scene_master") ||
      (video.voiceoverAudioPath?.trim() && video.voiceoverSegments.length === 0),
  );

  if (!hasMasterVoiceover && video.voiceoverSegments.length === 0) {
    throw new Error("Cannot render: no voiceover segments found.");
  }

  const invalidVoiceoverSegment = hasMasterVoiceover
    ? null
    : video.voiceoverSegments.find(
        (segment) =>
          !segment.audioPath ||
          !["generated", "ready"].includes(segment.status),
      );

  if (invalidVoiceoverSegment) {
    throw new Error(
      invalidVoiceoverSegment.audioPath
        ? "Cannot render: voiceover segments are not ready."
        : `Cannot render: missing audio for segment ${invalidVoiceoverSegment.index}.`,
    );
  }

  if (video.voiceoverStatus !== "ready") {
    throw new Error("Cannot render: voiceover segments are not ready.");
  }

  if (burnCaptions) {
    if (video.subtitleStatus !== "ready") {
      throw new Error("Cannot render: subtitles are not ready.");
    }

    if (!video.styledSubtitleAss?.trim()) {
      throw new Error("Cannot render active-word captions: ASS subtitles not found.");
    }
  }

  return {
    video,
    scenesWithImages,
  };
}

export async function validateRenderDraftReadiness(
  videoId: string,
  formData?: FormData,
) {
  try {
    const options = formData ? parseRenderOptions(formData) : { burnCaptions: true };

    await ensureFfmpegAvailable();
    if (options.burnCaptions) {
      await ensureFfmpegAssFilterAvailable();
    }
    await loadRenderReadiness(videoId, options.burnCaptions);
  } catch (error) {
    redirectToRenderDraft(
      videoId,
      "error",
      error instanceof Error ? error.message : "Render readiness check failed.",
    );
  }

  redirectToRenderDraft(videoId, "success", "Render draft prerequisites look ready.");
}

export async function getRenderDiagnostics(videoId: string) {
  const directory = await ensureRenderDir(videoId);
  const diagnostics = await getRenderFfmpegDiagnostics();
  const manifestPath = path.join(directory, "render_manifest.json");
  const logPath = path.join(directory, "render.log");
  const paths = {
    assFile: path.join(directory, "draft_subtitles.ass"),
    combinedAudio: path.join(directory, "draft_audio.wav"),
    finalVideo: path.join(
      directory,
      (
        await prisma.renderDraft.findFirst({
          where: { videoId, fileName: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { fileName: true },
        })
      )?.fileName ||
        renderFinalVideoFileName(
          (
            await prisma.video.findUnique({
              where: { id: videoId },
              select: { title: true },
            })
          )?.title,
        ),
    ),
  };
  const [assFileExists, combinedAudioExists, finalVideoExists, logExists] =
    await Promise.all([
      fileExists(paths.assFile),
      fileExists(paths.combinedAudio),
      fileExists(paths.finalVideo),
      fileExists(logPath),
    ]);
  const [combinedAudioProbe, finalVideoProbe] = await Promise.all([
    combinedAudioExists ? probeMedia(paths.combinedAudio) : null,
    finalVideoExists ? probeMedia(paths.finalVideo) : null,
  ]);
  let manifest: Record<string, unknown> | null = null;

  if (await fileExists(manifestPath)) {
    try {
      const rawManifest = await readFile(manifestPath, "utf8");
      const parsedManifest = JSON.parse(rawManifest);

      if (isRecord(parsedManifest)) {
        manifest = parsedManifest;
      }
    } catch {
      manifest = null;
    }
  }

  return {
    ...diagnostics,
    renderCwd: directory,
    manifestPath,
    logPath: logExists ? logPath : null,
    lastBurnCaptions:
      isRecord(manifest?.captions) &&
      typeof manifest.captions.burnCaptions === "boolean"
        ? manifest.captions.burnCaptions
        : null,
    files: {
      assFile: {
        path: paths.assFile,
        available: assFileExists,
      },
      combinedAudio: {
        path: paths.combinedAudio,
        available: combinedAudioExists,
        probe: combinedAudioProbe ? getMediaSummary(combinedAudioProbe) : null,
        hasAudioStream:
          combinedAudioProbe?.streams.some(
            (stream) => stream.codec_type === "audio",
          ) ?? false,
      },
      finalVideo: {
        path: paths.finalVideo,
        available: finalVideoExists,
        probe: finalVideoProbe ? getMediaSummary(finalVideoProbe) : null,
        hasVideoStream:
          finalVideoProbe?.streams.some(
            (stream) => stream.codec_type === "video",
          ) ?? false,
        hasAudioStream:
          finalVideoProbe?.streams.some(
            (stream) => stream.codec_type === "audio",
          ) ?? false,
      },
    },
    advanced: {
      commands: isRecord(manifest?.commands) ? manifest.commands : null,
      probes: isRecord(manifest?.probes) ? manifest.probes : null,
    },
  };
}

export async function renderDraft(videoId: string, formData: FormData) {
  const options = parseRenderOptions(formData);
  const processId = await startProcess({
    type: "render_draft",
    videoId,
    title: "Rendering draft",
    description: `${options.width}x${options.height} @ ${options.fps}fps`,
    totalSteps: 8,
    currentStep: "Preparing render folder",
  });
  const directory = await ensureRenderDir(videoId);
  const renderManifestPath = path.join(directory, "render_manifest.json");
  const diagnostics = await getRenderFfmpegDiagnostics();
  const manifest: Record<string, unknown> = {
    videoId,
    createdAt: new Date().toISOString(),
    status: "rendering",
    width: options.width,
    height: options.height,
    fps: options.fps,
    imageFit: options.imageFit,
    ffmpegBinary: diagnostics.ffmpeg.binary,
    ffprobeBinary: diagnostics.ffprobe.binary,
    ffmpeg: diagnostics.ffmpeg,
    ffprobe: diagnostics.ffprobe,
    commands: {},
    probes: {},
    captions: {
      burnCaptions: options.burnCaptions,
      captionRenderMode: "active_word_highlight",
      renderMode: "active_word_highlight",
      timingModel: ACTIVE_WORD_ASS_TIMING_MODEL,
      overlapEnabled: false,
      flickerFix: "continuous-active-word-events",
      eventOverlapSec: ACTIVE_WORD_ASS_EVENT_OVERLAP_SEC,
      gapWarnings: [],
      overlapWarnings: [],
      duplicateRisk: false,
    },
    voiceSoundBars: options.voiceSoundBars,
    voiceSoundBarsStyle: options.voiceSoundBarsStyle,
    sceneTimeline: [],
    manifestPath: renderManifestPath,
  };
  const writeManifest = async (status: string, error?: string) => {
    manifest.status = status;
    manifest.updatedAt = new Date().toISOString();

    if (error) {
      manifest.error = error;
    }

    await writeFile(renderManifestPath, JSON.stringify(manifest, null, 2));
  };

  let renderDraftRow = await prisma.renderDraft.create({
    data: {
      videoId,
      width: options.width,
      height: options.height,
      fps: options.fps,
      status: "rendering",
    },
  });

  await prisma.video.update({
    where: { id: videoId },
    data: { renderDraftStatus: "rendering" },
  });

  try {
    await updateProcess(processId, {
      currentStep: "Cleaning previous draft files",
      stepIndex: 1,
      totalSteps: 8,
    });
    const previousOutputs = await prisma.renderDraft.findMany({
      where: { videoId, fileName: { not: null } },
      select: { fileName: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    const videoForName = await prisma.video.findUnique({
      where: { id: videoId },
      select: { title: true },
    });
    const finalVideoFileName = renderFinalVideoFileName(videoForName?.title);
    await cleanupRenderDraftFiles(directory, [
      finalVideoFileName,
      ...previousOutputs
        .map((draft) => draft.fileName)
        .filter((name): name is string => Boolean(name)),
    ]);
    await writeManifest("rendering");
    await updateProcess(processId, {
      currentStep: "Checking FFmpeg",
      stepIndex: 2,
      totalSteps: 8,
    });
    await ensureFfmpegAvailable();
    if (options.burnCaptions) {
      await ensureFfmpegAssFilterAvailable();
    }
    await updateProcess(processId, {
      currentStep: "Preparing render timeline",
      stepIndex: 3,
      totalSteps: 8,
    });
    const { video, scenesWithImages } = await loadRenderReadiness(
      videoId,
      options.burnCaptions,
    );
    const usingSceneMaster = Boolean(
      video.voiceoverAudioPath?.includes("voiceover_by_scene_master") ||
        (video.voiceoverAudioPath?.trim() && video.voiceoverSegments.length === 0),
    );
    const segmentsWithDurations = usingSceneMaster
      ? []
      : await Promise.all(
          video.voiceoverSegments.map(async (segment) => {
            let durationSec = segment.durationSec;

            if (!durationSec && segment.audioPath) {
              durationSec = await getAudioDurationSec(
                resolveStoredAudioPathForRender(segment.audioPath),
              );
            }

            return { ...segment, durationSec };
          }),
        );
    const masterAudioPath = usingSceneMaster
      ? resolveStoredAudioPathForRender(video.voiceoverAudioPath ?? "")
      : "";
    const needsExclusiveClipRestitch =
      usingSceneMaster &&
      scenesWithImages.some((scene) => sceneUsesExclusiveClipAudio(scene));
    const masterAudioProbe =
      usingSceneMaster && !needsExclusiveClipRestitch
        ? await validateAudioFile(
            masterAudioPath,
            "Cannot render: by-scene master voiceover is missing or invalid.",
          )
        : null;
    await updateProcess(processId, {
      currentStep: "Preparing voiceover audio",
      stepIndex: 4,
      totalSteps: 8,
      logMessage: needsExclusiveClipRestitch
        ? "Rebuilding master audio with exclusive scene-clip audio (no music bed under those scenes)."
        : usingSceneMaster
          ? "Using by-scene master voiceover."
          : `Combining ${segmentsWithDurations.length} voiceover segments.`,
    });

    let combinedAudio;

    if (needsExclusiveClipRestitch) {
      const stitchClips = [];
      for (const scene of scenesWithImages) {
        const isMusicBed =
          scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
          isMusicBedScene(scene);
        if (sceneUsesExclusiveClipAudio(scene)) {
          const targetDurationSec =
            scene.voiceoverDuration && scene.voiceoverDuration > 0
              ? scene.voiceoverDuration
              : Math.max(0.5, scene.duration ?? 5);
          const clipAudioPath = await prepareExclusiveClipAudioForScene({
            videoId,
            sceneId: scene.id,
            clipLocalPath: scene.clipLocalPath,
            clipFileName: scene.clipFileName,
            targetDurationSec,
          });
          stitchClips.push({
            sortOrder: scene.sortOrder,
            audioPath: clipAudioPath,
            pauseAfterMs: scene.pauseAfterMs,
            isMusicBed: false,
          });
          continue;
        }
        if (!scene.voiceoverLocalPath) {
          throw new Error(
            `Cannot render: missing voiceover for scene ${scene.sortOrder}.`,
          );
        }
        stitchClips.push({
          sortOrder: scene.sortOrder,
          audioPath: scene.voiceoverLocalPath,
          pauseAfterMs: scene.pauseAfterMs,
          isMusicBed,
        });
      }
      const exclusiveMasterRelative = renderRelativePath(
        videoId,
        "draft_audio_exclusive.wav",
      );
      const stitched = await stitchSceneVoiceoverAudio(
        videoId,
        stitchClips,
        exclusiveMasterRelative,
      );
      combinedAudio = {
        outputPath: stitched.outputPath,
        durationSec: stitched.durationSec,
        draftAudioProbe: stitched.masterProbe,
        segmentAudioProbes: [],
        audioConcatResult: stitched.audioConcatResult,
      };
    } else if (usingSceneMaster) {
      combinedAudio = {
        outputPath: masterAudioPath,
        durationSec: masterAudioProbe?.durationSec ?? 0,
        draftAudioProbe: masterAudioProbe,
        segmentAudioProbes: [],
        audioConcatResult: null,
      };
    } else {
      combinedAudio = await renderCombinedVoiceoverAudio(
        videoId,
        segmentsWithDurations,
      );
    }

    manifest.audioPath = combinedAudio.outputPath;
    manifest.combinedAudioPath = path.basename(combinedAudio.outputPath);
    manifest.audioSource = usingSceneMaster ? "by_scene_master" : "voiceover_segments";
    if (!usingSceneMaster && combinedAudio.audioConcatResult) {
      manifest.commands = {
        ...(isRecord(manifest.commands) ? manifest.commands : {}),
        audioConcat: {
          binary: combinedAudio.audioConcatResult.binaryPath,
          cwd: combinedAudio.audioConcatResult.cwd,
          args: combinedAudio.audioConcatResult.args,
        },
      };
    }
    if (!combinedAudio.draftAudioProbe) {
      throw new Error("Cannot render: voiceover audio probe is unavailable.");
    }
    manifest.probes = {
      ...(isRecord(manifest.probes) ? manifest.probes : {}),
      voiceoverSegments: combinedAudio.segmentAudioProbes.map((item) => ({
        segmentIndex: item.segmentIndex,
        filePath: item.filePath,
        probe: getMediaSummary(item.probe),
      })),
      draftAudio: getMediaSummary(combinedAudio.draftAudioProbe),
    };
    manifest.draftAudioProbe = getMediaSummary(combinedAudio.draftAudioProbe);

    const overlapAwareDurations = usingSceneMaster
      ? buildOverlapAwareSceneDurations(
          scenesWithImages.map((scene) => {
            const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
            return {
              sortOrder: scene.sortOrder,
              voiceoverDuration: scene.voiceoverDuration,
              pauseAfterMs: scene.pauseAfterMs,
              // Exclusive clip audio disables music-bed underlay timing.
              isMusicBed:
                !exclusiveClip &&
                (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
                  isMusicBedScene(scene)),
            };
          }),
        )
      : new Map<number, number>();

    const sceneTimeline = buildSceneTimelineFromSegments(
      scenesWithImages.map((scene) => {
        const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
        const isMusicBed =
          !exclusiveClip &&
          (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
            isMusicBedScene(scene));
        return {
          sortOrder: scene.sortOrder,
          scriptText: scene.scriptText,
          duration: usingSceneMaster
            ? (overlapAwareDurations.get(scene.sortOrder) ??
              exactSceneRenderDuration({
                ...scene,
                isMusicBed,
              }))
            : scene.duration,
          imagePath: scene.renderImagePath,
          clipPath: scene.renderClipPath,
          clipMuted: scene.clipMuted !== false,
        };
      }),
      usingSceneMaster
        ? scenesWithImages.map((scene) => {
            const exclusiveClip = sceneUsesExclusiveClipAudio(scene);
            const isMusicBed =
              !exclusiveClip &&
              (scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
                isMusicBedScene(scene));
            return {
              index: scene.sortOrder,
              sceneStartOrder: scene.sortOrder,
              sceneEndOrder: scene.sortOrder,
              durationSec:
                overlapAwareDurations.get(scene.sortOrder) ??
                exactSceneRenderDuration({
                  ...scene,
                  isMusicBed,
                }),
            };
          })
        : segmentsWithDurations.map((segment) => ({
            index: segment.index,
            sceneStartOrder: segment.sceneStartOrder,
            sceneEndOrder: segment.sceneEndOrder,
            durationSec: segment.durationSec,
          })),
    );
    manifest.sceneTimeline = sceneTimeline;
    await updateProcess(processId, {
      currentStep: "Rendering scene video",
      stepIndex: 5,
      totalSteps: 8,
      logMessage: `Rendering ${sceneTimeline.length} timeline items${
        options.voiceSoundBars ? " (voice sound bars on stills)" : ""
      }.`,
    });

    const voiceDriveSourceByOrder = new Map<number, string>();
    if (options.voiceSoundBars) {
      const sceneByOrder = new Map(
        scenesWithImages.map((scene) => [scene.sortOrder, scene]),
      );
      for (const item of sceneTimeline) {
        const scene = sceneByOrder.get(item.sceneOrder);
        if (!scene) {
          continue;
        }
        const isMusicBed =
          scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
          isMusicBedScene(scene);
        if (
          !shouldAttachVoiceSoundBars({
            voiceSoundBarsEnabled: true,
            mediaKind: item.mediaKind,
            scriptText: scene.scriptText,
            voiceoverLocalPath: scene.voiceoverLocalPath,
            isMusicBed,
            isPartCover: isPartCoverVisualIdea(scene.visualIdea),
          })
        ) {
          continue;
        }
        voiceDriveSourceByOrder.set(
          item.sceneOrder,
          resolveStoredAudioPathForRender(scene.voiceoverLocalPath!),
        );
      }
    }

    const sceneVideo = await renderImageSequenceVideo({
      videoId,
      sceneTimeline,
      width: options.width,
      height: options.height,
      fps: options.fps,
      imageFit: options.imageFit,
      voiceSoundBars: options.voiceSoundBars,
      voiceSoundBarsStyle: options.voiceSoundBarsStyle,
      voiceDriveSourceByOrder,
    });

    // Exclusive clip audio is already in the master when we re-stitched above.
    // Only splice into segment-based masters (no by-scene stitch).
    let draftAudioPath = combinedAudio.outputPath;
    const unmutedClips = sceneVideo.unmutedClipItems ?? [];
    if (!needsExclusiveClipRestitch && unmutedClips.length > 0) {
      await updateProcess(processId, {
        currentStep: "Inserting exclusive scene clip audio",
        stepIndex: 5,
        totalSteps: 8,
        logMessage: `Replacing master audio with ${unmutedClips.length} scene clip(s) (no music bed under those windows).`,
      });
      const renderDirectory = path.dirname(combinedAudio.outputPath);
      let workingAudio = combinedAudio.outputPath;
      for (let index = 0; index < unmutedClips.length; index += 1) {
        const item = unmutedClips[index]!;
        const clipAudioPath = path.join(
          renderDirectory,
          `clip-audio-${item.sceneOrder}.m4a`,
        );
        await extractFittedClipAudio({
          sourcePath: item.clipPath!,
          outputPath: clipAudioPath,
          targetDurationSec: item.duration,
        });
        const replacedPath = path.join(
          renderDirectory,
          `draft-audio-clip-exclusive-${index + 1}.m4a`,
        );
        await replaceMasterAudioSegment({
          masterAudioPath: workingAudio,
          clipAudioPath,
          startSec: item.start,
          durationSec: item.duration,
          outputPath: replacedPath,
        });
        workingAudio = replacedPath;
      }
      draftAudioPath = workingAudio;
    }

    manifest.commands = {
      ...(isRecord(manifest.commands) ? manifest.commands : {}),
      imageVideo: {
        binary: sceneVideo.imageVideoResult.binaryPath,
        cwd: sceneVideo.imageVideoResult.cwd,
        args: sceneVideo.imageVideoResult.args,
      },
    };
    manifest.probes = {
      ...(isRecord(manifest.probes) ? manifest.probes : {}),
      sceneVideo: getMediaSummary(sceneVideo.sceneVideoProbe),
    };

    await updateProcess(processId, {
      currentStep: options.burnCaptions
        ? "Preparing subtitles"
        : "Skipping subtitles",
      stepIndex: 6,
      totalSteps: 8,
      logMessage: options.burnCaptions
        ? "Writing ASS captions for burn-in."
        : "Rendering without on-screen subtitles.",
    });
    const activeWordCues = options.burnCaptions
      ? activeWordCuesFromJson(video.styledSubtitleJson)
      : [];
    const captionStylePreset = getCaptionStylePreset(video.captionStylePreset);
    // Always re-export with the video's saved preset. Omitting the preset used to
    // fall back to active_word_highlight and ignore GodsWord / other styles.
    const renderSubtitleAss = options.burnCaptions
      ? activeWordCues.length > 0
        ? exportActiveWordCaptionsToAss(activeWordCues, captionStylePreset)
        : (video.styledSubtitleAss ?? "")
      : "";
    const subtitlePath = options.burnCaptions
      ? await writeRenderSubtitles(videoId, renderSubtitleAss)
      : null;
    const captionAudit = options.burnCaptions
      ? analyzeActiveWordAssEvents(
          activeWordCues,
          renderSubtitleAss,
          captionStylePreset,
        )
      : {
          assDialogueEventsCount: 0,
          eventCount: 0,
          minEventDurationSec: 0,
          maxEventDurationSec: 0,
          totalCaptionCoveredDurationSec: 0,
          gapWarnings: [],
          overlapWarnings: [],
          duplicateRisk: false,
        };
    manifest.subtitlePath = subtitlePath;
    manifest.captions = {
      burnCaptions: options.burnCaptions,
      assPath: subtitlePath,
      captionRenderMode: captionStylePreset.id,
      renderMode: captionStylePreset.id,
      stylePreset: captionStylePreset.id,
      timingModel: ACTIVE_WORD_ASS_TIMING_MODEL,
      overlapEnabled: false,
      assDialogueEventsCount:
        captionAudit.assDialogueEventsCount ||
        countAssDialogueEvents(renderSubtitleAss),
      activeWordCueCount: countActiveWordCues(video.styledSubtitleJson),
      eventCount: captionAudit.eventCount,
      minEventDurationSec: captionAudit.minEventDurationSec,
      maxEventDurationSec: captionAudit.maxEventDurationSec,
      totalCaptionCoveredDurationSec:
        captionAudit.totalCaptionCoveredDurationSec,
      flickerFix: "continuous-active-word-events",
      eventOverlapSec: ACTIVE_WORD_ASS_EVENT_OVERLAP_SEC,
      gapWarnings: captionAudit.gapWarnings,
      overlapWarnings: captionAudit.overlapWarnings,
      duplicateRisk: captionAudit.duplicateRisk,
    };

    await updateProcess(processId, {
      currentStep: "Rendering final video",
      stepIndex: 7,
      totalSteps: 8,
      logMessage: "Running final FFmpeg render.",
    });
    const finalRender = await renderFinalDraftVideo({
      videoId,
      videoTitle: video.title,
      sceneVideoPath: sceneVideo.outputPath,
      audioPath: draftAudioPath,
      subtitlePath,
      width: options.width,
      height: options.height,
      fps: options.fps,
      burnCaptions: options.burnCaptions,
    });
    manifest.outputPath = finalRender.outputPath;
    manifest.outputFileName = finalRender.fileName;
    manifest.finalRenderArgs = finalRender.finalFfmpegArgs;
    manifest.warnings = finalRender.warnings;
    manifest.commands = {
      ...(isRecord(manifest.commands) ? manifest.commands : {}),
      finalRender: {
        binary: finalRender.finalFfmpegResult.binaryPath,
        cwd: finalRender.finalFfmpegCwd,
        args: finalRender.finalFfmpegArgs,
      },
    };
    manifest.probes = {
      ...(isRecord(manifest.probes) ? manifest.probes : {}),
      draftAudioBeforeFinalRender: getMediaSummary(
        finalRender.audioProbeBeforeFinalRender,
      ),
      sceneVideoBeforeFinalRender: getMediaSummary(
        finalRender.sceneVideoProbeBeforeFinalRender,
      ),
      finalVideo: getMediaSummary(finalRender.finalVideoProbe),
    };
    manifest.finalVideoProbe = getMediaSummary(finalRender.finalVideoProbe);
    manifest.finalVideoHasAudio = finalRender.finalVideoProbe.streams.some(
      (stream) => stream.codec_type === "audio",
    );
    manifest.finalVideoHasVideo = finalRender.finalVideoProbe.streams.some(
      (stream) => stream.codec_type === "video",
    );
    manifest.assDialogueEventsCount =
      captionAudit.assDialogueEventsCount ||
      countAssDialogueEvents(renderSubtitleAss);
    manifest.captionRenderMode = captionStylePreset.id;
    manifest.timingModel = ACTIVE_WORD_ASS_TIMING_MODEL;
    manifest.overlapEnabled = false;
    manifest.duplicateRisk = captionAudit.duplicateRisk;
    manifest.eventOverlapSec = ACTIVE_WORD_ASS_EVENT_OVERLAP_SEC;
    await writeManifest("rendered");

    await updateProcess(processId, {
      currentStep: "Saving render output",
      stepIndex: 8,
      totalSteps: 8,
    });
    renderDraftRow = await prisma.renderDraft.update({
      where: { id: renderDraftRow.id },
      data: {
        outputPath: renderRelativePath(videoId, finalRender.fileName),
        fileName: finalRender.fileName,
        durationSec: finalRender.durationSec,
        status: "rendered",
        error: null,
      },
    });
    await prisma.video.update({
      where: { id: videoId },
      data: { renderDraftStatus: "rendered" },
    });
    await finishProcess(processId, {
      result: {
        outputPath: renderRelativePath(videoId, finalRender.fileName),
        fileName: finalRender.fileName,
        durationSec: finalRender.durationSec,
      },
      logMessage: `Render generated (${finalRender.fileName}, ${finalRender.durationSec.toFixed(1)}s).`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Render draft failed.";
    const finalVideoPath = path.join(
      directory,
      renderFinalVideoFileName(
        (
          await prisma.video.findUnique({
            where: { id: videoId },
            select: { title: true },
          })
        )?.title,
      ),
    );
    const draftAudioPath = path.join(directory, "draft_audio.wav");

    if (error instanceof FinalRenderValidationError) {
      const finalVideoHasAudio = error.finalVideoProbe.streams.some(
        (stream) => stream.codec_type === "audio",
      );
      const finalVideoHasVideo = error.finalVideoProbe.streams.some(
        (stream) => stream.codec_type === "video",
      );

      manifest.finalRenderArgs = error.finalFfmpegResult.args;
      manifest.finalVideoProbe = getMediaSummary(error.finalVideoProbe);
      manifest.finalVideoHasAudio = finalVideoHasAudio;
      manifest.finalVideoHasVideo = finalVideoHasVideo;
      manifest.commands = {
        ...(isRecord(manifest.commands) ? manifest.commands : {}),
        finalRender: {
          binary: error.finalFfmpegResult.binaryPath,
          cwd: error.finalFfmpegResult.cwd,
          args: error.finalFfmpegResult.args,
        },
      };
      manifest.probes = {
        ...(isRecord(manifest.probes) ? manifest.probes : {}),
        finalVideo: getMediaSummary(error.finalVideoProbe),
      };
    }

    if (await fileExists(draftAudioPath)) {
      const draftAudioProbe = await probeMedia(draftAudioPath);
      manifest.draftAudioProbe = getMediaSummary(draftAudioProbe);
      manifest.probes = {
        ...(isRecord(manifest.probes) ? manifest.probes : {}),
        draftAudio: getMediaSummary(draftAudioProbe),
      };
    }

    if (await fileExists(finalVideoPath)) {
      const finalVideoProbe = await probeMedia(finalVideoPath);
      const finalVideoHasAudio = finalVideoProbe.streams.some(
        (stream) => stream.codec_type === "audio",
      );
      const finalVideoHasVideo = finalVideoProbe.streams.some(
        (stream) => stream.codec_type === "video",
      );

      manifest.finalVideoProbe = getMediaSummary(finalVideoProbe);
      manifest.finalVideoHasAudio = finalVideoHasAudio;
      manifest.finalVideoHasVideo = finalVideoHasVideo;
      manifest.probes = {
        ...(isRecord(manifest.probes) ? manifest.probes : {}),
        finalVideo: getMediaSummary(finalVideoProbe),
      };
    }

    await writeManifest("error", message);

    await prisma.renderDraft.update({
      where: { id: renderDraftRow.id },
      data: { status: "error", error: message },
    });
    await prisma.video.update({
      where: { id: videoId },
      data: { renderDraftStatus: "error" },
    });
    await failProcess(processId, {
      errorMessage: message,
      logMessage: "Render failed. See render diagnostics for FFmpeg details.",
    });

    revalidatePath(`/videos/${videoId}`);
    redirectToRenderDraft(videoId, "error", message);
  }

  revalidatePath(`/videos/${videoId}`);
  redirectToRenderDraft(videoId, "success", "Render draft generated.");
}

export async function clearRenderDraft(videoId: string) {
  await prisma.renderDraft.deleteMany({ where: { videoId } });
  await prisma.video.update({
    where: { id: videoId },
    data: { renderDraftStatus: "pending" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToRenderDraft(videoId, "success", "Render draft rows cleared. Files were kept.");
}

export async function updateRenderDraftStatus(videoId: string, formData: FormData) {
  const status = requiredText(formData, "renderDraftStatus") || "pending";

  await prisma.video.update({
    where: { id: videoId },
    data: { renderDraftStatus: status },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToRenderDraft(videoId, "success", "Render draft status updated.");
}

export async function saveRawSubtitles(videoId: string, formData: FormData) {
  const rawSubtitleText = emptyToNull(formData.get("rawSubtitleText"));
  const rawSubtitleFormat = parseSubtitleFormat(formData.get("rawSubtitleFormat"));

  await prisma.video.update({
    where: { id: videoId },
    data: {
      rawSubtitleText,
      rawSubtitleFormat,
      subtitleStatus: rawSubtitleText ? "imported" : "pending",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Raw subtitles saved.");
}

export async function parseAndFormatSubtitles(
  videoId: string,
  formData: FormData,
) {
  const { rawSubtitleText, rawSubtitleFormat, cues } =
    await parseRawSubtitlesForVideo(videoId, formData);
  const formattedCues = formatSubtitleCuesForReadableCaptions(cues);

  await prisma.video.update({
    where: { id: videoId },
    data: {
      rawSubtitleText,
      rawSubtitleFormat,
      formattedSubtitleJson: formattedCues,
      formattedSubtitleText: subtitleTextFromCues(formattedCues),
      subtitleStatus: "formatted",
    },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(
    videoId,
    "success",
    `Formatted ${formattedCues.length} subtitle cues.`,
  );
}

export async function markSubtitlesReady(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { formattedSubtitleJson: true },
  });

  const cues = Array.isArray(video?.formattedSubtitleJson)
    ? video.formattedSubtitleJson
    : [];

  if (cues.length === 0) {
    redirectToVoiceover(
      videoId,
      "error",
      "Format subtitles before marking subtitles ready.",
    );
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { subtitleStatus: "ready" },
  });

  revalidatePath(`/videos/${videoId}`);
  redirectToVoiceover(videoId, "success", "Subtitles marked ready.");
}

async function logLatestImageBatch(videoId: string, message: string) {
  const latestBatch = await prisma.imageBatch.findFirst({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (latestBatch) {
    await appendImageBatchLog(latestBatch.id, message);
  }
}

function stuckUnattachedSceneWhere(videoId: string) {
  return {
    videoId,
    imageStatus: { in: ["queued", "generating", "waiting_manual", "needs_retry"] },
    imageUrl: null,
    imageLocalPath: null,
  };
}

function forceResettableSceneWhere(videoId: string) {
  return {
    videoId,
    imageStatus: { in: ["queued", "generating", "waiting_manual", "needs_retry", "failed"] },
    imageUrl: null,
    imageLocalPath: null,
  };
}

export async function prepareImageBatch(videoId: string, formData: FormData) {
  const processId = await startProcess({
    type: "asset_generation",
    videoId,
    title: "Preparing image batch",
    totalSteps: 3,
    currentStep: "Reading selected scenes",
  });
  const sceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  try {
    const savedPrompts = await applyScenePromptOverridesFromForm(
      formData,
      sceneIds,
    );
    await updateProcess(processId, {
      currentStep: "Preparing image prompts",
      stepIndex: 2,
      totalSteps: 3,
      logMessage:
        savedPrompts > 0
          ? `${sceneIds.length} selected scenes; saved ${savedPrompts} prompt edit(s) from Assets.`
          : `${sceneIds.length} selected scenes.`,
    });
    await persistImageOutputFolderFromForm(videoId, formData);
    const options = imageBatchOptionsFromForm(formData);
    if (!options.outputFolder) {
      options.outputFolder = await resolveVideoImageOutputFolderAbsolute(videoId);
    }
    await prepareImageBatchPayload(videoId, sceneIds, options);
    await finishProcess(processId, { logMessage: "Image batch payload prepared." });
  } catch (error) {
    if (error instanceof ImageBatchWorkflowError) {
      await logLatestImageBatch(videoId, `Prepare batch blocked: ${error.message}`);
      await failProcess(processId, { errorMessage: error.message });
      redirectToAssets(videoId, "error", error.message);
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Image batch preparation failed."),
    });
    throw error;
  }

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function assignPodcastImageLibrary(
  videoId: string,
  formData: FormData,
) {
  const overwrite =
    String(formData.get("overwrite") ?? "1").trim() !== "0";
  const minGap = parsePositiveInt(formData.get("minGap"), 3);
  const selectedIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));
  const scenarioRaw = String(formData.get("scenario") ?? "all").trim();

  try {
    const result = await assignPodcastImageLibraryToVideo(videoId, {
      overwrite,
      minGap,
      scenario: scenarioRaw,
      ...(selectedIds.length > 0 ? { sceneIds: selectedIds } : {}),
    });
    const scenarioLabel =
      result.scenario === "all"
        ? "all scenarios"
        : result.scenario === "default"
          ? "default pool"
          : result.scenario;
    const message = [
      `Library assigned to ${result.assigned} scene(s) (${scenarioLabel}).`,
      result.prunedMissingAssets > 0
        ? `Pruned ${result.prunedMissingAssets} deleted library file(s) from manifest.`
        : null,
      `Skipped Flow-only covers: ${result.skippedFlowOnly}.`,
      overwrite
        ? null
        : `Skipped already attached: ${result.skippedAlreadyAttached}.`,
      result.skippedNoPool > 0
        ? `No pool match: ${result.skippedNoPool}.`
        : null,
      `Scenario pool Emma ${result.scenarioCounts.emma} / Leo ${result.scenarioCounts.leo} / Music ${result.scenarioCounts.music}.`,
      `Library total Emma ${result.libraryCounts.emma} / Leo ${result.libraryCounts.leo} / Music ${result.libraryCounts.music}.`,
    ]
      .filter(Boolean)
      .join(" ");
    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
    redirectToAssets(videoId, "success", message);
  } catch (error) {
    redirectToAssets(
      videoId,
      "error",
      errorMessage(error, "Library assign failed."),
    );
  }
}

export async function importPodcastImageLibraryFromSourceVideo(
  videoId: string,
  formData: FormData,
) {
  const sourceVideoId =
    String(formData.get("sourceVideoId") ?? videoId).trim() || videoId;
  const maxOrder = parsePositiveInt(formData.get("maxOrder"), 150);

  try {
    const result = await importPodcastImageLibraryFromVideo({
      videoId: sourceVideoId,
      maxOrder,
      includeExtraMusicBeds: true,
    });
    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);
    redirectToAssets(
      videoId,
      "success",
      `Imported ${result.imported} library assets (Emma ${result.counts.emma}, Leo ${result.counts.leo}, Music ${result.counts.music}). Skipped ${result.skipped}.`,
    );
  } catch (error) {
    redirectToAssets(
      videoId,
      "error",
      errorMessage(error, "Library import failed."),
    );
  }
}

/** Read-only helper for Assets UI. Syncs disk scenario folders into the manifest. */
export async function getPodcastImageLibrarySummary() {
  const synced = await syncPodcastImageLibraryManifest();
  return summarizePodcastImageLibrary(synced.manifest);
}

export async function insertMissingPodcastPartCovers(videoId: string) {
  try {
    const result = await insertPodcastPartCoversFromScript(videoId);
    // Even when covers already exist, strip PART headings glued onto avatar turns.
    const cleanedLeakedHeadings =
      result.cleanedLeakedHeadings ??
      (await stripLeakedPartHeadingsFromScenes(videoId));
    await invalidateSceneStructureArtifacts(videoId);
    await persistComputedVideoStatus(videoId);
    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);

    if (result.inserted === 0) {
      const details = [
        result.plan.skippedExisting.length > 0
          ? `already present: ${result.plan.skippedExisting.length}`
          : null,
        result.plan.unmatched.length > 0
          ? `unmatched: ${result.plan.unmatched.join("; ")}`
          : null,
        cleanedLeakedHeadings > 0
          ? `cleaned PART heading leak(s) from ${cleanedLeakedHeadings} scene(s)`
          : null,
      ]
        .filter(Boolean)
        .join("; ");
      redirectToAssets(
        videoId,
        details ? "success" : "success",
        details
          ? `No new PART covers inserted (${details}).`
          : "No missing PART covers to insert.",
      );
    }

    redirectToAssets(
      videoId,
      "success",
      `Inserted ${result.inserted} PART cover scene(s) at orders ${result.createdOrders.join(", ")}. Generate them with Flow (Flow-only covers).${
        cleanedLeakedHeadings > 0
          ? ` Also removed PART heading text from ${cleanedLeakedHeadings} prior avatar scene(s).`
          : ""
      }${
        result.plan.unmatched.length > 0
          ? ` Unmatched: ${result.plan.unmatched.join("; ")}.`
          : ""
      }`,
    );
  } catch (error) {
    redirectToAssets(
      videoId,
      "error",
      errorMessage(error, "PART cover insert failed."),
    );
  }
}

/** Attach INTRO/LESSON/CLOSING/FINAL clips from video-library onto SECTION_CLIP scenes. */
export async function attachPodcastSectionVideoLibrary(videoId: string) {
  try {
    const result = await attachPodcastSectionClipsFromVisualIdeas(videoId);
    await invalidateSceneStructureArtifacts(videoId);
    await persistComputedVideoStatus(videoId);
    revalidatePath("/");
    revalidatePath(`/videos/${videoId}`);

    if (result.attached.length === 0) {
      redirectToAssets(
        videoId,
        result.skipped.length > 0 ? "error" : "success",
        result.skipped.length > 0
          ? `No section clips attached. ${result.skipped.join("; ")}`
          : "No SECTION_CLIP scenes found to attach.",
      );
    }

    redirectToAssets(
      videoId,
      "success",
      `Attached ${result.attached.length} section clip(s): ${result.attached
        .map((item) => `${item.tag}@${item.sortOrder}`)
        .join(", ")} (exclusive audio).${
        result.skipped.length > 0 ? ` Skipped: ${result.skipped.join("; ")}.` : ""
      }`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirectToAssets(
      videoId,
      "error",
      errorMessage(error, "Section video-library attach failed."),
    );
  }
}

export async function generateSelectedImageBatch(
  videoId: string,
  formData: FormData,
) {
  const processId = await startProcess({
    type: "asset_generation",
    videoId,
    title: "Generating selected scene images",
    totalSteps: 4,
    currentStep: "Preparing batch payload",
  });
  const sceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  let batchId: string;

  try {
    await updateProcess(processId, {
      currentStep: "Preparing prompts",
      stepIndex: 1,
      totalSteps: 4,
      logMessage: `${sceneIds.length} selected scenes.`,
    });
    const savedPrompts = await applyScenePromptOverridesFromForm(
      formData,
      sceneIds,
    );
    if (savedPrompts > 0) {
      await updateProcess(processId, {
        currentStep: "Preparing prompts",
        stepIndex: 1,
        totalSteps: 4,
        logMessage: `Saved ${savedPrompts} prompt edit(s) from Assets before Flow.`,
      });
    }
    await persistImageOutputFolderFromForm(videoId, formData);
    const options = imageBatchOptionsFromForm(formData);
    if (!options.outputFolder) {
      options.outputFolder = await resolveVideoImageOutputFolderAbsolute(videoId);
    }
    const batch = await prepareImageBatchPayload(videoId, sceneIds, options);
    batchId = batch.batchId;
    await updateProcess(processId, {
      currentStep: "Running Google Flow batch",
      stepIndex: 2,
      totalSteps: 4,
      logMessage: `Batch ${batchId} created.`,
    });
  } catch (error) {
    if (error instanceof ImageBatchWorkflowError) {
      await logLatestImageBatch(videoId, `Prepare batch blocked: ${error.message}`);
      await failProcess(processId, { errorMessage: error.message });
      redirectToAssets(videoId, "error", error.message);
    }

    await failProcess(processId, {
      errorMessage: errorMessage(error, "Image generation setup failed."),
    });
    throw error;
  }

  try {
    const flowResult = await runGoogleFlowBatch(batchId);

    if (flowResult.canceled) {
      await cancelProcess(processId);
      revalidatePath("/");
      revalidatePath(`/videos/${videoId}`);
      redirectToAssets(
        videoId,
        "success",
        flowResult.message || "Image batch canceled.",
      );
    }

    await updateProcess(processId, {
      currentStep: "Saving image batch results",
      stepIndex: 4,
      totalSteps: 4,
    });
    await finishProcess(processId, { logMessage: "Google Flow batch completed." });
  } catch (error) {
    await failProcess(processId, {
      errorMessage: errorMessage(error, "Google Flow batch failed."),
    });
    throw error;
  }

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function runImageBatch(videoId: string, formData: FormData) {
  const processId = await startProcess({
    type: "asset_generation",
    videoId,
    title: "Running image batch",
    totalSteps: 2,
    currentStep: "Loading batch",
  });
  const batchId = requiredText(formData, "batchId");

  if (!batchId) {
    await failProcess(processId, { errorMessage: "Batch ID is required." });
    throw new Error("Batch ID is required.");
  }

  try {
    await updateProcess(processId, {
      currentStep: "Generating images in Google Flow",
      stepIndex: 1,
      totalSteps: 2,
      logMessage: `Running batch ${batchId}.`,
    });
    const flowResult = await runGoogleFlowBatch(batchId);

    if (flowResult.canceled) {
      await cancelProcess(processId);
      revalidatePath("/");
      revalidatePath(`/videos/${videoId}`);
      redirectToAssets(
        videoId,
        "success",
        flowResult.message || "Image batch canceled.",
      );
    }

    await finishProcess(processId, { logMessage: "Image batch completed." });
  } catch (error) {
    await failProcess(processId, {
      errorMessage: errorMessage(error, "Image batch failed."),
    });
    throw error;
  }

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function cancelImageBatch(videoId: string, formData: FormData) {
  const batchId = requiredText(formData, "batchId");
  const selectedSceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  if (!batchId) {
    redirectToAssets(videoId, "error", "Batch ID is required.");
  }

  const result = await requestImageBatchCancel({
    videoId,
    batchId,
    selectedSceneIds,
  });

  if (!result.ok) {
    redirectToAssets(videoId, "error", result.error);
  }

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);

  if (result.selectedOrphanResetCount > 0) {
    redirectToAssets(
      videoId,
      "success",
      `Canceled batch and reset ${result.selectedOrphanResetCount} selected stuck scenes from old batches.`,
    );
  }

  redirectToAssets(
    videoId,
    "success",
    `Canceled batch. Reset ${result.resetCount} scene(s). The running Flow automation will stop at the next prompt/download checkpoint.`,
  );
}

export async function resetSelectedImageScenes(videoId: string, formData: FormData) {
  const sceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  if (sceneIds.length === 0) {
    redirectToAssets(videoId, "error", "Select scenes to reset.");
  }

  const result = await prisma.scene.updateMany({
    where: {
      id: { in: sceneIds },
      ...stuckUnattachedSceneWhere(videoId),
    },
    data: {
      imageStatus: "pending",
      imageError: null,
      imageBatchId: null,
      imageFileName: null,
    },
  });

  await logLatestImageBatch(videoId, `Reset ${result.count} stuck scenes to pending`);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  redirectToAssets(videoId, "success", `Reset ${result.count} stuck scenes to pending.`);
}

export async function forceResetSelectedImageScenes(
  videoId: string,
  formData: FormData,
) {
  const sceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  if (sceneIds.length === 0) {
    redirectToAssets(videoId, "error", "Select scenes to force reset.");
  }

  const skippedAttachedScenes = await prisma.scene.count({
    where: {
      id: { in: sceneIds },
      videoId,
      OR: [
        { imageStatus: "attached" },
        { imageUrl: { not: null } },
        { imageLocalPath: { not: null } },
      ],
    },
  });
  const resetResult = await prisma.scene.updateMany({
    where: {
      id: { in: sceneIds },
      ...forceResettableSceneWhere(videoId),
    },
    data: {
      imageStatus: "pending",
      imageError: null,
      imageBatchId: null,
      imageFileName: null,
    },
  });
  const message = `Force reset selected scenes: reset ${resetResult.count} scenes, skipped ${skippedAttachedScenes} attached scenes`;

  await logLatestImageBatch(videoId, message);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  redirectToAssets(videoId, "success", message);
}

export async function resetSelectedImageReferences(videoId: string, formData: FormData) {
  const sceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  if (sceneIds.length === 0) {
    redirectToAssets(videoId, "error", "Select image references to reset.");
  }

  const result = await prisma.scene.updateMany({
    where: {
      id: { in: sceneIds },
      videoId,
    },
    data: {
      imageStatus: "pending",
      imageError: null,
      imageUrl: null,
      imageLocalPath: null,
      imageFileName: null,
      imageBatchId: null,
      status: "planned",
    },
  });

  const message = `Reset ${result.count} image reference${result.count === 1 ? "" : "s"} to pending. Regenerate or import images for those scenes.`;

  await logLatestImageBatch(videoId, message);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  redirectToAssets(videoId, "success", message);
}

export async function retryFailedScenes(videoId: string, formData: FormData) {
  const batchId = requiredText(formData, "batchId");

  if (!batchId) {
    throw new Error("Batch ID is required.");
  }

  const failedScenes = await prisma.scene.findMany({
    where: {
      videoId,
      imageBatchId: batchId,
      imageStatus: { in: ["failed", "needs_retry"] },
      imageUrl: null,
      imageLocalPath: null,
    },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  if (failedScenes.length === 0) {
    redirectToAssets(videoId, "error", "No failed or retry-needed scenes were found for this batch.");
  }

  await appendImageBatchLog(
    batchId,
    `creating scoped retry batch for scenes ${failedScenes
      .map((scene) => scene.sortOrder)
      .join(", ")}`,
  );

  const retryBatch = await prepareImageBatchPayload(
    videoId,
    failedScenes.map((scene) => scene.id),
    {
      ...imageBatchOptionsFromForm(formData),
      name: `Retry failed scenes ${new Date().toLocaleString("en")}`,
    },
  );

  const retryResult = await runGoogleFlowBatch(retryBatch.batchId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);

  if (retryResult.canceled) {
    redirectToAssets(
      videoId,
      "success",
      retryResult.message || "Retry batch canceled.",
    );
  }
}

export async function retrySelectedImageScenes(videoId: string, formData: FormData) {
  const sceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));

  if (sceneIds.length === 0) {
    redirectToAssets(videoId, "error", "Select scenes to retry.");
  }

  const retryBatch = await prepareImageBatchPayload(videoId, sceneIds, {
    ...imageBatchOptionsFromForm(formData),
    name: `Retry selected scenes ${new Date().toLocaleString("en")}`,
  });

  const retryResult = await runGoogleFlowBatch(retryBatch.batchId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);

  if (retryResult.canceled) {
    redirectToAssets(
      videoId,
      "success",
      retryResult.message || "Retry batch canceled.",
    );
  }
}

export async function importDownloadedImages(videoId: string, formData: FormData) {
  const processId = await startProcess({
    type: "asset_import",
    videoId,
    title: "Importing downloaded images",
    totalSteps: 4,
    currentStep: "Reading import folder",
  });
  const batchId = emptyToNull(formData.get("batchId"));
  const folderPath = requiredText(formData, "importFolderPath");
  const overwrite = formData.get("overwriteImages") === "on";
  const selectedSceneIds = parseSelectedSceneIds(formData.get("selectedSceneIds"));
  const latestOnly = formData.get("latestOnly") === "on";
  const dryRun =
    formData.get("dryRun") === "on" || (!batchId && selectedSceneIds.length === 0);
  let result: Awaited<ReturnType<typeof importDownloadedImagesFromFolder>>;

  try {
    await updateProcess(processId, {
      currentStep: "Matching images to scenes",
      stepIndex: 2,
      totalSteps: 4,
      logMessage: selectedSceneIds.length > 0
        ? `Matching ${selectedSceneIds.length} selected scenes.`
        : "Matching images for available scenes.",
    });
    result = await importDownloadedImagesFromFolder({
      videoId,
      batchId,
      folderPath,
      overwrite,
      selectedSceneIds,
      latestOnly,
      dryRun,
    });
  } catch (error) {
    await failProcess(processId, {
      errorMessage: errorMessage(error, "Image import failed."),
    });
    throw error;
  }

  if (batchId) {
    await updateProcess(processId, {
      currentStep: "Writing batch logs",
      stepIndex: 3,
      totalSteps: 4,
    });
    await appendImageBatchLog(
      batchId,
      `${dryRun ? "dry-run import" : "imported images"}: ${result.matched} matched, ${result.unmatched} unmatched, ${result.failed} failed`,
    );
    for (const match of result.matches.slice(0, 30)) {
      await appendImageBatchLog(
        batchId,
        `${match.fileName} -> scene ${match.sceneSortOrder.toString().padStart(3, "0")} (${match.matchReason})`,
      );
    }
  }

  if (!dryRun) {
    await updateProcess(processId, {
      currentStep: "Saving imported assets",
      stepIndex: 4,
      totalSteps: 4,
    });
    await persistComputedVideoStatus(videoId);
  }
  await finishProcess(processId, {
    result,
    logMessage: `${dryRun ? "Dry run" : "Imported"}: ${result.matched} matched, ${result.unmatched} unmatched, ${result.failed} failed.`,
  });
  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
  redirectToAssets(
    videoId,
    result.failed > 0 ? "error" : "success",
    `${dryRun ? "Dry run" : "Imported"}: ${result.matched} matched, ${result.unmatched} unmatched, ${result.failed} failed.`,
  );
}

export async function updateScene(
  sceneId: string,
  videoId: string,
  formData: FormData,
) {
  const data = sceneDataFromForm(formData);
  const previous = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { status: true, sortOrder: true },
  });

  await prisma.scene.update({
    where: { id: sceneId },
    data,
  });
  await persistComputedVideoStatus(videoId);

  const becameRejected =
    previous &&
    !isSceneRejected(previous.status) &&
    isSceneRejected(String(data.status ?? ""));

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);

  if (becameRejected) {
    redirectToAssets(
      videoId,
      "success",
      `Scene ${previous.sortOrder} marked Rejected — skipped in voiceover, stitch, and render. Re-stitch the master if it was already built.`,
    );
  }
}

export async function deleteScene(sceneId: string, videoId: string) {
  await prisma.scene.delete({
    where: { id: sceneId },
  });
  await reindexScenesForVideo(videoId);
  await invalidateSceneStructureArtifacts(videoId);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function deleteSelectedScenes(videoId: string, formData: FormData) {
  const sceneIds = formData
    .getAll("selectedSceneIds")
    .map((value) => value.toString())
    .filter(Boolean);

  if (sceneIds.length === 0) {
    throw new Error("Select at least one scene to delete.");
  }

  await prisma.scene.deleteMany({
    where: {
      videoId,
      id: { in: sceneIds },
    },
  });
  await reindexScenesForVideo(videoId);
  await invalidateSceneStructureArtifacts(videoId);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}

export async function deleteSceneRange(videoId: string, formData: FormData) {
  const fromOrder = parsePositiveInt(formData.get("deleteFromOrder"), 0);
  const toOrder = parsePositiveInt(formData.get("deleteToOrder"), 0);
  const confirm = formData.get("confirmSceneRangeDelete")?.toString() === "on";

  if (fromOrder <= 0 || toOrder <= 0 || fromOrder > toOrder) {
    throw new Error("Enter a valid scene range to delete.");
  }

  if (!confirm) {
    throw new Error("Confirm scene range deletion before applying.");
  }

  await prisma.scene.deleteMany({
    where: {
      videoId,
      sortOrder: {
        gte: fromOrder,
        lte: toOrder,
      },
    },
  });
  await reindexScenesForVideo(videoId);
  await invalidateSceneStructureArtifacts(videoId);
  await persistComputedVideoStatus(videoId);

  revalidatePath("/");
  revalidatePath(`/videos/${videoId}`);
}
