import assert from "node:assert/strict";
import { test } from "node:test";

import { getChannelProfile } from "@/lib/channels";
import {
  NARRATIVE_ECONOMICS_VISUAL_BRIEF_MARKERS,
  WEALTH_INSIGHTS_NARRATIVE_ECONOMICS_CATEGORY,
  WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK,
  buildNarrativeEconomicsStoriesVisualBrief,
  buildWealthInsightsVisualModeSection,
  hasAllowedWealthInsightsVisualIdeaPrefix,
  isNarrativeEconomicsStoriesCategory,
  resolveWealthInsightsVisualMode,
} from "@/lib/wealth-insights-visual-mode";

test("Wealth Insights topic system includes narrative_economics_stories", () => {
  const channel = getChannelProfile("wealth-insights");
  const category = channel.topicSystem?.categories.find(
    (entry) => entry.id === WEALTH_INSIGHTS_NARRATIVE_ECONOMICS_CATEGORY,
  );
  assert.ok(category);
  assert.equal(category?.label, "Narrative Economics Stories");
  assert.match(category?.description ?? "", /hidden business models/i);
  assert.equal(isNarrativeEconomicsStoriesCategory(category?.id), true);
});

test("default finance categories keep default visual mode", () => {
  for (const id of [
    "housing",
    "savings",
    "debt",
    "investing",
    "income",
    "cost_of_living",
    "psychology",
  ]) {
    assert.equal(
      resolveWealthInsightsVisualMode({ topicCategory: id }),
      "default",
    );
  }
});

test("narrative category selects narrative economics visual mode", () => {
  assert.equal(
    resolveWealthInsightsVisualMode({
      topicCategory: "narrative_economics_stories",
    }),
    "narrative_economics_stories",
  );
});

test("ideaJson business-history signals select narrative mode without the category", () => {
  assert.equal(
    resolveWealthInsightsVisualMode({
      topicCategory: "investing",
      ideaJson: {
        format: "company history",
        coreAngle: "A hidden business machine behind a familiar brand",
      },
    }),
    "narrative_economics_stories",
  );
  assert.equal(
    resolveWealthInsightsVisualMode({
      topicCategory: "housing",
      ideaJson: { title: "A normal rent tip" },
    }),
    "default",
  );
});

test("narrative brief is reusable and not hardcoding one company vocabulary", () => {
  const brief = buildNarrativeEconomicsStoriesVisualBrief();
  for (const marker of NARRATIVE_ECONOMICS_VISUAL_BRIEF_MARKERS) {
    assert.ok(brief.includes(marker), `missing marker: ${marker}`);
  }
  assert.ok(brief.includes(WEALTH_INSIGHTS_NARRATIVE_STYLE_LOCK));
  assert.doesNotMatch(brief, /McDonald/);
  assert.doesNotMatch(brief, /\bApple\b/);
  assert.doesNotMatch(brief, /\bAmazon\b/);
  assert.doesNotMatch(brief, /\bNike\b/);
  assert.doesNotMatch(brief, /\bDisney\b/);
  assert.doesNotMatch(brief, /\bTesla\b/);
  assert.doesNotMatch(brief, /\bCostco\b/);
  assert.match(brief, /scriptText always wins/i);
  assert.match(brief, /does not replace Default Mode/);
});

test("mode sections distinguish default vs narrative", () => {
  const defaultSection = buildWealthInsightsVisualModeSection("default");
  const narrativeSection = buildWealthInsightsVisualModeSection(
    "narrative_economics_stories",
  );
  assert.match(defaultSection, /MAIN HOST \+ BIG EXPLANATORY ELEMENTS/);
  assert.match(defaultSection, /required by default/);
  assert.match(
    narrativeSection,
    /EPISODE PROTAGONIST \+ STORY MOMENT \/ ECONOMIC MECHANISM/,
  );
  assert.match(narrativeSection, /NOT required by default/);
});

test("visualIdea prefixes depend on active mode", () => {
  assert.equal(
    hasAllowedWealthInsightsVisualIdeaPrefix("MAIN HOST: Explains chart", "default"),
    true,
  );
  assert.equal(
    hasAllowedWealthInsightsVisualIdeaPrefix(
      "CHARACTER_A: Protagonist studies a clue",
      "default",
    ),
    false,
  );
  assert.equal(
    hasAllowedWealthInsightsVisualIdeaPrefix(
      "CHARACTER_A: Protagonist studies a clue",
      "narrative_economics_stories",
    ),
    true,
  );
  assert.equal(
    hasAllowedWealthInsightsVisualIdeaPrefix(
      "MECHANISM: Hidden base under visible product",
      "narrative_economics_stories",
    ),
    true,
  );
  assert.equal(
    hasAllowedWealthInsightsVisualIdeaPrefix(
      "EDITORIAL BOARD: Four-box chaos board",
      "narrative_economics_stories",
    ),
    true,
  );
});
