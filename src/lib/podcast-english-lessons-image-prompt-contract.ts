/**
 * Final production imagePrompt locks for Podcast English Lessons.
 *
 * Emma / Leo / music stills come from library or episode-folder attach — their
 * imagePrompt is a short note only (not a Flow generation prompt).
 * PART covers keep a full cinematic Flow title-card prompt.
 */

import { extractPartCoverDisplayTitle } from "@/lib/podcast-part-covers";

/** Brief note stored on library/episode-still scenes (Emma, Leo, music). */
export const PODCAST_ATTACHED_STILL_IMAGE_PROMPT =
  "Attached still from podcast image library / episode still folder (not Flow-generated).";

/**
 * PART cover — cinematic realistic podcast title card (Flow).
 * Only the quoted PART_TEXT title changes between covers.
 */
export const PODCAST_PART_COVER_PROMPT_TEMPLATE = `Create a 16:9 realistic cinematic podcast title card for an English learning podcast.

Use a premium modern podcast visual style that matches realistic youthful podcast hosts Max and Sara: warm, professional, clean, cinematic, friendly, and educational.

Scene:
A cozy professional podcast studio with a dark petrol blue background close to HEX #102A2E, subtle warm beige accents, soft golden lamp glow, blurred acoustic panels, a wooden desk, a professional black podcast microphone near the lower center, black headphones resting on the desk, a notebook, a coffee cup, and very subtle audio waveform decoration in the background.

Composition:
Keep the layout fixed and clean.
The central focus must be one large horizontal rounded rectangle title card, centered in the frame.
The title card should be warm cream off-white, close to HEX #F8F3E8, with a soft realistic drop shadow.
The title card must leave enough margin around the text.
The microphone should be visible below or slightly behind the card, but it must not cover the text.
The background should feel premium and cinematic, but not busy.

Text style:
Inside the title card, place the title text exactly:
"[PART_TEXT]"

Use bold modern geometric sans-serif all-caps lettering.
Deep charcoal navy ink color, close to HEX #061417.
Perfectly centered.
One or two centered lines maximum.
Even letter spacing.
Uniform heavy stroke weight.
Scale the lettering to fit cleanly inside the card.
No serif font.
No script font.
No handwriting.
No italic.
No neon outline.
No 3D extruded letters.
No mixed fonts.

Important restrictions:
No people.
No characters.
No faces.
No hands.
No Max.
No Sara.
No Emma.
No Leo.
No subtitles.
No logos.
No watermarks.
No trademarks.
No extra captions.
No extra readable words.
No decorative flourishes around the letters.
No clutter.
No cartoon style.
No 2D illustration style.
No anime.
No 3D toy style.
No photorealistic people.

Single image only.
No collage.
No mosaic.
No grid.
No comic-strip layout.
No storyboard frames.
No repeated title cards.

Visible text must be limited exactly to:
"[PART_TEXT]"
No other letters or readable writing anywhere in the image.`;

/**
 * Internal production rule (planner / hybrid brief only — NOT sent to Flow).
 */
export const PODCAST_PART_COVER_INTERNAL_CONSISTENCY_RULE =
  [
    "INTERNAL (do not put this wording in imagePrompt):",
    "Every PART cover must reuse assemblePodcastPartCoverImagePrompt / PODCAST_PART_COVER_PROMPT_TEMPLATE verbatim.",
    "Only the exact title words inside the quotes change between PART numbers.",
    "Same studio, cream card, bold geometric sans all-caps, charcoal navy ink, and card geometry.",
    "Never invent a new font, case style, outline style, or card size per PART.",
  ].join(" ");

/** @deprecated Kept for older imports; avatars no longer use Flow locks. */
export const PODCAST_STYLE_LOCK =
  "Soft semi-flat 2D editorial educational illustration with clean dark outlines, warm muted colors and lightly textured shading.";
/** @deprecated */
export const PODCAST_EMMA_CHARACTER_LOCK =
  "Recurring adult female English teacher Emma, short curly chestnut-brown hair, round dark-framed glasses, warm brown eyes, friendly confident expression, teal blouse and mustard knitted cardigan.";
