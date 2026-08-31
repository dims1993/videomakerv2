import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS,
  WEALTH_PAUSE_CAST_SHIFT_MS,
  suggestWealthInsightsPauseAfterMs,
  suggestWealthInsightsPausesForScenes,
} from "./wealth-insights-pause";
import {
  VOICEOVER_PAUSE_COMMA_MS,
  VOICEOVER_PAUSE_DEFAULT_MS,
  VOICEOVER_PAUSE_PERIOD_MS,
} from "./voiceover-punctuation-pause";
import { defaultScenePauseAfterMsForChannel } from "./voiceover-scenes";

test("Wealth channel default pause matches shared punctuation fallback", () => {
  assert.equal(WEALTH_INSIGHTS_SCENE_PAUSE_AFTER_MS, VOICEOVER_PAUSE_DEFAULT_MS);
  assert.equal(
    defaultScenePauseAfterMsForChannel("wealth-insights"),
    VOICEOVER_PAUSE_DEFAULT_MS,
  );
  assert.equal(
    defaultScenePauseAfterMsForChannel("the-gods-word"),
    VOICEOVER_PAUSE_DEFAULT_MS,
  );
});

test("continuation and short phrases follow punctuation commas/periods", () => {
  assert.equal(
    suggestWealthInsightsPauseAfterMs({
      scriptText: "At 8:12 on a Tuesday morning,",
    }),
    VOICEOVER_PAUSE_COMMA_MS,
  );
  assert.equal(
    suggestWealthInsightsPauseAfterMs({
      scriptText: "Three spaces away,",
    }),
    VOICEOVER_PAUSE_COMMA_MS,
  );
  assert.equal(
    suggestWealthInsightsPauseAfterMs({
      scriptText: "he says anything.",
    }),
    VOICEOVER_PAUSE_PERIOD_MS,
  );
});

test("full sentences get a period breath", () => {
  assert.equal(
    suggestWealthInsightsPauseAfterMs({
      scriptText:
        "Ryan pulls into the office parking lot in a spotless black SUV.",
    }),
    VOICEOVER_PAUSE_PERIOD_MS,
  );
});

test("host to story handoff widens the pause", () => {
  assert.equal(
    suggestWealthInsightsPauseAfterMs({
      scriptText: "Here is the mechanism behind the trap.",
      visualIdea: "MAIN HOST: points at a glowing fee",
      nextVisualIdea: "STORY_CHARACTER: Ryan — stares at the bill",
    }),
    WEALTH_PAUSE_CAST_SHIFT_MS,
  );
});

test("batch helper preserves order and fills suggestions", () => {
  const suggested = suggestWealthInsightsPausesForScenes([
    {
      scriptText: "At 8:12 on a Tuesday morning,",
      visualIdea: "STORY_CHARACTER: Ryan — arrives",
    },
    {
      scriptText:
        "Here is the longer mechanism explanation behind that quiet money trap.",
      visualIdea: "MAIN HOST: explains jar",
    },
  ]);
  assert.equal(suggested[0]?.suggestedPauseAfterMs, WEALTH_PAUSE_CAST_SHIFT_MS);
  assert.equal(suggested[1]?.suggestedPauseAfterMs, VOICEOVER_PAUSE_PERIOD_MS);
});
