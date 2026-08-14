import assert from "node:assert/strict";
import test from "node:test";

import {
  assemblePodcastPartCoverImagePrompt,
  inferPodcastImagePromptRole,
  normalizePodcastImagePrompt,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import {
  isPartCoverVisualIdea,
  parsePodcastPartHeading,
  sanitizePodcastAvatarScriptText,
  stripTrailingPodcastPartHeading,
  toSpokenPartCoverText,
} from "@/lib/podcast-part-covers";
import { groupScenesByScriptSection } from "@/lib/script-sections";
import { buildPodcastVisualPlanSkeleton } from "@/lib/visual-plan-skeleton";

test("parsePodcastPartHeading accepts dash variants and markdown hashes", () => {
  const a = parsePodcastPartHeading("PART 1 — SAYING YOUR NAME");
  assert.ok(a);
  assert.equal(a?.partNumber, 1);
  assert.equal(a?.displayTitle, "PART 1 — SAYING YOUR NAME");
  assert.equal(a?.spokenText, "Part 1. Saying your name.");

  const b = parsePodcastPartHeading("## PART 2 - Talking About Work");
  assert.ok(b);
  assert.equal(b?.partNumber, 2);
  assert.equal(b?.displayTitle, "PART 2 — TALKING ABOUT WORK");
  assert.equal(b?.spokenText, "Part 2. Talking about work.");

  assert.equal(parsePodcastPartHeading("## COLD OPEN"), null);
  assert.equal(parsePodcastPartHeading("DAY 1 — INTRO"), null);
});

test("toSpokenPartCoverText sentence-cases titles", () => {
  assert.equal(
    toSpokenPartCoverText(3, "ASKING QUESTIONS"),
    "Part 3. Asking questions.",
  );
});

test("stripTrailingPodcastPartHeading removes leaked PART titles from avatar turns", () => {
  assert.equal(
    stripTrailingPodcastPartHeading(
      "Great. Let’s begin with the first part of your introduction: saying your name. PART 1 — SAYING YOUR NAME",
    ),
    "Great. Let’s begin with the first part of your introduction: saying your name.",
  );
  assert.equal(
    stripTrailingPodcastPartHeading(
      "Now it is time to speak.\nPART 9 - LISTEN AND REPEAT",
    ),
    "Now it is time to speak.",
  );
  assert.equal(
    stripTrailingPodcastPartHeading("PART 2 — SAYING WHERE YOU ARE FROM"),
    "",
  );
  // Spoken PART_COVER narration must stay intact.
  assert.equal(
    stripTrailingPodcastPartHeading("Part 1. Saying your name."),
    "Part 1. Saying your name.",
  );
  assert.equal(
    stripTrailingPodcastPartHeading(
      "Mistakes are part of learning a language.",
    ),
    "Mistakes are part of learning a language.",
  );
});

test("sanitizePodcastAvatarScriptText strips CLOSING from previous turn", () => {
  assert.equal(
    sanitizePodcastAvatarScriptText(
      "Excellent. Practice today. Tomorrow, these sentences will already feel more familiar. CLOSING",
    ),
    "Excellent. Practice today. Tomorrow, these sentences will already feel more familiar.",
  );
  assert.equal(sanitizePodcastAvatarScriptText("CLOSING"), "");
  assert.equal(
    sanitizePodcastAvatarScriptText("Welcome to the lesson.\nCOLD OPEN"),
    "Welcome to the lesson.",
  );
});

test("skeleton keeps PART heading out of the previous spoken turn", () => {
  const script = `[EMMA]
Great. Let’s begin with the first part of your introduction: saying your name.
PART 1 — SAYING YOUR NAME
[EMMA]
My name is Emma.
`;
  const skeleton = buildPodcastVisualPlanSkeleton(script);
  const coverIndex = skeleton.scenes.findIndex((scene) =>
    isPartCoverVisualIdea(scene.visualIdea),
  );
  assert.ok(coverIndex > 0);
  const previous = skeleton.scenes[coverIndex - 1]!;
  assert.equal(
    previous.scriptText,
    "Great. Let’s begin with the first part of your introduction: saying your name.",
  );
  assert.doesNotMatch(previous.scriptText, /PART\s+\d+\s*[—–\-]/i);
});

test("skeleton creates narrated PART covers with local visualsFilled", () => {
  const script = `## COLD OPEN
[MUSIC: begin]
[EMMA]
Welcome.
PART 1 — SAYING YOUR NAME
[EMMA]
My name is Emma.
## PART 2 - ASKING WHERE YOU ARE FROM
[LEO]
I am from Spain.
`;

  const skeleton = buildPodcastVisualPlanSkeleton(script);
  const covers = skeleton.scenes.filter((scene) =>
    isPartCoverVisualIdea(scene.visualIdea),
  );
  assert.equal(covers.length, 2);

  assert.equal(covers[0]?.sceneType, "insert");
  assert.equal(covers[0]?.speaker, "teacher");
  assert.equal(covers[0]?.scriptText, "Part 1. Saying your name.");
  assert.equal(covers[0]?.visualsFilled, true);
  assert.match(covers[0]?.visualIdea ?? "", /^PART_COVER \| COMP_PART_COVER:/);
  assert.ok(covers[0]?.imagePrompt.includes('"PART 1 — SAYING YOUR NAME"'));
  assert.ok(
    covers[0]?.imagePrompt.includes(
      "Create a 16:9 realistic cinematic podcast title card",
    ),
  );
  assert.ok(covers[0]?.imagePrompt.includes("No people."));

  assert.equal(covers[1]?.scriptText, "Part 2. Asking where you are from.");

  // COLD OPEN must not become a cover.
  assert.ok(
    !skeleton.scenes.some((scene) =>
      /COLD OPEN/i.test(scene.scriptText + scene.visualIdea),
    ),
  );
});

test("PART covers map to Emma voiceover section", () => {
  const assignments = groupScenesByScriptSection({
    script: "[EMMA]\nHello.\n",
    scenes: [
      {
        sortOrder: 1,
        scriptText: "Part 1. Saying your name.",
        visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — SAYING YOUR NAME",
      },
    ],
  });
  assert.equal(assignments[0]?.sectionKind, "teacher");
});

test("normalizePodcastImagePrompt keeps PART title exception", () => {
  const prompt = normalizePodcastImagePrompt({
    role: "part",
    visualIdea: "PART_COVER | COMP_PART_COVER: PART 1 — SAYING YOUR NAME",
    scriptText: "Part 1. Saying your name.",
    imagePrompt: "random drift without title",
  });
  assert.ok(prompt.includes('"PART 1 — SAYING YOUR NAME"'));
  assert.ok(prompt.includes("bold modern geometric sans-serif all-caps"));
  assert.ok(prompt.includes("#102A2E"));
  assert.ok(prompt.includes("Single image only."));
  assert.ok(prompt.includes("No people."));
  assert.ok(!prompt.toLowerCase().includes("across every part"));
  assert.ok(!prompt.includes("Soft semi-flat 2D editorial"));
  assert.equal(inferPodcastImagePromptRole({ visualIdea: "PART_COVER | x" }), "part");
  assert.ok(
    assemblePodcastPartCoverImagePrompt("PART 1 — X").includes('"PART 1 — X"'),
  );
  assert.ok(
    assemblePodcastPartCoverImagePrompt("PART 1 — X").includes(
      "bold modern geometric sans-serif all-caps",
    ),
  );
});
