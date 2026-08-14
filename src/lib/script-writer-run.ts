import { getComputedVideoStatus } from "@/lib/status";
import { prisma } from "@/lib/prisma";
import { getVideoPrompt } from "@/lib/video-prompts";
import { getChannelProfile } from "@/lib/channels-server";
import {
  ChatGptPromptRunError,
  withChatGptBrowserTurns,
} from "@/lib/browser-providers/run-chatgpt-prompt";
import { BrowserAutomationError } from "@/lib/browser-automation/errors";
import { extractScriptFromResponse } from "@/lib/script-writer-extract";
import {
  buildScriptWriterRevisionPrompt,
  considerScriptWriterBestDraft,
  escalateStalledPolishDecision,
  extractScriptScore,
  getScriptWriterMaxDrafts,
  getScriptWriterPassScore,
  getScriptWriterScorePrompt,
  resolveScriptWriterRevisionDecision,
  shouldReviseScriptForDecision,
  SCRIPT_WRITER_MAX_CONSECUTIVE_REGRESSIONS,
  type ScriptWriterBestDraft,
} from "@/lib/script-writer-critique";
import { getScriptWriterPromptContext } from "@/lib/script-writer-prompt-context";
import {
  ScriptWriterCanceledError,
  clearScriptWriterCancel,
  isScriptWriterCancelRequested,
} from "@/lib/script-writer-cancel";
import {
  clearScriptWriterCheckpoint,
  hashScriptWriterIdea,
  loadScriptWriterCheckpoint,
  saveScriptWriterCheckpoint,
  type ScriptWriterCheckpoint,
} from "@/lib/script-writer-checkpoint";
import {
  formatPodcastValidationReport,
  validatePodcastEnglishScript,
} from "@/lib/podcast-english-lessons-script-validate";
import {
  PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
  resolvePodcastEpisodeFormat,
} from "@/lib/podcast-english-lessons-script-shared";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import {
  GODS_WORD_SCRIPT_WRITER_MAX_DRAFTS,
  GODS_WORD_SCRIPT_WRITER_PASS_SCORE,
  GODS_WORD_STRUCTURAL_MARKERS_RECOMMENDATION,
  THE_GODS_WORD_CHANNEL_KEY,
  buildGodsWordApplyRecommendationPrompt,
  buildGodsWordTopicIdeaScriptPrompt,
  godsWordScriptHasStructuralMarkers,
  godsWordScriptPassed,
  parseGodsWordScriptBatchResponse,
} from "@/lib/the-gods-word-script-prompt";

export class ScriptWriterRunError extends Error {
  readonly rawText: string | null;

  constructor(message: string, rawText: string | null = null) {
    super(message);
    this.name = "ScriptWriterRunError";
    this.rawText = rawText;
  }
}

async function persistLatestScript(videoId: string, script: string) {
  const normalized = extractScriptFromResponse(script);
  const updated = await prisma.video.update({
    where: { id: videoId },
    data: { script: normalized },
    select: {
      ideaJson: true,
      script: true,
      metadataJson: true,
      scenes: { select: { imagePrompt: true } },
    },
  });
  const status = getComputedVideoStatus(updated);
  await prisma.video.update({
    where: { id: videoId },
    data: { status },
  });
  return normalized;
}

function validateIfPodcast(
  channelKey: string | null | undefined,
  script: string,
  options?: {
    ideaJson?: string | null;
    title?: string | null;
    topic?: string | null;
    topicEngine?: string | null;
  },
) {
  if (channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    return null;
  }
  const format = resolvePodcastEpisodeFormat({
    channelKey,
    ideaJson: options?.ideaJson,
    topicEngine: options?.topicEngine,
    title: options?.title,
    topic: options?.topic,
  });
  return validatePodcastEnglishScript(script, format);
}

