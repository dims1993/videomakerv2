/** Client-safe podcast section-clip tag helpers (no Node / Prisma). */

export const PODCAST_SECTION_CLIP_TAGS = [
  "INTRO",
  "LESSON",
  "CLOSING",
  "FINAL",
] as const;

export type PodcastSectionClipTag = (typeof PODCAST_SECTION_CLIP_TAGS)[number];

const SECTION_LABEL_LINE =
  /^#{0,6}\s*\[?\s*(INTRO|LESSON|CLOSING|FINAL)\s*\]?\s*$/i;

const SECTION_CLIP_VISUAL_IDEA =
  /^SECTION_CLIP\s*\|\s*(INTRO|LESSON|CLOSING|FINAL)\b/i;

export function isPodcastSectionClipTag(
  value: string,
): value is PodcastSectionClipTag {
  return (PODCAST_SECTION_CLIP_TAGS as readonly string[]).includes(
    value.toUpperCase(),
  );
}

export function parsePodcastSectionClipLabel(
  line: string,
): PodcastSectionClipTag | null {
  const match = line.trim().match(SECTION_LABEL_LINE);
  if (!match?.[1]) {
    return null;
  }
  const tag = match[1].toUpperCase();
  return isPodcastSectionClipTag(tag) ? tag : null;
}

export function isPodcastSectionClipVisualIdea(
  visualIdea: string | null | undefined,
) {
  return SECTION_CLIP_VISUAL_IDEA.test((visualIdea ?? "").trim());
}

export function sectionClipTagFromVisualIdea(
  visualIdea: string | null | undefined,
): PodcastSectionClipTag | null {
  const match = (visualIdea ?? "").trim().match(SECTION_CLIP_VISUAL_IDEA);
  if (!match?.[1]) {
    return null;
  }
  const tag = match[1].toUpperCase();
  return isPodcastSectionClipTag(tag) ? tag : null;
}

export function buildSectionClipVisualIdea(tag: PodcastSectionClipTag) {
  const blurb =
    tag === "INTRO"
      ? "episode intro bumper"
      : tag === "LESSON"
        ? "lesson section bumper"
        : tag === "CLOSING"
          ? "closing bumper"
          : "final thanks bumper";
  return `SECTION_CLIP | ${tag}: ${blurb}`;
}

export function buildSectionClipVisualPurpose(tag: PodcastSectionClipTag) {
  return `Video-library ${tag} bumper (empty scriptText; exclusive clip audio).`;
}
