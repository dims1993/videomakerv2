import assert from "node:assert/strict";
import { test } from "node:test";

import { registerChannelMaturePack } from "@/lib/channel-mature-pack";

test("registerChannelMaturePack skips empty uploads without failing", async () => {
  const formData = new FormData();
  const result = await registerChannelMaturePack({
    channelKey: "test-mature-pack-channel",
    channelName: "Test Mature Pack",
    pipelineMode: "full",
    formData,
  });

  assert.ok(result.skipped.length >= 5);
  assert.equal(result.saved.length, 0);
});
