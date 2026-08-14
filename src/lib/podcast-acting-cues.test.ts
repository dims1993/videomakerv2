import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExpressiveVoiceoverText,
  extractPodcastScriptTurnsWithActingCues,
  mapPodcastActingCuesToScenes,
  resolveVoiceoverModelForActingCues,
} from "./podcast-acting-cues";

describe("podcast-acting-cues", () => {
  it("extracts acting cues with following dialogue", () => {
    const turns = extractPodcastScriptTurnsWithActingCues(`
[EMMA]
Hello.

[laughs]
Then today, we are bringing it back to the very beginning.

[LEO]
[nervous]
Okay.
Hello.
`);

    assert.equal(turns.length, 3);
    assert.deepEqual(turns[0], {
      cues: [],
      dialogue: "Hello.",
    });
    assert.equal(turns[1]?.cues[0]?.tag, "laughs");
    assert.match(turns[1]?.dialogue ?? "", /Then today/);
    assert.equal(turns[2]?.cues[0]?.tag, "nervous");
    assert.equal(turns[2]?.dialogue, "Okay. Hello.");
  });

  it("maps cues onto matching scenes by dialogue", () => {
    const script = `
[EMMA]
Hello everyone.

[laughs]
Then today, we are bringing it back to the very beginning.

[LEO]
[sighs]
I know.
`;
    const scenes = [
      { sortOrder: 1, scriptText: "Hello everyone." },
      {
        sortOrder: 2,
        scriptText: "Then today, we are bringing it back to the very beginning.",
      },
      { sortOrder: 3, scriptText: "I know." },
    ];

    const map = mapPodcastActingCuesToScenes({ script, scenes });
    assert.equal(map.size, 2);
    assert.equal(map.get(2)?.[0]?.audioTag, "[laughs]");
    assert.equal(map.get(3)?.[0]?.audioTag, "[sighs]");
    assert.equal(map.has(1), false);
  });

  it("builds expressive text and picks eleven_v3 only when cues exist", () => {
    assert.equal(
      buildExpressiveVoiceoverText("Hello there.", [
        { tag: "laughs", audioTag: "[laughs]" },
      ]),
      "[laughs] Hello there.",
    );
    assert.equal(
      resolveVoiceoverModelForActingCues(
        [{ tag: "laughs", audioTag: "[laughs]" }],
        "eleven_turbo_v2_5",
      ),
      "eleven_v3",
    );
    assert.equal(
      resolveVoiceoverModelForActingCues([], "eleven_turbo_v2_5"),
      "eleven_turbo_v2_5",
    );
  });
});
