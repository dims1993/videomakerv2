import assert from "node:assert/strict";
import test from "node:test";

import { getChannelProfile } from "@/lib/channels";
import { parseTopicBatchJson } from "@/lib/topic-batch-import";
import {
  assertPodcastTopicBatchAvoidsPromptExamples,
  extractPodcastEditorialTitleCores,
  findForbiddenPodcastExampleTitle,
  FORBIDDEN_PODCAST_EXAMPLE_TITLES,
  normalizePodcastTopicTitleCore,
} from "@/lib/podcast-english-lessons-topic-validate";
import { buildTopicBatchPrompt } from "@/lib/topic-batch-prompt";

test("podcast prompt includes anti-copy, multi-topic balance, and politeness spelling", () => {
  const channel = getChannelProfile("podcast-english-lessons");
  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count: 2,
    categories: channel.topicSystem!.categories,
    editorialInstructions: channel.editorialInstructions!,
    recentTopics: [],
  });

  assert.match(prompt, /EXAMPLE ANTI-COPY RULE/i);
  assert.match(prompt, /MULTI-TOPIC BALANCE/i);
  assert.match(prompt, /EMOTIONAL SPECIFICITY PREFERENCE/i);
  assert.match(prompt, /Why One Notification Breaks Your Whole Morning/i);
  assert.match(
    prompt,
    /Prefer emotionally specific titles over flat topic labels/i,
  );
  assert.match(
    prompt,
    /at least one title should include a concrete everyday scene or moment/i,
  );
  assert.match(prompt, /Treat examples as forbidden outputs/i);
  assert.match(prompt, /How To Say No Politely/);
  assert.doesNotMatch(prompt, /How To Say No Politly/);
  assert.match(
    prompt,
    /Titles may be simple and searchable, but they must not be copied from the examples/i,
  );
  assert.match(prompt, /NOT available outputs/i);
  assert.match(
    prompt,
    /Do not let the first batch after this prompt default to job interviews/i,
  );
});

test("forbidden example title detection covers pipes, SEO suffixes, and normalization", () => {
  assert.equal(
    findForbiddenPodcastExampleTitle(
      "Job Interview Questions And Answers | English Podcast For Learning English | Easy English Podcast",
    ),
    "Job Interview Questions And Answers",
  );
  assert.equal(
    findForbiddenPodcastExampleTitle(
      "English Podcast For Learning English | Stop Wasting Time | Easy English Podcast",
    ),
    "Stop Wasting Time",
  );
  assert.equal(
    findForbiddenPodcastExampleTitle("stop wasting time!!!"),
    "stop wasting time!!!",
  );
  assert.equal(
    findForbiddenPodcastExampleTitle(
      "Why Small Tasks Stay Unfinished All Week | Easy English Podcast",
    ),
    null,
  );
  assert.equal(
    findForbiddenPodcastExampleTitle("Easy English Podcast"),
    null,
  );

  assert.deepEqual(
    extractPodcastEditorialTitleCores(
      "English Podcast For Learning English | Why Some Conversations Die After One-Word Answers | Easy English Podcast",
    ),
    ["Why Some Conversations Die After One-Word Answers"],
  );

  assert.equal(
    normalizePodcastTopicTitleCore("What Makes A Good Friend?"),
    normalizePodcastTopicTitleCore("what makes a good friend"),
  );
});

test("assertPodcastTopicBatchAvoidsPromptExamples rejects known example titles", () => {
  assert.throws(
    () =>
      assertPodcastTopicBatchAvoidsPromptExamples([
        {
          title:
            "Job Interview Questions And Answers | English Podcast For Learning English | Easy English Podcast",
        },
      ]),
    /forbidden prompt-example title/i,
  );

  assert.doesNotThrow(() =>
    assertPodcastTopicBatchAvoidsPromptExamples([
      {
        title:
          "Why Small Tasks Stay Unfinished All Week | Easy English Podcast",
      },
      {
        title:
          "Why Some Conversations Die After One-Word Answers | Natural English Conversation",
      },
    ]),
  );

  assert.ok(FORBIDDEN_PODCAST_EXAMPLE_TITLES.includes("How To Say No Politely"));
});

test("simulated 2-topic podcast batch passes anti-copy acceptance criteria", () => {
  const raw = JSON.stringify({
    topics: [
      {
        category: "technology_media",
        title: "Why One Notification Breaks Your Focus | Easy English Podcast",
        topic:
          "Max and Sara talk about how a single phone buzz can pull you out of a calm morning.",
        angle:
          "Focus on the first interruption of the day, not on deleting all apps.",
        uniqueMechanism:
          "The First Buzz Drift: one early notification feels small, but it opens a chain of replies and checks that quietly replaces the morning plan.",
        trigger: "recognition of losing the morning after one buzz",
        promise:
          "Listeners recognize the interruption pattern and hear natural phrases for focus, phones, and starting again.",
        visualHook:
          "Sara holds a phone with one bright notification while Max's coffee and notebook sit untouched beside him.",
        thumbnailIdea:
          "Studio desk with one glowing phone alert and untouched coffee; on-image text: 'JUST ONE BUZZ'",
        repetitionRisk: "low",
      },
      {
        category: "food_lifestyle",
        title:
          "Why You Buy Five Things You Did Not Need | English Podcast For Learning English | Easy English Podcast",
        topic:
          "Max and Sara discuss walking into a store for one item and leaving with extras.",
        angle:
          "Explore impulse extras after the main item is already in the basket, not general budgeting lectures.",
        uniqueMechanism:
          "The Extra Basket Slide: once the needed item is found, the brain relaxes and nearby extras feel harmless, so the basket grows without a new decision.",
        trigger: "remembering a receipt with surprise extras",
        promise:
          "Listeners recognize the shopping slide and absorb natural phrases for wanting, choosing, and saying enough.",
        visualHook:
          "Max holds one milk carton while Sara points at four small snacks already in a studio shopping basket.",
        thumbnailIdea:
          "Studio basket with one needed item and four extras; on-image text: 'JUST ONE MORE?'",
        repetitionRisk: "medium",
      },
    ],
  });

  const topics = parseTopicBatchJson(raw);
  assert.equal(topics.length, 2);
  assertPodcastTopicBatchAvoidsPromptExamples(topics);

  const scenefulTitleCount = topics.filter((topic) =>
    /\b(why|when|before|after|one|five|whole|breaks|becomes|takes)\b/i.test(
      topic.title,
    ),
  ).length;
  assert.ok(
    scenefulTitleCount >= 1,
    "at least one title should create a concrete everyday scene",
  );

  for (const topic of topics) {
    assert.ok(topic.uniqueMechanism && topic.uniqueMechanism.length > 20);
    assert.ok(
      topic.visualHook?.toLowerCase().includes("max") ||
        topic.visualHook?.toLowerCase().includes("sara"),
    );
    assert.ok(topic.thumbnailIdea);
    assert.match(topic.repetitionRisk ?? "", /^(low|medium|high)$/);
    assert.doesNotMatch(topic.title, /Job Interview Questions And Answers/i);
    assert.doesNotMatch(topic.title, /Stop Wasting Time/i);
    assert.doesNotMatch(topic.title, /Making Plans With Friends/i);
    assert.doesNotMatch(topic.title, /^Too Many Notifications\b/i);
    assert.doesNotMatch(topic.title, /^Grocery Shopping\b/i);
  }

  assert.equal(topics[0]?.category, "technology_media");
  assert.equal(topics[1]?.category, "food_lifestyle");
  assert.ok(
    !/english learning|interview|fluency|speaking challenge/i.test(
      topics[1]?.topic ?? "",
    ),
  );
});
