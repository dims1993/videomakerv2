import assert from "node:assert/strict";
import test from "node:test";

import {
  MUSIC_BED_MIN_INTRO_SEC,
  MUSIC_BED_UNDERLAY_TAIL_SEC,
} from "@/lib/music-beds";
import {
  buildOverlapAwareSceneDurations,
  effectiveScenePauseAfterMs,
  musicBedIntroSec,
  musicBedUnderlaySec,
  planMusicBedStitch,
  sceneVisualDurationSec,
} from "@/lib/music-bed-stitch";

test("planMusicBedStitch underlays nearly the whole next spoken clip", () => {
  const steps = planMusicBedStitch([
    { isMusicBed: true, pauseAfterMs: 0, durationSec: 2 },
    { isMusicBed: false, pauseAfterMs: 200, durationSec: 11 },
    { isMusicBed: false, pauseAfterMs: 0, durationSec: 2 },
  ]);

  assert.deepEqual(steps[0], {
    kind: "overlap",
    bedIndex: 0,
    speechIndex: 1,
    introSec: MUSIC_BED_MIN_INTRO_SEC,
    underlaySec: 11 - MUSIC_BED_UNDERLAY_TAIL_SEC,
  });
  assert.deepEqual(steps[1], { kind: "silence", pauseSec: 0.2 });
  assert.deepEqual(steps[2], { kind: "clip", clipIndex: 2, fadeOutSec: 0 });
});

test("planMusicBedStitch skips underlay when bed has a long pause after", () => {
  const steps = planMusicBedStitch([
    { isMusicBed: true, pauseAfterMs: 1500, durationSec: 3 },
    { isMusicBed: false, pauseAfterMs: 0, durationSec: 4 },
  ]);

  assert.equal(steps[0]?.kind, "clip");
  assert.equal(steps[1]?.kind, "silence");
  assert.equal(steps[2]?.kind, "clip");
});

test("planMusicBedStitch fades orphan music beds at the end", () => {
  const steps = planMusicBedStitch([
    { isMusicBed: false, pauseAfterMs: 0, durationSec: 2 },
    { isMusicBed: true, pauseAfterMs: 0, durationSec: 3 },
  ]);

  assert.equal(steps[0]?.kind, "clip");
  assert.equal(steps[1]?.kind, "clip");
  if (steps[1]?.kind === "clip") {
    assert.ok(steps[1].fadeOutSec >= 0.2);
  }
});

test("effectiveScenePauseAfterMs defaults spoken null to punctuation fallback", () => {
  assert.equal(effectiveScenePauseAfterMs({ pauseAfterMs: null }), 80);
  assert.equal(effectiveScenePauseAfterMs({ pauseAfterMs: 0 }), 0);
  assert.equal(
    effectiveScenePauseAfterMs({
      pauseAfterMs: null,
      defaultPauseAfterMs: 0,
    }),
    0,
  );
  assert.equal(
    effectiveScenePauseAfterMs({ isMusicBed: true, pauseAfterMs: null }),
    0,
  );
  assert.equal(
    effectiveScenePauseAfterMs({ isMusicBed: true, pauseAfterMs: 1500 }),
    1500,
  );
});

test("music bed intro and underlay helpers", () => {
  assert.equal(musicBedIntroSec(2), MUSIC_BED_MIN_INTRO_SEC);
  assert.equal(musicBedIntroSec(7), 7);
  assert.equal(musicBedUnderlaySec(11), 11 - MUSIC_BED_UNDERLAY_TAIL_SEC);
});

test("sceneVisualDurationSec keeps bed intro on screen", () => {
  assert.equal(
    sceneVisualDurationSec({
      voiceoverDuration: 2,
      pauseAfterMs: 0,
      isMusicBed: true,
      introSec: 5,
    }),
    5,
  );
  assert.equal(
    sceneVisualDurationSec({
      voiceoverDuration: 4,
      pauseAfterMs: null,
      isMusicBed: false,
    }),
    4.08,
  );
});

test("buildOverlapAwareSceneDurations uses intro + full speech", () => {
  const durations = buildOverlapAwareSceneDurations([
    {
      sortOrder: 1,
      voiceoverDuration: 2,
      pauseAfterMs: 0,
      isMusicBed: true,
    },
    {
      sortOrder: 2,
      voiceoverDuration: 11.006,
      pauseAfterMs: 0,
      isMusicBed: false,
    },
    {
      sortOrder: 3,
      voiceoverDuration: 3.529,
      pauseAfterMs: 0,
      isMusicBed: false,
    },
  ]);

  assert.equal(durations.get(1), MUSIC_BED_MIN_INTRO_SEC);
  assert.equal(durations.get(2), 11.006);
  assert.equal(durations.get(3), 3.529);
  const total = [...durations.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(
    Math.abs(total - (MUSIC_BED_MIN_INTRO_SEC + 11.006 + 3.529)) < 0.001,
  );
});
