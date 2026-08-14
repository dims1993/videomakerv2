import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ChannelPipelineMode,
  ChannelProfile,
} from "@/lib/channels";
import {
  ChannelScaffoldError,
  slugifyChannelKey,
  validateChannelKey,
} from "@/lib/channel-key";
import {
  customChannelExists,
  upsertCustomChannel,
} from "@/lib/channel-registry";

export type CreateChannelInput = {
  name: string;
  key: string;
  description: string;
  pipelineMode: ChannelPipelineMode;
  audience?: string;
  niche?: string;
  categoryLabel?: string;
};

export {
  ChannelScaffoldError,
  slugifyChannelKey,
  validateChannelKey,
} from "@/lib/channel-key";

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? "");
}

function projectBibleTemplate(vars: Record<string, string>) {
  return fill(
    `# {{name}} — Project Bible

## Purpose

This file defines the creative direction for **{{name}}**.

{{description}}

## Core mission

Help the target audience ({{audience}}) understand and apply ideas from {{niche}} through clear, visual storytelling.

## Voice

- Clear and direct
- Warm and practical
- No hype, no jargon overload

## What every video should deliver

- One strong idea
- One emotional hook
- One practical takeaway
- Visual scenes that are easy to stage

## Avoid

- Generic filler topics
- Copied viral formats without a unique mechanism
- Overpromising outcomes
`,
    vars,
  );
}

function imagePromptBibleTemplate(vars: Record<string, string>) {
  return fill(
    `# {{name}} — Image Prompt Bible

## Style lock

Soft semi-flat 2D editorial illustration with clean outlines, warm muted colors, and lightly textured shading.

## Composition defaults

- Clear focal subject
- Simple backgrounds
- Empty lower-center area reserved for burned-in subtitles when needed
- No logos, watermarks, or readable paragraphs unless explicitly authorized

## Negative lock

No photorealism, no 3D, no anime, no celebrity likeness, no clutter, no random text baked into the image.
`,
    vars,
  );
}

function angleBuilderTemplate(vars: Record<string, string>) {
  return fill(
    `# {{name}} — Angle Builder

Transform topic seeds into sharp video angles for {{niche}}.

Audience: {{audience}}

Return concise angles with:
- title direction
- unique mechanism
- emotional hook
- visual hook
- why it matters now

Prefer specific mechanisms over generic category titles.
`,
    vars,
  );
}

function scriptWriterTemplate(vars: Record<string, string>) {
  return fill(
    `# {{name}} — Script Writer

Write complete narration scripts for {{name}}.

Audience: {{audience}}
Niche: {{niche}}

Goals:
- clear spoken language
- strong opening hook
- one idea developed cleanly
- practical close

Output:
Title:
Core idea:
Script:
`,
    vars,
  );
}

function visualPlannerTemplate(vars: Record<string, string>) {
  return fill(
    `# {{name}} — Visual Planner

Convert the final script into scene visuals for image generation.

Platform mode: fill-hybrid
- The app builds a local scene skeleton (scriptText + duration are authoritative).
- ChatGPT fills ONLY visualPurpose, visualIdea, imagePrompt, and sceneType per chunk.
- Do NOT rewrite narration or invent/omit scenes.

Rules:
- Prefer one clear claim per scene
- Use avatar / insert / space scene types as appropriate
- Keep character and style identity locks consistent across the video
- Never invent narration not present in the script
- No logos or baked-in captions unless this channel explicitly requires on-image title text

Return valid scene visual fill JSON only when asked for a fill chunk.
`,
    vars,
  );
}

function metadataWriterTemplate(vars: Record<string, string>) {
  return fill(
    `# {{name}} — Metadata Writer

Create YouTube metadata for {{name}} videos.

Audience: {{audience}}

Return:
- title options
- description
- tags
- thumbnail concept notes

Keep titles clear and searchable. Avoid clickbait that the script cannot deliver.
`,
    vars,
  );
}

async function writeTextFile(relativePath: string, contents: string) {
  const absolute = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
}