export async function runScriptWriterViaBrowser({
  videoId,
  providerKey,
  includeReferenceTranscripts = false,
  referenceDocumentIds = [],
  resetCheckpoint = false,
}: {
  videoId: string;
  providerKey?: string;
  includeReferenceTranscripts?: boolean;
  referenceDocumentIds?: string[];
  resetCheckpoint?: boolean;
}) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      ideaJson: true,
      script: true,
      metadataJson: true,
      channelKey: true,
      title: true,
      topic: true,
      topicCategory: true,
      scenes: { select: { imagePrompt: true } },
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }

  if (!video.ideaJson?.trim()) {
    throw new Error(
      "This video has no Idea JSON yet. Add an idea before running Script Writer Batch.",
    );
  }

  const channel = getChannelProfile(video.channelKey);
  const godsWordSimpleScript =
    video.channelKey === THE_GODS_WORD_CHANNEL_KEY &&
    !isBibleOneYearCategory(video.topicCategory);
  const podcastSinglePassScript =
    video.channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;
  const ideaHash = hashScriptWriterIdea(video.ideaJson);
  const maxDrafts = godsWordSimpleScript
    ? GODS_WORD_SCRIPT_WRITER_MAX_DRAFTS
    : getScriptWriterMaxDrafts(video.channelKey);
  const passScore = godsWordSimpleScript
    ? GODS_WORD_SCRIPT_WRITER_PASS_SCORE
    : getScriptWriterPassScore(video.channelKey);

  if (resetCheckpoint) {
    await clearScriptWriterCheckpoint(videoId);
  }

  const existingCheckpoint = resetCheckpoint
    ? null
    : await loadScriptWriterCheckpoint(videoId);
  const resumeCheckpoint =
    existingCheckpoint &&
    existingCheckpoint.ideaHash === ideaHash &&
    existingCheckpoint.script.trim()
      ? existingCheckpoint
      : null;

  const prompt = godsWordSimpleScript
    ? buildGodsWordTopicIdeaScriptPrompt({
        ideaJson: video.ideaJson,
        title: video.title,
        topic: video.topic,
      })
    : await getVideoPrompt(videoId, "script-writer", {
        includeReferenceTranscripts,
        referenceDocumentIds,
      });
  if (!prompt?.trim()) {
    throw new Error("Could not build the Script Writer request for this video.");
  }

  const promptContext = godsWordSimpleScript
    ? null
    : await getScriptWriterPromptContext(videoId);

  let rawText: string | null = null;
  clearScriptWriterCancel(videoId);

  const writeCheckpoint = async (
    partial: Omit<
      ScriptWriterCheckpoint,
      "version" | "updatedAt" | "videoId" | "ideaHash"
    >,
  ) => {
    await saveScriptWriterCheckpoint({
      videoId,
      ideaHash,
      ...partial,
    });
  };

  try {
    const batch = await withChatGptBrowserTurns({
      jobId: `script-writer-${videoId}-${Date.now()}`,
      providerKey,
      timeoutMs: 900000,
      conversationStartUrl: channel.chatgptScriptConversationUrl,
      shouldAbort: () => isScriptWriterCancelRequested(videoId),
      run: async ({ send, providerKey: usedProviderKey }) => {
        let draftNumber = 1;
        let script = "";
        let score: number | null = null;
        let decision: ReturnType<typeof resolveScriptWriterRevisionDecision> | null =
          null;
        let briefReason: string | null = null;
        let mustFix: string[] = [];
        let rewritePriority: string[] = [];
        let dimensionScores: Record<string, number> | null = null;
        let validationReport: string | null = null;
        let passed = false;
        let resumed = false;
        let previousScore: number | null =
          resumeCheckpoint?.score != null &&
          Number.isFinite(resumeCheckpoint.score)
            ? resumeCheckpoint.score
            : null;
        let stalledPolishCount = 0;
        let consecutiveRegressions = 0;
        let bestDraft: ScriptWriterBestDraft | null =
          resumeCheckpoint?.script?.trim() &&
          resumeCheckpoint.score != null &&
          Number.isFinite(resumeCheckpoint.score)
            ? {
                draftNumber: Math.max(
                  1,
                  Math.floor(resumeCheckpoint.draftNumber) || 1,
                ),
                script: resumeCheckpoint.script.trim(),
                score: resumeCheckpoint.score,
                briefReason: resumeCheckpoint.briefReason,
                mustFix: [],
                rewritePriority: [],
                dimensionScores: null,
              }
            : null;

        const scoreAndMaybeRevise = async () => {
          while (!passed && draftNumber <= maxDrafts) {
            if (isScriptWriterCancelRequested(videoId)) {
              throw new ScriptWriterCanceledError();
            }

            const validation = validateIfPodcast(video.channelKey, script, {
              ideaJson: video.ideaJson,
              title: video.title,
              topic: video.topic,
              topicEngine: channel.editorialInstructions?.topicEngine,
            });
            if (validation) {
              script = validation.normalizedScript;
              validationReport = formatPodcastValidationReport(validation);
              console.info("[script-writer-batch] validation", {
                videoId,
                draftNumber,
                ok: validation.ok,
                errors: validation.errors.length,
                warnings: validation.warnings.length,
                metrics: validation.metrics,
              });
            } else {
              validationReport = null;
            }

            const scorePrompt = await getScriptWriterScorePrompt(
              video.channelKey,
              {
                script,
                validationReport,
                projectBible: promptContext?.projectBible,
                currentIdeaJson: promptContext?.currentIdeaJson,
                episodeContext: promptContext?.episodeContext,
              },
            );
            // Same ChatGPT thread for Wealth: score the preceding assistant script.
            const scoreRaw = await send(scorePrompt, {
              expectReplyKind: "score",
            });
            rawText = scoreRaw;
            const critique = extractScriptScore(scoreRaw);
            score = critique.score;
            briefReason = critique.briefReason;
            mustFix = critique.mustFix;
            rewritePriority = critique.rewritePriority;
            dimensionScores = critique.dimensionScores;
            decision = resolveScriptWriterRevisionDecision({
              decision: critique.decision,
              score: critique.score,
              channelKey: video.channelKey,
            });

            if (validation && !validation.ok) {
              for (const issue of validation.errors) {
                if (!mustFix.includes(issue.message)) {
                  mustFix.push(issue.message);
                }
              }
            }

            const bestConsideration = considerScriptWriterBestDraft(bestDraft, {
              draftNumber,
              script,
              score,
              briefReason,
              mustFix,
              rewritePriority,
              dimensionScores,
            });
            const previousBestScore = bestDraft?.score ?? null;
            bestDraft = bestConsideration.best;

            if (bestConsideration.rejectedAsRegression && bestDraft) {
              consecutiveRegressions += 1;
              console.warn("[script-writer-batch] rejecting regressing draft", {
                videoId,
                draftNumber,
                rejectedScore: critique.score,
                bestDraftNumber: bestDraft.draftNumber,
                bestScore: bestDraft.score,
                consecutiveRegressions,
              });
              script = bestDraft.script;
              score = bestDraft.score;
              briefReason = bestDraft.briefReason;
              mustFix = bestDraft.mustFix;
              rewritePriority = bestDraft.rewritePriority;
              dimensionScores = bestDraft.dimensionScores;
              // Keep revising from the best draft, not the weaker rewrite.
              decision = resolveScriptWriterRevisionDecision({
                score: bestDraft.score,
                channelKey: video.channelKey,
              });
            } else if (bestConsideration.accepted && bestDraft) {
              consecutiveRegressions = 0;
              script = bestDraft.script;
              mustFix = bestDraft.mustFix;
              rewritePriority = bestDraft.rewritePriority;
              dimensionScores = bestDraft.dimensionScores;
              if (
                previousBestScore == null ||
                bestDraft.score > previousBestScore
              ) {
                script = await persistLatestScript(videoId, script);
              }
            }

            const escalation = escalateStalledPolishDecision({
              decision,
              score,
              previousScore,
              stalledPolishCount,
            });
            decision = escalation.decision;
            stalledPolishCount = escalation.stalledPolishCount;
            if (escalation.escalated) {
              console.info("[script-writer-batch] escalating stalled polish", {
                videoId,
                draftNumber,
                score,
                previousScore,
                stalledPolishCount,
              });
            }

            await writeCheckpoint({
              draftNumber: bestDraft?.draftNumber ?? draftNumber,
              script: bestDraft?.script ?? script,
              score: bestDraft?.score ?? score,
              briefReason: bestDraft?.briefReason ?? briefReason,
              phase: "scored",
            });

            let willRevise = shouldReviseScriptForDecision(decision);
            if (
              consecutiveRegressions >= SCRIPT_WRITER_MAX_CONSECUTIVE_REGRESSIONS
            ) {
              willRevise = false;
              console.info(
                "[script-writer-batch] stopping after consecutive regressions; keeping best draft",
                {
                  videoId,
                  bestDraftNumber: bestDraft?.draftNumber ?? draftNumber,
                  bestScore: bestDraft?.score ?? score,
                  consecutiveRegressions,
                },
              );
            }

            console.info("[script-writer-batch]", {
              videoId,
              channelKey: video.channelKey,
              draftNumber,
              score,
              decision,
              briefReason,
              mustFix,
              rewritePriority,
              passScore,
              willRevise,
              resumed,
              stalledPolishCount,
              bestDraftNumber: bestDraft?.draftNumber ?? null,
              bestScore: bestDraft?.score ?? null,
              consecutiveRegressions,
              rejectedAsRegression: bestConsideration.rejectedAsRegression,
            });

            previousScore = bestDraft?.score ?? score;

            if (!willRevise) {
              if (bestDraft) {
                script = bestDraft.script;
                score = bestDraft.score;
                briefReason = bestDraft.briefReason;
                draftNumber = bestDraft.draftNumber;
              }
              passed = Boolean(
                bestDraft
                  ? bestDraft.score > passScore
                  : score != null && score > passScore,
              );
              break;
            }

            if (draftNumber >= maxDrafts) {
              break;
            }

            if (isScriptWriterCancelRequested(videoId)) {
              throw new ScriptWriterCanceledError();
            }

            const baseScript = bestDraft?.script ?? script;
            const baseScore = bestDraft?.score ?? critique.score;
            const baseReason = bestDraft?.briefReason ?? critique.briefReason;
            const baseMustFix = bestDraft?.mustFix ?? mustFix;
            const baseRewritePriority =
              bestDraft?.rewritePriority ?? rewritePriority;
            const baseDimensionScores =
              bestDraft?.dimensionScores ?? dimensionScores;

            const revisionRaw = await send(
              await buildScriptWriterRevisionPrompt({
                draftNumber: bestDraft?.draftNumber ?? draftNumber,
                score: baseScore,
                briefReason: baseReason,
                channelKey: video.channelKey,
                script: baseScript,
                mustFix: baseMustFix,
                rewritePriority: baseRewritePriority,
                validationReport,
                dimensionScores: baseDimensionScores,
                projectBible: promptContext?.projectBible,
                currentIdeaJson: promptContext?.currentIdeaJson,
                episodeContext: promptContext?.episodeContext,
                decision,
              }),
              {
                expectReplyKind: "script",
                // Wealth stays in the same thread with a short critique prompt.
              },
            );
            rawText = revisionRaw;
            script = extractScriptFromResponse(revisionRaw);
            draftNumber += 1;
            score = null;
            decision = null;
            briefReason = null;
            mustFix = [];
            rewritePriority = [];
            dimensionScores = null;

            await writeCheckpoint({
              draftNumber,
              script,
              score: null,
              briefReason: null,
              phase: "drafted",
            });
            // Do not persist unscored revisions over a known best draft.
            if (!bestDraft) {
              script = await persistLatestScript(videoId, script);
            }
          }

          if (bestDraft) {
            script = bestDraft.script;
            score = bestDraft.score;
            briefReason = bestDraft.briefReason;
            draftNumber = Math.max(draftNumber, bestDraft.draftNumber);
          }
        };

        if (resumeCheckpoint) {
          resumed = true;
          draftNumber = Math.max(1, Math.floor(resumeCheckpoint.draftNumber) || 1);
          script = resumeCheckpoint.script.trim();
          score = resumeCheckpoint.score;
          briefReason = resumeCheckpoint.briefReason;

          console.info("[script-writer-batch] resume", {
            videoId,
            draftNumber,
            phase: resumeCheckpoint.phase,
            score,
            briefReason,
            scriptLength: script.length,
            godsWordSimpleScript,
          });

          if (godsWordSimpleScript) {
            const hasMarkers = godsWordScriptHasStructuralMarkers(script);
            if (godsWordScriptPassed(score) && hasMarkers) {
              passed = true;
              if (script.trim()) {
                script = await persistLatestScript(videoId, script);
              }
            } else if (script.trim()) {
              // Resume into recommendation loop with last known advice.
              briefReason = hasMarkers
                ? resumeCheckpoint.briefReason
                : GODS_WORD_STRUCTURAL_MARKERS_RECOMMENDATION;
              script = await persistLatestScript(videoId, script);
            }
          } else if (podcastSinglePassScript) {
            // Podcast: no score/revision loop. Keep the saved draft and finish.
            const validation = validateIfPodcast(video.channelKey, script, {
              ideaJson: video.ideaJson,
              title: video.title,
              topic: video.topic,
              topicEngine: channel.editorialInstructions?.topicEngine,
            });
            if (validation) {
              script = validation.normalizedScript;
              validationReport = formatPodcastValidationReport(validation);
            }
            if (script.trim()) {
              script = await persistLatestScript(videoId, script);
            }
            passed = Boolean(script.trim());
            await writeCheckpoint({
              draftNumber,
              script,
              score: null,
              briefReason: null,
              phase: "scored",
            });
          } else if (resumeCheckpoint.phase === "scored") {
            decision = resolveScriptWriterRevisionDecision({
              score,
              channelKey: video.channelKey,
            });
            if (!shouldReviseScriptForDecision(decision)) {
              passed = true;
            } else if (script.trim()) {
              // Score/revision depend on the preceding assistant script bubble.
              await send(
                [
                  "Restore this exact narration draft for the next evaluation turn.",
                  "Reply with ONLY the script below, unchanged, with no commentary:",
                  "",
                  script.trim(),
                ].join("\n"),
                { expectReplyKind: "script" },
              );
            }
          } else if (resumeCheckpoint.phase === "drafted" && script.trim()) {
            // Scorer reads the preceding assistant message; restore that turn
            // when resuming into a fresh ChatGPT conversation.
            await send(
              [
                "Restore this exact narration draft for the next evaluation turn.",
                "Reply with ONLY the script below, unchanged, with no commentary:",
                "",
                script.trim(),
              ].join("\n"),
              { expectReplyKind: "script" },
            );
          }
        } else if (!godsWordSimpleScript) {
          const firstRaw = await send(prompt, { expectReplyKind: "script" });
          rawText = firstRaw;
          script = extractScriptFromResponse(firstRaw);
          const validation = validateIfPodcast(video.channelKey, script, {
            ideaJson: video.ideaJson,
            title: video.title,
            topic: video.topic,
            topicEngine: channel.editorialInstructions?.topicEngine,
          });
          if (validation) {
            script = validation.normalizedScript;
            validationReport = formatPodcastValidationReport(validation);
            console.info("[script-writer-batch] validation", {
              videoId,
              draftNumber,
              ok: validation.ok,
              errors: validation.errors.length,
              warnings: validation.warnings.length,
              metrics: validation.metrics,
            });
          }
          await writeCheckpoint({
            draftNumber,
            script,
            score: null,
            briefReason: null,
            phase: podcastSinglePassScript ? "scored" : "drafted",
          });
          script = await persistLatestScript(videoId, script);
          if (podcastSinglePassScript) {
            passed = Boolean(script.trim());
          }
        }

        if (godsWordSimpleScript) {
          let recomendacion =
            briefReason?.trim() ||
            resumeCheckpoint?.briefReason?.trim() ||
            "";
          let sentInitialTopicPrompt = false;

          while (!passed && draftNumber <= maxDrafts) {
            if (isScriptWriterCancelRequested(videoId)) {
              throw new ScriptWriterCanceledError();
            }

            const shouldAskTopicPrompt =
              !sentInitialTopicPrompt &&
              ((!resumed && draftNumber === 1) ||
                (resumed && !recomendacion && score == null));

            const turnPrompt = shouldAskTopicPrompt
              ? prompt
              : buildGodsWordApplyRecommendationPrompt(recomendacion);

            if (shouldAskTopicPrompt) {
              sentInitialTopicPrompt = true;
            }

            const raw = await send(turnPrompt, { expectReplyKind: "script" });
            rawText = raw;
            const parsed = parseGodsWordScriptBatchResponse(raw);
            script = parsed.script;
            score = parsed.score;
            briefReason = parsed.recomendacion || parsed.valoracion || null;
            recomendacion = parsed.recomendacion;
            decision = resolveScriptWriterRevisionDecision({
              score,
              channelKey: video.channelKey,
            });

            const hasMarkers = godsWordScriptHasStructuralMarkers(script);
            const scorePassed = godsWordScriptPassed(score);
            const structurePassed = scorePassed && hasMarkers;

            await writeCheckpoint({
              draftNumber,
              script,
              score,
              briefReason,
              phase: structurePassed ? "scored" : "drafted",
            });
            script = await persistLatestScript(videoId, script);

            const bestConsideration = considerScriptWriterBestDraft(bestDraft, {
              draftNumber,
              script,
              score,
              briefReason,
              mustFix: [],
              rewritePriority: [],
              dimensionScores: null,
            });
            bestDraft = bestConsideration.best;

            console.info("[script-writer-batch] gods-word valuation", {
              videoId,
              draftNumber,
              score,
              valoracion: parsed.valoracion,
              recomendacion: parsed.recomendacion,
              hasStructuralMarkers: hasMarkers,
              passed: structurePassed,
            });

            if (structurePassed) {
              passed = true;
              break;
            }

            if (draftNumber >= maxDrafts) {
              break;
            }

            if (!hasMarkers) {
              recomendacion = GODS_WORD_STRUCTURAL_MARKERS_RECOMMENDATION;
              console.warn(
                "[script-writer-batch] gods-word missing structural markers; forcing marker rewrite",
                { videoId, draftNumber, score },
              );
            } else if (!parsed.recomendacion.trim()) {
              console.warn(
                "[script-writer-batch] gods-word missing recomendacion; stopping loop",
                { videoId, draftNumber, score },
              );
              break;
            }

            draftNumber += 1;
          }

          if (bestDraft) {
            script = bestDraft.script;
            score = bestDraft.score;
            briefReason = bestDraft.briefReason;
            draftNumber = Math.max(draftNumber, bestDraft.draftNumber);
            script = await persistLatestScript(videoId, script);
            await writeCheckpoint({
              draftNumber,
              script,
              score,
              briefReason,
              phase: "scored",
            });
          }

          const finalHasMarkers = godsWordScriptHasStructuralMarkers(script);
          passed =
            (godsWordScriptPassed(score) && finalHasMarkers) ||
            Boolean(script.trim());
          if (script.trim() && !finalHasMarkers) {
            console.warn(
              "[script-writer-batch] gods-word finished without structural markers",
              { videoId, draftNumber, score },
            );
          }
        } else if (!podcastSinglePassScript) {
          await scoreAndMaybeRevise();
        }

        console.info("[script-writer-batch] finished", {
          videoId,
          draftNumber,
          score,
          passed,
          resumed,
          scriptLength: script.length,
          maxDrafts,
          godsWordSimpleScript,
          podcastSinglePassScript,
          bestDraftNumber: bestDraft?.draftNumber ?? null,
          bestScore: bestDraft?.score ?? null,
          consecutiveRegressions,
        });

        return {
          providerKey: usedProviderKey,
          script,
          draftNumber,
          version: `v${draftNumber}` as const,
          score,
          briefReason,
          mustFix,
          rewritePriority,
          dimensionScores,
          passed,
          resumed,
        };
      },
    });

    const {
      script,
      draftNumber,
      version,
      score,
      briefReason,
      mustFix,
      rewritePriority,
      passed,
      resumed,
      providerKey: usedProviderKey,
    } = batch;

    const savedScript = await persistLatestScript(videoId, script);
    await clearScriptWriterCheckpoint(videoId);

    return {
      ok: true as const,
      videoId,
      providerKey: usedProviderKey,
      scriptLength: savedScript.length,
      includedReferences: includeReferenceTranscripts,
      referenceCount: includeReferenceTranscripts
        ? referenceDocumentIds.length
        : 0,
      script: savedScript,
      draftNumber,
      version,
      score,
      briefReason,
      mustFix,
      rewritePriority,
      passed,
      resumed,
      passScore,
      maxDrafts,
    };
  } catch (error) {
    const checkpoint = await loadScriptWriterCheckpoint(videoId);
    const resumeHint = checkpoint?.script?.trim()
      ? " Latest draft was checkpointed — click Resume Batch to continue from there."
      : "";

    if (
      error instanceof ScriptWriterCanceledError ||
      (error instanceof BrowserAutomationError && error.code === "canceled")
    ) {
      throw new ScriptWriterCanceledError(
        `${
          error instanceof Error ? error.message : "Script Writer Batch canceled."
        }${resumeHint}`,
      );
    }

    if (error instanceof ChatGptPromptRunError) {
      throw new ScriptWriterRunError(
        `${error.message}${resumeHint}`,
        error.rawText ?? rawText,
      );
    }

    if (error instanceof ScriptWriterRunError) {
      throw new ScriptWriterRunError(
        `${error.message}${
          resumeHint && !error.message.includes("checkpointed")
            ? resumeHint
            : ""
        }`,
        error.rawText ?? rawText,
      );
    }

    throw new ScriptWriterRunError(
      `${
        error instanceof Error ? error.message : "Script Writer Batch failed."
      }${resumeHint}`,
      rawText,
    );
  } finally {
    clearScriptWriterCancel(videoId);
  }
}
