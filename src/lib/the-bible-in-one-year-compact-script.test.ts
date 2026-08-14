import assert from "node:assert/strict";
import { test } from "node:test";

import { ensureHookMarkersInScript } from "@/lib/visual-plan-script";
import { normalizeForScriptCoverage } from "@/lib/visual-plan-script";
import {
  BIBLE_ONE_YEAR_REFLECTION_OPENER,
  abstractBeatKind,
  abstractBeatRequiredPromptSignals,
  buildBibleOneYearAuthorizedTitles,
  buildBibleOneYearCoverBeatDirectives,
  countIndependentVisualActions,
  coverTitleFromChapterAnnouncement,
  coverTitleFromWelcomeLine,
  encodeBibleSpokenQuotesForJson,
  extractBibleOneYearCoverBeats,
  extractBibleOneYearDeterministicBeats,
  looksLikeGenericSeatedBibleTemplate,
  parseBibleScriptTextFromJsonFragment,
  prepareBibleOneYearCompactScript,
  suggestedScriptureSceneCount,
} from "@/lib/the-bible-in-one-year-compact-script";
import {
  BIBLE_ONE_YEAR_VISUAL_BRIEF_MARKERS,
  buildBibleOneYearVisualBrief,
} from "@/lib/the-bible-in-one-year-visual-brief";

const DAY1_MARKED = `[INTRODUCTION]

The Bible in One Year — Day 1.

Welcome to Day 1 of The Bible in One Year.

I'm truly glad you are here as we begin this journey through God's Word together.

Through this series, we are walking through the Bible one day at a time, with a simple and manageable daily reading. You do not need to understand everything at once or complete this journey perfectly. Simply listen, receive what God's Word has for you today, and return for the next reading.

And if, after today's reading, you can carry with you just one thought that speaks to your life, then the time we have spent together will already have been worthwhile.

Our readings come from the World English Bible, American English Edition, also known as the WEBUS.

Today, we will read Genesis 1–2.

As you listen, notice how God brings order, life, purpose, and rest into creation.

Let us begin.

[CHAPTER COVER — GENESIS 1]

Genesis, chapter 1.

In the beginning, God created the heavens and the earth.

[CHAPTER COVER — GENESIS 2]

Genesis, chapter 2.

The heavens, the earth, and all their vast array were finished.

[REFLECTION AND PRAYER]

${BIBLE_ONE_YEAR_REFLECTION_OPENER}

Genesis opens by showing us a world shaped by God's wisdom.

Pray with me.

Father, thank you for your Word.

In Jesus' name, amen.

[CLOSING]

Thank you for joining Day 1 of The Bible in One Year.

To mark your progress, comment "Day 1 complete" below.

If one verse or thought stayed with you, you are welcome to share it.

We will continue with Genesis 3–4.

May God's Word remain with you.

[FINAL]`;

test("prepareBibleOneYearCompactScript preserves section markers and does not replace them with HOOK", () => {
  const prepared = prepareBibleOneYearCompactScript(DAY1_MARKED, {
    ideaHook: "Welcome to Day 1 of The Bible in One Year.",
  });

  assert.match(prepared, /\[INTRODUCTION\]/);
  assert.match(prepared, /\[CHAPTER COVER — GENESIS 1\]/);
  assert.match(prepared, /\[CHAPTER COVER — GENESIS 2\]/);
  assert.match(prepared, /\[REFLECTION AND PRAYER\]/);
  assert.match(prepared, /\[CLOSING\]/);

  const strippedByHookHelper = ensureHookMarkersInScript(DAY1_MARKED, {
    ideaHook: "Welcome to Day 1 of The Bible in One Year.",
  }).script;
  assert.doesNotMatch(strippedByHookHelper, /\[INTRODUCTION\]/);

  assert.match(prepared, /\[INTRODUCTION\]/);
  assert.equal(prepared.includes("[HOOK]"), false);
});

test("introduction without marker still becomes a narrated cover beat", () => {
  const hookOnly = `[HOOK]

Welcome to Day 12 of The Bible in One Year.

I'm glad you are here.

[END HOOK]

Genesis, chapter 3.

In the beginning of the next reading.`;

  const prepared = prepareBibleOneYearCompactScript(hookOnly);
  assert.match(prepared, /\[INTRODUCTION\]/);

  const beats = extractBibleOneYearCoverBeats(hookOnly);
  const intro = beats.find((beat) => beat.kind === "introduction");
  assert.ok(intro);
  assert.equal(intro?.visibleTitle, "THE BIBLE IN ONE YEAR — DAY 12");
  assert.equal(intro?.sceneType, "insert");
  assert.equal(intro?.visualIdeaPrefix, "Chapter cover:");
});

