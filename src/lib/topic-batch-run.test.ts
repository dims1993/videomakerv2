import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeBrowserModelProvider } from "@/lib/browser-providers/fake-browser-provider";
import { extractJsonPayload } from "@/lib/browser-automation/types";
import { parseTopicBatchJson } from "@/lib/topic-batch-import";
import { buildTopicBatchPrompt } from "@/lib/topic-batch-prompt";

test("buildTopicBatchPrompt + fake provider returns importable topics JSON", async () => {
  const prompt = buildTopicBatchPrompt({
    channelName: "Wealth Insights",
    count: 7,
    selectedCategoryId: "housing",
    categories: [
      {
        id: "housing",
        label: "Housing",
        description: "Mortgage and rent.",
      },
    ],
    editorialInstructions: {
      role: "editor",
      audience: "US",
      niche: "finance",
      style: ["clear"],
      originalityRules: ["Be original"],
      overusedAngles: ["rent trap"],
      requiredTopicFields: ["category", "title", "topic"],
    },
    recentTopics: [],
  });

  const provider = new FakeBrowserModelProvider();
  await provider.openSession({
    profileDir: "/tmp",
    headful: false,
    launchMode: "persistent_context",
    timeoutMs: 5000,
  });

  const submission = await provider.submitPrompt({
    jobId: "test-topic-batch",
    prompt,
    conversationMode: "new",
  });
  const completion = await provider.waitForCompletion(submission);
  const extracted = await provider.extractResponse(completion);
  const raw = extracted.jsonText || extractJsonPayload(extracted.text) || "";
  const topics = parseTopicBatchJson(raw);

  assert.equal(topics.length, 7);
  assert.ok(topics.every((topic) => topic.category === "housing"));
  assert.ok(topics.every((topic) => topic.title.includes("Fake Topic")));
});
