import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  estimateBeatNarrationSeconds,
  forceSplitOversizedBeat,
} from "./visual-plan-dense-beats";

describe("visual-plan-dense-beats", () => {
  it("keeps short beats intact", () => {
    const parts = forceSplitOversizedBeat("Have I gone too far?", {
      maxWords: 14,
      maxEstimatedSec: 5.5,
    });
    assert.deepEqual(parts, ["Have I gone too far?"]);
  });

  it("splits dense hook sentences with commas and connectives", () => {
    const dense =
      "They see phrases about falling away, trampling the Son of God, insulting the Spirit of grace, and they panic.";
    const parts = forceSplitOversizedBeat(dense, {
      maxWords: 14,
      maxEstimatedSec: 5.5,
    });
    assert.ok(parts.length >= 2);
    assert.ok(parts.every((part) => part.split(/\s+/).length <= 16));
    assert.equal(
      parts.join(" ").replace(/\s+/g, " ").trim(),
      dense.replace(/\s+/g, " ").trim(),
    );
  });

  it("splits long and-joined clauses without dropping words", () => {
    const dense =
      "It tells the sheep that no one can snatch them from Christ’s hand, and it also tells professing believers to examine themselves carefully.";
    const parts = forceSplitOversizedBeat(dense, {
      maxWords: 14,
      maxEstimatedSec: 5.5,
    });
    assert.ok(parts.length >= 2);
    assert.ok(
      parts.every(
        (part) => estimateBeatNarrationSeconds(part) <= 6.5,
      ),
    );
    assert.equal(
      parts.join(" ").replace(/\s+/g, " ").trim(),
      dense.replace(/\s+/g, " ").trim(),
    );
  });
});
