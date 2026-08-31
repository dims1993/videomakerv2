import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGodsWordVisualPlanSkeleton,
  mergeShortBodyBeats,
  stripUnknownGodsWordBracketLines,
} from "./gods-word-visual-skeleton";
import { normalizeForScriptCoverage } from "./visual-plan-script";

const SAMPLE = `
[HOOK]

There are words of Jesus that people almost never quote casually.

Words that do not fit easily on a mug.

[INTRODUCTION]

Few sentences in Scripture are more sobering than that.

[END HOOK]

[MESSAGE]

The central danger in Matthew 7 is not that these people lacked religious evidence.

It is that they trusted the wrong evidence.

They believed the name of Jesus on their lips proved that their hearts belonged to Him.

[CHAPTER 1 - THE WARNING HAS A CONTEXT]

Jesus does not begin the Sermon on the Mount with “I never knew you.”

He begins with blessing, hunger, mercy, and the narrow way that leads to life.

[CLOSING]

So what did Jesus really mean when He said I never knew you?

Let the warning drive you to Him.

[FINAL]
`.trim();

describe("gods-word-visual-skeleton", () => {
  it("strips unknown bracket lines like [MESSAGE]", () => {
    const cleaned = stripUnknownGodsWordBracketLines(SAMPLE);
    assert.doesNotMatch(cleaned, /\[MESSAGE\]/);
    assert.match(cleaned, /\[HOOK\]/);
    assert.match(cleaned, /\[CHAPTER 1/);
  });

  it("builds skeleton with coverage lock and chapter cover on first chapter beat", () => {
    const skeleton = buildGodsWordVisualPlanSkeleton(SAMPLE);
    assert.ok(skeleton.scenes.length >= 6);
    assert.ok(skeleton.sectionCount >= 3);

    const expected = normalizeForScriptCoverage(
      stripUnknownGodsWordBracketLines(SAMPLE),
    );
    const actual = normalizeForScriptCoverage(
      skeleton.scenes.map((scene) => scene.scriptText).join(" "),
    );
    assert.equal(actual, expected);

    const cover = skeleton.scenes.find((scene) =>
      scene.visualIdea.startsWith("Chapter cover:"),
    );
    assert.ok(cover);
    assert.equal(cover?.sceneType, "insert");
    assert.match(cover?.visualIdea ?? "", /THE WARNING HAS A CONTEXT/);
    assert.ok(
      skeleton.scenes.every((scene) => scene.visualsFilled === false),
    );
  });

  it("merges short body beats when neighbors exist", () => {
    const merged = mergeShortBodyBeats([
      "One two three.",
      "Four five six seven eight nine.",
      "Ten eleven twelve thirteen fourteen fifteen sixteen.",
    ]);
    assert.ok(merged.length < 3);
    assert.ok(merged.every((beat) => beat.split(/\s+/).length >= 6));
  });

  it("force-splits dense single-sentence hook beats", () => {
    const script = `
[HOOK]
They see phrases about falling away, trampling the Son of God, insulting the Spirit of grace, and they panic about whether they are already lost.
Another person hears Jesus say, "No one will snatch them out of My hand," and feels comfort for a moment before a harder question returns.
It tells the sheep that no one can snatch them from Christ's hand, and it also tells professing believers to examine themselves carefully before they presume.
[END HOOK]

[CHAPTER 1 - THE WARNING]
Jesus does not begin with fear alone. He begins with a real promise and a real warning that work together.
[FINAL]
`.trim();

    const skeleton = buildGodsWordVisualPlanSkeleton(script);
    const hookScenes = skeleton.scenes.filter((scene) =>
      (scene.visualPurpose || "").toLowerCase().includes("hook"),
    );
    assert.ok(hookScenes.length >= 4);
    for (const scene of hookScenes) {
      const words = scene.scriptText.trim().split(/\s+/).filter(Boolean).length;
      assert.ok(
        words <= 16,
        `hook beat still too dense (${words} words): ${scene.scriptText}`,
      );
      assert.ok(
        (scene.duration ?? 0) <= 6,
        `hook duration ${scene.duration}s exceeds soft max`,
      );
    }

    const expected = normalizeForScriptCoverage(
      stripUnknownGodsWordBracketLines(script),
    );
    const actual = normalizeForScriptCoverage(
      skeleton.scenes.map((scene) => scene.scriptText).join(" "),
    );
    assert.equal(actual, expected);
  });
});
