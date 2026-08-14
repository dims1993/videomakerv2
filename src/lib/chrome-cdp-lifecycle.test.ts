import assert from "node:assert/strict";
import test from "node:test";

import { pipelineChromeCdpPort } from "./chrome-cdp-lifecycle";

test("pipelineChromeCdpPort defaults to 9222", () => {
  const previous = process.env.GOOGLE_FLOW_CDP_URL;
  delete process.env.GOOGLE_FLOW_CDP_URL;
  delete process.env.CHATGPT_CDP_URL;
  delete process.env.BROWSER_CDP_URL;
  assert.equal(pipelineChromeCdpPort(), 9222);
  if (previous != null) {
    process.env.GOOGLE_FLOW_CDP_URL = previous;
  }
});
