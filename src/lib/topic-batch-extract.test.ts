import assert from "node:assert/strict";
import { test } from "node:test";

import { extractTopicBatchFromResponse } from "@/lib/topic-batch-extract";

test("extractTopicBatchFromResponse handles fenced JSON with smart quotes", () => {
  const raw = `
Sure! Here is the batch:

\`\`\`json
{
  "topics": [
    {
      "category": "parable",
      "title": "The Seed That Never Took Root",
      "topic": "How distraction quietly kills spiritual growth",
      "angle": "A parable lens on half-started faith.",
      "uniqueMechanism": "Attention leaks before belief collapses.",
      "trigger": "recognition",
      "promise": "See the leak early.",
      "visualHook": "Seeds falling onto crowded phone screens.",
      "thumbnailIdea": "SEED vs SCROLL",
      "repetitionRisk": "low"
    }
  ]
}
\`\`\`
`;

  const result = extractTopicBatchFromResponse(raw);
  assert.equal(result.topics.length, 1);
  assert.equal(result.topics[0]?.category, "parable");
});

test("extractTopicBatchFromResponse repairs unescaped quotes in thumbnailIdea", () => {
  const raw = `{
"topics": [
{
"category": "parable",
"title": "The Seed That Never Reached the Soil",
"topic": "A reflection on the parable of the sower.",
"angle": "Focus on the overlooked moment before growth.",
"uniqueMechanism": "Spiritual truth can remain familiar yet fruitless.",
"trigger": "The uneasy feeling of hearing Scripture often but remaining unchanged.",
"promise": "The viewer will understand why familiarity is not the same as receiving it.",
"visualHook": "Seeds fall onto a stone floor while rich soil sits untouched.",
"thumbnailIdea": "A single seed resting on cracked stone; on-image text: "WHY IT NEVER GREW"",
"repetitionRisk": "low"
},
{
"category": "parable",
"title": "When Mercy Feels Unfair",
"topic": "A reflection on the workers in the vineyard.",
"angle": "Explore how comparison turns another person's mercy into a personal offense.",
"uniqueMechanism": "The heart can reinterpret generosity as injustice.",
"trigger": "Resentment when someone else receives forgiveness.",
"promise": "The viewer will recover gratitude for undeserved mercy.",
"visualHook": "Two workers hold identical coins at sunset.",
"thumbnailIdea": "Two open palms holding equal coins; on-image text: "THAT FEELS UNFAIR"",
"repetitionRisk": "low"
}
]
}`;

  const result = extractTopicBatchFromResponse(raw);
  assert.equal(result.topics.length, 2);
  assert.match(result.topics[0]?.thumbnailIdea ?? "", /WHY IT NEVER GREW/);
  assert.match(result.topics[1]?.thumbnailIdea ?? "", /THAT FEELS UNFAIR/);
});

test("extractTopicBatchFromResponse repairs trailing commas", () => {
  const raw = `{
  "topics": [
    {
      "category": "hope_mercy",
      "title": "Mercy Still Finds You",
      "topic": "Hope after failure",
      "angle": "Return is possible",
      "uniqueMechanism": "Shame keeps the door closed from the inside",
      "trigger": "relief",
      "promise": "You can come back",
      "visualHook": "A closed door opening from the inside",
      "thumbnailIdea": "COME BACK",
      "repetitionRisk": "low",
    },
  ]
}`;

  const result = extractTopicBatchFromResponse(raw);
  assert.equal(result.topics.length, 1);
  assert.equal(result.topics[0]?.title, "Mercy Still Finds You");
});
