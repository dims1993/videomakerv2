import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  bumpPipelineStepAttempt,
  clearPipelineStepAttempts,
  getPipelineStepAttempt,
  isTransientPipelineError,
  isTransientPipelineFailure,
  PIPELINE_TRANSIENT_MAX_ATTEMPTS,
  pipelineRetryDelayMs,
  resetPipelineAttemptCounts,
} from "./pipeline-resilience";

describe("pipeline-resilience", () => {
  test("classifies ChatGPT/browser glitches as transient", () => {
    assert.equal(
      isTransientPipelineError(
        "Timed out waiting for ChatGPT response after 1800s.",
      ),
      true,
    );
    assert.equal(
      isTransientPipelineError(
        'Could not select ChatGPT GPT-5.5 / Alta: Could not open ChatGPT model picker.',
      ),
      true,
    );
    assert.equal(
      isTransientPipelineError(
        "locator.click: Timeout 10000ms exceeded. waiting for locator('#prompt-textarea')",
      ),
      true,
    );
    assert.equal(isTransientPipelineError("network error"), true);
    assert.equal(isTransientPipelineError("Failed to fetch"), true);
    assert.equal(
      isTransientPipelineFailure(new TypeError("network error")),
      true,
    );
  });

  test("does not retry cancel or missing-script failures", () => {
    assert.equal(
      isTransientPipelineError("Script Writer Batch canceled."),
      false,
    );
    assert.equal(isTransientPipelineError("Video has no script."), false);
    assert.equal(
      isTransientPipelineError("Section still invalid after repair: foo"),
      false,
    );
  });

  test("attempt counters and retry delay scale", () => {
    resetPipelineAttemptCounts();
    assert.equal(getPipelineStepAttempt("item1", "visual_plan"), 0);
    assert.equal(bumpPipelineStepAttempt("item1", "visual_plan"), 1);
    assert.equal(bumpPipelineStepAttempt("item1", "visual_plan"), 2);
    assert.ok(PIPELINE_TRANSIENT_MAX_ATTEMPTS >= 2);
    assert.equal(pipelineRetryDelayMs(1), 20_000);
    assert.equal(pipelineRetryDelayMs(2), 80_000);
    clearPipelineStepAttempts("item1", "visual_plan");
    assert.equal(getPipelineStepAttempt("item1", "visual_plan"), 0);
  });
});
