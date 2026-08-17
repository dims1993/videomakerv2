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

test("podcast prompt includes big-human editorial shift and anti-copy", () => {
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
  assert.match(prompt, /EMOTIONAL SIGNIFICANCE PREFERENCE/i);
  assert.match(prompt, /BIG HUMAN CONVERSATION HOOK FIRST/i);
  assert.match(prompt, /GROUNDED EVERYDAY EXAMPLES SECOND/i);
  assert.match(prompt, /TITLE QUALITY TEST/i);
  assert.match(prompt, /CRITICAL SELF-AUDIT/i);
  assert.match(prompt, /Why One Notification Breaks Your Whole Morning/i);
  assert.match(prompt, /The Power Of Starting Again/i);
  assert.match(
    prompt,
    /Prefer BIG HUMAN CONVERSATION HOOK titles over micro-object titles/i,
  );
  assert.match(
    prompt,
    /at least one life-lesson topic/i,
  );
  assert.match(prompt, /Treat examples as forbidden outputs/i);
  assert.match(prompt, /How To Say No Politely/);
  assert.doesNotMatch(prompt, /How To Say No Politly/);
  assert.match(prompt, /NOT available outputs/i);
  assert.match(
    prompt,
    /Do not let the first batch after this prompt default to job interviews/i,
  );
  assert.doesNotMatch(
    prompt,
    /at least one topic based on a concrete object or moment/i,
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
      "English Podcast For Easy English Conversation | The Power Of Starting Again | Learn English Fast",
    ),
    "The Power Of Starting Again",
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
  assert.equal(
    findForbiddenPodcastExampleTitle("Learn English Fast"),
    null,
  );

  assert.deepEqual(
    extractPodcastEditorialTitleCores(
      "English Podcast For Easy English Conversation | Why Comparison Quietly Steals Joy | Learn English Fast",
    ),
    ["Why Comparison Quietly Steals Joy"],
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
          "Why Comparison Quietly Steals Joy | Easy English Podcast For Conversation Practice | Learn English Fast",
      },
      {
        title:
          "English Podcast For Easy English Conversation | When Saying No Feels Selfish | Learn English Fast",
      },
    ]),
  );

  assert.ok(FORBIDDEN_PODCAST_EXAMPLE_TITLES.includes("How To Say No Politely"));
  assert.ok(
    FORBIDDEN_PODCAST_EXAMPLE_TITLES.includes("The Power Of Starting Again"),
  );
});

test("simulated 2-topic podcast batch passes anti-copy acceptance criteria", () => {
  const raw = JSON.stringify({
    topics: [
      {
        category: "feelings_mindset",
        title:
          "English Podcast For Easy English Conversation | Why Comparison Quietly Steals Joy | Learn English Fast",
        topic:
          "Max and Sara talk about why comparing your life to other people can make ordinary days feel smaller.",
        angle:
          "Explore quiet comparison through social feeds, friends' updates, and success stories, not generic positivity advice.",
        uniqueMechanism:
          "The Quiet Scoreboard: a person keeps ranking their progress against other people's highlights even when nobody asked them to compete.",
        trigger:
          "The viewer has felt suddenly less happy after seeing someone else's update.",
        promise:
          "Listeners will explore why comparison can shrink joy while hearing clear everyday English for talking about feelings, pressure, and personal choices.",
        visualHook:
          "Sara looks at floating highlight bubbles while Max points to a card that says 'YOUR DAY'.",
        thumbnailIdea:
          "Studio scene with highlight bubbles and a personal card; on-image text: 'WHOSE LIFE?'",
        repetitionRisk: "low",
      },
      {
        category: "social_relationships",
        title:
          "When Saying No Feels Selfish | Easy English Podcast For Conversation Practice | Learn English Fast",
        topic:
          "Max and Sara discuss why saying no can feel rude even when the request is too much.",
        angle:
          "Focus on ordinary invitations and favors where guilt appears before the answer, with different experiences from Max and Sara.",
        uniqueMechanism:
          "The Guilt-First No: before the person evaluates time or energy, they feel selfish for considering a refusal.",
        trigger:
          "The viewer has agreed to something they did not want because saying no felt mean.",
        promise:
          "Listeners will recognize the guilt pattern around saying no while absorbing natural English for boundaries, plans, and honest answers.",
        visualHook:
          "Max holds an invitation card while Sara gently pushes a 'NO' card forward with an unsure face.",
        thumbnailIdea:
          "Invitation card versus a simple NO card between hosts; on-image text: 'IS IT SELFISH?'",
        repetitionRisk: "medium",
      },
    ],
  });

  const topics = parseTopicBatchJson(raw);
  assert.equal(topics.length, 2);
  assertPodcastTopicBatchAvoidsPromptExamples(topics);

  const bigHumanTitleCount = topics.filter((topic) =>
    /\b(why|when|what|how|courage|truth|power|care|comparison|friend|life|mind|peace|busy|start|again)\b/i.test(
      topic.title,
    ),
  ).length;
  assert.ok(
    bigHumanTitleCount >= 1,
    "at least one title should feel like a big human conversation hook",
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
    assert.doesNotMatch(topic.title, /The Power Of Starting Again/i);
    assert.doesNotMatch(topic.title, /Why One Notification Breaks Your Whole Morning/i);
  }

  assert.equal(topics[0]?.category, "feelings_mindset");
  assert.equal(topics[1]?.category, "social_relationships");
  assert.ok(
    !/english learning|interview|fluency|speaking challenge/i.test(
      topics[1]?.topic ?? "",
    ),
  );
});
