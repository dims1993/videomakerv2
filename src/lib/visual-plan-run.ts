import {
  ChatGptPromptRunError,
  withChatGptBrowserTurns,
} from "@/lib/browser-providers/run-chatgpt-prompt";
import { BrowserAutomationError } from "@/lib/browser-automation/errors";
import { prisma } from "@/lib/prisma";
import { buildPodcastHybridFillBrief } from "@/lib/podcast-english-lessons-image-prompt-contract";
import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-english-lessons-visual";
import { buildBibleOneYearSectionHybridContext } from "@/lib/the-bible-in-one-year-visual-brief";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import {
  buildTheGodsWordSectionHybridContext,
} from "@/lib/the-gods-word-visual-brief";
import { getVideoPrompt } from "@/lib/video-prompts";
import {
  VISUAL_PLAN_CALL,
  type VisualPlanCallType,
} from "@/lib/visual-plan-critique";
import {
  VisualPlanCanceledError,
  clearVisualPlanCancel,
  isVisualPlanCancelRequested,
} from "@/lib/visual-plan-cancel";
import {
  chunkIsAlreadyFilled,
  clearVisualPlanHybridCheckpoint,
  countFilledVisualPlanScenes,
  hashVisualPlanScript,
  loadVisualPlanHybridCheckpoint,
  mergeVisualPlanHybridCheckpoint,
  mergeVisualPlanSectionCheckpoint,
  saveVisualPlanHybridCheckpoint,
  saveVisualPlanSectionCheckpoint,
  type VisualPlanSectionScene,
} from "@/lib/visual-plan-checkpoint";
import {
  applyVisualPlanFillPatches,
  buildVisualPlanFillChunkPrompt,
  buildVisualPlanFillRepairPrompt,
  isVisualPlanMegaSceneCollapse,
  isVisualPlanOutputTooLarge,
  slimHybridVisualPlanContext,
  validateVisualPlanFillResponse,
  type VisualPlanFillPatch,
} from "@/lib/visual-plan-fill";
import {
  buildPodcastVisualPlanSkeleton,
  chunkPodcastSkeletonScenes,
  skeletonScenesToImportJson,
  VISUAL_PLAN_FILL_CHUNK_SIZE,
  type PodcastVisualPlanSkeletonScene,
} from "@/lib/visual-plan-skeleton";
import {
  buildSectionVisualPlanChunkPrompt,
  summarizeSectionSceneTypeMix,
  type SectionSceneTypeMixMode,
  type StructuralScriptSection,
} from "@/lib/visual-plan-script-sections";
import { stripStructuralMarkers, segmentHookNarration, normalizeForScriptCoverage } from "@/lib/visual-plan-script";
import {
  resolveVisualPlanSectionsForChannel,
} from "@/lib/visual-plan-section-routing";
import { resolveVisualPlanFillProfile } from "@/lib/visual-plan-channel-profile";
import {
  buildVisualPlanScenesRepairPrompt,
  buildVisualPlanSectionChunkRepairPrompt,
  saveFailedVisualPlanResponse,
  validateVisualPlanScenesResponse,
} from "@/lib/visual-plan-validate";
import {
  buildWealthInsightsSectionHybridContext,
} from "@/lib/wealth-insights-visual-brief";
import {
  compactGodsWordImagePromptForContinuity,
  normalizeGodsWordScenes,
} from "@/lib/the-gods-word-image-prompt";
import { THE_GODS_WORD_CHANNEL_KEY } from "@/lib/the-gods-word-script-prompt";
import {
  buildGodsWordVisualPlanSkeleton,
  stripUnknownGodsWordBracketLines,
} from "@/lib/gods-word-visual-skeleton";
import { normalizeWealthInsightsScenes } from "@/lib/wealth-insights-image-prompt";
import {
  resolveWealthInsightsVisualMode,
  WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK,
} from "@/lib/wealth-insights-visual-mode";
import {
  buildWealthInsightsVisualElementLibraryCompact,
  buildWealthVisualContinuityState,
  estimateWealthNarrationSeconds,
  isWealthHookSectionLabel,
  sectionsReconstructScript,
  validateFullVisualPlanScriptCoverage,
  validateSequentialSceneOrders,
  validateWealthSceneDurations,
  validateWealthSectionScriptCoverage,
} from "@/lib/wealth-insights-visual-sections";
import { validateGodsWordSceneDurations } from "@/lib/gods-word-visual-pacing";

type VisualPlanSend = (
  prompt: string,
  options?: { freshConversation?: boolean },
) => Promise<string>;

export class VisualPlanRunError extends Error {
  readonly rawText: string | null;
  readonly callType: string | null;
  readonly debugPath: string | null;

  constructor(
    message: string,
    rawText: string | null = null,
    options?: { callType?: string | null; debugPath?: string | null },
  ) {
    super(message);
    this.name = "VisualPlanRunError";
    this.rawText = rawText;
    this.callType = options?.callType ?? null;
    this.debugPath = options?.debugPath ?? null;
  }
}

async function failValidatedCall({
  videoId,
  callType,
  draftNumber,
  rawText,
  validationErrors,
}: {
  videoId: string;
  callType: string;
  draftNumber: number;
  rawText: string;
  validationErrors: string[];
}): Promise<never> {
  let debugPath: string | null = null;
  try {
    debugPath = await saveFailedVisualPlanResponse({
      videoId,
      callType: callType as VisualPlanCallType | `${VisualPlanCallType}_REPAIR`,
      draftNumber,
      rawText,
      validationErrors,
    });
  } catch (error) {
    console.warn("[visual-plan-batch] failed to save debug response", error);
  }

  const errorSummary = validationErrors.slice(0, 4).join(" ");
  throw new VisualPlanRunError(
    `${callType} failed validation after repair retry (draft V${draftNumber}): ${errorSummary}`,
    rawText,
    { callType, debugPath },
  );
}

