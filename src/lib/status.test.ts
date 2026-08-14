import assert from "node:assert/strict";
import test from "node:test";

import {
  getComputedVideoStatus,
  isSceneIncludedInPipeline,
  isSceneRejected,
  sceneIncludedInPipelineWhere,
} from "@/lib/status";

test("isSceneRejected recognizes rejected status", () => {
  assert.equal(isSceneRejected("rejected"), true);
  assert.equal(isSceneRejected("Rejected"), true);
  assert.equal(isSceneRejected("approved"), false);
  assert.equal(isSceneRejected(null), false);
});

test("isSceneIncludedInPipeline is inverse of rejected", () => {
  assert.equal(isSceneIncludedInPipeline("planned"), true);
  assert.equal(isSceneIncludedInPipeline("rejected"), false);
});

test("sceneIncludedInPipelineWhere excludes rejected", () => {
  assert.deepEqual(sceneIncludedInPipelineWhere(), {
    status: { not: "rejected" },
  });
});

test("getComputedVideoStatus ignores rejected scenes for image prompts", () => {
  const status = getComputedVideoStatus({
    ideaJson: "{}",
    script: "Hello",
    metadataJson: "{}",
    scenes: [
      { imagePrompt: "ok", status: "planned" },
      { imagePrompt: null, status: "rejected" },
    ],
  });
  assert.equal(status, "done");
});
