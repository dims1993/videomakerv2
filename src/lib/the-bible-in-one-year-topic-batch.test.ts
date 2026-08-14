import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeBrowserModelProvider } from "@/lib/browser-providers/fake-browser-provider";
import { extractJsonPayload } from "@/lib/browser-automation/types";
import { parseTopicBatchJson } from "@/lib/topic-batch-import";
import { buildTopicBatchPrompt } from "@/lib/topic-batch-prompt";
import {
  buildBibleOneYearSectionPresets,
  normalizeBibleOneYearSectionRange,
  suggestNextBibleOneYearSection,
} from "@/lib/the-bible-in-one-year-topic-batch";

test("bible one year section presets cover 365 days", () => {
  const presets = buildBibleOneYearSectionPresets();
  assert.equal(presets[0]?.startDay, 1);
  assert.equal(presets[presets.length - 1]?.endDay, 365);
  const total = presets.reduce(
    (sum, preset) => sum + (preset.endDay - preset.startDay + 1),
    0,
  );
  assert.equal(total, 365);
});

test("suggestNextBibleOneYearSection continues after covered days", () => {
  const next = suggestNextBibleOneYearSection([1, 2, 3, 30]);
  assert.equal(next.startDay, 4);
  assert.equal(next.endDay, 33);
});

test("normalizeBibleOneYearSectionRange caps section size at 30", () => {
  const range = normalizeBibleOneYearSectionRange(1, 90);
  assert.equal(range.startDay, 1);
  assert.equal(range.endDay, 30);
});

test("bible one year topic batch prompt + fake provider is importable", async () => {
  const prompt = buildTopicBatchPrompt({
    channelName: "TheGodsWord",
    count: 7,
    selectedCategoryId: "the_bible_in_one_year",
    categories: [
      {
        id: "the_bible_in_one_year",
        label: "The Bible in One Year",
        description: "Daily WEBUS readings.",
      },
    ],
    editorialInstructions: {
      role: "editor",
      audience: "US 65+",
      niche: "bible reading",
      style: ["calm"],
      originalityRules: ["Stay consecutive"],
      overusedAngles: [],
      requiredTopicFields: ["category", "title", "topic"],
    },
    recentTopics: [],
    bibleOneYearSection: { startDay: 1, endDay: 7 },
    coveredBibleOneYearDays: [],
  });

  assert.match(prompt, /startDay: 1/);
  assert.match(prompt, /endDay: 7/);
  assert.match(prompt, /the_bible_in_one_year/);

  const provider = new FakeBrowserModelProvider();
  await provider.openSession({
    profileDir: "/tmp",
    headful: false,
    launchMode: "persistent_context",
    timeoutMs: 5000,
  });

  const submission = await provider.submitPrompt({
    jobId: "test-bible-topic-batch",
    prompt,
    conversationMode: "new",
  });
  const completion = await provider.waitForCompletion(submission);
  const extracted = await provider.extractResponse(completion);
  const raw = extracted.jsonText || extractJsonPayload(extracted.text) || "";
  const topics = parseTopicBatchJson(raw);

  assert.equal(topics.length, 7);
  assert.ok(topics.every((topic) => topic.category === "the_bible_in_one_year"));
  assert.ok(topics[0]?.title.startsWith("Day 1 —"));
  assert.ok(topics[0]?.notes?.includes("the_bible_in_one_year_day"));
});
