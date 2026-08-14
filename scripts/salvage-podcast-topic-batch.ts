import { config as loadEnv } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import {
  extractTopicBatchFromResponse,
  saveTopicBatchDraft,
} from "../src/lib/topic-batch-extract";
import { persistTopicBatchIdeas } from "../src/lib/topic-batch-import";
import { maybeAssertPodcastTopicBatchAvoidsPromptExamples } from "../src/lib/podcast-english-lessons-topic-validate";
import { prisma } from "../src/lib/prisma";

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page =
    context?.pages().find((p) => p.url().includes("chatgpt.com")) ??
    context?.pages()[0];
  if (!page) {
    throw new Error("No ChatGPT page");
  }

  const raw = await page.evaluate(() => {
    const assistants = Array.from(
      document.querySelectorAll('[data-message-author-role="assistant"]'),
    ) as HTMLElement[];
    const last = assistants.at(-1);
    return last?.innerText?.trim() || document.body?.innerText || "";
  });

  console.info("rawChars", raw.length);
  console.info("rawHead", raw.slice(0, 500));
  console.info("rawTail", raw.slice(-800));

  const outDir = path.join(process.cwd(), "storage", "topic-batch-drafts");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "podcast-english-lessons.scraped.txt"),
    raw,
    "utf8",
  );

  try {
    const extracted = extractTopicBatchFromResponse(raw);
    maybeAssertPodcastTopicBatchAvoidsPromptExamples(
      "podcast-english-lessons",
      extracted.topics,
    );
    await saveTopicBatchDraft({
      channelKey: "podcast-english-lessons",
      rawText: extracted.jsonText,
      error: null,
    });
    const result = await persistTopicBatchIdeas({
      channelKey: "podcast-english-lessons",
      topics: extracted.topics,
      source: "chatgpt_browser_batch_salvage",
    });
    console.info(
      JSON.stringify(
        {
          ok: true,
          ...result,
          titles: extracted.topics.map((t) => t.title),
          categories: extracted.topics.map((t) => t.category),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("EXTRACT/IMPORT FAILED", error);
    await saveTopicBatchDraft({
      channelKey: "podcast-english-lessons",
      rawText: raw,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main();
