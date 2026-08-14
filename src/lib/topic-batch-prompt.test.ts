import assert from "node:assert/strict";
import test from "node:test";

import { getChannelProfile } from "@/lib/channels";
import { buildTopicBatchPrompt } from "@/lib/topic-batch-prompt";
import { parseTopicBatchJson } from "@/lib/topic-batch-import";

test("gods-word topic batch prompt is scripture-first and finance-free", () => {
  const channel = getChannelProfile("the-gods-word");
  assert.equal(channel.editorialInstructions?.topicEngine, "scripture_first");
  assert.ok(
    !channel.topicSystem?.weeklyRotation.includes("the_bible_in_one_year"),
  );

  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count: 3,
    categories: channel.topicSystem!.categories,
    editorialInstructions: channel.editorialInstructions!,
    recentTopics: [],
  });

  assert.match(prompt, /SCRIPTURE FIRST/i);
  assert.match(prompt, /centralQuestion/);
  assert.match(prompt, /scriptureAnchor/);
  assert.match(prompt, /commonMisunderstanding/);
  assert.match(prompt, /spiritualTurn/);
  assert.match(prompt, /BIBLICAL TENSION/i);
  assert.match(
    prompt,
    /Treat familiar-but-misunderstood Scripture as one especially valuable topic lane/i,
  );
  assert.match(
    prompt,
    /do not force every topic into a misunderstanding frame/i,
  );
  assert.match(
    prompt,
    /instinctive assumption, shallow reading, expectation, or cliché/i,
  );
  assert.doesNotMatch(prompt, /something Christians commonly hold/i);
  assert.match(prompt, /conceptual DNA/i);
  assert.match(prompt, /essentially the same centralQuestion/i);
  assert.doesNotMatch(prompt, /make your raise disappear/i);
  assert.doesNotMatch(prompt, /keep you broke/i);
  assert.doesNotMatch(prompt, /salary vs wealth/i);
  assert.doesNotMatch(prompt, /drain your paycheck/i);
  assert.match(prompt, /Never use category "the_bible_in_one_year"/);
});

test("scripture-first recent topics include conceptual DNA fields", () => {
  const channel = getChannelProfile("the-gods-word");
  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count: 2,
    categories: channel.topicSystem!.categories,
    editorialInstructions: channel.editorialInstructions!,
    recentTopics: [
      {
        category: "biblical_story",
        title: "Why Did Jesus Wait When Lazarus Was Dying?",
        angle: "Divine delay",
        uniqueMechanism: "Love that waits for glory, not instant rescue.",
        scriptureAnchor: "John 11 — Jesus delays going to Lazarus.",
        centralQuestion: "Why would love wait while someone dies?",
        commonMisunderstanding:
          "If Jesus loves someone and can help, love should act immediately.",
        spiritualTurn: "Waiting can be love, not abandonment.",
        visualHook: "Closed tomb under delayed dawn light.",
        thumbnailIdea: "Sealed tomb; on-image text: 'HE WAITED'",
      },
    ],
  });

  assert.match(prompt, /John 11/);
  assert.match(prompt, /Why would love wait/);
  assert.match(prompt, /love should act immediately/);
  assert.match(prompt, /Waiting can be love/);
});

test("gods-word requiredTopicFields match scripture-first JSON contract", () => {
  const fields = getChannelProfile("the-gods-word").editorialInstructions
    ?.requiredTopicFields;
  assert.deepEqual(fields, [
    "category",
    "title",
    "scriptureAnchor",
    "topic",
    "centralQuestion",
    "commonMisunderstanding",
    "angle",
    "uniqueMechanism",
    "spiritualTurn",
    "trigger",
    "promise",
    "visualHook",
    "thumbnailIdea",
    "repetitionRisk",
  ]);
});

test("wealth topic batch prompt still includes finance title mechanics when lanes exist", () => {
  const channel = getChannelProfile("wealth-insights");
  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count: 3,
    categories: channel.topicSystem!.categories,
    editorialInstructions: channel.editorialInstructions!,
    recentTopics: [],
    outlierAngleLanes: channel.topicSystem?.outlierAngleLanes ?? [],
  });

  assert.match(prompt, /make your raise disappear|Make Your Raise Disappear/i);
  assert.doesNotMatch(prompt, /SCRIPTURE FIRST/i);
});

