import { readFile } from "node:fs/promises";
import path from "node:path";

import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";

/**
 * Podcast English Lessons visual consistency helpers.
 * Consistency is currently text-locked (bibles + planner). Google Flow has no
 * filesystem reference-image conditioning in this repo.
 */

export { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY };
export const PODCAST_EMMA_REFERENCE_RELATIVE_PATH = path.join(
  "docs",
  "channels",
  "podcast-english-lessons",
  "references",
  "emma-reference.png",
);

export const PODCAST_LEO_REFERENCE_RELATIVE_PATH = path.join(
  "docs",
  "channels",
  "podcast-english-lessons",
  "references",
  "leo-reference.png",
);

export const PODCAST_EMMA_IDENTITY_TOKENS = [
  "short curly chestnut-brown hair",
  "round dark-framed glasses",
  "teal blouse",
  "mustard cardigan",
] as const;

export const PODCAST_LEO_IDENTITY_TOKENS = [
  "short dark-brown hair",
  "navy or dark-blue",
  "light neutral shirt",
] as const;

export const PODCAST_STUDIO_TOKENS = [
  "wooden desk",
  "silver microphone",
  "camera-left",
  "terracotta",
  "navy",
  "warm lamp",
] as const;

export const PODCAST_STYLE_TOKENS = [
  "soft semi-flat 2D",
  "editorial educational illustration",
  "no photorealism",
  "no 3D",
  "no anime",
] as const;

export const PODCAST_COMPOSITION_TOKENS = [
  "COMP_EMMA_HOST",
  "COMP_LEO_STUDENT",
  "COMP_MUSIC_BED",
  "COMP_PART_COVER",
] as const;

export const PODCAST_FORBIDDEN_SCHEMA_FIELDS = [
  "characterId",
  "compositionId",
  "referenceImage",
  "seed",
  "wardrobeId",
  "environmentId",
  "cameraPreset",
] as const;

export type PodcastVisualConsistencyMode =
  | "text_only"
  | "reference_image_conditioning"
  | "stable_seeds"
  | "reusable_source_images";

/** How this channel currently enforces visual continuity. */
export function getPodcastVisualConsistencyMode(): PodcastVisualConsistencyMode {
  // Inspected: reusable library assigner + Flow for PART/episode covers.
  return "reusable_source_images";
}

export function missingTokens(haystack: string, tokens: readonly string[]) {
  const lower = haystack.toLowerCase();
  return tokens.filter((token) => !lower.includes(token.toLowerCase()));
}

export async function readPodcastVisualLockCorpus() {
  const root = process.cwd();
  const files = {
    projectBible: path.join(
      root,
      "docs/channels/podcast-english-lessons/project-bible.md",
    ),
    characterBible: path.join(
      root,
      "docs/channels/podcast-english-lessons/character-bible.md",
    ),
    imagePromptBible: path.join(
      root,
      "docs/channels/podcast-english-lessons/image-prompt-bible.md",
    ),
    visualPlanner: path.join(
      root,
      "prompts/channels/podcast-english-lessons/visual-planner.md",
    ),
  };

  const [projectBible, characterBible, imagePromptBible, visualPlanner] =
    await Promise.all([
      readFile(files.projectBible, "utf8"),
      readFile(files.characterBible, "utf8"),
      readFile(files.imagePromptBible, "utf8"),
      readFile(files.visualPlanner, "utf8"),
    ]);

  return {
    files,
    projectBible,
    characterBible,
    imagePromptBible,
    visualPlanner,
    corpus: [
      projectBible,
      characterBible,
      imagePromptBible,
      visualPlanner,
    ].join("\n\n"),
  };
}

export function buildPodcastSceneGenerationRequestExcerpt({
  projectBible,
  characterBible,
  imagePromptBible,
  visualPlanner,
}: {
  projectBible: string;
  characterBible: string;
  imagePromptBible: string;
  visualPlanner: string;
}) {
  return [
    "# ChatGPT Scene Generation Request",
    "## Task\n\nGenerate Scenes JSON for the current video.",
    "## Generation Mode\n\nFULL",
    "## Project Bible\n\n" + projectBible,
    "## Character Bible\n\n" + characterBible,
    "## Image Prompt Bible\n\n" + imagePromptBible,
    "## Visual Planner Prompt\n\n" + visualPlanner,
    [
      "## Output Requirements",
      "",
      "Return a JSON array only.",
      "Do not invent schema fields such as characterId, compositionId, referenceImage, or seed.",
    ].join("\n"),
  ].join("\n\n");
}
