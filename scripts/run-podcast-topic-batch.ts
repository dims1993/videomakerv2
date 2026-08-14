/**
 * Run podcast topic batch via ChatGPT browser CDP and print the outcome.
 *
 * Usage:
 *   npx tsx scripts/run-podcast-topic-batch.ts [count]
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.join(process.cwd(), ".env") });
loadEnv({ path: path.join(process.cwd(), ".env.local"), override: true });

import { prisma } from "../src/lib/prisma";
import { readTopicBatchDraft } from "../src/lib/topic-batch-extract";
import {
  runTopicBatchViaBrowser,
  TopicBatchRunError,
} from "../src/lib/topic-batch-run";
import type { RecentTopicContext } from "../src/lib/topic-batch-prompt";

const CHANNEL_KEY = "podcast-english-lessons";

async function loadRecentTopics(): Promise<RecentTopicContext[]> {
  const recent = await prisma.topicIdea.findMany({
    where: {
      channelKey: CHANNEL_KEY,
      status: { in: ["selected", "used", "scripted", "produced"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 15,
    select: {
      category: true,
      title: true,
      angle: true,
      uniqueMechanism: true,
      visualHook: true,
      thumbnailIdea: true,
    },
  });

  return recent.map((topic) => ({
    category: topic.category,
    title: topic.title,
    angle: topic.angle,
    uniqueMechanism: topic.uniqueMechanism,
    visualHook: topic.visualHook,
    thumbnailIdea: topic.thumbnailIdea,
  }));
}

async function main() {
  const count = Math.max(1, Math.min(14, Number(process.argv[2] ?? "2") || 2));
  console.info("[run-podcast-topic-batch] starting", {
    channelKey: CHANNEL_KEY,
    count,
    cdp:
      process.env.CHATGPT_CDP_URL ||
      process.env.GOOGLE_FLOW_CDP_URL ||
      "http://127.0.0.1:9222",
  });

  const recentTopics = await loadRecentTopics();
  console.info("[run-podcast-topic-batch] recent topics", recentTopics.length);

  try {
    const result = await runTopicBatchViaBrowser({
      channelKey: CHANNEL_KEY,
      count,
      recentTopics,
    });
    console.info("[run-podcast-topic-batch] SUCCESS", {
      providerKey: result.providerKey,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      totalCount: result.totalCount,
      rawJsonChars: result.rawJson?.length ?? 0,
    });
    console.log(result.rawJson?.slice(0, 2500) ?? "(no raw json)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const raw =
      error instanceof TopicBatchRunError ? error.rawText : null;
    console.error("[run-podcast-topic-batch] FAILED", message);
    if (raw) {
      console.error("[run-podcast-topic-batch] raw preview", raw.slice(0, 1500));
    }
    const draft = await readTopicBatchDraft(CHANNEL_KEY);
    console.error("[run-podcast-topic-batch] draft", {
      hasDraft: Boolean(draft?.rawText),
      error: draft?.error ?? null,
      updatedAt: draft?.updatedAt ?? null,
      rawChars: draft?.rawText?.length ?? 0,
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
