import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEALTH_INSIGHTS_MAIN_HOST_LOCK,
  WEALTH_INSIGHTS_STYLE_LOCK,
  assembleWealthInsightsImagePrompt,
  buildWealthInsightsEducationalBeat,
  extractWealthInsightsVisualBeat,
  normalizeWealthInsightsImagePrompt,
  normalizeWealthInsightsScenes,
  softenWealthInsightsFlowPhrasing,
  wealthImagePromptLockCounts,
} from "./wealth-insights-image-prompt";

test("assemble uses fixed host + style locks and educational beat (not raw VO)", () => {
  const prompt = assembleWealthInsightsImagePrompt({
    educationalBeat: "The apartment initially feels safe and harmless.",
    narrativeMeaning: "The apartment initially feels safe.",
    visualBeat:
      "a spotless apartment doorway beside a softly glowing larger floor plan\nthe host opens the door with a confident welcoming gesture",
  });

  assert.match(prompt, /Educational beat:\n"The apartment initially feels safe and harmless\."/);
  assert.match(prompt, /Narrative meaning:\n"The apartment initially feels safe\."/);
  assert.doesNotMatch(prompt, /Voiceover context:/);
  assert.ok(prompt.includes(WEALTH_INSIGHTS_MAIN_HOST_LOCK));
  assert.ok(prompt.includes(WEALTH_INSIGHTS_STYLE_LOCK));
  assert.match(prompt, /spotless apartment doorway/);
  assert.match(prompt, /confident welcoming gesture/);
});

test("softenWealthInsightsFlowPhrasing replaces stress vocabulary", () => {
  assert.match(
    softenWealthInsightsFlowPhrasing(
      "the host reacts to financial pressure and fear as a trap closes",
    ),
    /tight monthly budget|budget squeeze/,
  );
  assert.doesNotMatch(
    softenWealthInsightsFlowPhrasing("financial pressure and fear"),
    /\bfear\b/i,
  );
});

test("buildWealthInsightsEducationalBeat prefers narrative meaning over scriptText", () => {
  const beat = buildWealthInsightsEducationalBeat({
    narrativeMeaning: "A fixed monthly cost reduces leftover money.",
    scriptText: "The pressure hits when every bill arrives at once and fear takes over.",
  });
  assert.equal(beat, "A fixed monthly cost reduces leftover money.");
});

test("normalize rewrites abbreviated host into the canonical lock", () => {
  const short = [
    "Voiceover context: The new apartment looks harmless.",
    "Narrative meaning: The apartment initially feels safe and harmless.",
    "Create: Clean 2D Wealth Insights finance explainer image.",
    "Must show: main recurring finance host, elegant young Black businesswoman in deep burgundy blazer and soft white blouse; a spotless apartment doorway beside a softly glowing larger floor plan; host opens the door with a confident welcoming gesture.",
    "Style rules: clean 2D vector, thick outlines, flat colors, simple shading, neutral background, few large readable elements, 16:9, no captions or long text, no photorealism, 3D, or anime.",
  ].join(" ");

  const normalized = normalizeWealthInsightsImagePrompt({
    imagePrompt: short,
    scriptText: "The new apartment looks harmless.",
    visualPurpose: "The apartment initially feels safe and harmless.",
  });

  assert.ok(normalized.includes(WEALTH_INSIGHTS_MAIN_HOST_LOCK));
  assert.ok(normalized.includes(WEALTH_INSIGHTS_STYLE_LOCK));
  assert.match(normalized, /spotless apartment doorway/i);
  assert.match(normalized, /opens the door/i);
  assert.match(normalized, /Educational beat:/);
  assert.doesNotMatch(normalized, /Voiceover context:/);
  assert.doesNotMatch(normalized, /The new apartment looks harmless/);
  assert.doesNotMatch(
    normalized.split("Must show:")[1] ?? "",
    /burgundy blazer and soft white blouse/,
  );
});

test("extractWealthInsightsVisualBeat drops host lock lines", () => {
  const beat = extractWealthInsightsVisualBeat({
    imagePrompt: [
      "Must show:",
      `- ${WEALTH_INSIGHTS_MAIN_HOST_LOCK}`,
      "- a giant rent notice labeled RENT",
      "- the host braces the jar with concern",
      "Style:",
      WEALTH_INSIGHTS_STYLE_LOCK,
    ].join("\n"),
  });
  assert.match(beat, /giant rent notice/);
  assert.match(beat, /braces the jar/);
  assert.doesNotMatch(beat, /same character every scene/);
});

test("normalize is idempotent and never duplicates host/style locks", () => {
  const once = normalizeWealthInsightsImagePrompt({
    imagePrompt: [
      "Educational beat:",
      '"Hello."',
      "Narrative meaning:",
      '"Greeting."',
      "Must show:",
      `- ${WEALTH_INSIGHTS_MAIN_HOST_LOCK}`,
      "- a glowing floor plan",
      "Style:",
      WEALTH_INSIGHTS_STYLE_LOCK,
    ].join("\n"),
    scriptText: "Hello.",
  });
  const twice = normalizeWealthInsightsImagePrompt({
    imagePrompt: once,
    scriptText: "Hello.",
  });
  assert.equal(once, twice);
  const counts = wealthImagePromptLockCounts(twice);
  assert.equal(counts.hostLockCount, 1);
  assert.equal(counts.styleLockCount, 1);
  assert.equal(counts.styleSectionCount, 1);
});

