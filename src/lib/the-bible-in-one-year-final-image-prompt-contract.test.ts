import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BIBLE_ONE_YEAR_ADAM_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_EVE_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_LISTENER_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR,
  BIBLE_ONE_YEAR_STYLE_LOCK_COVER,
  BIBLE_ONE_YEAR_STYLE_LOCK_LANDSCAPE,
  buildBibleOneYearFinalImagePromptContract,
} from "@/lib/the-bible-in-one-year-final-image-prompt-contract";

test("final image prompt contract injects approved character locks verbatim", () => {
  const contract = buildBibleOneYearFinalImagePromptContract();
  assert.match(contract, /FINAL IMAGE PROMPT CONTRACT — FIRST-PASS PRODUCTION OUTPUT/);
  assert.ok(contract.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK));
  assert.ok(contract.includes(BIBLE_ONE_YEAR_LISTENER_CHARACTER_LOCK));
  assert.ok(contract.includes(BIBLE_ONE_YEAR_ADAM_CHARACTER_LOCK));
  assert.ok(contract.includes(BIBLE_ONE_YEAR_EVE_CHARACTER_LOCK));
  assert.ok(contract.includes(BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR));
  assert.ok(contract.includes(BIBLE_ONE_YEAR_STYLE_LOCK_COVER));
  assert.ok(contract.includes(BIBLE_ONE_YEAR_STYLE_LOCK_LANDSCAPE));
  assert.match(contract, /PROMPT INDEPENDENCE TEST/);
  assert.match(contract, /without rewriting, compilation, expansion/);
});