/** @deprecated */
export const PODCAST_LEO_CHARACTER_LOCK =
  "Recurring adult male English learner Leo, short dark-brown hair, warm brown eyes, friendly curious expression, navy or dark-blue casual outer layer over a light neutral shirt.";
/** @deprecated */
export const PODCAST_STUDIO_LOCK =
  "Seated behind the same wooden podcast desk in the locked cozy studio, silver microphone on a black articulated boom arm, open notebook, pen and light ceramic mug, daylight window on camera-left, small shelf with books and plant, warm beige wall, terracotta and navy panels, low bookshelf and warm lamp.";
/** @deprecated */
export const PODCAST_COMP_EMMA =
  "Medium shot, slight three-quarter front angle, Emma framed slightly right of center, face unobstructed, natural hand gesture, empty lower-center area reserved for burned-in subtitles.";
/** @deprecated */
export const PODCAST_COMP_LEO =
  "Medium shot, slight three-quarter front angle, Leo framed slightly left of center, face unobstructed, empty lower-center area reserved for burned-in subtitles.";
/** @deprecated */
export const PODCAST_MUSIC_CORE =
  "Soft semi-flat 2D editorial educational illustration of the same locked cozy podcast studio, wooden desk, silver microphone silhouette, warm beige walls, terracotta and navy panels, soft daylight and warm lamp glow, subtle abstract waveform feeling, no speaking character, minimal composition, empty lower-center area reserved for burned-in subtitles.";
/** @deprecated — replaced by PODCAST_PART_COVER_PROMPT_TEMPLATE */
export const PODCAST_PART_COVER_CORE =
  "Create a 16:9 realistic cinematic podcast title card for an English learning podcast.";
/** @deprecated — replaced by PODCAST_PART_COVER_PROMPT_TEMPLATE */
export const PODCAST_PART_COVER_TYPE_LOCK =
  "Bold modern geometric sans-serif all-caps lettering on a warm cream off-white title card.";

export const PODCAST_VISIBLE_TEXT_NONE =
  "No visible text, letters, numbers, words, captions, subtitles, titles, speech bubbles, signs, labels, chalkboards with writing, posters with writing, or readable writing of any kind baked into the image.";

export const PODCAST_NEGATIVE_LOCK =
  `Keep the exact recurring character design, wardrobe, studio layout, furniture, microphone design, palette and illustration style consistent with all other scenes. No photorealism, no 3D, no anime, no celebrity likeness, no logos, no trademarks, no watermark, no extra people, no duplicated character, no random wardrobe change, no different room, no clutter. ${PODCAST_VISIBLE_TEXT_NONE}`;

export function podcastPartCoverVisibleTextRule(displayTitle: string) {
  const title = displayTitle.trim().replace(/\s+/g, " ");
  return `Visible text must be limited exactly to:\n"${title}"\nNo other letters or readable writing anywhere in the image.`;
}

export type PodcastImagePromptRole =
  | "emma"
  | "leo"
  | "music"
  | "part"
  | "unknown";

export function inferPodcastImagePromptRole(scene: {
  speaker?: string | null;
  visualIdea?: string | null;
  scriptText?: string | null;
  sceneType?: string | null;
}): PodcastImagePromptRole {
  const idea = (scene.visualIdea ?? "").toUpperCase();
  if (idea.includes("PART_COVER") || idea.includes("COMP_PART_COVER")) {
    return "part";
  }
  if (
    idea.includes("MUSIC_BED") ||
    idea.includes("COMP_MUSIC") ||
    idea.startsWith("MUSIC")
  ) {
    return "music";
  }
  if (idea.includes("TEACHER_EMMA") || idea.includes("COMP_EMMA")) {
    return "emma";
  }
  if (idea.includes("STUDENT_LEO") || idea.includes("COMP_LEO")) {
    return "leo";
  }

  const speaker = (scene.speaker ?? "").trim().toLowerCase();
  if (
    speaker === "teacher" ||
    speaker === "emma" ||
    speaker === "teacher_emma"
  ) {
    return "emma";
  }
  if (
    speaker === "student" ||
    speaker === "leo" ||
    speaker === "student_leo"
  ) {
    return "leo";
  }
  if (speaker === "music" || speaker === "music_bed") {
    return "music";
  }

  const script = scene.scriptText ?? "";
  if (/\[MUSIC\]/i.test(script)) {
    return "music";
  }
  if (/\[EMMA\]/i.test(script)) {
    return "emma";
  }
  if (/\[LEO\]/i.test(script)) {
    return "leo";
  }

  return "unknown";
}

