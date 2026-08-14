import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { getChannelProfile } from "@/lib/channels";
import {
  buildPodcastSceneGenerationRequestExcerpt,
  getPodcastVisualConsistencyMode,
  missingTokens,
  PODCAST_COMPOSITION_TOKENS,
  PODCAST_EMMA_IDENTITY_TOKENS,
  PODCAST_EMMA_REFERENCE_RELATIVE_PATH,
  PODCAST_FORBIDDEN_SCHEMA_FIELDS,
  PODCAST_LEO_IDENTITY_TOKENS,
  PODCAST_STYLE_TOKENS,
  PODCAST_STUDIO_TOKENS,
  readPodcastVisualLockCorpus,
} from "@/lib/podcast-english-lessons-visual";
import {
  foldPauseCardScenesIntoPauseAfterMs,
  isMusicBedVisualIdea,
} from "@/lib/podcast-pause-cues";
import { hasVisualIdeaPrefix } from "@/lib/visual-plan-script";
import { validateHandoffScenes } from "@/lib/chatgpt-scene-handoff";

test("podcast channel description and audio_only mode remain script-first", () => {
  const channel = getChannelProfile("podcast-english-lessons");
  assert.equal(channel.pipelineMode, "audio_only");
  assert.match(channel.description, /minimal reusable character-based visual layer/i);
  assert.doesNotMatch(channel.description, /no visual planner/i);
});

test("visual consistency mode is text-only (no Flow reference conditioning)", () => {
  assert.equal(getPodcastVisualConsistencyMode(), "reusable_source_images");
});

test("emma reference image exists on disk for future adapters", async () => {
  await access(path.join(process.cwd(), PODCAST_EMMA_REFERENCE_RELATIVE_PATH));
});

test("lock corpus contains Emma, Leo, studio, style, and composition tokens", async () => {
  const { corpus, projectBible, characterBible, imagePromptBible, visualPlanner } =
    await readPodcastVisualLockCorpus();

  assert.equal(
    missingTokens(corpus, PODCAST_EMMA_IDENTITY_TOKENS).length,
    0,
    `missing Emma tokens: ${missingTokens(corpus, PODCAST_EMMA_IDENTITY_TOKENS).join(", ")}`,
  );
  assert.equal(
    missingTokens(corpus, PODCAST_LEO_IDENTITY_TOKENS).length,
    0,
    `missing Leo tokens: ${missingTokens(corpus, PODCAST_LEO_IDENTITY_TOKENS).join(", ")}`,
  );
  assert.equal(
    missingTokens(corpus, PODCAST_STUDIO_TOKENS).length,
    0,
    `missing studio tokens: ${missingTokens(corpus, PODCAST_STUDIO_TOKENS).join(", ")}`,
  );
  assert.equal(
    missingTokens(corpus, PODCAST_STYLE_TOKENS).length,
    0,
    `missing style tokens: ${missingTokens(corpus, PODCAST_STYLE_TOKENS).join(", ")}`,
  );
  assert.equal(
    missingTokens(corpus, PODCAST_COMPOSITION_TOKENS).length,
    0,
    `missing composition tokens: ${missingTokens(corpus, PODCAST_COMPOSITION_TOKENS).join(", ")}`,
  );

  assert.match(visualPlanner, /Soft semi-flat 2D editorial educational illustration/);
  assert.doesNotMatch(
    visualPlanner,
    /clean 2D editorial illustration OR soft semi-flat/i,
  );
  assert.match(imagePromptBible, /Do \*\*not\*\* generate a separate pause image/);
  assert.match(characterBible, /mustard knitted cardigan|mustard cardigan/i);
  assert.match(projectBible, /Visual continuity is more important than novelty/i);

  const request = buildPodcastSceneGenerationRequestExcerpt({
    projectBible,
    characterBible,
    imagePromptBible,
    visualPlanner,
  });
  const projectIdx = request.indexOf("## Project Bible");
  const characterIdx = request.indexOf("## Character Bible");
  const imageIdx = request.indexOf("## Image Prompt Bible");
  const plannerIdx = request.indexOf("## Visual Planner Prompt");
  const outputIdx = request.indexOf("## Output Requirements");
  assert.ok(projectIdx > 0 && characterIdx > projectIdx);
  assert.ok(imageIdx > characterIdx && plannerIdx > imageIdx);
  assert.ok(outputIdx > plannerIdx);
});

