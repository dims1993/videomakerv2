import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

import Link from "next/link";
import { notFound } from "next/navigation";
import type React from "react";
import { Fragment } from "react";
import { ArrowLeft, ImageIcon, Mic2, Plus, Sparkles, Trash2 } from "lucide-react";

import {
  applyCleanSubtitlePunctuation,
  addScene,
  clearRenderDraft,
  combineSegmentSubtitles,
  deleteScene,
  deleteSceneRange,
  deleteSelectedScenes,
  deleteVideo,
  generateThumbnailConcepts,
  generateThumbnailImageWithFlow,
  generateThumbnailPrompt,
  importScenes,
  importScenePatch,
  importHookReplacementPatch,
  generateSceneVoiceovers,
  generateMissingSceneVoiceovers,
  generateSelectedSceneVoiceovers,
  getRenderDiagnostics,
  generateSubtitlesForAllReadySegments,
  generateSubtitlesForSegment,
  markSceneForPromptRegeneration,
  markSceneVoiceoverNeedsReview,
  markSceneVoiceoverQaOk,
  markSubtitlesReady,
  markAllSubtitleSegmentsReady,
  markSubtitleSegmentReady,
  markVoiceoverReady,
  mergeSceneWithNext,
  mergeSceneWithPrevious,
  mockGenerateIdea,
  mockGenerateMetadata,
  mockGenerateScript,
  parseAndFormatSubtitles,
  regenerateSubtitlesForSegment,
  renderDraft,
  retryFailedSceneVoiceovers,
  resetThumbnail,
  resetSelectedImageReferences,
  saveRawSubtitles,
  saveThumbnailBrief,
  saveThumbnailFinal,
  saveVoiceoverInfo,
  selectThumbnailConcept,
  splitHookScene,
  stitchSceneVoiceovers,
  markThumbnailBriefReady,
  markThumbnailPromptReady,
  markThumbnailReady,
  updateRenderDraftStatus,
  updateScene,
  updateAllSceneDurationsFromVoiceover,
  updateSceneDurationFromVoiceover,
  updateSubtitleStylePreset,
  validateRenderDraftReadiness,
  updateVideoIdea,
  updateVideoMetadata,
  updateVideoScript,
} from "@/app/actions";
import {
  getChannelOptions,
  getChannelProfile,
  getChannelTopicCategory,
  getWealthInsightsSuggestedCategory,
} from "@/lib/channels";
import {
  formatDate,
  formatDuration,
  formatSceneTypeShare,
  getSceneStats,
} from "@/lib/format";
import { generatedImagesDir } from "@/lib/image-batches";
import {
  DEFAULT_ELEVENLABS_SPEED,
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  getDefaultElevenLabsModelId,
  getDefaultElevenLabsVoiceId,
} from "@/lib/elevenlabs";
import { prisma } from "@/lib/prisma";
import { getComputedVideoStatus, sceneStatuses, statusLabel } from "@/lib/status";
import {
  exportCuesToSrt,
  exportCuesToVtt,
  getCaptionStats,
  secondsToTimestamp,
  type FormattedSubtitleCue,
} from "@/lib/subtitles";
import {
  exportActiveWordCaptionsToAss,
  exportActiveWordCaptionsToJson,
} from "@/lib/subtitle-alignment";
import { CAPTION_STYLE_PRESETS } from "@/lib/caption-styles";
import {
  generatedAudioUrl,
} from "@/lib/voiceover-segments";
import {
  conceptToBrief,
  parseThumbnailConcept,
  parseThumbnailConcepts,
  THUMBNAIL_NEGATIVE_PROMPT,
  WEALTH_INSIGHTS_HOST_DESCRIPTOR,
} from "@/lib/thumbnail";
import { ensureFfmpegAvailable, runFfmpeg } from "@/lib/render/ffmpeg";
import { Badge } from "@/components/ui/badge";
import { AssetsWorkflow } from "@/components/assets-workflow";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { DraftVideoPlayer } from "@/components/draft-video-player";
import { CopySubtitleButton } from "@/components/copy-subtitle-button";
import { ClearQueryParams } from "@/components/clear-query-params";
import { ExportVideoPackageButton } from "@/components/export-video-package-button";
import { ImportScenesForm } from "@/components/import-scenes-form";
import { ScenePatchImporter } from "@/components/scene-patch-importer";
import { HookAutoFixPanel } from "@/components/hook-auto-fix-panel";
import { ProcessFormGuard } from "@/components/process-form-guard";
import { RenderDiagnosticsCard } from "@/components/render/render-diagnostics-card";
import { Input } from "@/components/ui/input";
import { JsonTextarea } from "@/components/json-textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  VoiceoverQaPanel,
  type VoiceoverQaRow,
  type VoiceoverQaStatus,
} from "@/components/voiceover-qa-panel";
import {
  HOOK_PACING_PRESETS,
  type HookPacingPresetId,
} from "@/lib/hook-replacement-patch";

type VideoDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    tab?: string;
    assetNotice?: string;
    assetNoticeType?: string;
    voiceoverNotice?: string;
    voiceoverNoticeType?: string;
    renderNotice?: string;
    renderNoticeType?: string;
    thumbnailNotice?: string;
    thumbnailNoticeType?: string;
    selectedTopicIdeaId?: string;
    hookWindowSec?: string;
    deepVoiceoverQa?: string;
  }>;
};

export const dynamic = "force-dynamic";

function thumbnailBriefValue(value: unknown, key: string, fallback = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const candidate = (value as Record<string, unknown>)[key];

  if (typeof candidate === "string") {
    return candidate;
  }

  if (Array.isArray(candidate)) {
    return candidate.filter((item) => typeof item === "string").join("\n");
  }

  return fallback;
}

function thumbnailPreviewUrl(videoId: string, imageUrl: string | null, imagePath: string | null) {
  const cleanUrl = imageUrl?.trim();

  if (cleanUrl) {
    return cleanUrl;
  }

  const normalizedPath = imagePath?.trim().replace(/\\/g, "/") ?? "";
  const prefix = `storage/thumbnails/${videoId}/`;

  if (normalizedPath.startsWith(prefix)) {
    return `/api/thumbnails/${videoId}/${encodeURIComponent(
      normalizedPath.slice(prefix.length),
    )}`;
  }

  return "";
}

