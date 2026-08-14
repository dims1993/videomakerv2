import {
  parseAndValidateHandoffResponse,
  scenesToImportJson,
} from "@/lib/chatgpt-scene-handoff";
import { getChannelProfile } from "@/lib/channels-server";
import {
  readElevenLabsPreferences,
  resolveElevenLabsPreferenceSettings,
} from "@/lib/elevenlabs-preferences";
import { runGoogleFlowBatch } from "@/lib/google-flow";
import { prepareImageBatchPayload } from "@/lib/image-batches";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-english-lessons-script-shared";
import { assignPodcastImageLibraryToVideo } from "@/lib/podcast-image-library";
import { attachPodcastSectionClipsFromVisualIdeas } from "@/lib/podcast-video-library";
import { ensureAndAttachGodsWordFinalSectionClip } from "@/lib/gods-word-video-library";
import { THE_GODS_WORD_CHANNEL_KEY } from "@/lib/the-gods-word-script-prompt";
import {
  ensureLocalServerReady,
  stopLocalServer,
} from "@/lib/local-server-lifecycle";
import {
  applyPipelinePauseAfterMsToScenes,
  channelSupportsImageLibrary,
  resolvePipelineSettings,
  resolveVideoImageOutputFolderAbsolute,
} from "@/lib/pipeline-settings";
import { prisma } from "@/lib/prisma";
import {
  ScriptWriterCanceledError,
  clearScriptWriterCancel,
} from "@/lib/script-writer-cancel";
import {
  ScriptWriterRunError,
  runScriptWriterViaBrowser,
} from "@/lib/script-writer-run";
import { getComputedVideoStatus, sceneIncludedInPipelineWhere } from "@/lib/status";
import { getVideoPrompt } from "@/lib/video-prompts";
import {
  VisualPlanCanceledError,
  clearVisualPlanCancel,
} from "@/lib/visual-plan-cancel";
import { clearVisualPlanHybridCheckpoint } from "@/lib/visual-plan-checkpoint";
import {
  VisualPlanRunError,
  runVisualPlanViaBrowser,
} from "@/lib/visual-plan-run";
import {
  buildPodcastVisualPlanSkeleton,
  skeletonScenesToImportJson,
} from "@/lib/visual-plan-skeleton";
import {
  buildWealthInsightsVisualModeSection,
  resolveWealthInsightsVisualMode,
} from "@/lib/wealth-insights-visual-mode";
import type { PipelineStep } from "@/lib/pipeline-queue";

