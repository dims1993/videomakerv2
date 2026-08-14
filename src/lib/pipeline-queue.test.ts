import assert from "node:assert/strict";
import test from "node:test";

import { inferPipelineStartStep } from "@/lib/pipeline-queue";

test("inferPipelineStartStep starts at script when script missing", () => {
  assert.equal(
    inferPipelineStartStep({
      script: null,
      scenes: [],
    }),
    "script",
  );
});

test("inferPipelineStartStep starts at visual_plan when script exists but no scenes", () => {
  assert.equal(
    inferPipelineStartStep({
      script: "Narration about Lazarus.",
      scenes: [],
    }),
    "visual_plan",
  );
});

test("inferPipelineStartStep starts at assets when prompts exist but images missing", () => {
  assert.equal(
    inferPipelineStartStep({
      script: "Narration",
      scenes: [
        {
          status: "planned",
          imagePrompt: "A sealed tomb at dawn",
          imageLocalPath: null,
          imageUrl: null,
          clipLocalPath: null,
        },
      ],
      voiceoverStatus: "pending",
    }),
    "assets",
  );
});

test("inferPipelineStartStep starts at voiceover when assets ready", () => {
  assert.equal(
    inferPipelineStartStep({
      script: "Narration",
      scenes: [
        {
          status: "asset_ready",
          imagePrompt: "A sealed tomb at dawn",
          imageLocalPath: "/tmp/scene-1.png",
        },
      ],
      voiceoverStatus: "pending",
    }),
    "voiceover",
  );
});

test("inferPipelineStartStep skips subtitles when disabled", () => {
  assert.equal(
    inferPipelineStartStep({
      script: "Narration",
      scenes: [
        {
          status: "asset_ready",
          imagePrompt: "prompt",
          imageLocalPath: "/tmp/a.png",
        },
      ],
      voiceoverStatus: "ready",
      subtitleStatus: "pending",
      renderDraftStatus: "pending",
      generateSubtitles: false,
    }),
    "render",
  );
});

test("inferPipelineStartStep returns done when everything complete", () => {
  assert.equal(
    inferPipelineStartStep({
      script: "Narration",
      scenes: [
        {
          status: "asset_ready",
          imagePrompt: "prompt",
          imageLocalPath: "/tmp/a.png",
        },
      ],
      voiceoverStatus: "ready",
      subtitleStatus: "ready",
      renderDraftStatus: "rendered",
      generateSubtitles: true,
    }),
    "done",
  );
});
