import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BIBLE_ONE_YEAR_REFLECTION_OPENER,
  buildBibleOneYearAuthorizedTitles,
  countIndependentVisualActions,
  extractBibleOneYearDeterministicBeats,
  prepareBibleOneYearCompactScript,
} from "@/lib/the-bible-in-one-year-compact-script";
import {
  BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK,
  BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR,
  BIBLE_ONE_YEAR_STYLE_LOCK_COVER,
  BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE,
  BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT,
} from "@/lib/the-bible-in-one-year-final-image-prompt-contract";
import {
  DAY2_SAMPLE_SCENES,
  DAY2_SCRIPT,
  buildDay2SampleChatGptRequest,
  parchmentChapterCoverPrompt,
  parchmentEpisodeCoverPrompt,
} from "@/lib/the-bible-in-one-year-day2-sample";
import { validateBibleOneYearImagePrompt } from "@/lib/the-bible-in-one-year-validator";
import {
  normalizeForScriptCoverage,
  validateScriptCoverage,
} from "@/lib/visual-plan-script";


test("Day 2 sample request includes compact-flow bible-in-one-year FULL_VIDEO contract", () => {
  const request = buildDay2SampleChatGptRequest();
  assert.match(request, /requestFormat: compact-flow/);
  assert.match(request, /categoryFormat: bible-in-one-year/);
  assert.match(request, /generationMode: FULL_VIDEO/);
  assert.match(request, /Recurring American pastor host:/);
  assert.match(request, /VISUAL-BEAT SEGMENTATION/);
  assert.match(request, /REFLECT AND PRAY/);
  assert.match(request, /\[CLOSING\] is segmentation only/);
  assert.doesNotMatch(request, /visible text limited to: CLOSING/);
  assert.doesNotMatch(request, /Recurring older host: about 65–75/);
});

test("Day 2 deterministic beats cover episode, chapters, reflection, prayer, closing mappings", () => {
  const beats = extractBibleOneYearDeterministicBeats(DAY2_SCRIPT);
  const kinds = new Set(beats.map((beat) => beat.kind));
  for (const kind of [
    "episode_cover",
    "welcome_pastor",
    "worthwhile_pause",
    "chapter_cover",
    "reflection_cover",
    "pray_with_me",
    "amen",
    "thank_you",
    "progress",
    "share",
    "next_reading",
    "final_blessing",
  ] as const) {
    assert.ok(kinds.has(kind), `missing beat ${kind}`);
  }
  assert.equal(
    beats.filter((beat) => beat.kind === "chapter_cover").length >= 3,
    true,
  );
  assert.equal(
    beats.find((beat) => beat.kind === "reflection_cover")?.visibleTitle,
    "REFLECT AND PRAY",
  );
  assert.equal(
    beats.find((beat) => beat.kind === "thank_you")?.sceneType,
    "avatar",
  );
});

test("Day 2 sample scenes meet acceptance assertions", () => {
  const episode = DAY2_SAMPLE_SCENES[0]!;
  assert.match(episode.imagePrompt, /parchment|bookplate/i);
  assert.ok(episode.imagePrompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK));
  assert.match(
    episode.imagePrompt,
    /visible text limited to: THE BIBLE IN ONE YEAR — DAY 2\./,
  );

  const chapterish = parchmentChapterCoverPrompt(
    "GENESIS 3",
    "a garden tree and fruit tied literally to the chapter",
  );
  assert.match(chapterish, /parchment|bookplate/i);
  assert.equal(chapterish.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK), false);
  assert.match(chapterish, /visible text limited to: GENESIS 3\./);

  const reflection = DAY2_SAMPLE_SCENES.find(
    (scene) => scene.scriptText === BIBLE_ONE_YEAR_REFLECTION_OPENER,
  )!;
  assert.equal(reflection.scriptText, BIBLE_ONE_YEAR_REFLECTION_OPENER);
  assert.match(reflection.imagePrompt, /visible text limited to: REFLECT AND PRAY\./);
  assert.match(reflection.visualIdea, /^Chapter cover:/);

  const pray = DAY2_SAMPLE_SCENES.find((scene) => scene.scriptText === "Pray with me.")!;
  assert.equal(pray.sceneType, "avatar");
  assert.ok(pray.imagePrompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK));

  const amen = DAY2_SAMPLE_SCENES.find(
    (scene) => scene.scriptText === "In Jesus' name, amen.",
  )!;
  assert.equal(amen.sceneType, "avatar");
  assert.ok(amen.imagePrompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK));
  assert.match(amen.imagePrompt, /visible text limited to: AMEN\./);

  const thanks = DAY2_SAMPLE_SCENES.find((scene) =>
    scene.scriptText.startsWith("Thank you for joining Day 2"),
  )!;
  assert.equal(thanks.sceneType, "avatar");
  assert.doesNotMatch(thanks.visualIdea, /Chapter cover:/i);
  assert.ok(thanks.imagePrompt.includes(BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK));
  assert.match(thanks.imagePrompt, /visible text limited to: THANK YOU\./);

  const progress = DAY2_SAMPLE_SCENES.find((scene) =>
    scene.scriptText.includes("Day 2 complete"),
  )!;
  assert.match(progress.imagePrompt, /visible text limited to: DAY 2 COMPLETE\./);

  const next = DAY2_SAMPLE_SCENES.find((scene) =>
    scene.scriptText.startsWith("We will continue"),
  )!;
  assert.match(next.imagePrompt, /visible text limited to: NEXT — GENESIS 5–7\./);

  const blessing = DAY2_SAMPLE_SCENES.find((scene) =>
    scene.scriptText.startsWith("May God's Word"),
  )!;
  assert.equal(blessing.sceneType, "space");
  assert.match(blessing.imagePrompt, /No readable writing/);
});