export function extractPodcastExpressionSnippet(_opts: {
  imagePrompt?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
}): string {
  return "";
}

export function assemblePodcastPartCoverImagePrompt(displayTitle: string): string {
  const title = displayTitle.trim().replace(/\s+/g, " ") || "PART";
  return PODCAST_PART_COVER_PROMPT_TEMPLATE.replaceAll("[PART_TEXT]", title);
}

export function assemblePodcastImagePrompt(
  role: Exclude<PodcastImagePromptRole, "unknown" | "part">,
  _expression?: string,
): string {
  void role;
  return PODCAST_ATTACHED_STILL_IMAGE_PROMPT;
}

export function ensurePodcastNoVisibleText(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed === PODCAST_ATTACHED_STILL_IMAGE_PROMPT) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("no visible text") ||
    lower.includes("no readable writing") ||
    lower.includes("no letters, numbers, words") ||
    lower.includes("no other letters or readable writing") ||
    lower.includes("visible text must be limited exactly to")
  ) {
    return trimmed;
  }
  return `${trimmed} ${PODCAST_VISIBLE_TEXT_NONE}`;
}

/**
 * Rebuild imagePrompt:
 * - emma / leo / music → short attach note (library / episode still)
 * - part → cinematic Flow title-card template with exact PART title
 */
export function normalizePodcastImagePrompt(opts: {
  role: PodcastImagePromptRole;
  imagePrompt?: string | null;
  visualIdea?: string | null;
  visualPurpose?: string | null;
  scriptText?: string | null;
  displayTitle?: string | null;
  episodeContext?: string | null;
  title?: string | null;
  topicCategory?: string | null;
  visualAnchor?: string | null;
  topic?: string | null;
}): string {
  const existing = opts.imagePrompt?.trim() ?? "";
  if (opts.role === "unknown") {
    return ensurePodcastNoVisibleText(existing);
  }

  if (opts.role === "part") {
    const title =
      opts.displayTitle?.trim() ||
      extractPartCoverDisplayTitle({
        visualIdea: opts.visualIdea,
        scriptText: opts.scriptText,
        imagePrompt: opts.imagePrompt,
      }) ||
      "PART";
    return assemblePodcastPartCoverImagePrompt(title);
  }

  return PODCAST_ATTACHED_STILL_IMAGE_PROMPT;
}

/**
 * Compact contract for hybrid fill chunks.
 * Avatars/music are attach-only; PART covers use the cinematic template.
 */
export function buildPodcastHybridFillBrief(): string {
  return [
    "FINAL IMAGE PROMPT CONTRACT — PODCAST ENGLISH LESSONS",
    "",
    "Emma / Leo / music scenes: do NOT write Flow imagePrompts.",
    `Store only: ${PODCAST_ATTACHED_STILL_IMAGE_PROMPT}`,
    "Stills come from the podcast image library or the episode still folder.",
    "",
    "PART_COVER scenes only: use assemblePodcastPartCoverImagePrompt / this template,",
    "with the exact PART title inside the quotes (only the title words change):",
    "",
    PODCAST_PART_COVER_PROMPT_TEMPLATE,
    "",
    "INTERNAL PART consistency:",
    PODCAST_PART_COVER_INTERNAL_CONSISTENCY_RULE,
  ].join("\n");
}

export function podcastImagePromptHasIdentityLocks(
  prompt: string,
  role: PodcastImagePromptRole,
): boolean {
  const lower = prompt.toLowerCase();
  if (role === "emma" || role === "leo" || role === "music") {
    return (
      lower.includes("attached still") &&
      (lower.includes("library") || lower.includes("episode still"))
    );
  }
  if (role === "part") {
    return (
      lower.includes("realistic cinematic podcast title card") &&
      lower.includes("bold modern geometric sans-serif") &&
      lower.includes("#102a2e") &&
      lower.includes("#f8f3e8") &&
      lower.includes("visible text must be limited exactly to") &&
      lower.includes("single image only")
    );
  }
  return true;
}
