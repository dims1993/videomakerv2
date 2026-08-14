import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isPipelineUserStopError,
  PIPELINE_STOP_RESUME_MESSAGE,
} from "./pipeline-stop";

describe("pipeline-stop", () => {
  test("detects user/batch cancel errors", () => {
    assert.equal(
      isPipelineUserStopError(new Error("Visual Plan Batch canceled.")),
      true,
    );
    assert.equal(
      isPipelineUserStopError(null, PIPELINE_STOP_RESUME_MESSAGE),
      true,
    );
    assert.equal(
      isPipelineUserStopError({ name: "VisualPlanCanceledError", message: "x" }),
      true,
    );
  });

  test("does not treat orphan reclaim as a soft user stop for retries", () => {
    // Still a stop-like cancel string — parking is fine; important is we don't
    // treat permanent validation as stop.
    assert.equal(
      isPipelineUserStopError(new Error("Section still invalid after repair")),
      false,
    );
    assert.equal(
      isPipelineUserStopError(
        new Error("Timed out waiting for ChatGPT response after 1800s."),
      ),
      false,
    );
  });
});
