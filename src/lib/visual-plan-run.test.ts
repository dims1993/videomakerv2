import assert from "node:assert/strict";
import { test } from "node:test";

import { VISUAL_PLAN_CALL } from "@/lib/visual-plan-critique";

test("visual plan batch uses a single GENERATE call type", () => {
  assert.equal(VISUAL_PLAN_CALL.GENERATE, "GENERATE_VISUAL_PLAN");
});
