import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Mirrors ChatGptBrowserProvider score-stability intent:
 * same numeric score must count as stable even when raw JSON text flickers.
 */
function scoreNumberFromJson(scoreJson: string): number | null {
  try {
    const parsed = JSON.parse(scoreJson) as { score?: unknown };
    const raw = parsed.score;
    const numeric =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw.trim().replace(",", "."))
          : NaN;
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
      return null;
    }
    return Math.round(numeric * 10) / 10;
  } catch {
    return null;
  }
}

test("flickering score JSON strings still share the same numeric score", () => {
  const a = `{
  "score": 8.2,
  "briefReason": "Segmentation still dense in places.",
  "topFixes": ["Split scene 12", "Clarify scene 3", "Reduce symbolism in scene 9"],
  "blockScores": {"semanticAlignment": 8, "segmentationComplexity": 7.5, "promptQuality": 8.2, "compositionClarity": 8, "varietyRepetition": 8, "rhythmDuration": 8.5, "continuityEmotionalImpact": 8}
}`;
  const b = `{"score":8.2,"briefReason":"Segmentation still dense in places.","topFixes":["Split scene 12","Clarify scene 3","Reduce symbolism in scene 9"],"blockScores":{"semanticAlignment":8,"segmentationComplexity":7.5,"promptQuality":8.2,"compositionClarity":8,"varietyRepetition":8,"rhythmDuration":8.5,"continuityEmotionalImpact":8}}`;
  const c = a.replace(/\n/g, "\n ");

  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(scoreNumberFromJson(a), 8.2);
  assert.equal(scoreNumberFromJson(b), 8.2);
  assert.equal(scoreNumberFromJson(c), 8.2);
});
