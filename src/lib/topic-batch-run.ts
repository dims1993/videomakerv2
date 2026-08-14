import path from "node:path";

import { getBrowserModelProvider } from "@/lib/browser-providers/registry";
import { hashPrompt } from "@/lib/browser-automation/types";
import { BrowserAutomationError } from "@/lib/browser-automation/errors";
import { getChannelProfile } from "@/lib/channels-server";
import { prisma } from "@/lib/prisma";
import { persistTopicBatchIdeas } from "@/lib/topic-batch-import";
import {
  extractTopicBatchFromResponse,
  saveTopicBatchDraft,
} from "@/lib/topic-batch-extract";
import {
  buildTopicBatchPrompt,
  type RecentTopicContext,
} from "@/lib/topic-batch-prompt";
import { maybeAssertPodcastTopicBatchAvoidsPromptExamples } from "@/lib/podcast-english-lessons-topic-validate";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import {
  BIBLE_ONE_YEAR_SECTION_MAX_DAYS,
  bibleOneYearSectionDayCount,
  collectCoveredBibleOneYearDays,
  normalizeBibleOneYearSectionRange,
  type BibleOneYearSectionRange,
} from "@/lib/the-bible-in-one-year-topic-batch";

export type TopicBatchRunInput = {
  channelKey: string;
  count: number;
  selectedCategoryId?: string | null;
  recentTopics: RecentTopicContext[];
  providerKey?: string;
  bibleOneYearSection?: BibleOneYearSectionRange | null;
  coveredBibleOneYearDays?: number[];
};

export class TopicBatchRunError extends Error {
  readonly rawText: string | null;

  constructor(message: string, rawText: string | null = null) {
    super(message);
    this.name = "TopicBatchRunError";
    this.rawText = rawText;
  }
}

function resolveProviderKey(explicit?: string) {
  return (
    explicit?.trim() ||
    process.env.TOPIC_BATCH_PROVIDER?.trim() ||
    process.env.BROWSER_MODEL_PROVIDER?.trim() ||
    "chatgpt"
  );
}

function resolveCdpUrl() {
  return (
    process.env.CHATGPT_CDP_URL?.trim() ||
    process.env.GOOGLE_FLOW_CDP_URL?.trim() ||
    process.env.GOOGLE_FLOW_CHROME_CDP_URL?.trim() ||
    "http://127.0.0.1:9222"
  );
}

