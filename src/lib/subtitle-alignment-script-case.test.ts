import assert from "node:assert/strict";
import test from "node:test";

import { CAPTION_STYLE_PRESETS } from "@/lib/caption-styles";
import {
  applyScriptCasingToAlignedWords,
  cleanSubtitleDisplayText,
  exportActiveWordCaptionsToAss,
  buildActiveWordCaptionCuesFromWords,
  prepareAlignedWordsForCaptionStyle,
  transferScriptTokenCasing,
} from "@/lib/subtitle-alignment";

test("transferScriptTokenCasing prefers script token when cores match", () => {
  assert.equal(transferScriptTokenCasing("Born", "born"), "Born");
  assert.equal(transferScriptTokenCasing("Jesus,", "jesus"), "Jesus,");
});

test("applyScriptCasingToAlignedWords follows scriptText capitals", () => {
  const words = applyScriptCasingToAlignedWords(
    [
      { word: "unless", start: 0, end: 0.2 },
      { word: "one", start: 0.2, end: 0.4 },
      { word: "is", start: 0.4, end: 0.5 },
      { word: "born", start: 0.5, end: 0.8 },
      { word: "again", start: 0.8, end: 1.1 },
    ],
    "Unless one is Born again",
  );

  assert.deepEqual(
    words.map((word) => word.word),
    ["Unless", "one", "is", "Born", "again"],
  );
});

test("clean_phrase_script keeps mixed case and marks italic in ASS", () => {
  const style = CAPTION_STYLE_PRESETS.clean_phrase_script;
  assert.equal(style.uppercase, false);
  assert.equal(style.italic, true);
  assert.equal(style.matchScriptCasing, true);

  const prepared = prepareAlignedWordsForCaptionStyle(
    [
      { word: "hello", start: 0, end: 0.3 },
      { word: "world", start: 0.3, end: 0.6 },
    ],
    style,
    "Hello World",
  );
  const cues = buildActiveWordCaptionCuesFromWords(prepared, style);
  const joined = cues.map((cue) => cue.text).join(" ");
  assert.match(joined, /Hello/);
  assert.match(joined, /World/);
  assert.equal(cleanSubtitleDisplayText("Hello, world.", style), "Hello world");

  const ass = exportActiveWordCaptionsToAss(cues, style);
  assert.match(ass, /,1,1,0,0,100,100,/);
});
