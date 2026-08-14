import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractScenesFromHandoffResponse,
  parseAndValidateHandoffResponse,
  repairUnescapedJsonStringQuotes,
} from "@/lib/chatgpt-scene-handoff";

test("repairs unescaped quotes inside imagePrompt voiceover lines", () => {
  const broken = `[
  {
    "order": 1,
    "scriptText": "The moving truck is already gone.",
    "sceneType": "avatar",
    "visualPurpose": "Opens with the apartment upgrade feeling like a win.",
    "visualIdea": "MAIN HOST: The host stands beside an apartment door.",
    "duration": 5,
    "imagePrompt": "Voiceover context:\\n"The moving truck is already gone."\\nNarrative meaning:\\nThe move feels complete.\\nCreate:\\nClean 2D image.",
    "status": "planned"
  }
]`;

  assert.throws(() => JSON.parse(broken));

  const repaired = repairUnescapedJsonStringQuotes(broken);
  const parsed = JSON.parse(repaired) as Array<{ imagePrompt: string }>;
  assert.equal(parsed.length, 1);
  assert.match(parsed[0].imagePrompt, /"The moving truck is already gone\."/);

  const scenes = extractScenesFromHandoffResponse(broken);
  assert.equal(scenes.length, 1);

  const validation = parseAndValidateHandoffResponse(broken);
  assert.equal(validation.scenes.length, 1);
  assert.equal(validation.scenes[0].sceneType, "avatar");
});

test("leaves already-valid escaped JSON unchanged enough to parse", () => {
  const valid = JSON.stringify([
    {
      order: 1,
      scriptText: 'The truck is gone and keys are on the counter now.',
      sceneType: "avatar",
      visualPurpose: "Opens with a successful move feeling.",
      visualIdea: "MAIN HOST: Host beside apartment door with keys.",
      duration: 5,
      imagePrompt:
        'Voiceover context:\n"The truck is gone."\nNarrative meaning:\nDone.',
      status: "planned",
    },
  ]);

  const scenes = extractScenesFromHandoffResponse(valid);
  assert.equal(scenes.length, 1);
});