test("introduction with marker uses first spoken opener as episode cover", () => {
  const beats = extractBibleOneYearCoverBeats(DAY1_MARKED);
  const intro = beats.find((beat) => beat.kind === "introduction");
  assert.ok(intro);
  assert.equal(intro?.spokenLine, "The Bible in One Year — Day 1.");
  assert.equal(intro?.visibleTitle, "THE BIBLE IN ONE YEAR — DAY 1");
});

test("chapter announcements become narrated covers without empty scenes", () => {
  const beats = extractBibleOneYearCoverBeats(DAY1_MARKED);
  const chapters = beats.filter((beat) => beat.kind === "chapter");
  assert.equal(chapters.length >= 2, true);
  assert.equal(chapters[0]?.spokenLine, "Genesis, chapter 1.");
  assert.equal(chapters[0]?.visibleTitle, "GENESIS 1");
  assert.equal(chapters[1]?.spokenLine, "Genesis, chapter 2.");
  assert.equal(chapters[1]?.visibleTitle, "GENESIS 2");
  assert.equal(
    chapters.every((beat) => beat.spokenLine.trim().length > 0),
    true,
  );
});

test("chapter announcement without marker still maps to a cover", () => {
  assert.equal(
    coverTitleFromChapterAnnouncement("Exodus, chapter 12."),
    "EXODUS 12",
  );
  const beats = extractBibleOneYearCoverBeats(
    "Welcome to Day 40 of The Bible in One Year.\n\nExodus, chapter 12.\n\nAnd the Lord spoke.",
  );
  assert.ok(beats.some((beat) => beat.visibleTitle === "EXODUS 12"));
});

test("reflection becomes REFLECT AND PRAY cover; closing is not a cover", () => {
  const covers = extractBibleOneYearCoverBeats(DAY1_MARKED);
  const reflection = covers.find((beat) => beat.kind === "reflection");
  assert.equal(reflection?.spokenLine, BIBLE_ONE_YEAR_REFLECTION_OPENER);
  assert.equal(reflection?.visibleTitle, "REFLECT AND PRAY");
  assert.equal(
    covers.some((beat) => beat.visibleTitle === "CLOSING"),
    false,
  );

  const all = extractBibleOneYearDeterministicBeats(DAY1_MARKED);
  assert.ok(all.some((beat) => beat.kind === "thank_you"));
  assert.ok(all.some((beat) => beat.kind === "progress"));
  assert.ok(all.some((beat) => beat.kind === "next_reading"));
  assert.ok(all.some((beat) => beat.kind === "final_blessing"));
  assert.ok(all.some((beat) => beat.kind === "pray_with_me"));
  assert.ok(all.some((beat) => beat.kind === "amen"));
  assert.equal(
    all.some((beat) => beat.kind === "episode_cover" && beat.requiresPastorLock),
    true,
  );
});

test("cover directives are injected as mandatory contract text", () => {
  const directives = buildBibleOneYearCoverBeatDirectives(DAY1_MARKED);
  assert.match(directives, /Deterministic Visual Beats For This Script/);
  assert.match(directives, /THE BIBLE IN ONE YEAR — DAY 1/);
  assert.match(directives, /GENESIS 1/);
  assert.match(directives, /REFLECT AND PRAY/);
  assert.match(directives, /THANK YOU/);
  assert.doesNotMatch(directives, /visible text limited to: CLOSING/);
  assert.match(directives, /\[CLOSING\] is segmentation only/);
  assert.match(directives, /Do not create an empty\/silent cover/);
});

test("authorized titles exclude CLOSING and include dynamic day titles", () => {
  const titles = buildBibleOneYearAuthorizedTitles(DAY1_MARKED);
  assert.ok(titles.includes("THE BIBLE IN ONE YEAR — DAY 1"));
  assert.ok(titles.includes("REFLECT AND PRAY"));
  assert.ok(titles.includes("AMEN"));
  assert.ok(titles.includes("THANK YOU"));
  assert.ok(titles.includes("DAY 1 COMPLETE"));
  assert.ok(titles.includes("NEXT — GENESIS 3–4"));
  assert.equal(titles.includes("CLOSING"), false);
  assert.equal(titles.includes("REFLECTION AND PRAYER"), false);
});