export async function scaffoldNewChannel(
  input: CreateChannelInput,
  options: { builtinKeys: Set<string> },
): Promise<ChannelProfile> {
  const name = input.name.trim();
  const key = slugifyChannelKey(input.key || name);
  const description = input.description.trim();
  const pipelineMode = input.pipelineMode;

  if (!name) {
    throw new ChannelScaffoldError("Channel name is required.");
  }
  if (!description) {
    throw new ChannelScaffoldError("Channel description is required.");
  }
  validateChannelKey(key);

  if (options.builtinKeys.has(key) || customChannelExists(key)) {
    throw new ChannelScaffoldError(
      `Channel key "${key}" already exists. Choose another key.`,
    );
  }

  const audience =
    input.audience?.trim() ||
    (pipelineMode === "audio_only" ? "general viewers" : "");
  const niche =
    input.niche?.trim() ||
    (pipelineMode === "audio_only" ? description : "");

  if (pipelineMode === "full") {
    if (!audience) {
      throw new ChannelScaffoldError("Audience is required for full channels.");
    }
    if (!niche) {
      throw new ChannelScaffoldError("Niche is required for full channels.");
    }
  }

  const vars = {
    name,
    description,
    audience: audience || "general viewers",
    niche: niche || description,
  };

  const projectBiblePath = `docs/channels/${key}/project-bible.md`;
  const imagePromptBiblePath = `docs/channels/${key}/image-prompt-bible.md`;
  const characterBiblePath = `docs/channels/${key}/character-bible.md`;
  const prompts = {
    angleBuilder: `prompts/channels/${key}/angle-builder.md`,
    scriptWriter: `prompts/channels/${key}/script-writer.md`,
    visualPlanner: `prompts/channels/${key}/visual-planner.md`,
    metadataWriter: `prompts/channels/${key}/metadata-writer.md`,
  };

  await writeTextFile(projectBiblePath, projectBibleTemplate(vars));
  await writeTextFile(imagePromptBiblePath, imagePromptBibleTemplate(vars));
  await writeTextFile(
    characterBiblePath,
    [
      `# Character Bible`,
      ``,
      `## Host / recurring characters`,
      ``,
      `Describe recurring characters, wardrobe locks, and visual consistency rules for ${vars.name}.`,
      ``,
      `Replace this stub before shipping Visual Planner requests.`,
    ].join("\n"),
  );
  await writeTextFile(prompts.angleBuilder, angleBuilderTemplate(vars));
  await writeTextFile(prompts.scriptWriter, scriptWriterTemplate(vars));
  await writeTextFile(prompts.visualPlanner, visualPlannerTemplate(vars));
  await writeTextFile(prompts.metadataWriter, metadataWriterTemplate(vars));

  const categoryLabel =
    input.categoryLabel?.trim() || niche || "General";
  const categoryId = slugifyChannelKey(categoryLabel) || "general";

  const profile: ChannelProfile = {
    key,
    name,
    description,
    projectBiblePath,
    imagePromptBiblePath,
    characterBiblePath,
    pipelineMode,
    voiceoverSpeedDefault: pipelineMode === "audio_only" ? 0.9 : 0.85,
    prompts,
    ...(pipelineMode === "full"
      ? {
          topicSystem: {
            enabled: true,
            categories: [
              {
                id: categoryId,
                label: categoryLabel,
                description: `Primary topic category for ${name}.`,
              },
            ],
            weeklyRotation: [categoryId],
          },
          editorialInstructions: {
            role: "editorial strategy partner",
            audience,
            niche,
            style: [
              "clear and practical",
              "easy to visualize",
              "emotionally engaging without hype",
            ],
            originalityRules: [
              "Prefer specific mechanisms over generic category titles.",
              "Avoid repeating overused angles unless there is a new mechanism.",
            ],
            overusedAngles: [],
            requiredTopicFields: [
              "category",
              "title",
              "topic",
              "angle",
              "uniqueMechanism",
              "trigger",
              "promise",
              "visualHook",
              "thumbnailIdea",
              "repetitionRisk",
            ],
          },
        }
      : {}),
  };

  upsertCustomChannel(profile);
  return profile;
}
