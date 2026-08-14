import assert from "node:assert/strict";
import test from "node:test";

import { sceneUsesExclusiveClipAudio } from "@/lib/scene-clips";
import { planMusicBedStitch } from "@/lib/music-bed-stitch";

test("exclusive clip audio is only when unmuted with a clip path", () => {
  assert.equal(
    sceneUsesExclusiveClipAudio({
      clipLocalPath: "storage/scene-clips/x/a.mp4",
      clipMuted: false,
    }),
    true,
  );
  assert.equal(
    sceneUsesExclusiveClipAudio({
      clipLocalPath: "storage/scene-clips/x/a.mp4",
      clipMuted: true,
    }),
    false,
  );
  assert.equal(
    sceneUsesExclusiveClipAudio({
      clipLocalPath: null,
      clipMuted: false,
    }),
    false,
  );
});

test("exclusive clip beds do not underlay the next spoken scene", () => {
  const steps = planMusicBedStitch([
    // Music bed treated as plain clip when exclusive video audio is used.
    { isMusicBed: false, pauseAfterMs: 0, durationSec: 5 },
    { isMusicBed: false, pauseAfterMs: 220, durationSec: 10 },
  ]);
  assert.equal(
    steps.some((step) => step.kind === "overlap"),
    false,
  );
});
