import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assembleGodsWordImagePrompt,
  compactGodsWordImagePromptForContinuity,
  extractGodsWordImagePromptBody,
  normalizeGodsWordScenes,
  THE_GODS_WORD_NEGATIVE_LOCK,
  THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK,
  THE_GODS_WORD_STYLE_LOCK,
} from "./the-gods-word-image-prompt";

describe("the-gods-word-image-prompt", () => {
  test("avatar assembles fixed prefix + body + no-text + negatives", () => {
    const prompt = assembleGodsWordImagePrompt({
      sceneType: "avatar",
      body: "A believer kneels beside a simple bed with open hands.",
    });
    assert.ok(prompt.startsWith(THE_GODS_WORD_STYLE_LOCK));
    assert.ok(prompt.includes("A believer kneels beside a simple bed"));
    assert.ok(prompt.endsWith(
      `${THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK} ${THE_GODS_WORD_NEGATIVE_LOCK}`,
    ));
    assert.equal(
      (prompt.match(/No photorealism/gi) || []).length,
      1,
      "negatives must appear once",
    );
  });

  test("space uses the same fixed suffix as avatar", () => {
    const prompt = assembleGodsWordImagePrompt({
      sceneType: "space",
      body: "An empty Bethany doorway in soft parchment light, still and concrete.",
    });
    assert.ok(prompt.startsWith(THE_GODS_WORD_STYLE_LOCK));
    assert.ok(
      prompt.endsWith(
        `${THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK} ${THE_GODS_WORD_NEGATIVE_LOCK}`,
      ),
    );
  });

  test("insert keeps text policy in body and only appends negatives", () => {
    const withText = assembleGodsWordImagePrompt({
      sceneType: "insert",
      body: "Clean Bible-study card. Use only this exact visible text: Follow Me. No other words. Simple centered layout.",
    });
    assert.ok(withText.startsWith(THE_GODS_WORD_STYLE_LOCK));
    assert.ok(withText.includes("Use only this exact visible text: Follow Me."));
    assert.ok(withText.endsWith(THE_GODS_WORD_NEGATIVE_LOCK));
    // Should not double-append the avatar no-text lock when card text is present.
    assert.equal(
      (withText.match(/No visible text, captions, letters, or words\./gi) || [])
        .length,
      0,
    );

    const noText = assembleGodsWordImagePrompt({
      sceneType: "insert",
      body: "One iron nail beside a rough crossbeam on packed earth.",
    });
    assert.ok(noText.includes(THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK));
    assert.ok(noText.endsWith(THE_GODS_WORD_NEGATIVE_LOCK));
  });

  test("extract strips locks from a full production prompt", () => {
    const full = assembleGodsWordImagePrompt({
      sceneType: "avatar",
      body: "Two sisters stand in a Bethany doorway waiting.",
    });
    const body = extractGodsWordImagePromptBody(full);
    assert.equal(body, "Two sisters stand in a Bethany doorway waiting.");
    assert.equal(compactGodsWordImagePromptForContinuity(full), body);
  });

  test("normalize is idempotent and maps scenes", () => {
    const scenes = normalizeGodsWordScenes([
      {
        sceneType: "avatar",
        imagePrompt: "A messenger pauses at the gate with a sealed note.",
      },
      {
        sceneType: "insert",
        imagePrompt: `${THE_GODS_WORD_STYLE_LOCK} One folded message on a table. ${THE_GODS_WORD_NO_VISIBLE_TEXT_LOCK} ${THE_GODS_WORD_NEGATIVE_LOCK}`,
      },
    ]);
    assert.ok(scenes[0]!.imagePrompt!.startsWith(THE_GODS_WORD_STYLE_LOCK));
    assert.ok(scenes[1]!.imagePrompt!.endsWith(THE_GODS_WORD_NEGATIVE_LOCK));
    const again = normalizeGodsWordScenes(scenes);
    assert.equal(again[0]!.imagePrompt, scenes[0]!.imagePrompt);
    assert.equal(again[1]!.imagePrompt, scenes[1]!.imagePrompt);
  });
});