test("multi-action Genesis passage requires several scenes", () => {
  const passage =
    "When the woman saw that the tree was good for food, she took some of its fruit, and ate. Then she gave some to her husband with her, and he ate it, too. Their eyes were opened. They sewed fig leaves together.";
  assert.equal(countIndependentVisualActions(passage) >= 4, true);
  assert.equal(
    DAY2_SAMPLE_SCENES.filter((scene) =>
      /saw that the tree|took some of its fruit/i.test(scene.scriptText),
    ).length >= 2,
    true,
  );
});

test("validator rejects pastor+no modern clothing, bad titles, and abstract-only prompts", () => {
  const titles = buildBibleOneYearAuthorizedTitles(DAY2_SCRIPT);

  const badPastor = validateBibleOneYearImagePrompt({
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_AVATAR} Medium view of ${BIBLE_ONE_YEAR_HOST_CHARACTER_LOCK} standing beside a Bible. No modern clothing. ${BIBLE_ONE_YEAR_VISIBLE_TEXT_NONE}`,
    scriptText: "Welcome to Day 2 of The Bible in One Year.",
    sceneType: "avatar",
    authorizedTitles: titles,
    sourceScript: DAY2_SCRIPT,
  });
  assert.ok(
    badPastor.some((error) => /no modern clothing/i.test(error)),
    badPastor.join("; "),
  );

  const badTitle = validateBibleOneYearImagePrompt({
    imagePrompt: `${BIBLE_ONE_YEAR_STYLE_LOCK_COVER} Large title. visible text limited to: CLOSING. ${BIBLE_ONE_YEAR_NEGATIVE_LOCK_DEFAULT}`,
    scriptText: "Thank you for joining Day 2 of The Bible in One Year.",
    sceneType: "insert",
    authorizedTitles: titles,
    sourceScript: DAY2_SCRIPT,
  });
  assert.ok(badTitle.some((error) => /CLOSING/i.test(error)), badTitle.join("; "));

  const abstract = validateBibleOneYearImagePrompt({
    imagePrompt:
      "A symbolic scene representing trust in God’s design with illustrating grace and communicating order.",
    sceneType: "space",
    authorizedTitles: titles,
  });
  assert.ok(
    abstract.some((error) => /Abstract-only|observable/i.test(error)),
    abstract.join("; "),
  );

  const extraText = validateBibleOneYearImagePrompt({
    imagePrompt: parchmentEpisodeCoverPrompt("WRONG TITLE HERE"),
    scriptText: "The Bible in One Year — Day 2.",
    sceneType: "insert",
    authorizedTitles: titles,
    sourceScript: DAY2_SCRIPT,
  });
  assert.ok(
    extraText.some((error) => /Unauthorized visible title/i.test(error)),
    extraText.join("; "),
  );
});

test("joined sample coverage helper still normalizes markers out of source", () => {
  const prepared = prepareBibleOneYearCompactScript(DAY2_SCRIPT);
  const spoken = normalizeForScriptCoverage(prepared);
  assert.match(spoken, /Welcome to Day 2/);
  assert.doesNotMatch(spoken, /\[INTRODUCTION\]/);
  const coverage = validateScriptCoverage(prepared, [
    "The Bible in One Year — Day 2.",
    "Welcome to Day 2 of The Bible in One Year.",
  ]);
  assert.equal(typeof coverage.ok, "boolean");
});
