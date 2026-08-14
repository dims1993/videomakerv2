import assert from "node:assert/strict";
import test from "node:test";

import {
  assessVoiceoverSubtitleTimelineAlignment,
  lastCueEndFromCues,
  sumSegmentDurationSecs,
  sumTrailingUncaptionedDurationSecs,
  TIMELINE_ALIGNMENT_TOLERANCE_SEC,
} from "@/lib/timeline-alignment";

test("sumSegmentDurationSecs ignores nulls and empty", () => {
  assert.equal(sumSegmentDurationSecs([]), null);
  assert.equal(sumSegmentDurationSecs([null, undefined]), null);
  assert.equal(sumSegmentDurationSecs([1.5, null, 2.5]), 4);
});

test("lastCueEndFromCues returns max end", () => {
  assert.equal(lastCueEndFromCues(null), null);
  assert.equal(lastCueEndFromCues([]), null);
  assert.equal(
    lastCueEndFromCues([{ end: 1.2 }, { end: 4.5 }, { end: 3.1 }]),
    4.5,
  );
});

test("sumTrailingUncaptionedDurationSecs sums empty tail only", () => {
  assert.equal(
    sumTrailingUncaptionedDurationSecs([
      { text: "Hello", durationSec: 1 },
      { text: "", durationSec: 8.18 },
    ]),
    8.18,
  );
  assert.equal(
    sumTrailingUncaptionedDurationSecs([
      { text: "Hello", durationSec: 1 },
      { pacedTextUsed: "World", text: "", durationSec: 2 },
    ]),
    0,
  );
});

test("aligned when delta within tolerance (last-scene pause)", () => {
  const report = assessVoiceoverSubtitleTimelineAlignment({
    masterDurationSec: 1366.072,
    segmentDurationSecs: [1366.252],
  });

  assert.equal(report.status, "aligned");
  assert.ok(Math.abs(report.deltaSec ?? 99) <= TIMELINE_ALIGNMENT_TOLERANCE_SEC);
  assert.match(report.message, /aligned/i);
});

test("misaligned when pauses inflate subtitle clock (~75s drift)", () => {
  const report = assessVoiceoverSubtitleTimelineAlignment({
    masterDurationSec: 1290.472,
    segmentDurationSecs: [1366.252],
    lastCueEndSec: 1360,
  });

  assert.equal(report.status, "misaligned");
  assert.ok((report.deltaSec ?? 0) > 70);
  assert.match(report.message, /re-stitch/i);
});

test("FINAL bumper tail does not flag last-caption early end", () => {
  const master = 2208.85;
  const report = assessVoiceoverSubtitleTimelineAlignment({
    masterDurationSec: master,
    segmentDurationSecs: [2200.84, 8.18],
    lastCueEndSec: master - 8.59,
    uncaptionedTailSec: 8.18,
  });

  assert.equal(report.status, "aligned");
  assert.equal(report.uncaptionedTailSec, 8.18);
  assert.match(report.message, /uncaptioned bumper/i);
});

test("unknown without master", () => {
  const report = assessVoiceoverSubtitleTimelineAlignment({
    masterDurationSec: null,
    segmentDurationSecs: [10, 20],
  });

  assert.equal(report.status, "unknown");
  assert.match(report.message, /stitch/i);
});
