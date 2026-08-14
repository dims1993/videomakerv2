import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAndValidateHandoffResponse } from "@/lib/chatgpt-scene-handoff";

test("normalizes common invalid sceneType aliases", () => {
  const validation = parseAndValidateHandoffResponse(
    JSON.stringify([
      {
        scriptText: "Hello there friend this is long enough text.",
        sceneType: "character",
        visualPurpose: "Hook the viewer with recognition",
        visualIdea: "Narrative scene: A person looks to camera calmly",
        duration: 5,
        imagePrompt:
          "A clear watercolor portrait of a believer looking toward soft light with calm expression and simple parchment background texture. No visible text, captions, letters, or words.",
        status: "planned",
      },
      {
        scriptText: "Object line that is also long enough here.",
        sceneType: "close-up",
        visualPurpose: "Show the object clearly",
        visualIdea: "Object/detail insert: A cup on a table",
        duration: 5,
        imagePrompt:
          "Close watercolor study of a simple clay cup on a wooden table, strong focus. No visible text, captions, letters, or words.",
        status: "planned",
      },
      {
        scriptText: "Place line that is also long enough here.",
        sceneType: "landscape",
        visualPurpose: "Give a quiet transition",
        visualIdea: "Atmosphere/space: A quiet road at dawn",
        duration: 5,
        imagePrompt:
          "Wide watercolor of a quiet dirt road at dawn with soft paper texture. No visible text, captions, letters, or words.",
        status: "planned",
      },
    ]),
  );

  assert.deepEqual(
    validation.scenes.map((scene) => scene.sceneType),
    ["avatar", "insert", "space"],
  );
  assert.equal(validation.errors.length, 0);
});

test("requireVisualIdeaPrefixes elevates missing prefixes to errors", () => {
  const validation = parseAndValidateHandoffResponse(
    JSON.stringify([
      {
        scriptText: "A memorable thesis line for the card.",
        sceneType: "insert",
        visualPurpose: "State the thesis",
        visualIdea: "A seed on closed soil",
        duration: 5,
        imagePrompt:
          "Watercolor seed on closed soil. Use only this exact visible text: Information is not transformation. No other words.",
        status: "planned",
      },
    ]),
    { requireVisualIdeaPrefixes: true },
  );

  assert.ok(validation.errors.some((error) => /visualIdea/i.test(error)));
});
