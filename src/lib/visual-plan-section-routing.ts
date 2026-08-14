import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-english-lessons-visual";
import {
  scriptHasStructuralVisualPlanSections,
  splitScriptIntoStructuralSections,
  type StructuralScriptSection,
} from "@/lib/visual-plan-script-sections";
import { splitWealthInsightsScriptIntoVisualPlanSections } from "@/lib/wealth-insights-visual-sections";

/**
 * Resolve section list for legacy section-hybrid helpers / tests.
 * Wealth Insights can split unmarked scripts deterministically.
 */
export function resolveVisualPlanSectionsForChannel({
  channelKey,
  script,
}: {
  channelKey: string;
  script: string;
}): StructuralScriptSection[] {
  if (channelKey === "wealth-insights") {
    return splitWealthInsightsScriptIntoVisualPlanSections(script);
  }
  return splitScriptIntoStructuralSections(script);
}

/**
 * @deprecated Platform Visual Plan is fill-hybrid for all non-podcast channels.
 * Kept for tests / legacy section helpers; the batch runner no longer branches on this.
 */
export function channelUsesSectionHybridVisualPlan({
  channelKey,
  script,
}: {
  channelKey: string;
  script: string;
}) {
  if (!script.trim()) {
    return false;
  }
  if (channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    return false;
  }
  // Historical: Wealth + structural-marker channels used section-generate.
  // Platform default is now local skeleton + fill chunks.
  return false;
}

/** True when a script still has structural markers useful for local skeleton packing. */
export function scriptHasVisualPlanStructuralMarkers(script: string) {
  return scriptHasStructuralVisualPlanSections(script);
}