test("spoken coverage ignores markers only", () => {
  const prepared = prepareBibleOneYearCompactScript(DAY1_MARKED);
  const spoken = normalizeForScriptCoverage(prepared);
  assert.match(spoken, /Welcome to Day 1/);
  assert.doesNotMatch(spoken, /INTRODUCTION/);
  assert.doesNotMatch(spoken, /CHAPTER COVER/);
});

test("straight quotes encode as \\u0022 and parse back", () => {
  const spoken =
    'To mark your progress, comment "Day 1 complete" below.';
  const encoded = encodeBibleSpokenQuotesForJson(spoken);
  assert.match(encoded, /\\u0022Day 1 complete\\u0022/);
  assert.doesNotMatch(encoded, /\\"/);
  const scene = JSON.parse(
    `[{"scriptText":"${encoded}","sceneType":"insert","visualPurpose":"Invite progress","visualIdea":"Object/detail insert: A simple progress note","duration":5,"imagePrompt":"Simple closing insert, warm watercolor-and-ink style, visible text limited to: DAY 1 COMPLETE","status":"planned"}]`,
  ) as Array<{ scriptText: string }>;
  assert.equal(scene[0]?.scriptText, spoken);
  assert.equal(parseBibleScriptTextFromJsonFragment(encoded), spoken);
});

test("title helpers generalize beyond Day 1 / Genesis", () => {
  assert.equal(
    coverTitleFromWelcomeLine("Welcome to Day 200 of The Bible in One Year."),
    "THE BIBLE IN ONE YEAR — DAY 200",
  );
  assert.equal(
    coverTitleFromChapterAnnouncement("Psalm, chapter 23."),
    "PSALM 23",
  );
});

test("multi-action Genesis passage suggests several visual scenes", () => {
  const passage =
    "When the woman saw that the tree was good for food, she took some of its fruit, and ate. Then she gave some to her husband with her, and he ate it, too. Their eyes were opened. They sewed fig leaves together.";
  assert.equal(countIndependentVisualActions(passage) >= 4, true);
  assert.equal(suggestedScriptureSceneCount(passage) >= 4, true);
});

test("abstract beat mappings are semantic and anti-generic", () => {
  assert.equal(
    abstractBeatKind(
      "You do not need to understand everything at once or complete this journey perfectly.",
    ),
    "release_pressure",
  );
  assert.equal(
    abstractBeatKind(
      "Simply listen, receive what God's Word has for you today, and return for the next reading.",
    ),
    "listen_receive_return",
  );
  assert.equal(
    abstractBeatKind(
      "Our readings come from the World English Bible, American English Edition, also known as the WEBUS.",
    ),
    "translation_edition",
  );

  const releaseSignals = abstractBeatRequiredPromptSignals("release_pressure");
  const good =
    "Close view of an older reader’s hands gradually releasing tension beside an open Bible, fingers no longer gripping the page, warm watercolor-and-ink style, No visible text.";
  const bad =
    "Older reader beside an open Bible in warm morning light, peaceful atmosphere.";
  assert.equal(
    releaseSignals.some((signal) => good.toLowerCase().includes(signal)),
    true,
  );
  assert.equal(looksLikeGenericSeatedBibleTemplate(bad), true);
  assert.equal(looksLikeGenericSeatedBibleTemplate(good), false);
});

test("brief includes specificity and anti-repetition contracts", () => {
  const brief = buildBibleOneYearVisualBrief();
  for (const marker of BIBLE_ONE_YEAR_VISUAL_BRIEF_MARKERS) {
    assert.ok(brief.includes(marker), `missing marker: ${marker}`);
  }
  assert.match(brief, /ANTI-REPETITION RULE/);
  assert.match(brief, /ABSTRACT BEAT VISUAL MAPPINGS/);
  assert.match(brief, /Fallback when \[INTRODUCTION\] is missing/);
});

test("schema fields remain the only required scene keys in output contract example", () => {
  const brief = buildBibleOneYearVisualBrief();
  assert.match(brief, /sceneType/);
  assert.doesNotMatch(brief, /Create one chapter-cover insert for every exact \[CHAPTER N/);
});