export async function runTopicBatchViaBrowser(input: TopicBatchRunInput) {
  const channel = getChannelProfile(input.channelKey);

  if (!channel.topicSystem?.enabled) {
    throw new Error(`Topic batch generation is not enabled for ${channel.name}.`);
  }

  if (!channel.editorialInstructions) {
    throw new Error(`Editorial instructions are missing for ${channel.name}.`);
  }

  const selectedCategoryId = input.selectedCategoryId?.trim() || undefined;
  const isBibleOneYear = isBibleOneYearCategory(selectedCategoryId);
  const bibleSection = isBibleOneYear
    ? normalizeBibleOneYearSectionRange(
        input.bibleOneYearSection?.startDay ?? 1,
        input.bibleOneYearSection?.endDay ??
          (input.bibleOneYearSection?.startDay ?? 1) +
            BIBLE_ONE_YEAR_SECTION_MAX_DAYS -
            1,
      )
    : null;
  const count = isBibleOneYear && bibleSection
    ? bibleOneYearSectionDayCount(bibleSection)
    : Math.max(1, Math.min(28, Math.floor(input.count) || 14));
  const providerKey = resolveProviderKey(input.providerKey);
  const provider = getBrowserModelProvider(providerKey);

  const coveredBibleOneYearDays =
    input.coveredBibleOneYearDays ??
    collectCoveredBibleOneYearDays(input.recentTopics);

  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count,
    selectedCategoryId,
    categories: channel.topicSystem.categories,
    editorialInstructions: channel.editorialInstructions,
    recentTopics: input.recentTopics,
    outlierAngleLanes: channel.topicSystem.outlierAngleLanes ?? [],
    bibleOneYearSection: bibleSection,
    coveredBibleOneYearDays,
  });

  const settings = await prisma.browserAutomationSettings.findUnique({
    where: { id: "default" },
  });

  const profileDir =
    settings?.profileDir?.trim() ||
    path.join(process.cwd(), "storage", "browser-profiles", "chatgpt");
  const cdpUrl = settings?.cdpUrl?.trim() || resolveCdpUrl();
  const timeoutMs = settings?.timeoutMs ?? 300000;
  const launchMode =
    providerKey === "fake"
      ? "persistent_context"
      : ((settings?.launchMode as "persistent_context" | "connect_cdp" | undefined) ??
        "connect_cdp");

  let rawAssistantText: string | null = null;

  try {
    await provider.openSession({
      profileDir,
      cdpUrl,
      headful: settings?.headful ?? true,
      launchMode,
      timeoutMs,
    });

    const sessionCheck = await provider.checkSession();
    if (sessionCheck.requiresUserAction || !sessionCheck.authenticated) {
      throw new BrowserAutomationError(
        sessionCheck.message ||
          "ChatGPT browser session needs manual Google login in Chrome CDP.",
        { code: "needs_user_action", requiresUserAction: true },
      );
    }

    const jobId = `topic-batch-${channel.key}-${Date.now()}`;
    const submission = await provider.submitPrompt({
      jobId,
      prompt,
      conversationMode: "new",
      conversationStartUrl: channel.chatgptTopicConversationUrl,
    });
    const completion = await provider.waitForCompletion(submission);
    const extracted = await provider.extractResponse(completion);

    if (extracted.requiresUserAction) {
      throw new BrowserAutomationError(
        extracted.userActionMessage || "ChatGPT needs manual action.",
        { code: "needs_user_action", requiresUserAction: true },
      );
    }

    if (extracted.providerError) {
      throw new TopicBatchRunError(extracted.providerError, extracted.text || null);
    }

    rawAssistantText = extracted.text?.trim() || extracted.jsonText?.trim() || null;
    if (!rawAssistantText) {
      throw new TopicBatchRunError("ChatGPT returned an empty topic batch response.");
    }

    await saveTopicBatchDraft({
      channelKey: channel.key,
      rawText: rawAssistantText,
      error: null,
    });

    let topics;
    let jsonText: string;
    try {
      const extractedBatch = extractTopicBatchFromResponse(rawAssistantText);
      topics = extractedBatch.topics;
      jsonText = extractedBatch.jsonText;
      maybeAssertPodcastTopicBatchAvoidsPromptExamples(channel.key, topics);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not parse topic batch JSON from ChatGPT.";
      throw new TopicBatchRunError(message, rawAssistantText);
    }

    const result = await persistTopicBatchIdeas({
      channelKey: channel.key,
      topics,
      source: providerKey === "fake" ? "fake_browser_batch" : "chatgpt_browser_batch",
    });

    await saveTopicBatchDraft({
      channelKey: channel.key,
      rawText: jsonText,
      error: null,
    });

    return {
      ok: true as const,
      channelKey: channel.key,
      providerKey,
      promptHash: hashPrompt(prompt),
      ...result,
      selectedCategoryId: selectedCategoryId ?? null,
      bibleOneYearSection: bibleSection,
      rawJson: jsonText,
    };
  } catch (error) {
    if (rawAssistantText) {
      await saveTopicBatchDraft({
        channelKey: channel.key,
        rawText: rawAssistantText,
        error: error instanceof Error ? error.message : "Topic batch run failed.",
      });
    } else if (error instanceof TopicBatchRunError && error.rawText) {
      await saveTopicBatchDraft({
        channelKey: channel.key,
        rawText: error.rawText,
        error: error.message,
      });
    }

    throw error;
  } finally {
    await provider.closeSession?.();
  }
}