/**
 * GENERATE_VISUAL_PLAN with parse+schema validation and one repair retry.
 * Skips repair when ChatGPT refuses due to output size (repair would repeat the same failure).
 */
async function sendValidatedScenes({
  send,
  videoId,
  prompt,
}: {
  send: VisualPlanSend;
  videoId: string;
  prompt: string;
}): Promise<{ scenesJson: string; rawText: string }> {
  const callType = VISUAL_PLAN_CALL.GENERATE;
  let rawText = await send(prompt);
  let validation = validateVisualPlanScenesResponse(rawText);

  if (validation.ok && validation.scenesJson) {
    const parsed = JSON.parse(validation.scenesJson) as Array<{
      scriptText?: string;
    }>;
    if (isVisualPlanMegaSceneCollapse(parsed)) {
      throw new VisualPlanRunError(
        `${callType} returned a single mega-scene instead of per-turn scenes. Use hybrid section/chunk mode for long scripts.`,
        rawText,
        { callType },
      );
    }
    return { scenesJson: validation.scenesJson, rawText };
  }

  if (isVisualPlanOutputTooLarge(rawText)) {
    throw new VisualPlanRunError(
      `${callType} output is too large for ChatGPT to paste inline. Long scripts must use hybrid section/chunk mode.`,
      rawText,
      { callType },
    );
  }

  console.warn("[visual-plan-batch] scenes validation failed; repairing once", {
    videoId,
    callType,
    errors: validation.errors,
  });

  const repairPrompt = buildVisualPlanScenesRepairPrompt({
    callType,
    draftNumber: 1,
    validationErrors: validation.errors,
    invalidResponse: rawText,
  });
  rawText = await send(repairPrompt);
  validation = validateVisualPlanScenesResponse(rawText);

  if (validation.ok && validation.scenesJson) {
    const parsed = JSON.parse(validation.scenesJson) as Array<{
      scriptText?: string;
    }>;
    if (isVisualPlanMegaSceneCollapse(parsed)) {
      throw new VisualPlanRunError(
        `${callType}_REPAIR returned a single mega-scene instead of per-turn scenes.`,
        rawText,
        { callType: `${callType}_REPAIR` },
      );
    }
    return { scenesJson: validation.scenesJson, rawText };
  }

  if (isVisualPlanOutputTooLarge(rawText)) {
    throw new VisualPlanRunError(
      `${callType}_REPAIR output is still too large for ChatGPT to paste inline.`,
      rawText,
      { callType: `${callType}_REPAIR` },
    );
  }

  await failValidatedCall({
    videoId,
    callType: `${callType}_REPAIR`,
    draftNumber: 1,
    rawText,
    validationErrors: validation.errors,
  });

  throw new VisualPlanRunError(
    `${callType} failed validation after repair retry.`,
    rawText,
    { callType },
  );
}

async function sendValidatedFillChunk({
  send,
  videoId,
  prompt,
  expectedOrders,
  chunkIndex,
  totalChunks,
  channelKey,
}: {
  send: VisualPlanSend;
  videoId: string;
  prompt: string;
  expectedOrders: number[];
  chunkIndex: number;
  totalChunks: number;
  channelKey: string;
}): Promise<{ patches: VisualPlanFillPatch[]; rawText: string }> {
  const callType = "GENERATE_VISUAL_PLAN_FILL_CHUNK";
  let rawText = await send(prompt);
  let validation = validateVisualPlanFillResponse(rawText, expectedOrders);

  if (validation.ok) {
    return { patches: validation.patches, rawText };
  }

  if (validation.tooLarge) {
    throw new VisualPlanRunError(
      `${callType} ${chunkIndex + 1}/${totalChunks} is too large; split the chunk.`,
      rawText,
      { callType },
    );
  }

  console.warn("[visual-plan-batch] fill chunk validation failed; repairing once", {
    videoId,
    chunkIndex,
    totalChunks,
    errors: validation.errors,
  });

  const repairPrompt = buildVisualPlanFillRepairPrompt({
    chunkIndex,
    totalChunks,
    expectedOrders,
    validationErrors: validation.errors,
    invalidResponse: rawText,
    channelKey,
  });
  rawText = await send(repairPrompt);
  validation = validateVisualPlanFillResponse(rawText, expectedOrders);

  if (validation.ok) {
    return { patches: validation.patches, rawText };
  }

  if (validation.tooLarge) {
    throw new VisualPlanRunError(
      `${callType}_REPAIR ${chunkIndex + 1}/${totalChunks} is too large; split the chunk.`,
      rawText,
      { callType: `${callType}_REPAIR` },
    );
  }

  // Soft-fail so the caller can split the chunk instead of aborting the whole batch.
  throw new VisualPlanRunError(
    `${callType} failed validation after repair retry (draft V${chunkIndex + 1}): ${validation.errors.slice(0, 3).join(" ")}`,
    rawText,
    { callType: `${callType}_REPAIR` },
  );
}

