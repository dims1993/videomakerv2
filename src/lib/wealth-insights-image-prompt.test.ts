import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEALTH_INSIGHTS_MAIN_HOST_LOCK,
  WEALTH_INSIGHTS_STYLE_LOCK,
  assembleWealthInsightsImagePrompt,
  extractWealthInsightsVisualBeat,
  normalizeWealthInsightsImagePrompt,
  normalizeWealthInsightsScenes,
  wealthImagePromptLockCounts,
} from "./wealth-insights-image-prompt";

test("assemble uses fixed host + style locks", () => {
  const prompt = assembleWealthInsightsImagePrompt({
    voiceoverContext: "The new apartment looks harmless.",
    narrativeMeaning: "The apartment initially feels safe.",
    visualBeat:
      "a spotless apartment doorway beside a softly glowing larger floor plan\nthe host opens the door with a confident welcoming gesture",
  });

  assert.match(prompt, /Voiceover context:\n"The new apartment looks harmless\."/);
  assert.match(prompt, /Narrative meaning:\n"The apartment initially feels safe\."/);
  assert.ok(prompt.includes(WEALTH_INSIGHTS_MAIN_HOST_LOCK));
  assert.ok(prompt.includes(WEALTH_INSIGHTS_STYLE_LOCK));
  assert.match(prompt, /spotless apartment doorway/);
  assert.match(prompt, /confident welcoming gesture/);
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
  });

  assert.ok(normalized.includes(WEALTH_INSIGHTS_MAIN_HOST_LOCK));
  assert.ok(normalized.includes(WEALTH_INSIGHTS_STYLE_LOCK));
  assert.match(normalized, /spotless apartment doorway/i);
  assert.match(normalized, /opens the door/i);
  assert.match(
    normalized,
    /Voiceover context:\n"The new apartment looks harmless\."/,
  );
  // Abbreviated host paraphrase must not remain as the Must-show host line.
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
      "Style rules:",
      WEALTH_INSIGHTS_STYLE_LOCK,
    ].join("\n"),
  });
  assert.match(beat, /giant rent notice/);
  assert.match(beat, /braces the jar/);
  assert.doesNotMatch(beat, /small silver hoop/);
});

test("normalize is idempotent and never duplicates host/style locks", () => {
  const once = normalizeWealthInsightsImagePrompt({
    imagePrompt: [
      "Voiceover context:",
      '"Hello."',
      "Narrative meaning:",
      '"Greeting."',
      "Must show:",
      `- ${WEALTH_INSIGHTS_MAIN_HOST_LOCK}`,
      "- a glowing floor plan",
      "Style rules:",
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