test("normalizeWealthInsightsScenes maps every scene", () => {
  const scenes = normalizeWealthInsightsScenes([
    {
      imagePrompt: "Must show: host in burgundy blazer; a glowing floor plan",
      scriptText: "Hello.",
      visualIdea: "MAIN HOST: points at the plan",
      visualPurpose: "Show upgrade temptation",
    },
  ]);
  assert.equal(scenes.length, 1);
  assert.ok(scenes[0]!.imagePrompt.includes(WEALTH_INSIGHTS_MAIN_HOST_LOCK));
  assert.ok(scenes[0]!.imagePrompt.includes(WEALTH_INSIGHTS_STYLE_LOCK));
  const counts = wealthImagePromptLockCounts(scenes[0]!.imagePrompt);
  assert.equal(counts.hostLockCount, 1);
  assert.equal(counts.styleLockCount, 1);
});

test("story-character scenes omit main host lock and inject cast descriptor", () => {
  const prompt = assembleWealthInsightsImagePrompt({
    educationalBeat: "Ryan notices a surprise fee on the bill.",
    narrativeMeaning: "Ryan feels surprised by a charge.",
    visualBeat: "Ryan holds a glowing phone bill labeled FEE",
    visualIdea: "STORY_CHARACTER: Ryan — stares at the fee",
    cast: {
      characters: [
        {
          name: "Ryan",
          mentionCount: 4,
          descriptor:
            "original cartoon character Ryan (same face, hair, outfit every scene): adult man early 30s, ivory knit polo, charcoal trousers.",
        },
      ],
    },
  });

  assert.doesNotMatch(
    prompt,
    new RegExp(
      WEALTH_INSIGHTS_MAIN_HOST_LOCK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  );
  assert.match(prompt, /original cartoon character Ryan/);
  assert.match(prompt, /glowing phone bill/);
  assert.ok(prompt.includes(WEALTH_INSIGHTS_STYLE_LOCK));
  assert.doesNotMatch(prompt, /shared character universe|recurring finance host|APP-OWNED/i);
  assert.equal(
    (prompt.match(/original cartoon character Ryan/g) ?? []).length,
    1,
  );
});

test("normalize strips vague duplicate cast lines and injects library lock once", () => {
  const cast = {
    characters: [
      {
        name: "Maya",
        mentionCount: 8,
        descriptor:
          "original cartoon character Maya (same face, hair, outfit every scene): adult woman, sage-green cardigan, cream blouse.",
      },
    ],
  };
  const normalized = normalizeWealthInsightsImagePrompt({
    imagePrompt: [
      "Voiceover context:",
      '"Maya parks."',
      "Narrative meaning:",
      '"Maya arrives quietly."',
      "Must show:",
      "- recurring story character named Maya, adult woman, approachable professional or smart-casual look",
      "- recurring story character named Maya, adult woman, approachable professional or smart-casual look",
      "- Maya parks an older sedan",
      "Style rules:",
      WEALTH_INSIGHTS_STYLE_LOCK,
    ].join("\n"),
    scriptText: "Maya parks.",
    visualIdea: "STORY_CHARACTER: Maya — parks an older sedan",
    visualPurpose: "Maya arrives quietly.",
    cast,
  });
  assert.match(normalized, /original cartoon character Maya/);
  assert.match(normalized, /sage-green cardigan/);
  assert.equal(
    (normalized.match(/original cartoon character Maya/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(normalized, /smart-casual look/);
  assert.doesNotMatch(normalized, /APP-OWNED IDENTITY LOCK/i);
  assert.doesNotMatch(normalized, /Voiceover context:/);
  assert.doesNotMatch(
    normalized.split("Must show:")[1]?.split("Style")[0] ?? "",
    /shared character universe|recurring story character/i,
  );
});

test("normalize scrubs IP-like phrasing from beats before Flow", () => {
  const scrubbed = normalizeWealthInsightsImagePrompt({
    imagePrompt: [
      "Voiceover context:",
      '"Hello."',
      "Narrative meaning:",
      '"Greeting from the shared character universe."',
      "Must show:",
      "- the recurring host points at a glowing rent jar",
      "Style rules:",
      "old style",
    ].join("\n"),
    scriptText: "Hello.",
    visualIdea: "MAIN HOST: points at jar",
    visualPurpose: "Greeting beat.",
  });
  const meaning =
    scrubbed.split("Narrative meaning:")[1]?.split("Create:")[0] ?? "";
  const mustShow = scrubbed.split("Must show:")[1]?.split("Style")[0] ?? "";
  assert.doesNotMatch(meaning, /shared character universe/i);
  assert.doesNotMatch(mustShow, /recurring host/i);
  assert.match(scrubbed, /original cartoon finance educator/i);
  assert.match(scrubbed, /glowing rent jar/i);
});
