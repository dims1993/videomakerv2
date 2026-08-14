/**
 * TheGodsWord Script Writer — short topic-idea request for the PalabraViva
 * ChatGPT project conversation (instructions live in the project).
 *
 * Reply contract: JSON with script + valoracion + recomendacion.
 * App loops applying recomendacion until valoracion > 9.2.
 */

import { extractJsonPayload } from "@/lib/browser-automation/types";
import { SCRIPT_WRITER_PASS_SCORE } from "@/lib/script-writer-critique";
import { stripChatGptUiChrome } from "@/lib/script-writer-extract";

export const THE_GODS_WORD_CHANNEL_KEY = "the-gods-word";

/** Max draft turns (initial + recommendation rewrites) for GodsWord. */
export const GODS_WORD_SCRIPT_WRITER_MAX_DRAFTS = 4;

export const GODS_WORD_SCRIPT_WRITER_PASS_SCORE = SCRIPT_WRITER_PASS_SCORE;

export type GodsWordScriptBatchPayload = {
  script: string;
  valoracion: string;
  recomendacion: string;
  score: number | null;
};

function prettyIdeaJson(ideaJson: string) {
  const trimmed = ideaJson.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

/**
 * True when the script has Visual Planner structural markers
 * (hook block + at least one chapter). Required for section-hybrid planning.
 */
export function godsWordScriptHasStructuralMarkers(script: string) {
  const text = script ?? "";
  const hasHook =
    /\[HOOK\]/i.test(text) && /\[END\s*HOOK\]/i.test(text);
  const hasChapter = /\[CHAPTER\s+\d+\s*[—–\-]/i.test(text);
  const hasFinalBumper = /^\s*\[FINAL\]\s*$/im.test(text);
  return hasHook && hasChapter && hasFinalBumper;
}

const GODS_WORD_STRUCTURAL_MARKER_RULES = [
  "Structural markers (required inside \"script\" — Visual Planner uses them to split scenes):",
  "- Put markers on their own lines in square brackets.",
  "- Markers are NOT spoken aloud; never write them as narration sentences.",
  "- Required shape:",
  "  [HOOK]",
  "  …opening tension / retention (about the first 1–2 minutes of spoken narration)…",
  "  [END HOOK]",
  "  [CHAPTER 1 — EXACT TITLE IN CAPS]",
  "  …section body…",
  "  [CHAPTER 2 — EXACT TITLE IN CAPS]",
  "  …more [CHAPTER N — TITLE] sections as needed (usually 5–10 for a medium essay)…",
  "  [FINAL — CLOSING TITLE IN CAPS]",
  "  …hopeful close (spoken)…",
  "  [FINAL]",
  "- Optional spoken-close markers also allowed: [CLOSING], [CONCLUSION], [REFLECTION AND PRAYER].",
  "- Plain [FINAL] (exact, no title) MUST be the last line of the script. It is a video end bumper, not spoken.",
  "- Do not put narration under plain [FINAL]. Do not invent spoken subscribe CTAs.",
  "- Chapter titles must be short, exact, and imageable (they become chapter-cover text).",
  "- Canonical chapter form: [CHAPTER N — TITLE] (e.g. [CHAPTER 1 — THE DELAY]). Dash may be — or -.",
  "- Emotional arc still applies: Tension → Recognition → Biblical Insight → Personal Reflection → Hope,",
  "  but map it onto HOOK + CHAPTER / FINAL blocks instead of plain prose.",
  "- Do NOT return markdown headings (#), bullets, scene directions, or production notes.",
  "- DO include the bracket markers above; they are production structure, not commentary.",
].join("\n");

/**
 * Script Writer prompt: topic idea in → JSON { script, valoracion, recomendacion }.
 */
export function buildGodsWordTopicIdeaScriptPrompt({
  ideaJson,
  title,
  topic,
}: {
  ideaJson: string;
  title?: string | null;
  topic?: string | null;
}) {
  const ideaBlock = prettyIdeaJson(ideaJson);
  const headerLines = [
    title?.trim() ? `Working title: ${title.trim()}` : null,
    topic?.trim() ? `Topic: ${topic.trim()}` : null,
  ].filter(Boolean);

  return [
    "Generate a complete YouTube narration script for this topic idea.",
    "",
    "Also give a final numeric valuation of that script (or of the best script in this conversation if you are comparing drafts), and a short recommendation to raise the score.",
    "",
    "Return valid JSON only. No markdown fences, no prose outside JSON.",
    "Exact keys (Spanish keys as written):",
    "{",
    '  "script": "full narration script WITH structural markers",',
    '  "valoracion": "Valoración: n/10",',
    '  "recomendacion": "concrete improvements to raise the score"',
    "}",
    "",
    "Rules:",
    `- "script" must be the full narration (no title line, no commentary outside the script).`,
    `- "script" MUST include [HOOK]…[END HOOK], multiple [CHAPTER N — TITLE] sections, a [FINAL — TITLE] (or [CLOSING]/[CONCLUSION]), and end with plain [FINAL] bumper.`,
    `- A script without those markers fails app validation even if the score is high.`,
    `- "valoracion" must include a clear score out of 10 (e.g. "Valoración: 8.7/10").`,
    `- "recomendacion" must be specific enough to rewrite the script in one pass.`,
    `- Pass bar for the app is strictly above ${GODS_WORD_SCRIPT_WRITER_PASS_SCORE}.`,
    "",
    GODS_WORD_STRUCTURAL_MARKER_RULES,
    "",
    ...(headerLines.length > 0 ? [...headerLines, ""] : []),
    "Topic idea:",
    ideaBlock || "(missing idea JSON)",
  ].join("\n");
}

export function buildGodsWordApplyRecommendationPrompt(recomendacion: string) {
  const advice =
    recomendacion.trim() ||
    "Improve clarity, biblical tension, and emotional payoff.";
  return [
    "Toma la recomendación siguiente y aplícala al script.",
    "Responde otra vez SOLO con el mismo JSON (sin markdown, sin prosa fuera del JSON):",
    '{ "script": "...", "valoracion": "Valoración: n/10", "recomendacion": "..." }',
    "",
    "Hard constraints while rewriting:",
    "- Keep or restore Visual Planner structural markers in \"script\".",
    "- Required: [HOOK]…[END HOOK], at least one [CHAPTER N — TITLE], [FINAL — TITLE] (or [CLOSING]/[CONCLUSION]), and plain [FINAL] as the last line.",
    "- Markers stay on their own lines; they are not spoken narration.",
    "- Do not flatten the script back into unmarked continuous prose.",
    "",
    "Recomendación a aplicar:",
    advice,
  ].join("\n");
}

export const GODS_WORD_STRUCTURAL_MARKERS_RECOMMENDATION = [
  "Add Visual Planner structural markers before any other polish.",
  "Wrap the opening retention in [HOOK]…[END HOOK].",
  "Split the body into numbered [CHAPTER N — TITLE] sections (e.g. [CHAPTER 1 — TITLE], [CHAPTER 2 — TITLE]) with short CAPS titles.",
  "End the spoken close with [FINAL — TITLE] (or [CLOSING]/[CONCLUSION]).",
  "Finish the script with plain [FINAL] alone on the last line (video end bumper; not spoken).",
  "Markers must be on their own lines and must not be spoken as narration.",
].join(" ");

export function parseGodsWordValoracionScore(valoracion: string | null | undefined) {
  if (!valoracion?.trim()) {
    return null;
  }
  const text = valoracion.trim();
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
    /valoraci[oó]n\s*:\s*(\d+(?:[.,]\d+)?)/i,
    /\b(\d+(?:[.,]\d+)?)\s*(?:sobre\s*10|out of 10)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const score = Number(match[1].replace(",", "."));
    if (Number.isFinite(score) && score >= 0 && score <= 10) {
      return score;
    }
  }
  return null;
}

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * Parse GodsWord Script Writer JSON reply.
 * Tolerates fenced JSON and minor key variants (valoración accents, recommendation).
 */
export function parseGodsWordScriptBatchResponse(
  rawResponse: string,
): GodsWordScriptBatchPayload {
  const cleaned = stripChatGptUiChrome(rawResponse.trim());
  if (!cleaned) {
    throw new Error("ChatGPT returned an empty GodsWord script response.");
  }

  const payload = extractJsonPayload(cleaned);
  if (!payload) {
    throw new Error(
      "ChatGPT did not return JSON with script / valoracion / recomendacion.",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    throw new Error("ChatGPT returned invalid JSON for GodsWord script batch.");
  }

  const script =
    textField(parsed.script) ||
    textField(parsed.narrationScript) ||
    textField(parsed.narration);
  const valoracion =
    textField(parsed.valoracion) ||
    textField(parsed["valoración"]) ||
    textField(parsed.valuation) ||
    textField(parsed.scoreLabel);
  const recomendacion =
    textField(parsed.recomendacion) ||
    textField(parsed["recomendación"]) ||
    textField(parsed.recommendation) ||
    textField(parsed.recomendations);

  if (!script || script.length < 40) {
    throw new Error(
      'GodsWord JSON is missing a usable "script" (narration too short or empty).',
    );
  }

  let score = parseGodsWordValoracionScore(valoracion);
  if (score == null && typeof parsed.score === "number" && Number.isFinite(parsed.score)) {
    score = parsed.score;
  }
  if (
    score == null &&
    typeof parsed.score === "string" &&
    parsed.score.trim()
  ) {
    score = parseGodsWordValoracionScore(parsed.score);
  }

  return {
    script: script.replace(/\\n/g, "\n").trim(),
    valoracion: valoracion || (score != null ? `Valoración: ${score}/10` : ""),
    recomendacion,
    score,
  };
}

export function godsWordScriptPassed(score: number | null | undefined) {
  return score != null && Number.isFinite(score) && score > GODS_WORD_SCRIPT_WRITER_PASS_SCORE;
}
