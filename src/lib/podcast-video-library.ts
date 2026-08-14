import { access, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import {
  buildSectionClipVisualIdea,
  buildSectionClipVisualPurpose,
  sectionClipTagFromVisualIdea,
  type PodcastSectionClipTag,
} from "@/lib/podcast-video-library-shared";
import { probeMedia } from "@/lib/render/ffmpeg";
import {
  ensureExclusiveSceneVoiceoverAudio,
  ensureSceneClipsDir,
  removePreviousSceneClip,
  sceneClipFileName,
  sceneClipRelativePath,
} from "@/lib/scene-clips";

export {
  buildSectionClipVisualIdea,
  buildSectionClipVisualPurpose,
  isPodcastSectionClipTag,
  isPodcastSectionClipVisualIdea,
  parsePodcastSectionClipLabel,
  PODCAST_SECTION_CLIP_TAGS,
  sectionClipTagFromVisualIdea,
  type PodcastSectionClipTag,
} from "@/lib/podcast-video-library-shared";

export const PODCAST_VIDEO_LIBRARY_RELATIVE_DIR = path.join(
  "data",
  "image-library",
  "podcast-english-lessons",
  "video-library",
);

const TAG_FILE_CANDIDATES: Record<PodcastSectionClipTag, string[]> = {
  INTRO: ["INTRO.mov", "INTRO.mp4", "1-INTRO.mov", "1-Greeting.mov"],
  LESSON: ["LESSON.mov", "LESSON.mp4", "2-LESSON.mov", "2-Lesson.mov"],
  CLOSING: ["CLOSING.mov", "CLOSING.mp4", "3-CLOSING.mov", "3-Closing.mov"],
  FINAL: [
    "FINAL.mov",
    "FINAL.mp4",
    "4-FINAL.mov",
    "4-ThanksForWatching.mov",
  ],
};

export function podcastVideoLibraryRootDir() {
  return path.join(process.cwd(), PODCAST_VIDEO_LIBRARY_RELATIVE_DIR);
}

export async function resolvePodcastVideoLibraryFile(
  tag: PodcastSectionClipTag,
) {
  const root = podcastVideoLibraryRootDir();
  for (const fileName of TAG_FILE_CANDIDATES[tag]) {
    const absolutePath = path.join(root, fileName);
    try {
      await access(absolutePath);
      return {
        absolutePath,
        fileName,
        relativePath: path.join(PODCAST_VIDEO_LIBRARY_RELATIVE_DIR, fileName),
      };
    } catch {
      // try next
    }
  }

  try {
    const entries = await readdir(root);
    const needle = tag.toLowerCase();
    const hit = entries.find((entry) => {
      const base = entry.replace(/\.[^.]+$/, "").toLowerCase();
      return base === needle || base.endsWith(`-${needle}`);
    });
    if (hit) {
      const absolutePath = path.join(root, hit);
      await access(absolutePath);
      return {
        absolutePath,
        fileName: hit,
        relativePath: path.join(PODCAST_VIDEO_LIBRARY_RELATIVE_DIR, hit),
      };
    }
  } catch {
    // missing library
  }

  return null;
}

export async function attachPodcastSectionClipToScene({
  videoId,
  sceneId,
  tag,
  previousClipLocalPath,
}: {
  videoId: string;
  sceneId: string;
  tag: PodcastSectionClipTag;
  previousClipLocalPath?: string | null;
}) {
  const libraryFile = await resolvePodcastVideoLibraryFile(tag);
  if (!libraryFile) {
    throw new Error(
      `Missing video-library file for ${tag}. Expected under ${PODCAST_VIDEO_LIBRARY_RELATIVE_DIR}.`,
    );
  }

  const probe = await probeMedia(libraryFile.absolutePath);
  if (!probe.ok || probe.durationSec <= 0) {
    throw new Error(`Video-library ${tag} clip has no valid media stream.`);
  }

  const ext = path.extname(libraryFile.fileName).toLowerCase() || ".mov";
  const fileName = sceneClipFileName(sceneId, ext);
  await ensureSceneClipsDir(videoId);
  const destAbs = path.join(
    process.cwd(),
    sceneClipRelativePath(videoId, fileName),
  );
  await copyFile(libraryFile.absolutePath, destAbs);
  await removePreviousSceneClip(previousClipLocalPath);

  const durationSec = Math.max(1, Math.ceil(probe.durationSec));
  const clipLocalPath = sceneClipRelativePath(videoId, fileName);

  // Extract exclusive clip audio into the scene-voiceover slot so subtitle
  // offsets include these silent bumpers (empty scriptText → silent_skip).
  const exclusiveAudio = await ensureExclusiveSceneVoiceoverAudio({
    videoId,
    sceneId,
    clipLocalPath,
    clipFileName: fileName,
    targetDurationSec: probe.durationSec,
  });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      clipLocalPath,
      clipFileName: fileName,
      clipMuted: false,
      duration: durationSec,
      voiceoverDuration: probe.durationSec,
      voiceoverLocalPath: exclusiveAudio.relativePath,
      voiceoverFileName: exclusiveAudio.fileName,
      visualIdea: buildSectionClipVisualIdea(tag),
      visualPurpose: buildSectionClipVisualPurpose(tag),
      scriptText: "",
      sceneType: "insert",
      voiceoverProvider: "video-library",
      voiceoverStatus: "attached",
      voiceoverError: null,
    },
  });

  return {
    tag,
    durationSec: probe.durationSec,
    clipLocalPath,
    voiceoverLocalPath: exclusiveAudio.relativePath,
    libraryFile: libraryFile.fileName,
  };
}

export async function attachPodcastSectionClipsBySortOrders({
  videoId,
  assignments,
}: {
  videoId: string;
  assignments: Array<{ sortOrder: number; tag: PodcastSectionClipTag }>;
}) {
  const results = [];
  for (const assignment of assignments) {
    const scene = await prisma.scene.findFirst({
      where: { videoId, sortOrder: assignment.sortOrder },
      select: { id: true, clipLocalPath: true, sortOrder: true },
    });
    if (!scene) {
      throw new Error(`Scene ${assignment.sortOrder} not found.`);
    }
    const attached = await attachPodcastSectionClipToScene({
      videoId,
      sceneId: scene.id,
      tag: assignment.tag,
      previousClipLocalPath: scene.clipLocalPath,
    });
    results.push({ sortOrder: scene.sortOrder, ...attached });
  }
  return results;
}

/** Attach library clips to every SECTION_CLIP scene detected via visualIdea. */
export async function attachPodcastSectionClipsFromVisualIdeas(videoId: string) {
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      visualIdea: true,
      clipLocalPath: true,
    },
  });

  const attached = [];
  const skipped: string[] = [];

  for (const scene of scenes) {
    const tag = sectionClipTagFromVisualIdea(scene.visualIdea);
    if (!tag) {
      continue;
    }
    try {
      const result = await attachPodcastSectionClipToScene({
        videoId,
        sceneId: scene.id,
        tag,
        previousClipLocalPath: scene.clipLocalPath,
      });
      attached.push({ sortOrder: scene.sortOrder, ...result });
    } catch (error) {
      skipped.push(
        `Scene ${scene.sortOrder} (${tag}): ${
          error instanceof Error ? error.message : "attach failed"
        }`,
      );
    }
  }

  return { attached, skipped };
}