test("podcast english topic batch prompt uses conversational Max & Sara engine", () => {
  const channel = getChannelProfile("podcast-english-lessons");
  assert.equal(
    channel.editorialInstructions?.topicEngine,
    "conversational_podcast",
  );
  assert.ok(
    channel.topicSystem?.categories.some(
      (item) => item.id === "english_communication",
    ),
  );
  assert.ok(
    channel.topicSystem?.categories.some((item) => item.id === "daily_life"),
  );
  assert.doesNotMatch(
    channel.topicSystem?.categories.map((item) => item.id).join(",") ?? "",
    /greetings_introductions/,
  );

  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count: 1,
    categories: channel.topicSystem!.categories,
    editorialInstructions: channel.editorialInstructions!,
    recentTopics: [],
  });

  assert.match(prompt, /Max and Sara/i);
  assert.match(prompt, /Natural Daily English Conversations/i);
  assert.match(prompt, /NOT a teacher-student speaking challenge/i);
  assert.match(prompt, /uniqueMechanism must describe the actual observable pattern/i);
  assert.match(prompt, /English Podcast For Learning English/i);
  assert.match(prompt, /Easy English Podcast/i);
  assert.match(prompt, /english_communication/i);
  assert.match(prompt, /Do not let english_communication dominate/i);
  assert.match(prompt, /The Tiny Task Delay/i);
  assert.match(prompt, /listen-and-repeat/i);
  assert.match(prompt, /EXAMPLE ANTI-COPY RULE/i);
  assert.match(prompt, /MULTI-TOPIC BALANCE/i);
  assert.doesNotMatch(prompt, /Emma & Leo/i);
  assert.doesNotMatch(prompt, /SCRIPTURE FIRST/i);
  assert.doesNotMatch(prompt, /make your raise disappear/i);
});

test("podcast english focused category forces selected key", () => {
  const channel = getChannelProfile("podcast-english-lessons");
  const prompt = buildTopicBatchPrompt({
    channelName: channel.name,
    count: 1,
    selectedCategoryId: "habits_productivity",
    categories: channel.topicSystem!.categories,
    editorialInstructions: channel.editorialInstructions!,
    recentTopics: [],
  });

  assert.match(prompt, /Focused category mode is active/i);
  assert.match(prompt, /habits_productivity/);
  assert.match(
    prompt,
    /Every generated topic must use this exact category key: habits_productivity/,
  );
});

test("parseTopicBatchJson keeps scripture-first fields", () => {
  const topics = parseTopicBatchJson(
    JSON.stringify({
      topics: [
        {
          category: "parable",
          title: "Why Did Jesus Praise a Widow Who Gave Almost Nothing?",
          scriptureAnchor:
            "Mark 12:41-44 — Jesus watches the poor widow put in two small coins.",
          topic:
            "Jesus praises costly devotion measured by sacrifice, not visible size.",
          centralQuestion:
            "Why would Jesus praise a gift that looks insignificant by every human measure?",
          commonMisunderstanding:
            "Christians often treat generosity as mainly about donation amount rather than costly trust.",
          angle: "Costly devotion vs visible size.",
          uniqueMechanism:
            "The passage measures devotion by what the gift costs the giver, not by its public size.",
          spiritualTurn:
            "The viewer reconsiders whether their obedience is shaped by appearance or costly trust.",
          trigger: "recognition that familiar generosity teaching may be shallower than Jesus' measure",
          promise: "See generosity through Jesus' measure of costly trust.",
          visualHook: "Two tiny coins beside a large temple treasury chest.",
          thumbnailIdea: "Tiny coins in open hands; on-image text: 'ALMOST NOTHING'",
          repetitionRisk: "low",
        },
      ],
    }),
  );

  assert.equal(topics.length, 1);
  assert.equal(topics[0]?.scriptureAnchor?.includes("Mark 12"), true);
  assert.ok(topics[0]?.centralQuestion?.includes("Why would Jesus"));
  assert.ok(topics[0]?.commonMisunderstanding?.includes("generosity"));
  assert.ok(topics[0]?.spiritualTurn?.includes("costly trust"));
});