function isRedirectError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  return (
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function redirectPathFromError(error: unknown): string | null {
  if (!isRedirectError(error)) {
    return null;
  }
  const digest = String((error as { digest: string }).digest);
  const parts = digest.split(";");
  return parts[2] ?? null;
}

function assertRedirectNoticeSuccess(
  error: unknown,
  noticeTypeParam: string,
  noticeParam: string,
) {
  const path = redirectPathFromError(error);
  if (!path) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  try {
    const url = new URL(path, "http://localhost");
    const type = url.searchParams.get(noticeTypeParam);
    const notice =
      url.searchParams.get(noticeParam)?.trim() || "Pipeline step failed.";
    if (type === "error") {
      throw new Error(notice);
    }
  } catch (parseError) {
    if (
      parseError instanceof Error &&
      parseError.message !== "Pipeline step failed." &&
      !parseError.message.includes("Invalid URL")
    ) {
      throw parseError;
    }
    if (path.includes(`${noticeTypeParam}=error`)) {
      throw new Error("Pipeline step failed.");
    }
  }
}

async function swallowRedirectSuccess(
  run: () => Promise<unknown>,
  noticeTypeParam: string,
  noticeParam: string,
) {
  try {
    await run();
  } catch (error) {
    assertRedirectNoticeSuccess(error, noticeTypeParam, noticeParam);
  }
}

function buildGeneratePromptFromAssembler({
  videoId,
  videoTitle,
  channelKey,
  topicCategory,
  ideaJson,
  fullPrompt,
}: {
  videoId: string;
  videoTitle: string;
  channelKey: string;
  topicCategory: string | null;
  ideaJson: unknown;
  fullPrompt: string;
}) {
  const wealthMode =
    channelKey === "wealth-insights"
      ? resolveWealthInsightsVisualMode({ topicCategory, ideaJson })
      : null;

  return [
    "GENERATE_VISUAL_PLAN",
    "# ChatGPT Scene Generation Request",
    "## Task\n\nGenerate Scenes JSON for the current video.",
    "## Generation Mode\n\nFULL",
    [
      "## Prompt Context Snapshot",
      "",
      `* generatedAt: ${new Date().toISOString()}`,
      `* videoId: ${videoId}`,
      `* videoTitle: ${videoTitle}`,
      `* channelKey: ${channelKey}`,
      `* topicCategory: ${topicCategory ?? "none"}`,
      `* requestFormat: pipeline-queue-run-batch`,
    ].join("\n"),
    fullPrompt.trim(),
    ...(wealthMode
      ? [
          `## Wealth Insights Visual Mode\n\n${buildWealthInsightsVisualModeSection(wealthMode)}`,
        ]
      : []),
    [
      "## Output Requirements",
      "",
      "Return a JSON array only.",
      "Paste the full JSON array inline in the assistant message.",
      "Do not attach, upload, or link a .json file.",
      "Do not return markdown.",
      "Do not return explanations.",
      "Do not wrap inside an object.",
      "Every scene must include: order, scriptText, sceneType, visualPurpose, visualIdea, duration, imagePrompt, status.",
      "sceneType must be avatar, insert, or space.",
      "status must be planned.",
    ].join("\n"),
  ].join("\n\n");
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
}

async function importScenesReplace(videoId: string, scenesJson: string) {
  const validation = parseAndValidateHandoffResponse(scenesJson, {
    requireVisualIdeaPrefixes: false,
  });
  if (validation.errors.length > 0) {
    throw new Error(
      `Import validation failed: ${validation.errors.slice(0, 3).join(" ")}`,
    );
  }
  if (validation.scenes.length === 0) {
    throw new Error("No scenes to import.");
  }

  const normalized = JSON.parse(scenesToImportJson(validation.scenes)) as Array<{
    order: number;
    scriptText: string;
    sceneType: string;
    visualPurpose: string;
    visualIdea: string;
    imagePrompt: string;
    duration: number;
    status: string;
    pauseAfterMs?: number | null;
  }>;

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { videoId } }),
    prisma.scene.createMany({
      data: normalized.map((scene) => ({
        videoId,
        sortOrder: scene.order,
        scriptText: scene.scriptText,
        sceneType: scene.sceneType,
        visualPurpose: scene.visualPurpose,
        visualIdea: scene.visualIdea,
        imagePrompt: scene.imagePrompt,
        duration: scene.duration,
        status: scene.status || "planned",
        pauseAfterMs:
          typeof scene.pauseAfterMs === "number" &&
          Number.isFinite(scene.pauseAfterMs)
            ? Math.round(scene.pauseAfterMs)
            : null,
      })),
    }),
  ]);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true },
  });
  if (video?.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    await attachPodcastSectionClipsFromVisualIdeas(videoId);
  } else if (video?.channelKey === THE_GODS_WORD_CHANNEL_KEY) {
    try {
      await ensureAndAttachGodsWordFinalSectionClip(videoId);
    } catch (error) {
      // Library file may not exist yet — keep scenes; attach can retry later.
      console.warn(
        "[pipeline] Gods Word FINAL clip attach skipped:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  await persistComputedVideoStatus(videoId);
  return normalized.length;
}

async function runScriptStep(videoId: string) {
  clearScriptWriterCancel(videoId);
  const settings = await resolvePipelineSettings(videoId);
  try {
    const result = await runScriptWriterViaBrowser({
      videoId,
      includeReferenceTranscripts: settings.script.includeReferenceTranscripts,
      referenceDocumentIds: settings.script.includeReferenceTranscripts
        ? settings.script.referenceDocumentIds
        : [],
      resetCheckpoint: false,
    });
    return {
      message: `Script saved (${result.scriptLength} chars, score ${
        typeof result.score === "number" ? result.score.toFixed(1) : "n/a"
      }).`,
    };
  } catch (error) {
    if (error instanceof ScriptWriterCanceledError) {
      throw error;
    }
    if (error instanceof ScriptWriterRunError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

async function runLibraryVisualPlanStep(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      title: true,
      channelKey: true,
      topicCategory: true,
      ideaJson: true,
      script: true,
    },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  if (video.channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    throw new Error("Library visual plan is only for Podcast English Lessons.");
  }
  const script = video.script?.trim() ?? "";
  if (!script) {
    throw new Error("Video has no script.");
  }

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
      "No scenes could be built from the script for library visual plan.",
    );
  }

  const importedCount = await importScenesReplace(
    videoId,
    skeletonScenesToImportJson(skeleton.scenes),
  );
  await clearVisualPlanHybridCheckpoint(videoId).catch(() => undefined);

  let libraryNote = "Library assign skipped.";
  try {
    const library = await assignPodcastImageLibraryToVideo(videoId, {
      overwrite: true,
      minGap: 3,
    });
    libraryNote = `Library assigned ${library.assigned} scene(s); Flow-only skipped ${library.skippedFlowOnly}.`;
  } catch (error) {
    libraryNote = `Library assign skipped: ${
      error instanceof Error ? error.message : "unavailable"
    }`;
  }

  return {
    message: `Library visual plan imported (${importedCount} scenes). ${libraryNote}`,
  };
}

async function runVisualPlanStep(videoId: string) {
  clearVisualPlanCancel(videoId);
  const settings = await resolvePipelineSettings(videoId);

  if (
    settings.visualPlan.mode === "library" &&
    channelSupportsImageLibrary(
      (
        await prisma.video.findUnique({
          where: { id: videoId },
          select: { channelKey: true },
        })
      )?.channelKey ?? "",
    )
  ) {
    return runLibraryVisualPlanStep(videoId);
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      title: true,
      channelKey: true,
      topicCategory: true,
      ideaJson: true,
      script: true,
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }
  if (!video.script?.trim()) {
    throw new Error("Video has no script.");
  }

  const fullPrompt = await getVideoPrompt(videoId, "visual-planner");
  if (!fullPrompt?.trim()) {
    throw new Error("Could not build visual-planner prompt.");
  }

  let ideaJson: unknown = null;
  if (video.ideaJson?.trim()) {
    try {
      ideaJson = JSON.parse(video.ideaJson);
    } catch {
      ideaJson = video.ideaJson;
    }
  }

  const prompt = buildGeneratePromptFromAssembler({
    videoId: video.id,
    videoTitle: video.title,
    channelKey: video.channelKey,
    topicCategory: video.topicCategory,
    ideaJson,
    fullPrompt,
  });

  try {
    const result = await runVisualPlanViaBrowser({
      videoId,
      prompt,
      resetCheckpoint: false,
    });
    const importedCount = await importScenesReplace(videoId, result.scenesJson);
    return {
      message: `Visual plan imported (${importedCount} scenes, ${result.version}).`,
    };
  } catch (error) {
    if (error instanceof VisualPlanCanceledError) {
      throw error;
    }
    if (error instanceof VisualPlanRunError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

const DEFAULT_IMAGE_BATCH_OPTIONS = {
  parallelCount: 4,
  delayMs: 0,
  retryCount: 0,
};

async function listScenesNeedingImages(videoId: string) {
  return prisma.scene.findMany({
    where: {
      videoId,
      ...sceneIncludedInPipelineWhere(),
      imagePrompt: { not: null },
      AND: [
        { OR: [{ imageLocalPath: null }, { imageLocalPath: "" }] },
        { OR: [{ imageUrl: null }, { imageUrl: "" }] },
        { OR: [{ clipLocalPath: null }, { clipLocalPath: "" }] },
      ],
    },
    select: { id: true, sortOrder: true, imagePrompt: true },
    orderBy: { sortOrder: "asc" },
  });
}

async function listFailedImageScenes(videoId: string, batchId?: string) {
  return prisma.scene.findMany({
    where: {
      videoId,
      ...(batchId ? { imageBatchId: batchId } : {}),
      imageStatus: { in: ["failed", "needs_retry"] },
      imageUrl: null,
      imageLocalPath: null,
      ...sceneIncludedInPipelineWhere(),
    },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
}

async function runAssetsStep(videoId: string) {
  // Always unlock leftovers from a stopped/failed Flow run before prepare —
  // Resume from the queue also does this, but the worker may re-enter assets
  // after an orphan reclaim without going through the Resume button.
  const { forceUnlockBusyImageScenes } = await import("@/lib/image-batches");
  const unlocked = await forceUnlockBusyImageScenes(videoId);
  if (unlocked.resetCount > 0) {
    console.info("[pipeline-assets] unlocked stuck scenes", {
      videoId,
      ...unlocked,
    });
  }

  const settings = await resolvePipelineSettings(videoId);
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true },
  });

  if (
    video?.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY &&
    settings.visualPlan.mode === "library"
  ) {
    // Library mode: assign library stills first; Flow only fills what remains.
    try {
      await assignPodcastImageLibraryToVideo(videoId, {
        overwrite: false,
        minGap: 3,
      });
    } catch {
      // Continue to Flow for remaining scenes.
    }
  }

  const needing = (await listScenesNeedingImages(videoId)).filter((scene) =>
    Boolean(scene.imagePrompt?.trim()),
  );

  if (needing.length === 0) {
    const chromeNote = await releaseChromeAfterAssetsStep(videoId);
    return {
      message: `Assets already complete (no missing images).${chromeNote}`,
    };
  }

  const batch = await prepareImageBatchPayload(
    videoId,
    needing.map((scene) => scene.id),
    {
      ...DEFAULT_IMAGE_BATCH_OPTIONS,
      name: `Pipeline assets ${new Date().toLocaleString("en")}`,
      outputFolder: await resolveVideoImageOutputFolderAbsolute(videoId),
    },
  );

  const flowResult = await runGoogleFlowBatch(batch.batchId);
  if (flowResult.canceled) {
    throw new Error(flowResult.message || "Image batch canceled.");
  }

  let failed = await listFailedImageScenes(videoId, batch.batchId);
  if (failed.length > 0) {
    const retryBatch = await prepareImageBatchPayload(
      videoId,
      failed.map((scene) => scene.id),
      {
        ...DEFAULT_IMAGE_BATCH_OPTIONS,
        name: `Pipeline retry failed ${new Date().toLocaleString("en")}`,
        outputFolder: await resolveVideoImageOutputFolderAbsolute(videoId),
      },
    );
    const retryResult = await runGoogleFlowBatch(retryBatch.batchId);
    if (retryResult.canceled) {
      throw new Error(retryResult.message || "Retry image batch canceled.");
    }
    failed = await listFailedImageScenes(videoId, retryBatch.batchId);
  }

  if (failed.length > 0) {
    const orders = failed.map((scene) => scene.sortOrder).join(", ");
    throw new Error(
      `Assets still failed after retry for scene(s): ${orders}.`,
    );
  }

  const stillMissing = (await listScenesNeedingImages(videoId)).filter((scene) =>
    Boolean(scene.imagePrompt?.trim()),
  );
  if (stillMissing.length > 0) {
    const orders = stillMissing.map((scene) => scene.sortOrder).join(", ");
    throw new Error(`Assets incomplete; still missing scene(s): ${orders}.`);
  }

  const chromeNote = await releaseChromeAfterAssetsStep(videoId);
  return {
    message: `Assets generated for ${needing.length} scene(s).${chromeNote}`,
  };
}

async function releaseChromeAfterAssetsStep(videoId: string) {
  try {
    const { quitPipelineChromeBrowser } = await import(
      "@/lib/chrome-cdp-lifecycle"
    );
    const result = await quitPipelineChromeBrowser();
    console.info("[pipeline-assets] released Chrome after assets", {
      videoId,
      ...result,
    });
    return result.quit ? ` ${result.message}` : "";
  } catch (error) {
    console.warn(
      "[pipeline-assets] Chrome release failed:",
      error instanceof Error ? error.message : error,
    );
    return "";
  }
}

async function buildVoiceoverFormData(videoId: string) {
  const settings = await resolvePipelineSettings(videoId);
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true, voiceoverSectionVoicesJson: true },
  });
  const channel = video ? getChannelProfile(video.channelKey) : null;
  const saved = await readElevenLabsPreferences();
  const ttsProvider = settings.voiceover.ttsProvider;
  const { settings: eleven } = resolveElevenLabsPreferenceSettings({
    saved,
    channelSpeedDefault: channel?.voiceoverSpeedDefault ?? null,
    channelVoiceId:
      settings.voiceover.voiceId ?? channel?.voiceoverDefaultVoiceId ?? null,
    channelVoiceName:
      settings.voiceover.voiceName ??
      channel?.voiceoverDefaultVoiceName ??
      null,
  });

  const formData = new FormData();
  formData.set("ttsProvider", ttsProvider);

  if (ttsProvider === "chatterbox") {
    const voiceId = settings.voiceover.voiceId?.trim() ?? "";
    if (!voiceId) {
      throw new Error(
        "Pipeline voiceover is set to Chatterbox but no voice is selected. Open Configure and pick a predefined or cloned Chatterbox voice.",
      );
    }
    formData.set("voiceId", voiceId);
    if (settings.voiceover.voiceName?.trim()) {
      formData.set("voiceName", settings.voiceover.voiceName.trim());
    }
    // Unused by Chatterbox; keep parseVoiceoverGenerationOptions happy.
    formData.set("modelId", eleven.modelId || "eleven_multilingual_v2");
    formData.set("outputFormat", eleven.outputFormat || "mp3_44100_128");
    formData.set("stability", String(eleven.stability ?? 0.5));
    formData.set("similarityBoost", String(eleven.similarityBoost ?? 0.75));
    formData.set("speed", String(eleven.speed ?? 0.85));
  } else if (ttsProvider === "google") {
    const voiceId =
      settings.voiceover.voiceId?.trim() || eleven.voiceId || "";
    if (!voiceId) {
      throw new Error(
        "Pipeline voiceover is set to Google Cloud TTS but no voice is selected. Add a Google voice (e.g. en-US-Neural2-A) to the catalog and pick it in Configure.",
      );
    }
    formData.set("voiceId", voiceId);
    if (settings.voiceover.voiceName?.trim()) {
      formData.set("voiceName", settings.voiceover.voiceName.trim());
    } else if (eleven.voiceName) {
      formData.set("voiceName", eleven.voiceName);
    }
    formData.set("modelId", eleven.modelId || "eleven_multilingual_v2");
    formData.set("outputFormat", eleven.outputFormat || "mp3_44100_128");
    formData.set("stability", String(eleven.stability ?? 0.5));
    formData.set("similarityBoost", String(eleven.similarityBoost ?? 0.75));
    formData.set("speed", String(eleven.speed ?? 1));
  } else {
    formData.set("voiceId", eleven.voiceId);
    formData.set("modelId", eleven.modelId);
    formData.set("outputFormat", eleven.outputFormat);
    formData.set("stability", String(eleven.stability));
    formData.set("similarityBoost", String(eleven.similarityBoost));
    formData.set("speed", String(eleven.speed));
    if (eleven.voiceName) {
      formData.set("voiceName", eleven.voiceName);
    }
  }

  if (video?.voiceoverSectionVoicesJson) {
    formData.set(
      "voiceoverSectionVoicesJson",
      JSON.stringify(video.voiceoverSectionVoicesJson),
    );
  }
  return formData;
}

async function runVoiceoverStep(videoId: string) {
  const settings = await resolvePipelineSettings(videoId);
  if (settings.voiceover.pauseAfterMs != null) {
    await applyPipelinePauseAfterMsToScenes(
      videoId,
      settings.voiceover.pauseAfterMs,
    );
  }

  const useChatterbox = settings.voiceover.ttsProvider === "chatterbox";
  let chatterboxManaged = false;
  try {
    if (useChatterbox) {
      await ensureLocalServerReady("chatterbox");
      chatterboxManaged = true;
    }

    const { generateSceneVoiceovers } = await import("@/app/actions");
    const formData = await buildVoiceoverFormData(videoId);
    await swallowRedirectSuccess(
      () => generateSceneVoiceovers(videoId, formData),
      "voiceoverNoticeType",
      "voiceoverNotice",
    );

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { voiceoverStatus: true },
    });
    if (video?.voiceoverStatus !== "ready") {
      throw new Error(
        `Voiceover step finished but status is "${video?.voiceoverStatus ?? "unknown"}" (expected ready).`,
      );
    }

    return {
      message: useChatterbox
        ? "Voiceover generated and stitched (Chatterbox stopped)."
        : "Voiceover generated and stitched.",
    };
  } finally {
    if (chatterboxManaged) {
      try {
        await stopLocalServer("chatterbox");
      } catch (error) {
        console.warn(
          "[pipeline] Failed to stop Chatterbox after voiceover:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

async function runSubtitlesStep(videoId: string) {
  const settings = await resolvePipelineSettings(videoId);
  if (!settings.voiceover.generateSubtitles) {
    return { message: "Subtitles skipped (disabled in pipeline settings)." };
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { captionStylePreset: settings.voiceover.captionStylePreset },
  });

  const useWhisperX = settings.voiceover.alignmentProvider === "whisperx";
  let whisperxManaged = false;
  try {
    if (useWhisperX) {
      await ensureLocalServerReady("whisperx");
      whisperxManaged = true;
    }

    const { generateSubtitlesForAllReadySegments } = await import(
      "@/app/actions"
    );
    const formData = new FormData();
    formData.set("alignmentProvider", settings.voiceover.alignmentProvider);
    await swallowRedirectSuccess(
      () => generateSubtitlesForAllReadySegments(videoId, formData),
      "voiceoverNoticeType",
      "voiceoverNotice",
    );

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { subtitleStatus: true },
    });
    if (video?.subtitleStatus !== "ready") {
      throw new Error(
        `Subtitles step finished but status is "${video?.subtitleStatus ?? "unknown"}" (expected ready).`,
      );
    }

    return {
      message: useWhisperX
        ? `Subtitles generated with WhisperX (${settings.voiceover.captionStylePreset}; server stopped).`
        : `Subtitles generated (${settings.voiceover.captionStylePreset}).`,
    };
  } finally {
    if (whisperxManaged) {
      try {
        await stopLocalServer("whisperx");
      } catch (error) {
        console.warn(
          "[pipeline] Failed to stop WhisperX after subtitles:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

async function runRenderStep(videoId: string) {
  const settings = await resolvePipelineSettings(videoId);
  const { renderDraft } = await import("@/app/actions");
  const formData = new FormData();
  formData.set("renderWidth", "1920");
  formData.set("renderHeight", "1080");
  formData.set("renderFps", "30");
  formData.set("imageFit", "cover");
  if (settings.render.burnCaptions) {
    formData.set("burnCaptions", "on");
  }
  if (settings.render.voiceSoundBars) {
    formData.set("voiceSoundBars", "on");
  }
  formData.set(
    "voiceSoundBarsStyle",
    settings.render.voiceSoundBarsStyle ?? "bars",
  );

  await swallowRedirectSuccess(
    () => renderDraft(videoId, formData),
    "renderNoticeType",
    "renderNotice",
  );

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { renderDraftStatus: true },
  });
  if (video?.renderDraftStatus !== "rendered") {
    throw new Error(
      `Render step finished but status is "${video?.renderDraftStatus ?? "unknown"}" (expected rendered).`,
    );
  }

  return { message: "Render draft generated." };
}

export async function runPipelineStep(
  videoId: string,
  step: PipelineStep,
): Promise<{ message: string }> {
  switch (step) {
    case "script":
      return runScriptStep(videoId);
    case "visual_plan":
      return runVisualPlanStep(videoId);
    case "assets":
      return runAssetsStep(videoId);
    case "voiceover":
      return runVoiceoverStep(videoId);
    case "subtitles":
      return runSubtitlesStep(videoId);
    case "render":
      return runRenderStep(videoId);
    default: {
      const exhaustive: never = step;
      throw new Error(`Unknown pipeline step: ${exhaustive}`);
    }
  }
}