export default async function VideoDetailPage({
  params,
  searchParams,
}: VideoDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const renderDiagnostics = await getRenderDiagnostics(id);

  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      scenes: {
        orderBy: { sortOrder: "asc" },
      },
      imageBatches: {
        orderBy: { createdAt: "desc" },
        take: 5,
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
    notFound();
  }

  const computedStatus = getComputedVideoStatus(video);
  const sceneStats = getSceneStats(video.scenes);
  const channel = getChannelProfile(video.channelKey);
  const duplicateSceneGroups = findDuplicateSceneGroups(video.scenes);
  const duplicateImageGroups = findDuplicateImageGroups(video.scenes);
  const hookWindowSec = resolveHookWindowSeconds(query?.hookWindowSec);
  const hookReview = buildHookReviewData(video.scenes, hookWindowSec);
  const hookRange = {
    fromOrder: hookReview.scenes[0]?.sortOrder ?? 1,
    toOrder:
      hookReview.scenes[hookReview.scenes.length - 1]?.sortOrder ??
      hookReview.scenes[0]?.sortOrder ??
      1,
  };
  const defaultHookPacing: HookPacingPresetId =
    channel.key === "wealth-insights" ? "balanced" : "balanced";
  const hookOptimizationPacks = await buildHookOptimizationPacks({
    video,
    channel,
    hookReview,
    hookRange,
  });
  const pendingPromptPatchJson = JSON.stringify(
    {
      videoId: video.id,
      patch: video.scenes
        .filter((scene) => !scene.imagePrompt?.trim())
        .map((scene) => ({
          id: scene.id,
          order: scene.sortOrder,
          visualIdea: scene.visualIdea ?? "",
          imagePrompt: "",
          status: scene.status,
        })),
    },
    null,
    2,
  );
  const wealthTopicSystem =
    channel.key === "wealth-insights" && channel.topicSystem?.enabled
      ? channel.topicSystem
      : null;
  const selectedTopicCategory = getChannelTopicCategory(
    channel.key,
    video.topicCategory,
  );
  const suggestedTopicCategory = getWealthInsightsSuggestedCategory();
  const recentWealthCategories = wealthTopicSystem
    ? await prisma.video.findMany({
        where: {
          channelKey: "wealth-insights",
          id: { not: video.id },
          topicCategory: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          topicCategory: true,
        },
      })
    : [];
  let ideaJsonTopicIdeaId: string | null = null;

  if (video.ideaJson) {
    try {
      const parsedIdeaJson = JSON.parse(video.ideaJson) as unknown;

      if (
        parsedIdeaJson &&
        typeof parsedIdeaJson === "object" &&
        !Array.isArray(parsedIdeaJson) &&
        typeof (parsedIdeaJson as { topicIdeaId?: unknown }).topicIdeaId === "string"
      ) {
        ideaJsonTopicIdeaId = (parsedIdeaJson as { topicIdeaId: string }).topicIdeaId;
      }
    } catch {
      ideaJsonTopicIdeaId = null;
    }
  }

  const sourceTopicIdea = wealthTopicSystem
    ? await prisma.topicIdea.findFirst({
        where: {
          channelKey: "wealth-insights",
          OR: [
            { createdVideoId: video.id },
            ...(query?.selectedTopicIdeaId ? [{ id: query.selectedTopicIdeaId }] : []),
            ...(ideaJsonTopicIdeaId ? [{ id: ideaJsonTopicIdeaId }] : []),
          ],
        },
        orderBy: { updatedAt: "desc" },
      })
    : null;
  const defaultVoiceoverSpeed =
    channel.voiceoverSpeedDefault ?? DEFAULT_ELEVENLABS_SPEED;
  const channelOptions = getChannelOptions();

  if (video.status !== computedStatus) {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: computedStatus },
    });
  }

  const promptUrl = (kind: string) => `/api/videos/${video.id}/prompts/${kind}`;
  const assetNotice: { type: "error" | "success"; message: string } | null = query?.assetNotice
    ? {
        message: query.assetNotice,
        type: query.assetNoticeType === "success" ? "success" : "error",
      }
    : null;
  const voiceoverNotice: { type: "error" | "success"; message: string } | null =
    query?.voiceoverNotice
      ? {
          message: query.voiceoverNotice,
          type: query.voiceoverNoticeType === "success" ? "success" : "error",
        }
      : null;
  const renderNotice: { type: "error" | "success"; message: string } | null =
    query?.renderNotice
      ? {
          message: query.renderNotice,
          type: query.renderNoticeType === "success" ? "success" : "error",
        }
      : null;
  const thumbnailNotice: { type: "error" | "success"; message: string } | null =
    query?.thumbnailNotice
      ? {
          message: query.thumbnailNotice,
          type: query.thumbnailNoticeType === "success" ? "success" : "error",
        }
      : null;

  const nextSceneOrder =
    video.scenes.length > 0
      ? Math.max(...video.scenes.map((scene) => scene.sortOrder)) + 1
      : 1;
  const formattedSubtitleCues = parseFormattedSubtitleCues(
    video.formattedSubtitleJson,
  );
  const formattedSrt = exportCuesToSrt(formattedSubtitleCues);
  const formattedVtt = exportCuesToVtt(formattedSubtitleCues);
  const formattedAss =
    video.styledSubtitleAss ?? exportActiveWordCaptionsToAss(formattedSubtitleCues);
  const activeWordCaptionJson = JSON.stringify(
    video.styledSubtitleJson ??
      exportActiveWordCaptionsToJson(formattedSubtitleCues),
    null,
    2,
  );
  const captionStats = getCaptionStats(formattedSubtitleCues);
  const sceneTimeline = buildSceneTimeline(video.scenes);
  const previewSubtitleCues = formattedSubtitleCues.filter((cue) => cue.start < 60);
  const defaultTab =
    query?.tab === "assets"
      ? "assets"
      : query?.tab === "voiceover"
      ? "voiceover"
      : query?.tab === "render-draft"
        ? "render-draft"
        : query?.tab === "thumbnail"
          ? "thumbnail"
          : "idea";
  const voiceoverAndSubtitlesReady =
    video.voiceoverStatus === "ready" && video.subtitleStatus === "ready";
  const elevenLabsSettingsFormId = `elevenlabs-settings-${video.id}`;
  const defaultVoiceId = getDefaultElevenLabsVoiceId();
  const defaultModelId = getDefaultElevenLabsModelId();
  const segmentSubtitlesFormId = `segment-subtitles-${video.id}`;
  const thumbnailBriefFormId = `thumbnail-brief-${video.id}`;
  const thumbnailConcepts = parseThumbnailConcepts(video.thumbnailVariationsJson);
  const activeThumbnailConcept = parseThumbnailConcept(video.thumbnailConceptJson);
  const thumbnailBriefSource =
    activeThumbnailConcept ? conceptToBrief(activeThumbnailConcept) : video.thumbnailConceptJson;
  const thumbnailAvoid =
    thumbnailBriefValue(
      thumbnailBriefSource,
      "avoid",
      "busy background\nsmall text\nphotorealism\n3D render\ntoo many objects\ncopyrighted characters\ncopied channel branding",
    );
  const thumbnailBriefJson = JSON.stringify(thumbnailBriefSource ?? {}, null, 2);
  const thumbnailPreviewSrc = thumbnailPreviewUrl(
    video.id,
    video.thumbnailImageUrl,
    video.thumbnailImagePath,
  );
  const subtitleSegmentByVoiceoverId = new Map(
    video.subtitleSegments.map((segment) => [segment.voiceoverSegmentId, segment]),
  );
  const missingSubtitleSegmentCount = video.voiceoverSegments.filter(
    (segment) =>
      !subtitleSegmentByVoiceoverId.has(segment.id) ||
      parseFormattedSubtitleCues(
        subtitleSegmentByVoiceoverId.get(segment.id)?.localCuesJson,
      ).length === 0,
  ).length;
  const hasMissingSegmentDurations = video.voiceoverSegments.some(
    (segment) => !segment.durationSec,
  );
  const hasOutdatedSubtitleSegments = video.voiceoverSegments.some((segment) => {
    const subtitleSegment = subtitleSegmentByVoiceoverId.get(segment.id);

    return Boolean(
      subtitleSegment && subtitleSegment.updatedAt < segment.updatedAt,
    );
  });
  const sceneVoiceoverGeneratedCount = video.scenes.filter((scene) =>
    ["generated", "attached"].includes(scene.voiceoverStatus ?? "none"),
  ).length;
  const sceneVoiceoverFailedCount = video.scenes.filter((scene) =>
    ["failed", "needs_retry"].includes(scene.voiceoverStatus ?? "none"),
  ).length;
  const sceneVoiceoverMissingCount = video.scenes.filter(
    (scene) => !scene.voiceoverLocalPath?.trim(),
  ).length;
  const sceneVoiceoverTotalDuration = video.scenes.reduce(
    (total, scene) => total + (scene.voiceoverDuration ?? 0),
    0,
  );
  const hasSceneVoiceoverMaster =
    video.voiceoverAudioPath?.includes("voiceover_by_scene_master") ?? false;
  const deepVoiceoverQaEnabled = query?.deepVoiceoverQa === "1";
  const voiceoverQaRows = await buildVoiceoverQaRows(
    video.scenes,
    deepVoiceoverQaEnabled,
  );
  const voiceoverQaSummary = summarizeVoiceoverQa(voiceoverQaRows);
  const masterVoiceoverAudioUrl = generatedAudioUrl(video.voiceoverAudioPath);
  const deepVoiceoverQaUrl = `/videos/${video.id}?tab=voiceover&deepVoiceoverQa=1#voiceover-qa`;
  const latestRenderDraft = video.renderDrafts[0] ?? null;
  const projectDraftPath = path.join("storage", "renders", video.id, "draft.mp4");
  const projectDraftCacheKey = await renderFileCacheKey(projectDraftPath);
  const projectDraftUrl = projectDraftCacheKey
    ? `/api/videos/${encodeURIComponent(video.id)}/draft-preview?v=${encodeURIComponent(
        projectDraftCacheKey,
      )}`
    : null;
  const imageReadyCount = video.scenes.filter(
    (scene) => scene.imageLocalPath || scene.imageFileName,
  ).length;
  const estimatedFinalDuration = video.voiceoverSegments.reduce(
    (total, segment) => total + (segment.durationSec ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      {assetNotice || voiceoverNotice || renderNotice || thumbnailNotice ? (
        <ClearQueryParams
          params={[
            "assetNotice",
            "assetNoticeType",
            "voiceoverNotice",
            "voiceoverNoticeType",
            "renderNotice",
            "renderNoticeType",
            "thumbnailNotice",
            "thumbnailNoticeType",
          ]}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link href="/">
            <ArrowLeft />
            Back
          </Link>
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-normal">
                {video.title}
              </h1>
              <Badge>{statusLabel(computedStatus)}</Badge>
              <Badge variant="outline">Channel: {channel.name}</Badge>
            </div>

            <p className="max-w-3xl text-sm text-muted-foreground">
              {video.topic}
            </p>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>Created {formatDate(video.createdAt)}</span>
              <span>Updated {formatDate(video.updatedAt)}</span>
              <span>{video.scenes.length} scenes</span>
            </div>
          </div>

          <form
            action={deleteVideo.bind(null, video.id)}
            className="flex flex-col items-start gap-2"
          >
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                name="confirmProjectDelete"
                type="checkbox"
                required
                className="size-4 rounded border-input"
              />
              Delete files too
            </label>
            <Button type="submit" variant="destructive">
              <Trash2 />
              Delete project
            </Button>
          </form>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Computed status</CardTitle>
            <CardDescription>
              Automatically calculated from idea, script, scenes, image
              prompts, and metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge>{statusLabel(computedStatus)}</Badge>
            {video.status !== computedStatus ? (
              <span className="text-sm text-muted-foreground">
                Stored status updated from {statusLabel(video.status)}.
              </span>
            ) : null}
          </CardContent>
        </Card>

        <ExportVideoPackageButton
          exportUrl={`/api/videos/${video.id}/export-package`}
        />
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="idea">Idea</TabsTrigger>
          <TabsTrigger value="script">Script</TabsTrigger>
          <TabsTrigger value="visual-plan">Visual Plan</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="voiceover">Voiceover & Subtitles</TabsTrigger>
          <TabsTrigger value="render-draft">Render Draft</TabsTrigger>
          <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="idea" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Idea</CardTitle>
              <CardDescription>
                Keep the Angle Builder output with the raw topic and working
                title.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={updateVideoIdea.bind(null, video.id)}
                className="space-y-5"
              >
                <div className="grid gap-2">
                  <Label htmlFor="channelKey">Channel</Label>
                  <select
                    id="channelKey"
                    name="channelKey"
                    defaultValue={channel.key}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    {channelOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Changing the channel affects future copied prompts, but does not automatically rewrite existing script, scenes, metadata, or images.
                  </p>
                </div>

                {wealthTopicSystem ? (
                  <div className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
                    <div className="grid gap-2">
                      <Label htmlFor="topicCategory">
                        Wealth Insights Topic Category
                      </Label>
                      <select
                        id="topicCategory"
                        name="topicCategory"
                        defaultValue={video.topicCategory ?? ""}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">No category selected</option>
                        {wealthTopicSystem.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Suggested today: {suggestedTopicCategory?.label ?? "None"}
                      </p>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {selectedTopicCategory?.label ??
                            "Select a category to guide the angle."}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {selectedTopicCategory?.description ??
                            "The weekly suggestion is optional. Override it whenever the topic calls for a different finance lane."}
                        </p>
                      </div>

                      {recentWealthCategories.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Recent Wealth Insights categories
                          </p>
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {recentWealthCategories.map((recentVideo) => {
                              const recentCategory = getChannelTopicCategory(
                                "wealth-insights",
                                recentVideo.topicCategory,
                              );

                              return (
                                <li key={recentVideo.id}>
                                  {recentCategory?.label ??
                                    recentVideo.topicCategory}
                                  {" · "}
                                  {recentVideo.title}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No recent Wealth Insights categories saved yet.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="topic">Topic</Label>
                  <Input
                    id="topic"
                    name="topic"
                    defaultValue={video.topic}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={video.title}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ideaJson">Idea JSON</Label>
                  <JsonTextarea
                    id="ideaJson"
                    name="ideaJson"
                    className="min-h-80 font-mono text-sm"
                    defaultValue={video.ideaJson ?? ""}
                    placeholder='{"rawIdea": "", "workingTitle": "", "coreAngle": ""}'
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <CopyPromptButton
                    label={`Copy Angle Builder Prompt — ${channel.name}`}
                    promptUrl={promptUrl("angle-builder")}
                  />

                  <Button type="submit">Save idea</Button>

                  <Button
                    type="submit"
                    variant="outline"
                    formAction={mockGenerateIdea.bind(null, video.id)}
                  >
                    <Sparkles />
                    Mock angle builder
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {sourceTopicIdea ? (
            <Card>
              <CardHeader>
                <CardTitle>Source Topic</CardTitle>
                <CardDescription>
                  This video was started from a Wealth Insights topic idea.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">
                      {sourceTopicIdea.title}
                    </h3>
                    <Badge variant="outline">
                      {getChannelTopicCategory(
                        "wealth-insights",
                        sourceTopicIdea.category,
                      )?.label ?? sourceTopicIdea.category}
                    </Badge>
                    <Badge variant="muted">{sourceTopicIdea.status}</Badge>
                  </div>

                  <dl className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        Topic
                      </dt>
                      <dd className="mt-1">{sourceTopicIdea.topic}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        Trigger
                      </dt>
                      <dd className="mt-1">{sourceTopicIdea.trigger ?? ""}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        Promise
                      </dt>
                      <dd className="mt-1">{sourceTopicIdea.promise ?? ""}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        Unique mechanism
                      </dt>
                      <dd className="mt-1">{sourceTopicIdea.uniqueMechanism ?? ""}</dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        Visual hook
                      </dt>
                      <dd className="mt-1">{sourceTopicIdea.visualHook ?? ""}</dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-xs font-semibold uppercase text-muted-foreground">
                        Thumbnail idea
                      </dt>
                      <dd className="mt-1">{sourceTopicIdea.thumbnailIdea ?? ""}</dd>
                    </div>
                  </dl>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="script">
          <Card>
            <CardHeader>
              <CardTitle>Script</CardTitle>
              <CardDescription>
                Draft and revise the narration text locally.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={updateVideoScript.bind(null, video.id)}
                className="space-y-5"
              >
                <div className="grid gap-2">
                  <Label htmlFor="script">Script</Label>
                  <Textarea
                    id="script"
                    name="script"
                    className="min-h-80 font-mono text-sm"
                    defaultValue={video.script ?? ""}
                    placeholder="Write the full script here..."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <CopyPromptButton
                    label={`Copy Script Writer Request — ${channel.name}`}
                    promptUrl={promptUrl("script-writer")}
                  />

                  <Button type="submit">Save script</Button>

                  <Button
                    type="submit"
                    variant="outline"
                    formAction={mockGenerateScript.bind(null, video.id)}
                  >
                    <Sparkles />
                    Mock generate script
                  </Button>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Copies the full script request, including the channel rules and the current idea.
                  </p>
                  {!video.ideaJson?.trim() ? (
                    <p className="text-destructive">
                      Warning: this video has no Idea JSON yet. Add or generate an idea before copying the script request.
                    </p>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visual-plan">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Visual Plan Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryItem label="Scenes" value={sceneStats.totalScenes} />
                  <SummaryItem
                    label="Estimated duration"
                    value={formatDuration(sceneStats.totalDurationSeconds)}
                  />
                  <SummaryItem
                    label="Average scene duration"
                    value={`${sceneStats.averageDurationSeconds.toFixed(1)}s`}
                  />
                  <SummaryItem
                    label="Image prompts"
                    value={`${sceneStats.scenesWithImagePrompts} / ${sceneStats.totalScenes}`}
                  />
                  <SummaryItem
                    label="Missing prompts"
                    value={sceneStats.scenesMissingImagePrompts}
                  />
                  <SummaryItem
                    label="Avatars"
                    value={formatSceneTypeShare(
                      sceneStats.avatarScenes,
                      sceneStats.totalScenes,
                    )}
                  />
                  <SummaryItem
                    label="Inserts"
                    value={formatSceneTypeShare(
                      sceneStats.insertScenes,
                      sceneStats.totalScenes,
                    )}
                  />
                  <SummaryItem
                    label="Space"
                    value={formatSceneTypeShare(
                      sceneStats.spaceScenes,
                      sceneStats.totalScenes,
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scene Cleanup</CardTitle>
                <CardDescription>
                  Delete duplicate or damaged scene ranges, then reindex the visual plan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  action={deleteSceneRange.bind(null, video.id)}
                  className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-[140px_140px_1fr_auto]"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="deleteFromOrder">From scene</Label>
                    <Input
                      id="deleteFromOrder"
                      name="deleteFromOrder"
                      type="number"
                      min="1"
                      max={video.scenes.length}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="deleteToOrder">To scene</Label>
                    <Input
                      id="deleteToOrder"
                      name="deleteToOrder"
                      type="number"
                      min="1"
                      max={video.scenes.length}
                    />
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      name="confirmSceneRangeDelete"
                      className="size-4"
                    />
                    Confirm range delete
                  </label>
                  <div className="flex items-end">
                    <Button type="submit" variant="outline">
                      <Trash2 />
                      Delete range
                    </Button>
                  </div>
                </form>

                {duplicateSceneGroups.length > 0 ? (
                  <form action={deleteSelectedScenes.bind(null, video.id)} className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Found {duplicateSceneGroups.length} duplicate narration group
                      {duplicateSceneGroups.length === 1 ? "" : "s"}. Keep the first occurrence unless the later one is intentional.
                    </div>
                    <div className="max-h-[360px] overflow-auto rounded-md border">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-background">
                          <tr className="border-b">
                            <th className="px-3 py-2 font-medium">Delete</th>
                            <th className="px-3 py-2 font-medium">Scene</th>
                            <th className="px-3 py-2 font-medium">Duplicate text</th>
                            <th className="px-3 py-2 font-medium">All occurrences</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicateSceneGroups.flatMap((group) =>
                            group.scenes.slice(1).map((scene) => (
                              <tr key={scene.id} className="border-b align-top">
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    name="selectedSceneIds"
                                    value={scene.id}
                                    defaultChecked
                                    className="size-4"
                                  />
                                </td>
                                <td className="px-3 py-2">{scene.sortOrder}</td>
                                <td className="px-3 py-2">{group.preview}</td>
                                <td className="px-3 py-2">
                                  {group.scenes.map((item) => item.sortOrder).join(", ")}
                                </td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Button type="submit" variant="outline">
                      <Trash2 />
                      Delete selected duplicates
                    </Button>
                  </form>
                ) : (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    No exact duplicate scene narration found.
                  </div>
                )}

                {duplicateImageGroups.length > 0 ? (
                  <form
                    action={resetSelectedImageReferences.bind(null, video.id)}
                    className="space-y-3"
                  >
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Found {duplicateImageGroups.length} duplicated image file reference
                      {duplicateImageGroups.length === 1 ? "" : "s"}. Later occurrences are selected by default because they are usually shifted after scene insertion or deletion.
                    </div>
                    <div className="max-h-[360px] overflow-auto rounded-md border">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-background">
                          <tr className="border-b">
                            <th className="px-3 py-2 font-medium">Reset</th>
                            <th className="px-3 py-2 font-medium">Scene</th>
                            <th className="px-3 py-2 font-medium">Image file</th>
                            <th className="px-3 py-2 font-medium">Scene text</th>
                            <th className="px-3 py-2 font-medium">All occurrences</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicateImageGroups.flatMap((group) =>
                            group.scenes.slice(1).map((scene) => (
                              <tr key={scene.id} className="border-b align-top">
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    name="selectedSceneIds"
                                    value={scene.id}
                                    defaultChecked
                                    className="size-4"
                                  />
                                </td>
                                <td className="px-3 py-2">{scene.sortOrder}</td>
                                <td className="px-3 py-2 break-all">{group.fileName}</td>
                                <td className="px-3 py-2">{scene.preview}</td>
                                <td className="px-3 py-2">
                                  {group.scenes.map((item) => item.sortOrder).join(", ")}
                                </td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Button type="submit" variant="outline">
                      <ImageIcon />
                      Reset selected image refs
                    </Button>
                  </form>
                ) : (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    No duplicated image file references found.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hook Review</CardTitle>
                <CardDescription>
                  Diagnose opening pacing, export a batch optimization pack, then import a replacement patch for the selected hook range.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {[15, 30, 60, 120].map((preset) => (
                    <Link
                      key={preset}
                      href={`/videos/${video.id}?tab=visual-plan&hookWindowSec=${preset}`}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        hookWindowSec === preset
                          ? "border-foreground bg-foreground text-background"
                          : "bg-background"
                      }`}
                    >
                      {preset}s
                    </Link>
                  ))}
                  <form method="get" action={`/videos/${video.id}`} className="flex items-center gap-2">
                    <input type="hidden" name="tab" value="visual-plan" />
                    <Input
                      name="hookWindowSec"
                      type="number"
                      min="5"
                      max="300"
                      defaultValue={hookWindowSec}
                      className="w-28"
                    />
                    <Button type="submit" variant="outline">
                      Custom
                    </Button>
                  </form>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <SummaryItem label="Hook scenes" value={hookReview.scenes.length} />
                  <SummaryItem
                    label="Selected duration"
                    value={formatDuration(hookReview.totalDurationSeconds)}
                  />
                  <SummaryItem
                    label="Average scene"
                    value={`${hookReview.averageDurationSeconds.toFixed(1)}s`}
                  />
                  <SummaryItem
                    label="Over 5.5s"
                    value={hookReview.over55Count}
                  />
                  <SummaryItem
                    label="Over 6.5s"
                    value={hookReview.over65Count}
                  />
                  <SummaryItem
                    label="Critical 8s+"
                    value={hookReview.criticalCount}
                  />
                </div>

                {hookReview.criticalCount > 0 ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    {hookReview.criticalCount} hook scene
                    {hookReview.criticalCount === 1 ? "" : "s"} are at or above 8 seconds. These are the first places to split or tighten.
                  </div>
                ) : hookReview.over65Count > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {hookReview.over65Count} hook scene
                    {hookReview.over65Count === 1 ? "" : "s"} currently exceed 6.5 seconds. The pacing is likely dragging in the opening beats.
                  </div>
                ) : hookReview.over55Count > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {hookReview.over55Count} hook scene
                    {hookReview.over55Count === 1 ? "" : "s"} exceed 5.5 seconds. These are worth checking before regenerating voiceover or render.
                  </div>
                ) : (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    The current hook selection is pacing cleanly.
                  </div>
                )}

                {hookReview.scenes.length > 0 ? (
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="px-3 py-2 font-medium">Scene</th>
                          <th className="px-3 py-2 font-medium">Cumulative</th>
                          <th className="px-3 py-2 font-medium">Duration</th>
                          <th className="px-3 py-2 font-medium">Script</th>
                          <th className="px-3 py-2 font-medium">Warnings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hookReview.scenes.map((scene) => (
                          <tr key={scene.id} className="border-b align-top">
                            <td className="px-3 py-2">{scene.sortOrder}</td>
                            <td className="px-3 py-2">
                              {scene.startTimeSec.toFixed(1)}s -{" "}
                              {scene.endTimeSec.toFixed(1)}s
                            </td>
                            <td className="px-3 py-2">{scene.duration ?? 0}s</td>
                            <td className="px-3 py-2">{scene.scriptText}</td>
                            <td className="px-3 py-2">
                              {scene.warnings.length > 0
                                ? scene.warnings.map((warning) => warning.text).join(", ")
                                : "OK"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {hookReview.scenes.length > 0 ? (
                  <HookAutoFixPanel
                    action={importHookReplacementPatch.bind(null, video.id)}
                    videoId={video.id}
                    selectedFromOrder={hookRange.fromOrder}
                    selectedToOrder={hookRange.toOrder}
                    currentScenes={video.scenes.map((scene) => ({
                      order: scene.sortOrder,
                      scriptText: scene.scriptText,
                      duration: scene.duration,
                    }))}
                    optimizationPacks={hookOptimizationPacks}
                    defaultPacing={defaultHookPacing}
                  />
                ) : null}

                <div className="rounded-md border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-medium">Pending Prompt Regeneration</h3>
                      <p className="text-sm text-muted-foreground">
                        Scenes with empty image prompts are ready to export into the existing Bulk Scene Patch flow.
                      </p>
                    </div>
                    <CopyPromptButton
                      label="Copy Pending Patch JSON"
                      prompt={pendingPromptPatchJson}
                    />
                  </div>
                </div>

                <details className="rounded-md border bg-muted/20 p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Advanced manual editing
                  </summary>
                  <div className="mt-4 grid gap-3">
                    {hookReview.scenes.length > 0 ? (
                      hookReview.scenes.map((scene) => (
                        <HookSceneReviewCard
                          key={scene.id}
                          scene={scene}
                          editAction={updateScene.bind(null, scene.id, video.id)}
                          splitAction={splitHookScene.bind(null, scene.id, video.id)}
                          mergePreviousAction={mergeSceneWithPrevious.bind(
                            null,
                            scene.id,
                            video.id,
                          )}
                          mergeNextAction={mergeSceneWithNext.bind(
                            null,
                            scene.id,
                            video.id,
                          )}
                          regenerateAction={markSceneForPromptRegeneration.bind(
                            null,
                            scene.id,
                            video.id,
                          )}
                          hasPrevious={scene.hasPrevious}
                          hasNext={scene.hasNext}
                        />
                      ))
                    ) : (
                      <div className="rounded-md border px-4 py-6 text-sm text-muted-foreground">
                        Add or import scenes to review the hook.
                      </div>
                    )}
                  </div>
                </details>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Import Scenes</CardTitle>
                <CardDescription>
                  This is a manual workflow. Copy the Visual Planner Prompt,
                  generate the scenes externally, then paste the resulting JSON
                  here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ImportScenesForm
                  action={importScenes.bind(null, video.id)}
                  visualPlanPromptUrl={promptUrl("visual-planner")}
                  channelName={channel.name}
                  videoId={video.id}
                  videoTitle={video.title}
                  channelKey={channel.key}
                  projectBiblePath={channel.projectBiblePath}
                  imagePromptBiblePath={channel.imagePromptBiblePath}
                  characterBiblePath={channel.characterBiblePath}
                  visualPlannerPath={channel.prompts.visualPlanner}
                  scriptLength={video.script?.length ?? 0}
                  currentSceneCount={video.scenes.length}
                  currentScenesJson={JSON.stringify(
                    video.scenes.map((scene) => ({
                      scriptText: scene.scriptText,
                      sceneType: scene.sceneType,
                      visualPurpose: scene.visualPurpose ?? "",
                      visualIdea: scene.visualIdea ?? "",
                      duration: scene.duration ?? 8,
                      imagePrompt: scene.imagePrompt ?? "",
                      status: "planned",
                    })),
                    null,
                    2,
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bulk Scene Patch Import</CardTitle>
                <CardDescription>
                  Paste a targeted JSON patch to update the existing visual plan without replacing the full scene list.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScenePatchImporter
                  action={importScenePatch.bind(null, video.id)}
                  videoId={video.id}
                  channelKey={channel.key}
                  scenes={video.scenes.map((scene) => ({
                    id: scene.id,
                    sortOrder: scene.sortOrder,
                    scriptText: scene.scriptText,
                    visualIdea: scene.visualIdea,
                    imagePrompt: scene.imagePrompt,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add scene</CardTitle>
                <CardDescription>
                  Break the script into ordered visual beats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SceneForm
                  action={addScene.bind(null, video.id)}
                  submitLabel="Add scene"
                  defaultOrder={nextSceneOrder}
                />
              </CardContent>
            </Card>

            {video.scenes.map((scene) => (
              <Card key={scene.id} id={`scene-${scene.sortOrder}`}>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Scene {scene.sortOrder}</CardTitle>
                      <CardDescription>{scene.sceneType}</CardDescription>
                    </div>

                    <Badge variant="muted">{statusLabel(scene.status)}</Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <SceneForm
                    action={updateScene.bind(null, scene.id, video.id)}
                    submitLabel="Save scene"
                    defaultOrder={scene.sortOrder}
                    defaultScriptText={scene.scriptText}
                    defaultSceneType={scene.sceneType}
                    defaultVisualPurpose={scene.visualPurpose ?? ""}
                    defaultVisualIdea={scene.visualIdea ?? ""}
                    defaultImagePrompt={scene.imagePrompt ?? ""}
                    defaultDuration={scene.duration?.toString() ?? ""}
                    defaultImageUrl={scene.imageUrl ?? ""}
                    defaultStatus={scene.status}
                    footer={
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        formAction={deleteScene.bind(null, scene.id, video.id)}
                      >
                        <Trash2 />
                        Delete scene
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assets">
          <AssetsWorkflow
            videoId={video.id}
            defaultOutputFolder={generatedImagesDir(video.id, video.title)}
            notice={assetNotice}
            scenes={video.scenes.map((scene) => ({
              id: scene.id,
              sortOrder: scene.sortOrder,
              scriptText: scene.scriptText,
              sceneType: scene.sceneType,
              visualPurpose: scene.visualPurpose,
              visualIdea: scene.visualIdea,
              imagePrompt: scene.imagePrompt,
              duration: scene.duration,
              imageUrl: scene.imageUrl,
              imageLocalPath: scene.imageLocalPath,
              imageStatus: scene.imageStatus,
              imageError: scene.imageError,
              imageBatchId: scene.imageBatchId,
              imageFileName: scene.imageFileName,
              status: scene.status,
            }))}
            batches={video.imageBatches.map((batch) => ({
              id: batch.id,
              name: batch.name,
              status: batch.status,
              parallelCount: batch.parallelCount,
              outputFolder: batch.outputFolder,
              payloadPath: batch.payloadPath,
              logs: parseBatchLogs(batch.logsJson),
              createdAt: batch.createdAt.toISOString(),
            }))}
          />
        </TabsContent>

        <TabsContent value="voiceover">
          <div className="grid gap-4">
            {voiceoverNotice ? (
              <div
                className={
                  voiceoverNotice.type === "success"
                    ? "rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
                    : "rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                }
              >
                {voiceoverNotice.message}
              </div>
            ) : null}

            <div className="sticky top-2 z-10 flex flex-wrap gap-2 rounded-md border bg-background/95 p-2 text-sm shadow-sm backdrop-blur">
              <Button asChild variant="ghost" size="sm">
                <a href="#voiceover-overview">Overview</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#voiceover-by-scene">By Scene</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#voiceover-qa">Voiceover QA</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#segment-subtitles">Scene Subtitles</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#manual-subtitles">Manual Subtitles</a>
              </Button>
            </div>

            <Card id="voiceover-overview">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Voiceover & Subtitles</CardTitle>
                    <CardDescription>
                      Generate the voiceover manually in ElevenLabs, download
                      the final audio, then paste or import the SRT/VTT
                      subtitles here.
                    </CardDescription>
                  </div>
                  <Badge variant={voiceoverAndSubtitlesReady ? "default" : "outline"}>
                    {voiceoverAndSubtitlesReady
                      ? "Voiceover & Subtitles ready"
                      : "Render draft pending"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <SummaryItem
                  label="Voiceover"
                  value={statusLabel(video.voiceoverStatus)}
                />
                <SummaryItem
                  label="Subtitles"
                  value={statusLabel(video.subtitleStatus)}
                />
                <SummaryItem
                  label="Render draft"
                  value={statusLabel(video.renderDraftStatus)}
                />
                <SummaryItem
                  label="Duration"
                  value={
                    video.voiceoverDurationSec
                      ? formatDuration(Math.round(video.voiceoverDurationSec))
                      : "Not set"
                  }
                />
              </CardContent>
            </Card>

            <Card id="voiceover-by-scene">
              <CardHeader>
                <CardTitle>Voiceover</CardTitle>
                <CardDescription>
                  The by-scene workflow manages the master audio path automatically after stitching.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <SummaryItem
                      label="Master audio"
                      value={video.voiceoverAudioPath ? "Set" : "Not stitched"}
                    />
                    <SummaryItem
                      label="File"
                      value={video.voiceoverFileName ?? "Automatic after stitch"}
                    />
                    <SummaryItem
                      label="Duration"
                      value={
                        video.voiceoverDurationSec
                          ? formatDuration(Math.round(video.voiceoverDurationSec))
                          : "Automatic after stitch"
                      }
                    />
                  </div>

                  <details className="rounded-md border bg-muted/20 p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Advanced manual voiceover import
                    </summary>
                    <form
                      action={saveVoiceoverInfo.bind(null, video.id)}
                      className="mt-4 space-y-4"
                    >
                      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_180px]">
                        <div className="grid gap-2">
                          <Label htmlFor="voiceoverAudioPath">Audio path</Label>
                          <Input
                            id="voiceoverAudioPath"
                            name="voiceoverAudioPath"
                            defaultValue={video.voiceoverAudioPath ?? ""}
                            placeholder="storage/voiceovers/.../final-voiceover.mp3"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="voiceoverFileName">File name</Label>
                          <Input
                            id="voiceoverFileName"
                            name="voiceoverFileName"
                            defaultValue={video.voiceoverFileName ?? ""}
                            placeholder="Derived from audio path"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="voiceoverDurationSec">Duration sec</Label>
                          <Input
                            id="voiceoverDurationSec"
                            name="voiceoverDurationSec"
                            type="number"
                            min="0"
                            step="0.1"
                            defaultValue={video.voiceoverDurationSec ?? ""}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">
                          <Mic2 />
                          Save manual voiceover
                        </Button>
                        <Button
                          type="submit"
                          variant="outline"
                          formAction={markVoiceoverReady.bind(null, video.id)}
                        >
                          Mark voiceover ready
                        </Button>
                      </div>
                    </form>
                  </details>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Voiceover By Scene</CardTitle>
                    <CardDescription>
                      Generate one ElevenLabs clip per visual scene, then stitch a paced master voiceover.
                    </CardDescription>
                  </div>
                  <Badge variant={hasSceneVoiceoverMaster ? "default" : "outline"}>
                    {hasSceneVoiceoverMaster ? "Master stitched" : "Optional mode"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {video.scenes.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Generate or import a Visual Plan before using voiceover by scene.
                  </div>
                ) : null}

                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryItem label="Scenes" value={video.scenes.length} />
                  <SummaryItem label="Generated" value={sceneVoiceoverGeneratedCount} />
                  <SummaryItem label="Missing" value={sceneVoiceoverMissingCount} />
                  <SummaryItem label="Failed" value={sceneVoiceoverFailedCount} />
                  <SummaryItem
                    label="Scene audio duration"
                    value={
                      sceneVoiceoverTotalDuration > 0
                        ? formatDuration(Math.round(sceneVoiceoverTotalDuration))
                        : "Not detected"
                    }
                  />
                </div>

                <form id={elevenLabsSettingsFormId} className="grid gap-4 rounded-md border bg-muted/20 p-4 lg:grid-cols-4">
                  <div className="grid gap-2">
                    <Label htmlFor="voiceId">Voice ID</Label>
                    <Input
                      id="voiceId"
                      name="voiceId"
                      defaultValue={defaultVoiceId}
                      placeholder="ElevenLabs voice ID"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="modelId">Model ID</Label>
                    <Input
                      id="modelId"
                      name="modelId"
                      defaultValue={defaultModelId}
                      placeholder={DEFAULT_ELEVENLABS_MODEL_ID}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="outputFormat">Output format</Label>
                    <Input
                      id="outputFormat"
                      name="outputFormat"
                      defaultValue={DEFAULT_ELEVENLABS_OUTPUT_FORMAT}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="speed">Speed</Label>
                    <Input
                      id="speed"
                      name="speed"
                      type="number"
                      min="0.7"
                      max="1.2"
                      step="0.05"
                      defaultValue={defaultVoiceoverSpeed}
                    />
                  </div>
                  <input type="hidden" name="stability" value="0.5" />
                  <input type="hidden" name="similarityBoost" value="0.75" />
                </form>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="overwriteSceneVoiceovers"
                      form={elevenLabsSettingsFormId}
                    />
                    Overwrite existing
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="updateSceneDurationsFromAudio"
                      form={elevenLabsSettingsFormId}
                      defaultChecked
                    />
                    Update scene durations from audio
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    form={elevenLabsSettingsFormId}
                    disabled={video.scenes.length === 0}
                    formAction={generateSceneVoiceovers.bind(null, video.id)}
                  >
                    Generate all scene voiceovers
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={elevenLabsSettingsFormId}
                    disabled={sceneVoiceoverMissingCount === 0}
                    formAction={generateMissingSceneVoiceovers.bind(null, video.id)}
                  >
                    Generate missing scene voiceovers
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={elevenLabsSettingsFormId}
                    disabled={video.scenes.length === 0}
                    formAction={generateSelectedSceneVoiceovers.bind(null, video.id)}
                  >
                    Generate selected scene voiceovers
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={elevenLabsSettingsFormId}
                    disabled={video.scenes.length === 0}
                    formAction={retryFailedSceneVoiceovers.bind(null, video.id)}
                  >
                    Retry failed scenes
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={elevenLabsSettingsFormId}
                    disabled={sceneVoiceoverGeneratedCount === 0}
                    formAction={stitchSceneVoiceovers.bind(null, video.id)}
                  >
                    Stitch master voiceover
                  </Button>
                </div>

                <div className="max-h-[560px] overflow-auto rounded-md border">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Order</th>
                        <th className="px-3 py-2">Select</th>
                        <th className="px-3 py-2">Script preview</th>
                        <th className="px-3 py-2">Voiceover</th>
                        <th className="px-3 py-2">Duration</th>
                        <th className="px-3 py-2">Pause</th>
                        <th className="px-3 py-2">Audio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {video.scenes.length > 0 ? (
                        video.scenes.map((scene) => {
                          const audioUrl = generatedAudioUrl(scene.voiceoverLocalPath);

                          return (
                            <tr key={scene.id} className="border-t align-top">
                              <td className="px-3 py-3 font-medium">{scene.sortOrder}</td>
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  name="selectedSceneVoiceoverOrders"
                                  value={scene.sortOrder}
                                  form={elevenLabsSettingsFormId}
                                  className="size-4"
                                />
                              </td>
                              <td className="max-w-sm px-3 py-3">
                                <div className="line-clamp-3 whitespace-pre-line">
                                  {scene.scriptText}
                                </div>
                                {scene.voiceoverError ? (
                                  <p className="mt-2 text-xs text-destructive">
                                    {scene.voiceoverError}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="outline">
                                  {statusLabel(scene.voiceoverStatus ?? "none")}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                {scene.voiceoverDuration
                                  ? `${scene.voiceoverDuration.toFixed(1)}s`
                                  : "Not set"}
                              </td>
                              <td className="px-3 py-3">
                                {scene.pauseAfterMs ? `${scene.pauseAfterMs}ms` : "Auto"}
                              </td>
                              <td className="max-w-xs px-3 py-3">
                                {audioUrl ? (
                                  <audio controls src={audioUrl} className="w-56 max-w-full" />
                                ) : null}
                                <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                                  {scene.voiceoverLocalPath ?? "No audio yet"}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            className="px-3 py-8 text-center text-muted-foreground"
                            colSpan={7}
                          >
                            Generate or import a Visual Plan before using voiceover by scene.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card id="voiceover-qa">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Voiceover QA</CardTitle>
                    <CardDescription>
                      Review suspicious generated clips without listening through the full video.
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      voiceoverQaSummary.failed > 0 || voiceoverQaSummary.critical > 0
                        ? "outline"
                        : "default"
                    }
                  >
                    {voiceoverQaSummary.failed > 0 || voiceoverQaSummary.critical > 0
                      ? "Issues found"
                      : "QA looks good"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <VoiceoverQaPanel
                  rows={voiceoverQaRows}
                  summary={voiceoverQaSummary}
                  masterAudioUrl={masterVoiceoverAudioUrl}
                  elevenLabsSettingsFormId={elevenLabsSettingsFormId}
                  regenerateAction={generateSelectedSceneVoiceovers.bind(null, video.id)}
                  markOkAction={markSceneVoiceoverQaOk.bind(null, video.id)}
                  markNeedsReviewAction={markSceneVoiceoverNeedsReview.bind(null, video.id)}
                  useAudioDurationAction={updateSceneDurationFromVoiceover.bind(null, video.id)}
                  updateAllDurationsAction={updateAllSceneDurationsFromVoiceover.bind(null, video.id)}
                  deepQaUrl={deepVoiceoverQaUrl}
                  deepQaEnabled={deepVoiceoverQaEnabled}
                />
              </CardContent>
            </Card>

            <Card id="segment-subtitles">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Scene Subtitles</CardTitle>
                    <CardDescription>
                      Scene voiceovers are synced into one-scene subtitle jobs
                      after generation or stitching.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {statusLabel(video.subtitleStatus)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <form id={segmentSubtitlesFormId} className="hidden" />

                {video.voiceoverStatus !== "ready" ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Stitch the scene voiceover master before generating final subtitles.
                  </div>
                ) : null}
                {hasMissingSegmentDurations ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Some segment durations are missing. Offsets will use subtitle cue duration fallback.
                  </div>
                ) : null}
                {hasOutdatedSubtitleSegments ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Subtitles may be out of date. Regenerate subtitles for changed segments.
                  </div>
                ) : null}

                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryItem
                    label="Scene subtitle jobs"
                    value={video.subtitleSegments.length}
                  />
                  <SummaryItem
                    label="Combined cues"
                    value={captionStats.cueCount}
                  />
                  <SummaryItem
                    label="Missing segments"
                    value={missingSubtitleSegmentCount}
                  />
                  <SummaryItem
                    label="Subtitle duration"
                    value={formatDuration(
                      Math.round(captionStats.totalDurationSeconds),
                    )}
                  />
                  <SummaryItem
                    label="Avg words"
                    value={captionStats.averageWordsPerCue.toFixed(1)}
                  />
                  <SummaryItem
                    label="Long lines"
                    value={captionStats.longLineCount}
                  />
                  <SummaryItem
                    label="3+ lines"
                    value={captionStats.moreThanTwoLinesCount}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={updateSubtitleStylePreset.bind(null, video.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        name="captionStylePreset"
                        defaultValue={video.captionStylePreset}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {Object.values(CAPTION_STYLE_PRESETS).map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="outline">
                        Apply style
                      </Button>
                    </div>
                  </form>
                  <Button
                    type="submit"
                    form={segmentSubtitlesFormId}
                    formAction={generateSubtitlesForAllReadySegments.bind(
                      null,
                      video.id,
                    )}
                  >
                    Generate Scene Subtitles
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={segmentSubtitlesFormId}
                    formAction={applyCleanSubtitlePunctuation.bind(null, video.id)}
                  >
                    Apply Clean Punctuation
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={segmentSubtitlesFormId}
                    formAction={combineSegmentSubtitles.bind(null, video.id)}
                  >
                    Combine Scene Subtitles
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={segmentSubtitlesFormId}
                    formAction={markAllSubtitleSegmentsReady.bind(null, video.id)}
                  >
                    Mark Subtitles Ready
                  </Button>
                  <CopySubtitleButton label="Copy Combined SRT" text={formattedSrt} />
                  <CopySubtitleButton label="Copy Combined VTT" text={formattedVtt} />
                  <CopySubtitleButton label="Copy Combined ASS" text={formattedAss} />
                  <CopySubtitleButton
                    label="Copy Active Word JSON"
                    text={activeWordCaptionJson}
                  />
                </div>

                <div className="max-h-[520px] overflow-auto rounded-md border">
                  <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Job</th>
                        <th className="px-3 py-2">Scene</th>
                        <th className="px-3 py-2">Voiceover</th>
                        <th className="px-3 py-2">Subtitle</th>
                        <th className="px-3 py-2">Local cues</th>
                        <th className="px-3 py-2">Local duration</th>
                        <th className="px-3 py-2">Preview</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {video.voiceoverSegments.length > 0 ? (
                        video.voiceoverSegments.map((segment) => {
                          const subtitleSegment =
                            subtitleSegmentByVoiceoverId.get(segment.id);
                          const localCues = parseFormattedSubtitleCues(
                            subtitleSegment?.localCuesJson,
                          );
                          const localDuration = localCues.reduce(
                            (maxEnd, cue) => Math.max(maxEnd, cue.end),
                            0,
                          );

                          return (
                            <tr key={segment.id} className="border-t align-top">
                              <td className="px-3 py-3 font-medium">
                                {segment.index}
                              </td>
                              <td className="px-3 py-3">
                                {segment.sceneStartOrder}-{segment.sceneEndOrder}
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="outline">
                                  {statusLabel(segment.status)}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <Badge variant="outline">
                                  {statusLabel(
                                    subtitleSegment?.status ?? "pending",
                                  )}
                                </Badge>
                                {subtitleSegment?.error ? (
                                  <p className="mt-2 text-xs text-destructive">
                                    {subtitleSegment.error}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-3">{localCues.length}</td>
                              <td className="px-3 py-3">
                                {localDuration > 0
                                  ? `${localDuration.toFixed(1)}s`
                                  : "Not set"}
                              </td>
                              <td className="max-w-sm px-3 py-3">
                                <div className="space-y-2">
                                  {localCues.slice(0, 3).map((cue) => (
                                    <div
                                      key={cue.index}
                                      className="rounded-md border bg-muted/30 p-2"
                                    >
                                      <div className="font-mono text-[11px] text-muted-foreground">
                                        {secondsToTimestamp(cue.start, "srt")} -{" "}
                                        {secondsToTimestamp(cue.end, "srt")}
                                      </div>
                                      <div className="whitespace-pre-line">
                                        {cue.text}
                                      </div>
                                    </div>
                                  ))}
                                  {localCues.length === 0 ? (
                                    <span className="text-muted-foreground">
                                      No local captions yet.
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="submit"
                                    size="sm"
                                    form={segmentSubtitlesFormId}
                                    formAction={generateSubtitlesForSegment.bind(
                                      null,
                                      segment.id,
                                    )}
                                  >
                                    Generate Subtitles
                                  </Button>
                                  <Button
                                    type="submit"
                                    size="sm"
                                    variant="outline"
                                    form={segmentSubtitlesFormId}
                                    formAction={regenerateSubtitlesForSegment.bind(
                                      null,
                                      segment.id,
                                    )}
                                  >
                                    Regenerate Subtitles
                                  </Button>
                                  {subtitleSegment ? (
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant="outline"
                                      form={segmentSubtitlesFormId}
                                      formAction={markSubtitleSegmentReady.bind(
                                        null,
                                        subtitleSegment.id,
                                      )}
                                    >
                                      Mark Subtitle Ready
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            className="px-3 py-8 text-center text-muted-foreground"
                            colSpan={8}
                          >
                            Generate and stitch scene voiceovers before generating subtitles.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Index</th>
                        <th className="px-3 py-2">Start</th>
                        <th className="px-3 py-2">End</th>
                        <th className="px-3 py-2">Scene</th>
                        <th className="px-3 py-2">Global preview</th>
                        <th className="px-3 py-2">Words</th>
                        <th className="px-3 py-2">Style</th>
                        <th className="px-3 py-2">Warnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewSubtitleCues.map((cue) => {
                        const analysis = analyzeSubtitlePreviewCue(cue, sceneTimeline);

                        return (
                        <tr key={cue.index} className="border-t">
                          <td className="px-3 py-2 font-medium">{cue.index}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {secondsToTimestamp(cue.start, "srt")}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {secondsToTimestamp(cue.end, "srt")}
                          </td>
                          <td className="px-3 py-2">{analysis.sceneOrder ?? "-"}</td>
                          <td className="whitespace-pre-line px-3 py-2">
                            <ActiveWordStaticPreview cue={cue} />
                          </td>
                          <td className="px-3 py-2">
                            {getCueWords(cue).length || cue.rawText.split(/\s+/).filter(Boolean).length}
                          </td>
                          <td className="px-3 py-2">
                            {"style" in cue && typeof cue.style === "string"
                              ? cue.style
                              : "plain"}
                          </td>
                          <td className="px-3 py-2">
                            {analysis.warnings.length > 0
                              ? analysis.warnings.join(" ")
                              : "OK"}
                          </td>
                        </tr>
                      )})}
                      {formattedSubtitleCues.length === 0 ? (
                        <tr>
                          <td
                            className="px-3 py-8 text-center text-muted-foreground"
                            colSpan={8}
                          >
                            Combine segment subtitles to preview the global track.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card id="manual-subtitles">
              <CardHeader>
                <CardTitle>Subtitles</CardTitle>
                <CardDescription>
                  Recommended caption style: complete subtitles split into
                  short, visual, easy-to-read blocks. Do not format subtitles
                  before the final voiceover is locked, because timing depends
                  on the final audio.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  action={saveRawSubtitles.bind(null, video.id)}
                  className="space-y-4"
                >
                  <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                    <div className="grid gap-2">
                      <Label htmlFor="rawSubtitleFormat">Format</Label>
                      <select
                        id="rawSubtitleFormat"
                        name="rawSubtitleFormat"
                        defaultValue={video.rawSubtitleFormat ?? "auto"}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="auto">Auto</option>
                        <option value="srt">SRT</option>
                        <option value="vtt">VTT</option>
                      </select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="rawSubtitleText">Raw SRT/VTT</Label>
                      <Textarea
                        id="rawSubtitleText"
                        name="rawSubtitleText"
                        className="min-h-72 font-mono text-sm"
                        defaultValue={video.rawSubtitleText ?? ""}
                        placeholder={
                          "1\n00:00:01,000 --> 00:00:03,500\nPaste final ElevenLabs subtitles here..."
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline">
                      Save raw subtitles
                    </Button>
                    <Button
                      type="submit"
                      formAction={parseAndFormatSubtitles.bind(null, video.id)}
                    >
                      Parse subtitles
                    </Button>
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={parseAndFormatSubtitles.bind(null, video.id)}
                    >
                      Format captions
                    </Button>
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={markSubtitlesReady.bind(null, video.id)}
                    >
                      Mark subtitles ready
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Caption Preview</CardTitle>
                    <CardDescription>
                      Formatted captions keep the original timing and apply
                      short readable line breaks.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopySubtitleButton label="Copy SRT" text={formattedSrt} />
                    <CopySubtitleButton label="Copy VTT" text={formattedVtt} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <SummaryItem label="Cues" value={captionStats.cueCount} />
                  <SummaryItem
                    label="Subtitle duration"
                    value={formatDuration(
                      Math.round(captionStats.totalDurationSeconds),
                    )}
                  />
                  <SummaryItem
                    label="Avg words"
                    value={captionStats.averageWordsPerCue.toFixed(1)}
                  />
                  <SummaryItem
                    label="Long lines"
                    value={captionStats.longLineCount}
                  />
                  <SummaryItem
                    label="3+ lines"
                    value={captionStats.moreThanTwoLinesCount}
                  />
                </div>

                <div className="max-h-[520px] overflow-auto rounded-md border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Index</th>
                        <th className="px-3 py-2">Start</th>
                        <th className="px-3 py-2">End</th>
                        <th className="px-3 py-2">Text preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formattedSubtitleCues.length > 0 ? (
                        formattedSubtitleCues.map((cue) => (
                          <tr key={cue.index} className="border-t">
                            <td className="px-3 py-2 font-medium">
                              {cue.index}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {secondsToTimestamp(cue.start, "srt")}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {secondsToTimestamp(cue.end, "srt")}
                            </td>
                            <td className="whitespace-pre-line px-3 py-2">
                              {cue.text}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            className="px-3 py-8 text-center text-muted-foreground"
                            colSpan={4}
                          >
                            Paste SRT/VTT subtitles and format captions to see a preview.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="render-draft">
          <div className="grid gap-4">
            {renderNotice ? (
              <div
                className={
                  renderNotice.type === "success"
                    ? "rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
                    : "rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                }
              >
                {renderNotice.message}
              </div>
            ) : null}

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Render Draft</CardTitle>
                    <CardDescription>
                      Create a local 1920x1080 draft MP4 from scene images,
                      segmented voiceover audio, and active-word ASS captions.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {statusLabel(video.renderDraftStatus)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryItem label="Scenes" value={video.scenes.length} />
                  <SummaryItem
                    label="Images ready"
                    value={`${imageReadyCount} / ${video.scenes.length}`}
                  />
                  <SummaryItem
                    label="Voiceover segments"
                    value={video.voiceoverSegments.length}
                  />
                  <SummaryItem
                    label="Voiceover"
                    value={statusLabel(video.voiceoverStatus)}
                  />
                  <SummaryItem
                    label="Subtitles"
                    value={statusLabel(video.subtitleStatus)}
                  />
                  <SummaryItem
                    label="ASS captions"
                    value={video.styledSubtitleAss ? "Available" : "Missing"}
                  />
                  <SummaryItem
                    label="Estimated duration"
                    value={
                      estimatedFinalDuration > 0
                        ? formatDuration(Math.round(estimatedFinalDuration))
                        : "Not set"
                    }
                  />
                  <SummaryItem
                    label="Latest render"
                    value={latestRenderDraft ? statusLabel(latestRenderDraft.status) : "None"}
                  />
                </div>

                {voiceoverQaSummary.failed > 0 || voiceoverQaSummary.critical > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p>
                        Voiceover QA found issues before render: {voiceoverQaSummary.failed} failed,{" "}
                        {voiceoverQaSummary.critical} critical.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href="#voiceover-qa">Open Voiceover QA</a>
                        </Button>
                        <span className="rounded-md border border-amber-300 px-3 py-2 text-xs">
                          Continue anyway by rendering below
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <form
                  action={renderDraft.bind(null, video.id)}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="grid gap-2">
                      <Label htmlFor="renderWidth">Width</Label>
                      <Input
                        id="renderWidth"
                        name="renderWidth"
                        type="number"
                        min="1"
                        defaultValue={latestRenderDraft?.width ?? 1920}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="renderHeight">Height</Label>
                      <Input
                        id="renderHeight"
                        name="renderHeight"
                        type="number"
                        min="1"
                        defaultValue={latestRenderDraft?.height ?? 1080}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="renderFps">FPS</Label>
                      <Input
                        id="renderFps"
                        name="renderFps"
                        type="number"
                        min="1"
                        defaultValue={latestRenderDraft?.fps ?? 30}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="imageFit">Image fit</Label>
                      <select
                        id="imageFit"
                        name="imageFit"
                        defaultValue="cover"
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="cover">Cover / crop</option>
                        <option value="contain">Contain / pad</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2 pb-2">
                      <input
                        id="burnCaptions"
                        name="burnCaptions"
                        type="checkbox"
                        defaultChecked
                        className="size-4"
                      />
                      <Label htmlFor="burnCaptions">Burn captions</Label>
                    </div>
                  </div>

                  {hookReview.over55Count > 0 ? (
                    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <p className="font-medium">Hook pacing has warnings.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <CopyPromptButton
                          label="Export Hook Optimization Pack"
                          prompt={hookOptimizationPacks[defaultHookPacing]}
                        />
                        <Button asChild variant="outline">
                          <Link href={`/videos/${video.id}?tab=visual-plan`}>
                            Open Hook Review
                          </Link>
                        </Button>
                        <Button type="submit" variant="outline">
                          Continue Anyway
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={validateRenderDraftReadiness.bind(null, video.id)}
                    >
                      Validate Render Readiness
                    </Button>
                    <Button type="submit">Render Draft</Button>
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={clearRenderDraft.bind(null, video.id)}
                    >
                      Clear Draft
                    </Button>
                  </div>
                </form>

                <form
                  action={updateRenderDraftStatus.bind(null, video.id)}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="renderDraftStatus">Status</Label>
                    <select
                      id="renderDraftStatus"
                      name="renderDraftStatus"
                      defaultValue={video.renderDraftStatus}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {["pending", "rendering", "rendered", "error"].map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" variant="outline">
                    Update Status
                  </Button>
                </form>
              </CardContent>
            </Card>

            <RenderDiagnosticsCard
              diagnostics={renderDiagnostics}
              burnCaptionsEnabled
              assCaptionSourceAvailable={Boolean(video.styledSubtitleAss)}
            />

            <Card>
              <CardHeader>
                <CardTitle>Project draft.mp4</CardTitle>
                <CardDescription>
                  Preview the generated draft.mp4 stored in this video's render folder.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <SummaryItem label="Project file" value={projectDraftPath} />
                  <SummaryItem
                    label="Preview"
                    value={projectDraftUrl ? "draft.mp4 found" : "draft.mp4 missing"}
                  />
                </div>

                {latestRenderDraft?.error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {latestRenderDraft.error}
                  </div>
                ) : null}

                {projectDraftUrl ? (
                  <div className="space-y-2">
                    <DraftVideoPlayer
                      src={projectDraftUrl}
                      sourceLabel={projectDraftPath}
                    />
                    <p className="text-xs text-muted-foreground">
                      Source: {projectDraftPath}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No draft.mp4 file exists yet in this video's render folder.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="thumbnail">
          <div className="space-y-5">
            {thumbnailNotice ? (
              <Card
                className={
                  thumbnailNotice.type === "success"
                    ? "border-green-500/40 bg-green-500/5"
                    : "border-destructive/40 bg-destructive/5"
                }
              >
                <CardContent className="py-3 text-sm">
                  {thumbnailNotice.message}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Thumbnail Brief</CardTitle>
                    <CardDescription>
                      Plan a CTR-focused thumbnail with one host, one large finance symbol, short text, and a clean white layout.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{statusLabel(video.thumbnailStatus)}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <form
                  id={thumbnailBriefFormId}
                  action={saveThumbnailBrief.bind(null, video.id)}
                  className="space-y-4"
                >
                  <input
                    type="hidden"
                    name="thumbnailActiveConceptId"
                    value={activeThumbnailConcept?.id ?? "A"}
                  />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailHook">Thumbnail hook</Label>
                      <Input
                        id="thumbnailHook"
                        name="thumbnailHook"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "thumbnailHook",
                          video.title,
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailOverlayText">Overlay text</Label>
                      <Input
                        id="thumbnailOverlayText"
                        name="thumbnailOverlayText"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "overlayText",
                          "NOT READY",
                        )}
                        placeholder="FIRST $10K"
                      />
                      <p className="text-xs text-muted-foreground">
                        2 to 5 words, uppercase, huge black text.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailMainEmotion">Main emotion</Label>
                      <select
                        id="thumbnailMainEmotion"
                        name="thumbnailMainEmotion"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "mainEmotion",
                          "surprised realization",
                        )}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="shocked">Shocked</option>
                        <option value="worried">Worried</option>
                        <option value="confused">Confused</option>
                        <option value="suspicious">Suspicious</option>
                        <option value="excited">Excited</option>
                        <option value="relieved">Relieved</option>
                        <option value="urgent">Urgent</option>
                        <option value="smug">Smug</option>
                        <option value="surprised realization">Surprised realization</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailColorAccent">Color accent</Label>
                      <select
                        id="thumbnailColorAccent"
                        name="thumbnailColorAccent"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "colorAccent",
                          "green",
                        )}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="red">Red</option>
                        <option value="green">Green</option>
                        <option value="blue">Blue</option>
                        <option value="yellow">Yellow</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailMainHostPose">Main host pose</Label>
                      <Input
                        id="thumbnailMainHostPose"
                        name="thumbnailMainHostPose"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "mainHostPose",
                          "main host reacting with raised eyebrows",
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailPrimaryObject">Main object/symbol</Label>
                      <Input
                        id="thumbnailPrimaryObject"
                        name="thumbnailPrimaryObject"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "primaryObject",
                          "oversized finance symbol",
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailSecondaryObject">Secondary object/symbol</Label>
                      <Input
                        id="thumbnailSecondaryObject"
                        name="thumbnailSecondaryObject"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "secondaryObject",
                          "a few simple money symbols",
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailVisualTension">Visual tension</Label>
                      <Input
                        id="thumbnailVisualTension"
                        name="thumbnailVisualTension"
                        defaultValue={thumbnailBriefValue(
                          thumbnailBriefSource,
                          "visualTension",
                          "small detail feels unexpectedly important",
                        )}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="thumbnailAvoid">Avoid</Label>
                    <Textarea
                      id="thumbnailAvoid"
                      name="thumbnailAvoid"
                      defaultValue={thumbnailAvoid}
                      className="min-h-28"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Save Thumbnail Brief</Button>
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={markThumbnailBriefReady.bind(null, video.id)}
                    >
                      Mark Brief Ready
                    </Button>
                    <CopyPromptButton
                      label="Copy Thumbnail Brief JSON"
                      prompt={thumbnailBriefJson}
                    />
                    <CopyPromptButton
                      label="Copy Overlay Text"
                      prompt={thumbnailBriefValue(
                        thumbnailBriefSource,
                        "overlayText",
                        "NOT READY",
                      )}
                    />
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Thumbnail Concepts</CardTitle>
                <CardDescription>
                  Generate three local draft concepts: curiosity, urgency, and transformation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form action={generateThumbnailConcepts.bind(null, video.id)}>
                  <Button type="submit">
                    <Sparkles />
                    Generate Thumbnail Concepts
                  </Button>
                </form>

                {thumbnailConcepts.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-3">
                    {thumbnailConcepts.map((concept) => (
                      <form
                        key={concept.id}
                        action={selectThumbnailConcept.bind(null, video.id)}
                        className="rounded-md border p-4"
                      >
                        <input
                          type="hidden"
                          name="thumbnailConceptId"
                          value={concept.id}
                        />
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                              Concept {concept.id}
                            </p>
                            <h3 className="font-semibold">{concept.name}</h3>
                          </div>
                          {activeThumbnailConcept?.id === concept.id ? (
                            <Badge>Active</Badge>
                          ) : null}
                        </div>
                        <dl className="space-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">Overlay</dt>
                            <dd className="font-black uppercase">{concept.overlayText}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Emotion</dt>
                            <dd>{concept.mainEmotion}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Object</dt>
                            <dd>{concept.primaryObject}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Why it works</dt>
                            <dd>{concept.whyItWorks}</dd>
                          </div>
                        </dl>
                        <Button type="submit" variant="outline" className="mt-4 w-full">
                          Select Concept {concept.id}
                        </Button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No thumbnail concepts generated yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Thumbnail Prompt</CardTitle>
                <CardDescription>
                  Generate a clean Google Flow-style prompt from the active brief. No image API is called.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-4 text-sm">
                  <p className="font-semibold">Wealth Insights main host descriptor</p>
                  <p className="mt-2 text-muted-foreground">
                    {WEALTH_INSIGHTS_HOST_DESCRIPTOR}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    form={thumbnailBriefFormId}
                    formAction={generateThumbnailPrompt.bind(null, video.id)}
                  >
                    <Sparkles />
                    Generate Thumbnail Prompt
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={thumbnailBriefFormId}
                    formAction={generateThumbnailImageWithFlow.bind(null, video.id)}
                  >
                    <Sparkles />
                    Generate with Flow
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    form={thumbnailBriefFormId}
                    formAction={markThumbnailPromptReady.bind(null, video.id)}
                  >
                    Mark Prompt Ready
                  </Button>
                  <CopyPromptButton
                    label="Copy Thumbnail Prompt"
                    prompt={video.thumbnailPrompt ?? ""}
                  />
                  <CopyPromptButton
                    label="Copy Negative Prompt"
                    prompt={video.thumbnailNegativePrompt ?? THUMBNAIL_NEGATIVE_PROMPT}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="thumbnailPrompt">Prompt</Label>
                  <Textarea
                    id="thumbnailPrompt"
                    readOnly
                    className="min-h-72 font-mono text-xs"
                    value={video.thumbnailPrompt ?? ""}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="thumbnailNegativePrompt">Negative prompt</Label>
                  <Textarea
                    id="thumbnailNegativePrompt"
                    readOnly
                    className="min-h-24 font-mono text-xs"
                    value={video.thumbnailNegativePrompt ?? THUMBNAIL_NEGATIVE_PROMPT}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Final Thumbnail</CardTitle>
                <CardDescription>
                  Store a manual URL or local path for the final thumbnail image.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  action={saveThumbnailFinal.bind(null, video.id)}
                  className="space-y-4"
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailImageUrl">Thumbnail image URL</Label>
                      <Input
                        id="thumbnailImageUrl"
                        name="thumbnailImageUrl"
                        defaultValue={video.thumbnailImageUrl ?? ""}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailImagePath">Local image path</Label>
                      <Input
                        id="thumbnailImagePath"
                        name="thumbnailImagePath"
                        defaultValue={video.thumbnailImagePath ?? ""}
                        placeholder="storage/thumbnails/.../thumbnail.png"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailFileName">File name</Label>
                      <Input
                        id="thumbnailFileName"
                        name="thumbnailFileName"
                        defaultValue={video.thumbnailFileName ?? ""}
                        placeholder="thumbnail.png"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="thumbnailNotes">Notes</Label>
                      <Input
                        id="thumbnailNotes"
                        name="thumbnailNotes"
                        defaultValue={video.thumbnailNotes ?? ""}
                        placeholder="Final thumbnail notes"
                      />
                    </div>
                  </div>

                  {thumbnailPreviewSrc ? (
                    <div className="max-w-xl overflow-hidden rounded-md border bg-muted/20">
                      <img
                        src={thumbnailPreviewSrc}
                        alt="Final thumbnail preview"
                        className="aspect-video w-full object-cover"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No final thumbnail image saved yet.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">Save Final Thumbnail</Button>
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={markThumbnailReady.bind(null, video.id)}
                    >
                      Mark Thumbnail Ready
                    </Button>
                    <Button
                      type="submit"
                      variant="outline"
                      formAction={resetThumbnail.bind(null, video.id)}
                    >
                      Reset Thumbnail
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Thumbnail Status</CardTitle>
                <CardDescription>
                  Track the thumbnail independently from render and voiceover.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <SummaryItem label="Status" value={statusLabel(video.thumbnailStatus)} />
                <SummaryItem
                  label="Concepts"
                  value={thumbnailConcepts.length > 0 ? `${thumbnailConcepts.length}` : "None"}
                />
                <SummaryItem
                  label="Prompt"
                  value={video.thumbnailPrompt ? "Ready" : "Missing"}
                />
                <SummaryItem
                  label="Image"
                  value={thumbnailPreviewSrc ? "Saved" : "Missing"}
                />
                <SummaryItem
                  label="File"
                  value={video.thumbnailFileName ?? "Not set"}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <CardDescription>
                Store publish metadata as JSON until richer fields are needed.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form
                action={updateVideoMetadata.bind(null, video.id)}
                className="space-y-5"
              >
                <div className="grid gap-2">
                  <Label htmlFor="metadataJson">Metadata JSON</Label>
                  <JsonTextarea
                    id="metadataJson"
                    name="metadataJson"
                    className="min-h-80 font-mono text-sm"
                    defaultValue={video.metadataJson ?? ""}
                    placeholder='{"description": "", "tags": []}'
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <CopyPromptButton
                    label={`Copy Metadata Writer Prompt — ${channel.name}`}
                    promptUrl={promptUrl("metadata-writer")}
                  />

                  <Button type="submit">Save metadata</Button>

                  <Button
                    type="submit"
                    variant="outline"
                    formAction={mockGenerateMetadata.bind(null, video.id)}
                  >
                    <Sparkles />
                    Mock metadata helper
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProcessFormGuard />
    </div>
  );
}

function parseBatchLogs(logsJson: string | null) {
  if (!logsJson) {
    return [];
  }

  try {
    const logs = JSON.parse(logsJson);
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
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

function buildSceneTimeline(
  scenes: Array<{
    sortOrder: number;
    voiceoverDuration?: number | null;
    pauseAfterMs?: number | null;
    duration: number | null;
  }>,
) {
  let currentStart = 0;

  return scenes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((scene) => {
      const span =
        scene.voiceoverDuration !== null && scene.voiceoverDuration !== undefined
          ? scene.voiceoverDuration + Math.max(0, (scene.pauseAfterMs ?? 0) / 1000)
          : Math.max(0, scene.duration ?? 0);
      const item = {
        order: scene.sortOrder,
        start: currentStart,
        end: currentStart + span,
      };

      currentStart = item.end;
      return item;
    });
}

function resolveHookWindowSeconds(value: string | undefined) {
  const numeric = Number(value ?? "120");

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 120;
  }

  return Math.max(5, Math.min(300, Math.round(numeric)));
}

function countSentenceBlocks(text: string) {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function normalizeSceneDuplicateText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findDuplicateSceneGroups(
  scenes: Array<{
    id: string;
    sortOrder: number;
    scriptText: string;
  }>,
) {
  const groups = new Map<
    string,
    Array<{ id: string; sortOrder: number; scriptText: string }>
  >();

  for (const scene of scenes) {
    const key = normalizeSceneDuplicateText(scene.scriptText);

    if (!key) {
      continue;
    }

    groups.set(key, [...(groups.get(key) ?? []), scene]);
  }

  return [...groups.entries()]
    .map(([text, groupScenes]) => ({
      text,
      preview: text.length > 140 ? `${text.slice(0, 140).trim()}...` : text,
      scenes: groupScenes.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.scenes.length > 1)
    .sort((a, b) => a.scenes[0].sortOrder - b.scenes[0].sortOrder);
}

function findDuplicateImageGroups(
  scenes: Array<{
    id: string;
    sortOrder: number;
    scriptText: string;
    imageFileName: string | null;
  }>,
) {
  const groups = new Map<
    string,
    Array<{ id: string; sortOrder: number; preview: string }>
  >();

  for (const scene of scenes) {
    const fileName = scene.imageFileName?.trim();

    if (!fileName) {
      continue;
    }

    groups.set(fileName, [
      ...(groups.get(fileName) ?? []),
      {
        id: scene.id,
        sortOrder: scene.sortOrder,
        preview:
          scene.scriptText.length > 140
            ? `${scene.scriptText.slice(0, 140).trim()}...`
            : scene.scriptText,
      },
    ]);
  }

  return [...groups.entries()]
    .map(([fileName, groupScenes]) => ({
      fileName,
      scenes: groupScenes.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.scenes.length > 1)
    .sort((a, b) => a.scenes[0].sortOrder - b.scenes[0].sortOrder);
}

function hookWarningsForScene(scene: {
  duration: number | null;
  scriptText: string;
}) {
  const warnings: Array<{
    tone: "warning" | "strong" | "critical";
    text: string;
  }> = [];
  const duration = scene.duration ?? 0;
  const scriptText = scene.scriptText.trim();
  const sentenceBlocks = countSentenceBlocks(scriptText);

  if (duration >= 8) {
    warnings.push({ tone: "critical", text: "Critical pacing 8s+" });
  } else if (duration > 6.5) {
    warnings.push({ tone: "strong", text: "Strong pacing warning > 6.5s" });
  } else if (duration > 5.5) {
    warnings.push({ tone: "warning", text: "Pacing warning > 5.5s" });
  }

  if (sentenceBlocks >= 4) {
    warnings.push({ tone: "warning", text: "4+ sentence blocks, possible split" });
  }

  if (
    /\b(but|then|however|that is the mistake)\b/i.test(scriptText)
  ) {
    warnings.push({ tone: "warning", text: "Contrast turn, possible split" });
  }

  return warnings;
}

function buildHookReviewData(
  scenes: Array<{
    id: string;
    sortOrder: number;
    scriptText: string;
    sceneType: string;
    visualPurpose: string | null;
    visualIdea: string | null;
    imagePrompt: string | null;
    duration: number | null;
    voiceoverDuration?: number | null;
    pauseAfterMs?: number | null;
    imageUrl: string | null;
    status: string;
  }>,
  hookWindowSec: number,
) {
  const timeline = buildSceneTimeline(scenes);
  const hookScenes = scenes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((scene) => {
      const time = timeline.find((item) => item.order === scene.sortOrder);
      const warnings = hookWarningsForScene(scene);

      return {
        ...scene,
        startTimeSec: time?.start ?? 0,
        endTimeSec: time?.end ?? 0,
        warnings,
      };
    })
    .filter((scene) => scene.startTimeSec < hookWindowSec);

  const totalDurationSeconds = hookScenes.reduce(
    (total, scene) => total + Math.max(0, scene.duration ?? 0),
    0,
  );

  return {
    scenes: hookScenes.map((scene, index) => ({
      ...scene,
      hasPrevious: index > 0,
      hasNext: index < hookScenes.length - 1,
    })),
    totalDurationSeconds,
    averageDurationSeconds:
      hookScenes.length > 0 ? totalDurationSeconds / hookScenes.length : 0,
    over55Count: hookScenes.filter((scene) => (scene.duration ?? 0) > 5.5).length,
    over65Count: hookScenes.filter((scene) => (scene.duration ?? 0) > 6.5).length,
    criticalCount: hookScenes.filter((scene) => (scene.duration ?? 0) >= 8).length,
  };
}

function parseJsonForPack(rawJson: string | null) {
  if (!rawJson?.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawJson) as unknown;
  } catch {
    return rawJson;
  }
}

async function readProjectTextForPack(relativePath: string | undefined) {
  if (!relativePath?.trim()) {
    return "";
  }

  try {
    return await readFile(path.join(process.cwd(), relativePath), "utf8");
  } catch {
    return "";
  }
}

async function buildHookOptimizationPacks({
  video,
  channel,
  hookReview,
  hookRange,
}: {
  video: {
    id: string;
    channelKey: string;
    title: string;
    ideaJson: string | null;
    scenes: Array<{
      id: string;
      sortOrder: number;
      scriptText: string;
      sceneType: string;
      visualPurpose: string | null;
      visualIdea: string | null;
      imagePrompt: string | null;
      duration: number | null;
    }>;
  };
  channel: ReturnType<typeof getChannelProfile>;
  hookReview: ReturnType<typeof buildHookReviewData>;
  hookRange: { fromOrder: number; toOrder: number };
}) {
  const [projectBible, visualPlannerPrompt, imagePromptBible, characterBible] =
    await Promise.all([
      readProjectTextForPack(channel.projectBiblePath),
      readProjectTextForPack(channel.prompts.visualPlanner),
      readProjectTextForPack(channel.imagePromptBiblePath),
      readProjectTextForPack(channel.characterBiblePath),
    ]);
  const orderedScenes = video.scenes.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const nextBodyScene =
    orderedScenes.find((scene) => scene.sortOrder > hookRange.toOrder) ?? null;
  const warningSummary = {
    scenesOver55Seconds: hookReview.over55Count,
    scenesOver65Seconds: hookReview.over65Count,
    scenesAtLeast8Seconds: hookReview.criticalCount,
    warnings: hookReview.scenes.flatMap((scene) =>
      scene.warnings.map((warning) => ({
        order: scene.sortOrder,
        warning: warning.text,
      })),
    ),
  };

  return Object.fromEntries(
    (Object.keys(HOOK_PACING_PRESETS) as HookPacingPresetId[]).map((presetId) => {
      const targetPacing = HOOK_PACING_PRESETS[presetId];
      const pack = {
        task: "optimize_hook_scene_pacing",
        videoId: video.id,
        channelKey: video.channelKey,
        videoTitle: video.title,
        ideaJson: parseJsonForPack(video.ideaJson),
        hookDurationSeconds: hookReview.totalDurationSeconds,
        replaceRange: {
          fromOrder: hookRange.fromOrder,
          toOrder: hookRange.toOrder,
        },
        targetPacing,
        currentHookScenes: hookReview.scenes.map((scene) => ({
          id: scene.id,
          order: scene.sortOrder,
          scriptText: scene.scriptText,
          sceneType: scene.sceneType,
          visualPurpose: scene.visualPurpose,
          visualIdea: scene.visualIdea,
          imagePrompt: scene.imagePrompt,
          duration: scene.duration,
          warnings: scene.warnings.map((warning) => warning.text),
          startTime: scene.startTimeSec,
          endTime: scene.endTimeSec,
        })),
        nextBodyScene: nextBodyScene
          ? {
              id: nextBodyScene.id,
              order: nextBodyScene.sortOrder,
              scriptText: nextBodyScene.scriptText,
              sceneType: nextBodyScene.sceneType,
              visualPurpose: nextBodyScene.visualPurpose,
              visualIdea: nextBodyScene.visualIdea,
              imagePrompt: nextBodyScene.imagePrompt,
              duration: nextBodyScene.duration,
            }
          : null,
        projectBible,
        visualPlannerPrompt,
        imagePromptBible,
        characterBible,
        totalHookDurationSeconds: hookReview.totalDurationSeconds,
        averageSceneDurationSeconds: hookReview.averageDurationSeconds,
        warningSummary,
        instructions: [
          "You are optimizing hook pacing.",
          "Return a replacement scene array for the hook only.",
          "Do not rewrite the narration meaning.",
          "Preserve all original hook narration text in order.",
          "You may split long scenes into shorter visual micro-beats.",
          "You may merge overly short fragments if needed.",
          "Target duration per scene: 3-5 seconds.",
          "Maximum hook scene duration: 6 seconds.",
          "Return JSON only.",
          "Use task: hook_replacement_patch.",
          `Use replace.fromOrder: ${hookRange.fromOrder} and replace.toOrder: ${hookRange.toOrder}.`,
          "Include imagePrompt for each scene.",
          "Do not return body scenes.",
        ],
        returnFormat: {
          task: "hook_replacement_patch",
          videoId: video.id,
          replace: {
            fromOrder: hookRange.fromOrder,
            toOrder: hookRange.toOrder,
          },
          scenes: [
            {
              scriptText: "...",
              sceneType: "avatar",
              visualPurpose: "...",
              visualIdea: "MAIN HOST: ...",
              duration: 4.2,
              imagePrompt: "...",
              status: "planned",
            },
          ],
        },
      };

      return [presetId, JSON.stringify(pack, null, 2)];
    }),
  ) as Record<HookPacingPresetId, string>;
}

function analyzeSubtitlePreviewCue(
  cue: FormattedSubtitleCue,
  sceneTimeline: Array<{ order: number; start: number; end: number }>,
) {
  const scene =
    sceneTimeline.find((item) => cue.start >= item.start && cue.start < item.end) ?? null;
  const warnings: string[] = [];
  const text = cue.text.replace(/\n/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);

  if (/[.,!"'`:;]/.test(text)) {
    warnings.push("visible punctuation");
  }
  if (text.length > 38) {
    warnings.push("too long");
  }
  if (
    words.length === 1 &&
    ["A", "AN", "THE", "TO", "OF", "IN", "ON"].includes(words[0] ?? "")
  ) {
    warnings.push("single function word");
  }
  if (/^[,.;:!?]/.test(text)) {
    warnings.push("starts with punctuation");
  }
  if (/[.?!].+\s+[A-Z]/.test(text)) {
    warnings.push("two sentences joined");
  }
  if (scene && cue.end > scene.end + 0.02) {
    warnings.push("crosses scene boundary");
  }

  return {
    sceneOrder: scene?.order ?? null,
    warnings,
  };
}

function voiceoverWordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

function storedVoiceoverPath(audioPath: string | null | undefined) {
  if (!audioPath?.trim()) {
    return null;
  }

  const normalized = audioPath.replace(/\\/g, "/");

  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  return path.resolve(process.cwd(), normalized);
}

async function voiceoverFileExists(audioPath: string | null | undefined) {
  const resolvedPath = storedVoiceoverPath(audioPath);

  if (!resolvedPath) {
    return false;
  }

  try {
    await access(resolvedPath);
    return true;
  } catch {
    return false;
  }
}

async function renderFileCacheKey(outputPath: string | null | undefined) {
  if (!outputPath?.startsWith("storage/renders/")) {
    return null;
  }

  const resolvedPath = path.resolve(process.cwd(), outputPath);
  const rendersRoot = path.resolve(process.cwd(), "storage", "renders");

  if (!resolvedPath.startsWith(`${rendersRoot}${path.sep}`)) {
    return null;
  }

  try {
    const fileStat = await stat(resolvedPath);

    return `${fileStat.size}-${Math.round(fileStat.mtimeMs)}`;
  } catch {
    return null;
  }
}

function voiceoverQaStatus({
  sceneDuration,
  voiceoverDuration,
  wordsPerSecond,
  hasScript,
  hasAudioPath,
  audioExists,
  manualStatus,
}: {
  sceneDuration: number | null;
  voiceoverDuration: number | null;
  wordsPerSecond: number | null;
  hasScript: boolean;
  hasAudioPath: boolean;
  audioExists: boolean;
  manualStatus: string | null;
}) {
  const warnings: string[] = [];
  let status: VoiceoverQaStatus = "ok";

  if (manualStatus === "needs_review") {
    status = "needs_review";
    warnings.push("Marked needs review.");
  }

  if (hasScript && !hasAudioPath) {
    warnings.push("Missing audio.");
    return { status: "failed" as const, warnings };
  }

  if (hasAudioPath && !audioExists) {
    warnings.push("Audio file does not exist.");
    return { status: "failed" as const, warnings };
  }

  if (manualStatus === "failed") {
    status = "failed";
    warnings.push("Scene generation failed.");
  }

  if (voiceoverDuration !== null && sceneDuration !== null) {
    if (voiceoverDuration > sceneDuration + 0.5) {
      status = "critical";
      warnings.push("Audio is longer than scene duration by more than 0.5s.");
    } else if (voiceoverDuration > sceneDuration) {
      if (status === "ok") status = "warning";
      warnings.push("Audio is longer than scene duration.");
    }

    if (voiceoverDuration < sceneDuration * 0.45) {
      if (status === "ok") status = "warning";
      warnings.push("Audio is much shorter than scene duration.");
    }
  }

  if (wordsPerSecond !== null) {
    if (wordsPerSecond > 4.2) {
      status = "critical";
      warnings.push("Words per second is very high.");
    } else if (wordsPerSecond > 3.5) {
      if (status === "ok" || status === "needs_review") status = "warning";
      warnings.push("Words per second is high.");
    } else if (wordsPerSecond < 0.8 && voiceoverDuration !== null && voiceoverDuration > 2) {
      if (status === "ok") status = "warning";
      warnings.push("Words per second is very low.");
    }
  }

  return { status, warnings };
}

type DeepVoiceoverQaResult = {
  silenceWarning: string | null;
  volumeWarning: string | null;
};

function parseNumberAfter(label: string, text: string) {
  const match = text.match(new RegExp(`${label}:\\s*(-?\\d+(?:\\.\\d+)?)`));

  return match?.[1] ? Number(match[1]) : null;
}

function parseSilenceEvents(output: string) {
  const events: Array<{ start: number; end: number; duration: number }> = [];
  let pendingStart: number | null = null;

  for (const line of output.split("\n")) {
    const start = parseNumberAfter("silence_start", line);

    if (start !== null && Number.isFinite(start)) {
      pendingStart = start;
      continue;
    }

    const end = parseNumberAfter("silence_end", line);
    const duration = parseNumberAfter("silence_duration", line);

    if (
      pendingStart !== null &&
      end !== null &&
      duration !== null &&
      Number.isFinite(end) &&
      Number.isFinite(duration)
    ) {
      events.push({ start: pendingStart, end, duration });
      pendingStart = null;
    }
  }

  return events;
}

function summarizeSilenceWarnings(
  events: Array<{ start: number; end: number; duration: number }>,
  durationSec: number | null,
) {
  const warnings: string[] = [];

  for (const event of events) {
    const startsAtBeginning = event.start <= 0.08;
    const endsAtEnd =
      durationSec !== null && durationSec > 0 && event.end >= durationSec - 0.12;

    if (startsAtBeginning && event.duration > 0.4) {
      warnings.push(`start silence ${event.duration.toFixed(1)}s`);
      continue;
    }

    if (endsAtEnd && event.duration > 0.8) {
      warnings.push(`end silence ${event.duration.toFixed(1)}s`);
      continue;
    }

    if (!startsAtBeginning && !endsAtEnd && event.duration > 1.2) {
      warnings.push(`internal silence ${event.duration.toFixed(1)}s`);
    }
  }

  return warnings.length > 0 ? warnings.join("; ") : null;
}

async function analyzeDeepVoiceoverAudio(
  audioPath: string | null,
  durationSec: number | null,
): Promise<DeepVoiceoverQaResult> {
  const resolvedPath = storedVoiceoverPath(audioPath);

  if (!resolvedPath) {
    return {
      silenceWarning: "No audio path.",
      volumeWarning: null,
    };
  }

  try {
    await ensureFfmpegAvailable();
    const result = await runFfmpeg([
      "-hide_banner",
      "-nostats",
      "-i",
      resolvedPath,
      "-af",
      "silencedetect=n=-45dB:d=0.15,volumedetect",
      "-f",
      "null",
      "-",
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    if (!result.ok) {
      return {
        silenceWarning: "Deep QA failed.",
        volumeWarning: output.slice(-220).trim() || "FFmpeg failed.",
      };
    }

    const silenceWarning = summarizeSilenceWarnings(
      parseSilenceEvents(output),
      durationSec,
    );
    const meanVolume = parseNumberAfter("mean_volume", output);
    const maxVolume = parseNumberAfter("max_volume", output);
    const volumeWarnings: string[] = [];

    if (meanVolume !== null && meanVolume < -35) {
      volumeWarnings.push(`low volume ${meanVolume.toFixed(1)} dB`);
    }

    if (maxVolume !== null && maxVolume > -0.5) {
      volumeWarnings.push(`possible clipping ${maxVolume.toFixed(1)} dB`);
    }

    return {
      silenceWarning,
      volumeWarning: volumeWarnings.length > 0 ? volumeWarnings.join("; ") : null,
    };
  } catch (error) {
    return {
      silenceWarning: "Deep QA unavailable.",
      volumeWarning: error instanceof Error ? error.message : "FFmpeg failed.",
    };
  }
}

async function buildVoiceoverQaRows(
  scenes: Array<{
    id: string;
    sortOrder: number;
    scriptText: string;
    duration: number | null;
    voiceoverLocalPath: string | null;
    voiceoverDuration: number | null;
    voiceoverStatus: string | null;
    pauseAfterMs: number | null;
  }>,
  runDeepQa = false,
): Promise<VoiceoverQaRow[]> {
  let masterStartSec = 0;
  const orderedScenes = scenes.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const rows: VoiceoverQaRow[] = [];

  for (const scene of orderedScenes) {
    const hasScript = Boolean(scene.scriptText.trim());
    const audioExists = await voiceoverFileExists(scene.voiceoverLocalPath);
    const words = voiceoverWordCount(scene.scriptText);
    const wordsPerSecond =
      scene.voiceoverDuration && scene.voiceoverDuration > 0
        ? words / scene.voiceoverDuration
        : null;
    const diffSec =
      scene.voiceoverDuration !== null && scene.duration !== null
        ? scene.voiceoverDuration - scene.duration
        : null;
    const qa = voiceoverQaStatus({
      sceneDuration: scene.duration,
      voiceoverDuration: scene.voiceoverDuration,
      wordsPerSecond,
      hasScript,
      hasAudioPath: Boolean(scene.voiceoverLocalPath),
      audioExists,
      manualStatus: scene.voiceoverStatus,
    });
    const deepQa =
      runDeepQa && audioExists
        ? await analyzeDeepVoiceoverAudio(
            scene.voiceoverLocalPath,
            scene.voiceoverDuration,
          )
        : { silenceWarning: null, volumeWarning: null };
    const deepWarnings = [
      deepQa.silenceWarning ? `Silence: ${deepQa.silenceWarning}` : null,
      deepQa.volumeWarning ? `Volume: ${deepQa.volumeWarning}` : null,
    ].filter((warning): warning is string => Boolean(warning));
    const finalStatus: VoiceoverQaStatus =
      deepWarnings.length > 0 && qa.status === "ok" ? "warning" : qa.status;

    rows.push({
      id: scene.id,
      order: scene.sortOrder,
      scriptText: scene.scriptText,
      sceneDuration: scene.duration,
      voiceoverDuration: scene.voiceoverDuration,
      pauseAfterMs: scene.pauseAfterMs,
      diffSec,
      wordsPerSecond,
      status: finalStatus,
      warnings: [...qa.warnings, ...deepWarnings],
      silenceWarning: deepQa.silenceWarning,
      volumeWarning: deepQa.volumeWarning,
      deepQaChecked: runDeepQa && audioExists,
      audioUrl: generatedAudioUrl(scene.voiceoverLocalPath),
      audioExists,
      voiceoverLocalPath: scene.voiceoverLocalPath,
      masterStartSec,
      isHook: masterStartSec < 120,
    });

    masterStartSec +=
      (scene.voiceoverDuration ?? scene.duration ?? 0) +
      Math.max(0, (scene.pauseAfterMs ?? 0) / 1000);
  }

  return rows;
}

function summarizeVoiceoverQa(rows: VoiceoverQaRow[]) {
  const suspiciousRows = rows.filter((row) =>
    ["warning", "critical", "failed", "needs_review"].includes(row.status),
  );

  return {
    totalScenes: rows.length,
    scenesWithAudio: rows.filter((row) => row.audioUrl && row.audioExists).length,
    missingAudio: rows.filter((row) => !row.audioUrl || !row.audioExists).length,
    ok: rows.filter((row) => row.status === "ok").length,
    warnings: rows.filter((row) => row.status === "warning").length,
    critical: rows.filter((row) => row.status === "critical").length,
    failed: rows.filter((row) => row.status === "failed").length,
    needsReview: rows.filter((row) => row.status === "needs_review").length,
    estimatedFullDurationSec: rows.reduce(
      (total, row) =>
        total +
        (row.voiceoverDuration ?? row.sceneDuration ?? 0) +
        Math.max(0, (row.pauseAfterMs ?? 0) / 1000),
      0,
    ),
    suspiciousReviewDurationSec: suspiciousRows.reduce(
      (total, row) => total + (row.voiceoverDuration ?? 0),
      0,
    ),
  };
}

function getCueWords(cue: FormattedSubtitleCue) {
  if (!("words" in cue) || !Array.isArray(cue.words)) {
    return [];
  }

  return cue.words.filter(
    (word): word is {
      index: number;
      word: string;
      lineIndex: number;
    } =>
      Boolean(word) &&
      typeof word.index === "number" &&
      typeof word.word === "string" &&
      typeof word.lineIndex === "number",
  );
}

function ActiveWordStaticPreview({ cue }: { cue: FormattedSubtitleCue }) {
  const words = getCueWords(cue);

  if (words.length === 0) {
    return <span className="whitespace-pre-line">{cue.text}</span>;
  }

  let currentLine = words[0]?.lineIndex ?? 0;

  return (
    <span className="font-semibold">
      {words.map((word, index) => {
        const lineBreak = index > 0 && word.lineIndex !== currentLine;
        currentLine = word.lineIndex;

        return (
          <Fragment key={`${word.index}-${index}`}>
            {lineBreak ? <br /> : index > 0 ? " " : null}
            <span className={index === 0 ? "text-[#00D9FF]" : undefined}>
              {word.word}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function SceneForm({
  action,
  submitLabel,
  defaultOrder,
  defaultScriptText = "",
  defaultSceneType = "avatar",
  defaultVisualPurpose = "",
  defaultVisualIdea = "",
  defaultImagePrompt = "",
  defaultDuration = "",
  defaultImageUrl = "",
  defaultStatus = "planned",
  footer,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaultOrder: number;
  defaultScriptText?: string;
  defaultSceneType?: string;
  defaultVisualPurpose?: string;
  defaultVisualIdea?: string;
  defaultImagePrompt?: string;
  defaultDuration?: string;
  defaultImageUrl?: string;
  defaultStatus?: string;
  footer?: React.ReactNode;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[120px_1fr_180px]">
        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-order`}>Order</Label>
          <Input
            id={`${submitLabel}-order`}
            name="order"
            type="number"
            min="1"
            defaultValue={defaultOrder}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-type`}>Scene type</Label>
          <Input
            id={`${submitLabel}-type`}
            name="sceneType"
            defaultValue={defaultSceneType}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-status`}>Status</Label>
          <select
            id={`${submitLabel}-status`}
            name="status"
            defaultValue={defaultStatus}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {sceneStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${submitLabel}-scriptText`}>Script text</Label>
        <Textarea
          id={`${submitLabel}-scriptText`}
          name="scriptText"
          defaultValue={defaultScriptText}
          required
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-visualPurpose`}>Visual purpose</Label>
          <Textarea
            id={`${submitLabel}-visualPurpose`}
            name="visualPurpose"
            defaultValue={defaultVisualPurpose}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-visualIdea`}>Visual idea</Label>
          <Textarea
            id={`${submitLabel}-visualIdea`}
            name="visualIdea"
            defaultValue={defaultVisualIdea}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${submitLabel}-imagePrompt`}>Image prompt</Label>
        <Textarea
          id={`${submitLabel}-imagePrompt`}
          name="imagePrompt"
          defaultValue={defaultImagePrompt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-duration`}>Duration</Label>
          <Input
            id={`${submitLabel}-duration`}
            name="duration"
            type="number"
            min="1"
            defaultValue={defaultDuration}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${submitLabel}-imageUrl`}>Image URL</Label>
          <Input
            id={`${submitLabel}-imageUrl`}
            name="imageUrl"
            defaultValue={defaultImageUrl}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">
          <Plus />
          {submitLabel}
        </Button>

        {footer}
      </div>
    </form>
  );
}

function HookSceneReviewCard({
  scene,
  editAction,
  splitAction,
  mergePreviousAction,
  mergeNextAction,
  regenerateAction,
  hasPrevious,
  hasNext,
}: {
  scene: {
    id: string;
    sortOrder: number;
    startTimeSec: number;
    endTimeSec: number;
    scriptText: string;
    sceneType: string;
    visualPurpose: string | null;
    visualIdea: string | null;
    imagePrompt: string | null;
    duration: number | null;
    imageUrl: string | null;
    status: string;
    warnings: Array<{
      tone: "warning" | "strong" | "critical";
      text: string;
    }>;
  };
  editAction: (formData: FormData) => void | Promise<void>;
  splitAction: (formData: FormData) => void | Promise<void>;
  mergePreviousAction: () => void | Promise<void>;
  mergeNextAction: () => void | Promise<void>;
  regenerateAction: () => void | Promise<void>;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const badgeClass =
    scene.duration !== null && scene.duration >= 8
      ? "border-red-300 text-red-700"
      : scene.duration !== null && scene.duration > 6.5
        ? "border-amber-300 text-amber-700"
        : scene.duration !== null && scene.duration > 5.5
          ? "border-amber-200 text-amber-700"
          : "";

  return (
    <div className="rounded-md border p-4">
      <form action={editAction} className="space-y-4">
        <input type="hidden" name="order" value={scene.sortOrder} />
        <input type="hidden" name="sceneType" value={scene.sceneType} />
        <input type="hidden" name="visualPurpose" value={scene.visualPurpose ?? ""} />
        <input type="hidden" name="imagePrompt" value={scene.imagePrompt ?? ""} />
        <input type="hidden" name="imageUrl" value={scene.imageUrl ?? ""} />
        <input type="hidden" name="status" value={scene.status} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Scene {scene.sortOrder}</span>
              <Badge variant="outline" className={badgeClass}>
                {secondsToTimestamp(scene.startTimeSec, "srt")} - {secondsToTimestamp(scene.endTimeSec, "srt")}
              </Badge>
              <Badge variant="outline" className={badgeClass}>
                {scene.duration ?? 0}s
              </Badge>
              <Badge variant="muted">{scene.sceneType}</Badge>
              <Badge variant={scene.imagePrompt?.trim() ? "default" : "outline"}>
                {scene.imagePrompt?.trim() ? "Prompt ready" : "Prompt needs regeneration"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Tighten the pacing here before regenerating images, voiceover, or render.
            </p>
            {scene.warnings.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {scene.warnings.map((warning) => (
                  <Badge
                    key={`${scene.id}-${warning.text}`}
                    variant="outline"
                    className={
                      warning.tone === "critical"
                        ? "border-red-300 text-red-700"
                        : warning.tone === "strong"
                          ? "border-amber-300 text-amber-700"
                          : "border-amber-200 text-amber-700"
                    }
                  >
                    {warning.text}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid w-full gap-3 lg:max-w-[520px] lg:grid-cols-[120px_1fr_auto]">
            <div className="grid gap-2">
              <Label htmlFor={`hook-duration-${scene.id}`}>Duration</Label>
              <Input
                id={`hook-duration-${scene.id}`}
                name="duration"
                type="number"
                min="1"
                max="30"
                step="1"
                defaultValue={scene.duration ?? ""}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`hook-visual-${scene.id}`}>Visual idea</Label>
              <Input
                id={`hook-visual-${scene.id}`}
                name="visualIdea"
                defaultValue={scene.visualIdea ?? ""}
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" size="sm">
                Save Edit
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`hook-script-${scene.id}`}>Script text</Label>
          <Textarea
            id={`hook-script-${scene.id}`}
            name="scriptText"
            defaultValue={scene.scriptText}
            className="min-h-24"
          />
        </div>
      </form>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm font-medium">Current visual idea</p>
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
            {scene.visualIdea?.trim() || "No visual idea yet."}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {hasPrevious ? (
            <form action={mergePreviousAction}>
              <Button type="submit" size="sm" variant="outline">
                Merge With Previous
              </Button>
            </form>
          ) : null}
          {hasNext ? (
            <form action={mergeNextAction}>
              <Button type="submit" size="sm" variant="outline">
                Merge With Next
              </Button>
            </form>
          ) : null}
          <form action={regenerateAction}>
            <Button type="submit" size="sm" variant="outline">
              Mark For Prompt Regeneration
            </Button>
          </form>
        </div>
      </div>

      <details className="mt-4 rounded-md border bg-muted/20 p-4">
        <summary className="cursor-pointer text-sm font-medium">Split Scene</summary>
        <form action={splitAction} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div className="grid gap-2">
              <Label htmlFor={`split-count-${scene.id}`}>Split into</Label>
              <select
                id={`split-count-${scene.id}`}
                name="splitCount"
                defaultValue="2"
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="2">2 scenes</option>
                <option value="3">3 scenes</option>
              </select>
            </div>
            <div className="rounded-md border bg-background p-3 text-sm">
              <p className="font-medium">Original narration</p>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">
                {scene.scriptText}
              </p>
            </div>
          </div>

          {[1, 2, 3].map((part) => (
            <div key={`${scene.id}-split-${part}`} className="grid gap-3 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Split part {part}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`split-script-${scene.id}-${part}`}>Script text</Label>
                <Textarea
                  id={`split-script-${scene.id}-${part}`}
                  name={`splitScriptText${part}`}
                  defaultValue={part === 1 ? scene.scriptText : ""}
                  className="min-h-20"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`split-duration-${scene.id}-${part}`}>Duration</Label>
                  <Input
                    id={`split-duration-${scene.id}-${part}`}
                    name={`splitDuration${part}`}
                    type="number"
                    min="1"
                    defaultValue={part === 1 ? Math.max(1, Math.ceil((scene.duration ?? 2) / 2)) : Math.max(1, Math.floor((scene.duration ?? 2) / 2))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`split-visual-${scene.id}-${part}`}>Visual idea</Label>
                  <Input
                    id={`split-visual-${scene.id}-${part}`}
                    name={`splitVisualIdea${part}`}
                    defaultValue={part === 1 ? scene.visualIdea ?? "" : ""}
                  />
                </div>
              </div>
            </div>
          ))}

          <Button type="submit" size="sm">
            Apply Split
          </Button>
        </form>
      </details>
    </div>
  );
}
