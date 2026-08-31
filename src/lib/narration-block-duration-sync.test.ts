import assert from "node:assert/strict";
import test from "node:test";

import { computeNarrationBlockSceneDurations } from "@/lib/narration-block-duration-sync";
import { mergeNarrationBlockRecords } from "@/lib/voiceover-block-manifest";
import type { NarrationManifest } from "@/lib/voiceover-block-manifest";

test("computeNarrationBlockSceneDurations maps slice timings to scene duration", () => {
  const manifest: NarrationManifest = {
    videoId: "v1",
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        index: 0,
        blockId: "nb_1",
        provider: "fish",
        voiceKey: "fish:v1",
        voiceId: "v1",
        sceneIds: ["a", "b"],
        durationSec: 4.5,
        segmentTimings: [
          { sceneId: "a", sortOrder: 1, startTimeSec: 0, endTimeSec: 2.2 },
          { sceneId: "b", sortOrder: 2, startTimeSec: 2.2, endTimeSec: 4.5 },
        ],
        alignmentProvider: "whisperx",
        alignmentConfidence: 0.9,
      },
    ],
  };

  const pauseAfterMsBySceneId = new Map<string, number>([
    ["a", 0],
    ["b", 80],
  ]);
  const updates = computeNarrationBlockSceneDurations({
    manifest,
    pauseAfterMsBySceneId,
  });

  assert.equal(updates.length, 2);
  assert.equal(updates[0]!.sceneId, "a");
  assert.equal(updates[0]!.voiceoverDurationSec, 2.2);
  assert.equal(updates[0]!.pauseAfterMs, 0);
  assert.equal(updates[1]!.voiceoverDurationSec, 2.3);
  assert.equal(updates[1]!.durationInt, 3);
});

test("mergeNarrationBlockRecords replaces overlapping blocks", () => {
  const merged = mergeNarrationBlockRecords(
    [
      {
        index: 0,
        blockId: "old",
        provider: "google",
        voiceKey: "google:v1",
        voiceId: "v1",
        sceneIds: ["a", "b"],
      },
      {
        index: 1,
        blockId: "keep",
        provider: "fish",
        voiceKey: "fish:v2",
        voiceId: "v2",
        sceneIds: ["c", "d"],
      },
    ],
    [
      {
        index: 0,
        blockId: "new",
        provider: "google",
        voiceKey: "google:v1",
        voiceId: "v1",
        sceneIds: ["a", "b"],
        alignmentConfidence: 0.95,
      },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.blockId, "new");
  assert.equal(merged[1]!.blockId, "keep");
});
