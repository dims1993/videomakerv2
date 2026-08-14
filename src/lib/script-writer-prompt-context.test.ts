import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildEpisodeContext,
  buildPromptSections,
} from "@/lib/script-writer-prompt-context";

test("buildEpisodeContext marks Max & Sara podcast episodes explicitly", () => {
  const context = buildEpisodeContext({
    channel: {
      key: "podcast-english-lessons",
      name: "Podcast English Lessons",
      editorialInstructions: { topicEngine: "conversational_podcast" },
    },
    video: {
      title:
        "When A Simple Group Chat Becomes Complicated | Natural English Conversation",
      topic:
        "Max and Sara talk about why a group chat can make a simple decision feel harder when too many people reply at different times.",
      topicCategory: "social_relationships",
    },
    topicCategory: {
      id: "social_relationships",
      label: "Social Relationships",
      description: "Everyday social situations and relationships.",
    },
    currentIdeaJson: {
      uniqueMechanism:
        "The Group Chat Spiral: one simple plan becomes harder because each new message adds a small condition, question, delay, or maybe, until nobody is sure what the plan actually is.",
      topicCategory: "social_relationships",
      seriesConcept: "Natural Daily English Conversations with Max & Sara",
    },
    topicEngine: "conversational_podcast",
  });

  assert.equal(context.episodeMode, "max_sara_conversation");
  assert.equal(context.podcastEpisodeFormat, "max_sara_conversation");
  assert.equal(context.topicCategory, "social_relationships");
  assert.notEqual(context.episodeMode, "other");
});

test("buildEpisodeContext keeps Emma & Leo when explicitly requested", () => {
  const context = buildEpisodeContext({
    channel: {
      key: "podcast-english-lessons",
      name: "Podcast English Lessons",
      editorialInstructions: { topicEngine: "conversational_podcast" },
    },
    video: {
      title: "Day 3 — Order Food",
      topic: "English in Action speaking challenge with Emma and Leo",
      topicCategory: null,
    },
    topicCategory: null,
    currentIdeaJson: {
      podcastEpisodeFormat: "emma_leo_lesson",
    },
  });

  assert.equal(context.episodeMode, "emma_leo_lesson");
  assert.equal(context.podcastEpisodeFormat, "emma_leo_lesson");
});

test("buildPromptSections fences JSON so topicCategory underscores stay clean", () => {
  const section = buildPromptSections([
    [
      "Episode Context",
      {
        topicCategory: "social_relationships",
        episodeMode: "max_sara_conversation",
        podcastEpisodeFormat: "max_sara_conversation",
      },
    ],
  ]);

  assert.match(section, /```json/);
  assert.match(section, /"topicCategory": "social_relationships"/);
  assert.doesNotMatch(section, /social\\_relationships/);
  assert.doesNotMatch(section, /"episodeMode": "other"/);
});