test("podcast visualIdea prefixes with COMP presets are accepted", () => {
  assert.equal(
    hasVisualIdeaPrefix(
      "TEACHER_EMMA | COMP_EMMA_HOST: Emma teaches from the locked desk.",
    ),
    true,
  );
  assert.equal(
    hasVisualIdeaPrefix(
      "STUDENT_LEO | COMP_LEO_STUDENT: Leo answers with mild uncertainty.",
    ),
    true,
  );
  assert.equal(
    hasVisualIdeaPrefix("MUSIC_BED | COMP_MUSIC_BED: quiet studio insert."),
    true,
  );
});

test("example scenes validate without forbidden schema fields", () => {
  const scenes = [
    {
      order: 1,
      scriptText: "",
      sceneType: "insert",
      visualPurpose: "Open with music.",
      visualIdea:
        "MUSIC_BED | COMP_MUSIC_BED: quiet insert of the locked studio desk.",
      duration: 2,
      imagePrompt:
        "Soft semi-flat 2D editorial educational illustration of the locked cozy podcast studio, wooden desk, silver microphone silhouette.",
      status: "planned",
    },
    {
      order: 2,
      scriptText: "You understand simple English.",
      sceneType: "avatar",
      visualPurpose: "Emma opens calmly.",
      visualIdea:
        "TEACHER_EMMA | COMP_EMMA_HOST: Emma addresses the viewer from the locked podcast desk.",
      duration: 3,
      imagePrompt:
        "Soft semi-flat 2D editorial educational illustration. Recurring adult female English teacher Emma, short curly chestnut-brown hair, round dark-framed glasses, teal blouse and mustard knitted cardigan.",
      status: "planned",
    },
    {
      order: 3,
      scriptText: "Completely blank.",
      sceneType: "avatar",
      visualPurpose: "Leo shows uncertainty.",
      visualIdea:
        "STUDENT_LEO | COMP_LEO_STUDENT: Leo responds with mild uncertainty.",
      duration: 4,
      imagePrompt:
        "Soft semi-flat 2D editorial educational illustration. Recurring adult male English learner Leo, short dark-brown hair, navy casual outer layer over a light neutral shirt.",
      status: "planned",
      pauseAfterMs: 2000,
    },
  ];

  for (const scene of scenes) {
    for (const field of PODCAST_FORBIDDEN_SCHEMA_FIELDS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(scene, field),
        false,
        `scene must not include ${field}`,
      );
    }
  }

  const result = validateHandoffScenes(scenes);
  assert.equal(result.errors.length, 0, result.errors.join(" | "));
  assert.equal(result.scenes.length, 3);
  assert.equal(result.scenes[2]?.pauseAfterMs, 2000);
  assert.equal(isMusicBedVisualIdea(result.scenes[0]?.visualIdea), true);
});

test("pause cards still fold into pauseAfterMs without becoming scenes", () => {
  const folded = foldPauseCardScenesIntoPauseAfterMs([
    {
      scriptText: "Today, that changes.",
      visualIdea: "TEACHER_EMMA | COMP_EMMA_HOST: calm close",
      duration: 3,
    },
    {
      scriptText: "",
      visualIdea: "PAUSE_CARD: soft studio",
      duration: 2,
    },
  ]);
  assert.equal(folded.scenes.length, 1);
  assert.equal(folded.scenes[0]?.pauseAfterMs, 2000);
});