async function fillSkeletonChunks({
  send,
  videoId,
  contextPrompt,
  scenes,
  scriptHash,
  channelKey,
  episodeContext,
  title,
  topicCategory,
  chunkSize = VISUAL_PLAN_FILL_CHUNK_SIZE,
}: {
  send: VisualPlanSend;
  videoId: string;
  contextPrompt: string;
  scenes: PodcastVisualPlanSkeletonScene[];
  scriptHash: string;
  channelKey: string;
  episodeContext?: string | null;
  title?: string | null;
  topicCategory?: string | null;
  chunkSize?: number;
}): Promise<{
  scenes: PodcastVisualPlanSkeletonScene[];
  rawTexts: string[];
  chunkCount: number;
  skippedChunks: number;
  filledFromChatGpt: number;
}> {
  let working = scenes;
  const rawTexts: string[] = [];
  let skippedChunks = 0;
  let filledFromChatGpt = 0;
  const effectiveChunkSize = Math.max(1, Math.floor(chunkSize));

  const persistCheckpoint = async () => {
    await saveVisualPlanHybridCheckpoint({
      videoId,
      scriptHash,
      channelKey,
      scenes: working,
    });
  };

  const processChunkList = async (
    chunkList: PodcastVisualPlanSkeletonScene[][],
    depth: number,
  ) => {
    for (let chunkIndex = 0; chunkIndex < chunkList.length; chunkIndex += 1) {
      if (isVisualPlanCancelRequested(videoId)) {
        await persistCheckpoint();
        throw new VisualPlanCanceledError("Visual Plan Batch canceled.");
      }

      const chunk = chunkList[chunkIndex]!;
      if (chunk.length === 0) {
        continue;
      }

      if (chunkIsAlreadyFilled(chunk, working)) {
        skippedChunks += 1;
        console.info("[visual-plan-batch] skip filled chunk", {
          videoId,
          chunkIndex: chunkIndex + 1,
          totalChunks: chunkList.length,
          orders: chunk.map((scene) => scene.order),
          depth,
        });
        continue;
      }

      const byOrder = new Map(working.map((scene) => [scene.order, scene]));
      // Skip locally-owned PART covers (already visualsFilled) inside mixed chunks.
      const toFill = chunk.filter(
        (scene) => byOrder.get(scene.order)?.visualsFilled !== true,
      );
      if (toFill.length === 0) {
        skippedChunks += 1;
        continue;
      }

      const expectedOrders = toFill.map((scene) => scene.order);
      const previousTail = working
        .filter((scene) => scene.order < expectedOrders[0]!)
        .slice(-3);
      const fillPrompt = buildVisualPlanFillChunkPrompt({
        contextPrompt,
        chunk: toFill,
        chunkIndex,
        totalChunks: chunkList.length,
        previousTail,
        channelKey,
      });

      console.info("[visual-plan-batch] fill chunk", {
        videoId,
        chunkIndex: chunkIndex + 1,
        totalChunks: chunkList.length,
        orders: expectedOrders,
        depth,
        filledSoFar: countFilledVisualPlanScenes(working),
      });

      try {
        const filled = await sendValidatedFillChunk({
          send,
          videoId,
          prompt: fillPrompt,
          expectedOrders,
          chunkIndex,
          totalChunks: chunkList.length,
          channelKey,
        });
        rawTexts.push(filled.rawText);
        working = applyVisualPlanFillPatches(working, filled.patches, {
          channelKey,
          episodeContext,
          title,
          topicCategory,
        });
        filledFromChatGpt += filled.patches.length;
        await persistCheckpoint();
        console.info("[visual-plan-batch] checkpoint saved", {
          videoId,
          filled: countFilledVisualPlanScenes(working),
          total: working.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldSplit =
          toFill.length > 1 &&
          depth < 3 &&
          (error instanceof VisualPlanRunError && /too large/i.test(message) ||
            /not parseable JSON|Missing fill patch|Unexpected fill patch|Fill response must be a JSON array/i.test(
              message,
            ));

        if (shouldSplit) {
          console.warn("[visual-plan-batch] splitting fill chunk after failure", {
            videoId,
            chunkSize: toFill.length,
            depth,
            reason: message.slice(0, 180),
          });
          const mid = Math.ceil(toFill.length / 2);
          await processChunkList(
            [toFill.slice(0, mid), toFill.slice(mid)],
            depth + 1,
          );
          continue;
        }
        // Keep progress from earlier chunks even when this one fails.
        await persistCheckpoint();
        throw error;
      }
    }
  };

  await processChunkList(
    chunkPodcastSkeletonScenes(working, effectiveChunkSize),
    0,
  );

  return {
    scenes: working,
    rawTexts,
    chunkCount: Math.ceil(scenes.length / effectiveChunkSize),
    skippedChunks,
    filledFromChatGpt,
  };
}

function parseSectionScenesFromValidatedJson(
  scenesJson: string,
  startOrder: number,
): VisualPlanSectionScene[] {
  const parsed = JSON.parse(scenesJson) as Array<{
    scriptText?: string;
    sceneType?: string;
    visualPurpose?: string;
    visualIdea?: string;
    duration?: number;
    imagePrompt?: string;
    pauseAfterMs?: number | null;
  }>;

  return parsed.map((scene, index) => {
    const sceneType = scene.sceneType;
    if (
      sceneType !== "avatar" &&
      sceneType !== "insert" &&
      sceneType !== "space"
    ) {
      throw new VisualPlanRunError(
        `Section scene ${index + 1} has invalid sceneType.`,
        scenesJson,
        { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
      );
    }
    return {
      order: startOrder + index,
      scriptText: String(scene.scriptText ?? ""),
      sceneType,
      visualPurpose: String(scene.visualPurpose ?? ""),
      visualIdea: String(scene.visualIdea ?? ""),
      duration: Number(scene.duration),
      imagePrompt: String(scene.imagePrompt ?? ""),
      status: "planned" as const,
      pauseAfterMs: null,
    };
  });
}

function sectionScenesToImportJson(scenes: VisualPlanSectionScene[]) {
  return JSON.stringify(
    scenes.map((scene) => ({
      order: scene.order,
      scriptText: scene.scriptText,
      sceneType: scene.sceneType,
      visualPurpose: scene.visualPurpose,
      visualIdea: scene.visualIdea,
      duration: scene.duration,
      imagePrompt: scene.imagePrompt,
      status: scene.status,
      // Micro-pauses are owned by the app (DEFAULT_SCENE_PAUSE_AFTER_MS when null).
      // Do not persist ChatGPT pauseAfterMs from section plans.
    })),
  );
}

/** Platform fill-hybrid: local skeleton + ChatGPT fill patches. Podcast uses its own skeleton. */
async function runFillHybridVisualPlan({
  send,
  videoId,
  script,
  providerKey,
  channelKey,
  resetCheckpoint = false,
  title,
  topicCategory,
  ideaJson,
  episodeContext,
}: {
  send: VisualPlanSend;
  videoId: string;
  script: string;
  providerKey: string;
  channelKey: string;
  resetCheckpoint?: boolean;
  title?: string | null;
  topicCategory?: string | null;
  ideaJson?: string | null;
  episodeContext?: string | null;
}) {
  const isPodcast = channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;

  let scenes: PodcastVisualPlanSkeletonScene[];
  let spokenCount: number;
  let musicBedCount = 0;
  let sectionCount: number | null = null;
  let contextPrompt: string;
  let contextKind: string;
  let chunkSize = VISUAL_PLAN_FILL_CHUNK_SIZE;
  let versionLabel = "v1-hybrid";
  let normalizeScenes: (
    next: PodcastVisualPlanSkeletonScene[],
  ) => PodcastVisualPlanSkeletonScene[] = (next) => next;

  if (isPodcast) {
    const skeleton = buildPodcastVisualPlanSkeleton(script, {
      title,
      topicCategory,
      episodeContext:
        episodeContext ??
        [title, topicCategory, script.slice(0, 4000)].filter(Boolean).join("\n"),
    });
    scenes = skeleton.scenes;
    spokenCount = skeleton.spokenTurnCount;
    musicBedCount = skeleton.musicBedCount;
    contextPrompt = buildPodcastHybridFillBrief();
    contextKind = "podcast-fill";
  } else {
    const profile = resolveVisualPlanFillProfile({
      channelKey,
      script,
      title,
      topicCategory,
      ideaJson,
      episodeContext,
    });
    scenes = profile.scenes;
    spokenCount = profile.spokenCount;
    musicBedCount = profile.musicBedCount;
    sectionCount = profile.sectionCount;
    contextPrompt = profile.contextPrompt;
    contextKind = profile.contextKind;
    chunkSize = profile.chunkSize;
    versionLabel = profile.versionLabel;
    normalizeScenes = profile.normalizeScenes;

    if (profile.coverageError) {
      throw new VisualPlanRunError(profile.coverageError, null, {
        callType: "GENERATE_VISUAL_PLAN_SKELETON",
      });
    }
  }

  if (scenes.length === 0) {
    throw new VisualPlanRunError(
      isPodcast
        ? "Hybrid visual plan: no spoken/music scenes could be built from the script. Check [EMMA]/[LEO]/[MUSIC] labels."
        : "Hybrid visual plan: no narration beats could be built from the script.",
      null,
      { callType: "GENERATE_VISUAL_PLAN_SKELETON" },
    );
  }

  const scriptHash = hashVisualPlanScript(script);
  if (resetCheckpoint) {
    await clearVisualPlanHybridCheckpoint(videoId);
  }

  const checkpoint = resetCheckpoint
    ? null
    : await loadVisualPlanHybridCheckpoint(videoId);
  const merged = mergeVisualPlanHybridCheckpoint({
    skeleton: scenes,
    checkpoint,
    scriptHash,
  });

  console.info("[visual-plan-batch] hybrid skeleton", {
    videoId,
    channelKey,
    contextKind,
    scenes: scenes.length,
    spokenCount,
    musicBedCount,
    sectionCount,
    resumed: merged.resumed,
    alreadyFilled: merged.filledCount,
  });

  console.info("[visual-plan-batch] hybrid fill context", {
    videoId,
    channelKey,
    slimContextChars: contextPrompt.length,
    mode: contextKind,
    chunkSize,
  });

  await saveVisualPlanHybridCheckpoint({
    videoId,
    scriptHash,
    channelKey,
    scenes: merged.scenes,
  });

  const filled = await fillSkeletonChunks({
    send: (prompt) => send(prompt, { freshConversation: true }),
    videoId,
    contextPrompt,
    scenes: merged.scenes,
    scriptHash,
    channelKey,
    episodeContext,
    title,
    topicCategory,
    chunkSize,
  });

  const importScenes = normalizeScenes(filled.scenes);

  const scenesJson = skeletonScenesToImportJson(importScenes);
  const finalValidation = validateVisualPlanScenesResponse(scenesJson);
  if (!finalValidation.ok || !finalValidation.scenesJson) {
    throw new VisualPlanRunError(
      `Hybrid visual plan merge failed validation: ${finalValidation.errors.slice(0, 3).join(" ")}`,
      scenesJson,
      { callType: "GENERATE_VISUAL_PLAN_FILL_CHUNK" },
    );
  }

  await clearVisualPlanHybridCheckpoint(videoId);

  return {
    providerKey,
    scenesJson: finalValidation.scenesJson,
    rawText: filled.rawTexts.join("\n\n---CHUNK---\n\n"),
    draftNumber: filled.chunkCount,
    version: versionLabel,
    mode: "hybrid" as const,
    hybridKind: "fill" as const,
    sceneCount: importScenes.length,
    resumedFilledCount: merged.filledCount,
    skippedChunks: filled.skippedChunks,
    filledFromChatGpt: filled.filledFromChatGpt,
  };
}

/**
 * Structural-marker scripts (e.g. God's Word) and Wealth Insights:
 * ChatGPT fully plans each section; app chunks by section and checkpoints.
 */
async function buildSectionHybridContextPrompt(options: {
  videoId: string;
  channelKey: string;
  topicCategory?: string | null;
  title?: string | null;
  ideaJson?: string | null;
  script?: string | null;
}): Promise<{
  contextPrompt: string;
  styleLockReminder: string | null;
  contextKind: string;
  sceneTypeMixMode: SectionSceneTypeMixMode;
  includeCoverRules: boolean;
  enforceCoverage: boolean;
  enforceWealthDurations: boolean;
  enforceGodsWordDurations: boolean;
  normalizeWealthImagePrompts: boolean;
}> {
  const {
    videoId,
    channelKey,
    topicCategory,
    title,
    ideaJson,
    script,
  } = options;

  if (channelKey === "wealth-insights") {
    let parsedIdea: unknown = ideaJson;
    if (typeof ideaJson === "string" && ideaJson.trim()) {
      try {
        parsedIdea = JSON.parse(ideaJson);
      } catch {
        parsedIdea = ideaJson;
      }
    }
    const mode = resolveWealthInsightsVisualMode({
      topicCategory,
      ideaJson: parsedIdea,
    });
    const library = buildWealthInsightsVisualElementLibraryCompact({
      title,
      topicCategory,
      ideaJson: parsedIdea,
      script,
    });
    return {
      contextPrompt: buildWealthInsightsSectionHybridContext({
        mode,
        visualElementLibraryCompact: library,
      }),
      styleLockReminder:
        mode === "narrative_economics_stories"
          ? WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK
          : null,
      contextKind:
        mode === "narrative_economics_stories"
          ? "wealth-narrative-compact"
          : "wealth-default-compact",
      sceneTypeMixMode: "avatar-default",
      includeCoverRules: false,
      enforceCoverage: true,
      enforceWealthDurations: true,
      enforceGodsWordDurations: false,
      normalizeWealthImagePrompts: mode !== "narrative_economics_stories",
    };
  }

  if (channelKey === "the-gods-word") {
    if (isBibleOneYearCategory(topicCategory)) {
      return {
        contextPrompt: buildBibleOneYearSectionHybridContext(),
        styleLockReminder: null,
        contextKind: "bible-one-year-compact",
        sceneTypeMixMode: "soft-balance",
        includeCoverRules: true,
        enforceCoverage: true,
        enforceWealthDurations: false,
        // Bible One Year pacing is scripture-led; keep essay pacing validator off.
        enforceGodsWordDurations: false,
        normalizeWealthImagePrompts: false,
      };
    }
    return {
      contextPrompt: buildTheGodsWordSectionHybridContext(),
      // App assembles style/negative locks — do not re-ship the full lock in every chunk.
      styleLockReminder: null,
      contextKind: "gods-word-compact",
      sceneTypeMixMode: "soft-balance",
      includeCoverRules: true,
      enforceCoverage: true,
      enforceWealthDurations: false,
      enforceGodsWordDurations: true,
      normalizeWealthImagePrompts: false,
    };
  }

  // Fallback for any other channel that happens to use structural markers.
  const fullPlannerPrompt =
    (await getVideoPrompt(videoId, "visual-planner"))?.trim() || "";
  return {
    contextPrompt: slimHybridVisualPlanContext(fullPlannerPrompt, {
      maxChars: 14_000,
      fallbackBlurb:
        "Follow the channel visual planner rules. Segment meaning-first, choose formats and durations, write imagePrompts. Keep identity locks consistent. No logos or baked-in captions unless required.",
    }),
    styleLockReminder: null,
    contextKind: "slim-full-prompt",
    sceneTypeMixMode: "soft-balance",
    includeCoverRules: true,
    enforceCoverage: true,
    enforceWealthDurations: false,
    enforceGodsWordDurations: false,
    normalizeWealthImagePrompts: false,
  };
}

function sectionSpokenText(section: StructuralScriptSection) {
  return stripStructuralMarkers(section.text);
}

function validateSectionChunkScenes({
  section,
  sectionScenes,
  enforceCoverage,
  enforceWealthDurations,
  enforceGodsWordDurations,
}: {
  section: StructuralScriptSection;
  sectionScenes: VisualPlanSectionScene[];
  enforceCoverage: boolean;
  enforceWealthDurations: boolean;
  enforceGodsWordDurations: boolean;
}): string[] {
  const errors: string[] = [];
  if (sectionScenes.length === 0) {
    errors.push("Section returned no scenes.");
    return errors;
  }

  if (enforceCoverage) {
    const coverage = validateWealthSectionScriptCoverage(
      sectionSpokenText(section),
      sectionScenes.map((scene) => scene.scriptText),
    );
    if (!coverage.ok) {
      errors.push(`Script coverage: ${coverage.reason}`);
    }
  }

  if (enforceWealthDurations) {
    errors.push(
      ...validateWealthSceneDurations(sectionScenes, {
        isHookSection: isWealthHookSectionLabel(section.label),
      }),
    );
  }

  if (enforceGodsWordDurations) {
    errors.push(
      ...validateGodsWordSceneDurations(sectionScenes, {
        isHookSection: isWealthHookSectionLabel(section.label),
      }),
    );
  }

  return errors;
}

async function runSectionGenerateHybridVisualPlan({
  send,
  videoId,
  script,
  providerKey,
  channelKey,
  topicCategory = null,
  title = null,
  ideaJson = null,
  resetCheckpoint = false,
}: {
  send: VisualPlanSend;
  videoId: string;
  script: string;
  providerKey: string;
  channelKey: string;
  topicCategory?: string | null;
  title?: string | null;
  ideaJson?: string | null;
  resetCheckpoint?: boolean;
}) {
  const sections = resolveVisualPlanSectionsForChannel({ channelKey, script });
  if (sections.length === 0) {
    throw new VisualPlanRunError(
      "Section hybrid visual plan: no sections found in the script.",
      null,
      { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
    );
  }

  const reconstruct = sectionsReconstructScript(script, sections);
  if (!reconstruct.ok && channelKey === "wealth-insights") {
    throw new VisualPlanRunError(
      `Wealth section splitter failed integrity check: ${reconstruct.reason}`,
      null,
      { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
    );
  }

  const scriptHash = hashVisualPlanScript(script);
  if (resetCheckpoint) {
    await clearVisualPlanHybridCheckpoint(videoId);
  }

  const checkpoint = resetCheckpoint
    ? null
    : await loadVisualPlanHybridCheckpoint(videoId);
  const sectionIds = sections.map((section) => section.id);
  const merged = mergeVisualPlanSectionCheckpoint({
    sectionIds,
    checkpoint,
    scriptHash,
  });

  let accumulated = [...merged.scenes];
  const completed = new Set(merged.completedSectionIds);
  const rawTexts: string[] = [];
  let skippedSections = 0;
  let generatedSections = 0;

  const {
    contextPrompt,
    styleLockReminder,
    contextKind,
    sceneTypeMixMode,
    includeCoverRules,
    enforceCoverage,
    enforceWealthDurations,
    enforceGodsWordDurations,
    normalizeWealthImagePrompts,
  } = await buildSectionHybridContextPrompt({
    videoId,
    channelKey,
    topicCategory,
    title,
    ideaJson,
    script,
  });

  console.info("[VisualPlan] Section hybrid", {
    videoId,
    channelKey,
    topicCategory,
    contextKind,
    sections: sections.length,
    resumed: merged.resumed,
    alreadyCompleted: merged.completedSectionIds.length,
    contextChars: contextPrompt.length,
    hasStyleLockReminder: Boolean(styleLockReminder),
    sceneTypeMixMode,
    enforceCoverage,
    enforceWealthDurations,
    enforceGodsWordDurations,
    normalizeWealthImagePrompts,
  });

  await saveVisualPlanSectionCheckpoint({
    videoId,
    scriptHash,
    channelKey,
    sectionIds,
    completedSectionIds: [...completed],
    scenes: accumulated,
  });

  for (const section of sections) {
    if (isVisualPlanCancelRequested(videoId)) {
      await saveVisualPlanSectionCheckpoint({
        videoId,
        scriptHash,
        channelKey,
        sectionIds,
        completedSectionIds: [...completed],
        scenes: accumulated,
      });
      throw new VisualPlanCanceledError("Visual Plan Batch canceled.");
    }

    if (completed.has(section.id)) {
      skippedSections += 1;
      console.info("[VisualPlan] skip completed section", {
        videoId,
        sectionId: section.id,
        label: section.label,
      });
      continue;
    }

    const continuity = buildWealthVisualContinuityState(accumulated);
    const previousTail = accumulated.slice(-3).map((scene) => ({
      order: scene.order,
      scriptText: scene.scriptText,
      sceneType: scene.sceneType,
      visualPurpose: scene.visualPurpose,
      visualIdea: scene.visualIdea,
      // God's Word: send body-only to avoid re-shipping style/negative locks.
      imagePrompt:
        channelKey === "the-gods-word"
          ? compactGodsWordImagePromptForContinuity(scene.imagePrompt)
          : scene.imagePrompt,
      duration: scene.duration,
    }));
    const nextOrder = continuity.nextSceneOrder;
    const sceneTypeMix = summarizeSectionSceneTypeMix(accumulated);

    const isHookSection = isWealthHookSectionLabel(section.label);
    const suggestedBeats = isHookSection
      ? segmentHookNarration(section.text)
      : null;

    const sectionPrompt = buildSectionVisualPlanChunkPrompt({
      contextPrompt,
      section,
      totalSections: sections.length,
      previousTail,
      sceneTypeMix,
      sceneTypeMixMode,
      styleLockReminder,
      includeCoverRules,
      hardHookMode: isHookSection,
      suggestedBeats,
      continuityExtras: {
        nextSceneOrder: continuity.nextSceneOrder,
        completedScenes: continuity.completedScenes,
        lastSceneType: continuity.lastSceneType,
        lastVisualIdea: continuity.lastVisualIdea,
        lastDominantElement: continuity.lastDominantElement,
        recentVisualIdeas: continuity.recentVisualIdeas,
        recentDominantElements: continuity.recentDominantElements,
        recentMotifs: continuity.recentMotifs,
      },
      timingHint:
        channelKey === "wealth-insights"
          ? isHookSection
            ? "HOOK: section is ≥ first ~2 minutes of narration; normal ~2–4s per scene; 4–5s only if indivisible; 5.5s estimated narration is the absolute ceiling. Hard Hook Segmentation Override. Never bypass by lowering duration."
            : "BODY/CLOSING: 5–8s per scene. Hard max 8s estimated. Follow Timing Rules in context."
          : channelKey === "the-gods-word"
            ? isHookSection
              ? "HOOK ONLY: 3–6s / ~4–12 words. Hard hook segmentation. Never one-word scenes; merge 1–3 word orphans."
              : "BODY/CHAPTER: Moderate segmentation (NOT hard hook). Target ~15–25 words and 5–8s (soft floor 5–6s; prefer 6–8s). Prefer same-claim merges. Never one-word scenes."
            : null,
    });

    console.info(
      `[VisualPlan] Section ${section.index + 1}/${sections.length}`,
    );
    console.info("[VisualPlan] script chars:", section.text.length);
    console.info("[VisualPlan] start order:", nextOrder);

    try {
      let generated = await sendValidatedScenes({
        send: (prompt) => send(prompt, { freshConversation: true }),
        videoId,
        prompt: sectionPrompt,
      });
      let sectionScenes = parseSectionScenesFromValidatedJson(
        generated.scenesJson,
        nextOrder,
      );

      let sectionErrors = validateSectionChunkScenes({
        section,
        sectionScenes,
        enforceCoverage,
        enforceWealthDurations,
        enforceGodsWordDurations,
      });

      if (sectionErrors.length > 0) {
        console.warn("[VisualPlan] section validation failed; repairing once", {
          videoId,
          sectionId: section.id,
          errors: sectionErrors.slice(0, 4),
        });
        const repairPrompt = buildVisualPlanSectionChunkRepairPrompt({
          sectionIndex: section.index + 1,
          totalSections: sections.length,
          sectionLabel: section.label,
          sectionText: sectionSpokenText(section),
          startOrder: nextOrder,
          validationErrors: sectionErrors,
          invalidResponse: generated.rawText,
          sceneDiagnostics: sectionScenes.map((scene, index) => ({
            index: index + 1,
            estimatedSeconds: estimateWealthNarrationSeconds(scene.scriptText),
            declaredDuration: Number(scene.duration),
            wordCount: scene.scriptText.trim()
              ? scene.scriptText.trim().split(/\s+/).filter(Boolean).length
              : 0,
            scriptText: scene.scriptText,
          })),
        });
        const repairedRaw = await send(repairPrompt, {
          freshConversation: true,
        });
        const repairedValidation =
          validateVisualPlanScenesResponse(repairedRaw);
        if (!repairedValidation.ok || !repairedValidation.scenesJson) {
          throw new VisualPlanRunError(
            `Section ${section.index + 1}/${sections.length} ([${section.label}]) failed coverage/duration repair: ${[
              ...sectionErrors,
              ...repairedValidation.errors,
            ]
              .slice(0, 4)
              .join(" ")}`,
            repairedRaw,
            { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
          );
        }
        generated = {
          scenesJson: repairedValidation.scenesJson,
          rawText: repairedRaw,
        };
        sectionScenes = parseSectionScenesFromValidatedJson(
          generated.scenesJson,
          nextOrder,
        );
        sectionErrors = validateSectionChunkScenes({
          section,
          sectionScenes,
          enforceCoverage,
          enforceWealthDurations,
          enforceGodsWordDurations,
        });
        if (sectionErrors.length > 0) {
          throw new VisualPlanRunError(
            `Section ${section.index + 1}/${sections.length} ([${section.label}]) still invalid after repair: ${sectionErrors
              .slice(0, 4)
              .join(" ")}`,
            generated.rawText,
            { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
          );
        }
      }

      rawTexts.push(generated.rawText);
      if (normalizeWealthImagePrompts) {
        sectionScenes = normalizeWealthInsightsScenes(sectionScenes);
      }
      if (channelKey === "the-gods-word") {
        sectionScenes = normalizeGodsWordScenes(sectionScenes);
      }
      console.info("[VisualPlan] generated scenes:", sectionScenes.length);
      console.info(
        "[VisualPlan] coverage:",
        enforceCoverage ? "PASS" : "SKIPPED",
      );
      console.info(
        "[VisualPlan] duration validation:",
        enforceWealthDurations || enforceGodsWordDurations ? "PASS" : "SKIPPED",
        enforceGodsWordDurations
          ? "(gods-word pacing)"
          : enforceWealthDurations
            ? "(wealth)"
            : "",
      );
      if (normalizeWealthImagePrompts) {
        console.info("[VisualPlan] wealth imagePrompt locks: APPLIED");
      }

      accumulated = [...accumulated, ...sectionScenes];
      completed.add(section.id);
      generatedSections += 1;

      await saveVisualPlanSectionCheckpoint({
        videoId,
        scriptHash,
        channelKey,
        sectionIds,
        completedSectionIds: sectionIds.filter((id) => completed.has(id)),
        scenes: accumulated,
      });

      console.info("[VisualPlan] section checkpoint saved", {
        videoId,
        sectionId: section.id,
        completed: completed.size,
        total: sections.length,
        scenes: accumulated.length,
      });
    } catch (error) {
      await saveVisualPlanSectionCheckpoint({
        videoId,
        scriptHash,
        channelKey,
        sectionIds,
        completedSectionIds: sectionIds.filter((id) => completed.has(id)),
        scenes: accumulated,
      });
      throw error;
    }
  }

  const orderCheck = validateSequentialSceneOrders(accumulated);
  if (!orderCheck.ok) {
    // Normalize orders if ChatGPT drifted but scenes are otherwise valid.
    accumulated = accumulated.map((scene, index) => ({
      ...scene,
      order: index + 1,
    }));
  }

  const scenesJson = sectionScenesToImportJson(accumulated);
  const finalValidation = validateVisualPlanScenesResponse(scenesJson);
  if (!finalValidation.ok || !finalValidation.scenesJson) {
    throw new VisualPlanRunError(
      `Section hybrid merge failed validation: ${finalValidation.errors.slice(0, 3).join(" ")}`,
      scenesJson,
      { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
    );
  }

  const finalOrder = validateSequentialSceneOrders(
    JSON.parse(finalValidation.scenesJson) as Array<{ order: number }>,
  );
  const fullCoverage = validateFullVisualPlanScriptCoverage(
    script,
    (
      JSON.parse(finalValidation.scenesJson) as Array<{ scriptText: string }>
    ).map((scene) => scene.scriptText),
  );

  console.info("[VisualPlan] Full assembly");
  console.info("[VisualPlan] sections:", sections.length);
  console.info(
    "[VisualPlan] scenes:",
    (JSON.parse(finalValidation.scenesJson) as unknown[]).length,
  );
  console.info(
    "[VisualPlan] full script coverage:",
    enforceCoverage ? (fullCoverage.ok ? "PASS" : "FAIL") : "SKIPPED",
  );
  console.info(
    "[VisualPlan] sequential orders:",
    finalOrder.ok ? "PASS" : "FAIL",
  );
  console.info("[VisualPlan] schema validation: PASS");

  if (enforceCoverage && !fullCoverage.ok) {
    throw new VisualPlanRunError(
      `Full visual plan script coverage failed: ${fullCoverage.reason}`,
      finalValidation.scenesJson,
      { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
    );
  }
  if (!finalOrder.ok) {
    throw new VisualPlanRunError(
      `Full visual plan order validation failed: ${finalOrder.reason}`,
      finalValidation.scenesJson,
      { callType: "GENERATE_VISUAL_PLAN_SECTION_CHUNK" },
    );
  }

  await clearVisualPlanHybridCheckpoint(videoId);

  return {
    providerKey,
    scenesJson: finalValidation.scenesJson,
    rawText: rawTexts.join("\n\n---SECTION---\n\n"),
    draftNumber: sections.length,
    version: "v2-section-hybrid" as const,
    mode: "hybrid" as const,
    hybridKind: "section_generate" as const,
    sceneCount: accumulated.length,
    resumedFilledCount: merged.completedSectionIds.length,
    skippedChunks: skippedSections,
    filledFromChatGpt: generatedSections,
  };
}

/**
 * Visual Plan Batch:
 * - podcast: local skeleton + chunked visual fill
 * - structural-marker scripts: ChatGPT plans each section; checkpoint by section
 * - otherwise: single full GENERATE call
 */
export async function runVisualPlanViaBrowser({
  videoId,
  prompt,
  providerKey,
  resetCheckpoint = false,
}: {
  videoId: string;
  prompt: string;
  providerKey?: string;
  resetCheckpoint?: boolean;
}) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error(
      "Visual Plan request is empty. Generate the ChatGPT request first, then Run Batch.",
    );
  }

  clearVisualPlanCancel(videoId);

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      channelKey: true,
      script: true,
      topicCategory: true,
      title: true,
      ideaJson: true,
    },
  });
  if (!video) {
    throw new Error("Video not found.");
  }

  const script = video.script?.trim() ?? "";
  // Platform default: fill-hybrid for every channel with a script.
  // Podcast keeps its own Emma/Leo/music skeleton inside the same orchestration.
  // Section-hybrid (ChatGPT plans whole sections) is no longer the default path.
  const useFillHybrid = Boolean(script);

  try {
    const batch = await withChatGptBrowserTurns({
      jobId: `visual-plan-${videoId}-${Date.now()}`,
      providerKey,
      timeoutMs: 1_800_000,
      shouldAbort: () => isVisualPlanCancelRequested(videoId),
      run: async ({ send, providerKey: usedProviderKey }) => {
        if (useFillHybrid) {
          console.info("[visual-plan-batch] mode", {
            videoId,
            mode: "hybrid-fill",
            channelKey: video.channelKey,
            resetCheckpoint,
          });
          return runFillHybridVisualPlan({
            send,
            videoId,
            script,
            providerKey: usedProviderKey,
            channelKey: video.channelKey,
            resetCheckpoint,
            title: video.title,
            topicCategory: video.topicCategory,
            ideaJson: video.ideaJson,
            episodeContext: [
              video.title,
              video.topicCategory,
              script.slice(0, 4000),
              video.ideaJson?.slice(0, 2000) ?? "",
            ].join("\n"),
          });
        }

        console.info("[visual-plan-batch] call", {
          videoId,
          callType: VISUAL_PLAN_CALL.GENERATE,
          draftNumber: 1,
          mode: "full",
        });

        const generated = await sendValidatedScenes({
          send,
          videoId,
          prompt: trimmed,
        });

        console.info("[visual-plan-batch] finished", {
          videoId,
          callType: VISUAL_PLAN_CALL.GENERATE,
          scenesJsonLength: generated.scenesJson.length,
          mode: "full",
        });

        return {
          providerKey: usedProviderKey,
          scenesJson: generated.scenesJson,
          rawText: generated.rawText,
          draftNumber: 1,
          version: "v1" as const,
          mode: "full" as const,
          sceneCount: null as number | null,
        };
      },
    });

    return {
      ok: true as const,
      videoId,
      ...batch,
    };
  } catch (error) {
    if (
      error instanceof VisualPlanCanceledError ||
      (error instanceof BrowserAutomationError && error.code === "canceled")
    ) {
      throw new VisualPlanCanceledError(
        error instanceof Error ? error.message : "Visual Plan Batch canceled.",
      );
    }

    if (error instanceof VisualPlanRunError) {
      throw error;
    }

    if (error instanceof ChatGptPromptRunError) {
      throw new VisualPlanRunError(error.message, error.rawText, {
        callType: VISUAL_PLAN_CALL.GENERATE,
      });
    }

    const message =
      error instanceof Error ? error.message : "Visual Plan Batch failed.";
    throw new VisualPlanRunError(message, null, {
      callType: VISUAL_PLAN_CALL.GENERATE,
    });
  }
}
