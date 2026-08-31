import assert from "node:assert/strict";
import { test } from "node:test";

import {
  prepareVoiceoverSpeechText,
  remapSpeechWordsToDisplay,
} from "@/lib/speech-text";

test("prepareVoiceoverSpeechText speaks YHWH as Yahweh", () => {
  const prepared = prepareVoiceoverSpeechText(
    "Call on YHWH and remember who YHVH is.",
  );

  assert.match(prepared.spokenText, /Call on Yahweh and remember who Yahweh is/);
  assert.equal(prepared.displayText.includes("YHWH"), true);
  assert.equal(
    prepared.replacements.some(
      (item) =>
        item.displayToken === "YHWH" &&
        item.spokenWords.join(" ") === "Yahweh",
    ),
    true,
  );
});

test("remapSpeechWordsToDisplay restores YHWH for captions", () => {
  const prepared = prepareVoiceoverSpeechText("Seek YHWH today.");
  const remapped = remapSpeechWordsToDisplay(
    [
      { word: "Seek", start: 0, end: 0.2 },
      { word: "Yahweh", start: 0.2, end: 0.6 },
      { word: "today", start: 0.6, end: 1.0 },
    ],
    prepared.replacements,
  );

  assert.equal(remapped[1]?.word, "YHWH");
});
