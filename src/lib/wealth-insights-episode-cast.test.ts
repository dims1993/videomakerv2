import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractWealthEpisodeCastLock,
  parseWealthStoryVisualIdea,
} from "@/lib/wealth-insights-episode-cast";
import {
  defaultScenePauseAfterMsForChannel,
  WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS,
} from "@/lib/voiceover-scenes";

test("extractWealthEpisodeCastLock finds recurring story names", () => {
  const script = [
    "Ryan checks his phone and freezes.",
    "Maya laughs because her rent stayed flat.",
    "Ryan says the fee jumped again.",
    "Maya keeps a separate jar labeled SAVE.",
    "Ryan and Maya make opposite choices every month.",
    "He keeps buying status while she builds quiet wealth.",
  ].join(" ");

  const cast = extractWealthEpisodeCastLock({ script });
  const names = cast.characters.map((member) => member.name);
  assert.ok(names.includes("Ryan"));
  assert.ok(names.includes("Maya"));
  assert.ok(cast.characters.length <= 4);
  const ryan = cast.characters.find((member) => member.name === "Ryan");
  assert.ok(ryan?.descriptor.includes("original cartoon character Ryan"));
  assert.match(ryan?.descriptor ?? "", /ivory knit polo|charcoal zip hoodie|olive button-down/i);
  const maya = cast.characters.find((member) => member.name === "Maya");
  assert.ok(maya?.descriptor.includes("original cartoon character Maya"));
  assert.match(maya?.descriptor ?? "", /sage-green cardigan|denim jacket|terracotta blouse/i);
  assert.match(ryan?.descriptor ?? "", /clean cartoon face/);
  assert.match(maya?.descriptor ?? "", /clean cartoon face/);
  assert.match(ryan?.descriptor ?? "", /outfit:/i);
  assert.match(maya?.descriptor ?? "", /outfit:/i);
  assert.doesNotMatch(ryan?.descriptor ?? "", /FIXED HAIR|large expressive dark brown eyes/i);
  assert.doesNotMatch(ryan?.descriptor ?? "", /shared character universe|APP-OWNED|recurring story character/i);
  assert.doesNotMatch(maya?.descriptor ?? "", /ivory knit polo/);
  assert.doesNotMatch(ryan?.descriptor ?? "", /sage-green cardigan/);
  assert.equal(
    cast.characters.some((c) => ["They", "Her", "Invisible", "Not"].includes(c.name)),
    false,
  );
});

test("parseWealthStoryVisualIdea recognizes story prefixes", () => {
  assert.equal(
    parseWealthStoryVisualIdea("STORY_CHARACTER: Ryan — stares at a fee").kind,
    "story_character",
  );
  assert.deepEqual(
    parseWealthStoryVisualIdea("STORY_PAIR: Ryan + Maya — contrast jars").names,
    ["Ryan", "Maya"],
  );
  assert.equal(
    parseWealthStoryVisualIdea("MAIN HOST + STORY: Maya — host points at jar")
      .kind,
    "host_plus_story",
  );
  assert.equal(parseWealthStoryVisualIdea("MAIN HOST: Explains chart").kind, "main_host");
});

test("Wealth Insights channel pause default uses punctuation fallback", () => {
  assert.equal(WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS, 80);
  assert.equal(defaultScenePauseAfterMsForChannel("wealth-insights"), 80);
  assert.equal(defaultScenePauseAfterMsForChannel("the-gods-word"), 80);
});
