import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBibleOneYearDayConfigFromPlan,
  fillBibleOneYearMasterTemplate,
  isBibleOneYearCategory,
  normalizeBibleOneYearDayConfig,
} from "@/lib/the-bible-in-one-year";

test("isBibleOneYearCategory matches category id", () => {
  assert.equal(isBibleOneYearCategory("the_bible_in_one_year"), true);
  assert.equal(isBibleOneYearCategory("parable"), false);
});

test("normalizeBibleOneYearDayConfig validates required fields", () => {
  const config = normalizeBibleOneYearDayConfig({
    dayNumber: 1,
    journeyAction: "begin",
    todayReadingDisplay: "Genesis 1–2",
    nextReadingDisplay: "Genesis 3–4",
    listeningFocus: "notice creation",
    chapterBlocks: [
      {
        bookName: "Genesis",
        bookNameUppercase: "GENESIS",
        chapterNumber: 1,
        webusText: "In the beginning...",
      },
    ],
    reflectionMainThought: "God creates with purpose.",
    reflectionApplication: "Trust His design.",
    prayerPoints: ["thank God for life"],
  });

  assert.ok(config);
  assert.equal(config?.dayNumber, 1);
  assert.equal(config?.chapterBlocks.length, 1);
});

test("fillBibleOneYearMasterTemplate injects day variables", () => {
  const config = buildBibleOneYearDayConfigFromPlan(
    {
      dayNumber: 2,
      todayReadingDisplay: "Genesis 3–4",
      nextReadingDisplay: "Genesis 5–7",
      listeningFocus: "notice the fall",
      chapters: [
        {
          bookName: "Genesis",
          bookNameUppercase: "GENESIS",
          chapterNumber: 3,
        },
      ],
      reflectionMainThought: "Sin separates.",
      reflectionApplication: "Return honestly.",
      prayerPoints: ["ask for mercy"],
    },
    { journeyAction: "continue", chapterWebusTexts: { "GENESIS:3": "Now the serpent..." } },
  );

  const filled = fillBibleOneYearMasterTemplate(
    "Day {{DAY_NUMBER}} reads {{TODAY_READING_DISPLAY}} with {{JOURNEY_ACTION}}.",
    config,
  );

  assert.match(filled, /Day 2 reads Genesis 3–4 with continue\./);
});
