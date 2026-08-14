import assert from "node:assert/strict";
import test from "node:test";

import { buildSceneTimelineFromSegments } from "@/lib/render/timing";

test("timeline prefers video clip over missing image", () => {
  const timeline = buildSceneTimelineFromSegments(
    [
      {
        sortOrder: 1,
        scriptText: "",
        duration: 5,
        imagePath: null,
        clipPath: "/tmp/intro.mp4",
        clipMuted: true,
      },
      {
        sortOrder: 2,
        scriptText: "Hello",
        duration: 3,
        imagePath: "/tmp/emma.png",
      },
    ],
    [
      {
        index: 1,
        sceneStartOrder: 1,
        sceneEndOrder: 1,
        durationSec: 5,
      },
      {
        index: 2,
        sceneStartOrder: 2,
        sceneEndOrder: 2,
        durationSec: 3,
      },
    ],
  );

  assert.equal(timeline.length, 2);
  assert.equal(timeline[0]?.mediaKind, "video");
  assert.equal(timeline[0]?.clipMuted, true);
  assert.equal(timeline[0]?.duration, 5);
  assert.equal(timeline[1]?.mediaKind, "image");
  assert.equal(timeline[1]?.imagePath, "/tmp/emma.png");
});

test("unmuted clip is marked exclusive (not mixed under music bed)", () => {
  const timeline = buildSceneTimelineFromSegments(
    [
      {
        sortOrder: 1,
        scriptText: "",
        duration: 4,
        imagePath: "/tmp/fallback.png",
        clipPath: "/tmp/intro.mp4",
        clipMuted: false,
      },
    ],
    [
      {
        index: 1,
        sceneStartOrder: 1,
        sceneEndOrder: 1,
        durationSec: 4,
      },
    ],
  );

  assert.equal(timeline[0]?.mediaKind, "video");
  assert.equal(timeline[0]?.clipMuted, false);
});
