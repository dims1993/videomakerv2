import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSilentSubtitleVoiceoverText } from "./subtitles";

describe("isSilentSubtitleVoiceoverText", () => {
  it("treats empty and whitespace as silent", () => {
    assert.equal(isSilentSubtitleVoiceoverText(""), true);
    assert.equal(isSilentSubtitleVoiceoverText("   "), true);
    assert.equal(isSilentSubtitleVoiceoverText(null), true);
    assert.equal(isSilentSubtitleVoiceoverText(undefined), true);
  });

  it("treats spoken dialogue as not silent", () => {
    assert.equal(isSilentSubtitleVoiceoverText("Hello there."), false);
  });
});
