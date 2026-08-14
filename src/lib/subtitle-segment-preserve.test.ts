import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRestorePreservedSubtitleCues,
  subtitleSegmentPreserveKey,
} from "./subtitle-segment-preserve";

describe("subtitle-segment-preserve", () => {
  it("keys scenes by start/end order", () => {
    assert.equal(subtitleSegmentPreserveKey(6, 6), "6:6");
  });

  it("restores cues when spoken text matches", () => {
    assert.equal(
      shouldRestorePreservedSubtitleCues({
        previousSpokenText: "Hello there.",
        nextSpokenText: "Hello there.",
        cueCount: 3,
        previousStatus: "ready",
      }),
      true,
    );
  });

  it("does not restore when spoken text changed", () => {
    assert.equal(
      shouldRestorePreservedSubtitleCues({
        previousSpokenText: "Hello there.",
        nextSpokenText: "Hello friends.",
        cueCount: 3,
        previousStatus: "ready",
      }),
      false,
    );
  });

  it("does not restore empty cues, but restores needs_update snapshots with cues", () => {
    assert.equal(
      shouldRestorePreservedSubtitleCues({
        previousSpokenText: "Hello.",
        nextSpokenText: "Hello.",
        cueCount: 0,
        previousStatus: "ready",
      }),
      false,
    );
    assert.equal(
      shouldRestorePreservedSubtitleCues({
        previousSpokenText: "Hello.",
        nextSpokenText: "Hello.",
        cueCount: 2,
        previousStatus: "needs_update",
      }),
      true,
    );
  });
});
