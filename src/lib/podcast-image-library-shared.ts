import { isPartCoverVisualIdea } from "@/lib/podcast-part-covers";
import { isPodcastSectionClipVisualIdea } from "@/lib/podcast-video-library-shared";

/** Safe for client components — no Node builtins. */
export const PODCAST_ENGLISH_LESSONS_CHANNEL_KEY = "podcast-english-lessons";

export type PodcastImageLibraryTag = "emma" | "leo" | "music";

/**
 * Scenes that must still go through Google Flow (unique on-image titles).
 * Everything else can pull from the reusable shot library.
 */
export function isPodcastFlowOnlyScene(scene: {
  visualIdea?: string | null;
  scriptText?: string | null;
}) {
  if (isPartCoverVisualIdea(scene.visualIdea)) {
    return true;
  }
  const idea = (scene.visualIdea ?? "").trim().toUpperCase();
  if (
    idea.startsWith("EPISODE_COVER") ||
    idea.startsWith("START_COVER") ||
    idea.includes("COMP_EPISODE_COVER") ||
    idea.includes("COMP_START_COVER")
  ) {
    return true;
  }
  return false;
}

/** Section bumpers use video-library clips — never assign stills / Flow. */
export function isPodcastSectionClipScene(scene: {
  visualIdea?: string | null;
}) {
  return isPodcastSectionClipVisualIdea(scene.visualIdea);
}

export function libraryTagForRole(
  role: string,
): PodcastImageLibraryTag | null {
  if (role === "emma") return "emma";
  if (role === "leo") return "leo";
  if (role === "music") return "music";
  return null;
}
