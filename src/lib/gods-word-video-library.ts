import { access, copyFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  buildSectionClipVisualIdea,
  buildSectionClipVisualPurpose,
  sectionClipTagFromVisualIdea,
} from "@/lib/podcast-video-library-shared";
import { prisma } from "@/lib/prisma";
import { probeMedia } from "@/lib/render/ffmpeg";
import {
  ensureExclusiveSceneVoiceoverAudio,
  ensureSceneClipsDir,
  removePreviousSceneClip,
  sceneClipFileName,
  sceneClipRelativePath,
} from "@/lib/scene-clips";
import { THE_GODS_WORD_CHANNEL_KEY } from "@/lib/the-gods-word-script-prompt";

export const GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR = path.join(
  "data",
  "image-library",
  "the-gods-word",
  "video-library",
);

const FINAL_FILE_CANDIDATES = ["FINAL.mp4", "FINAL.mov"] as const;

export function godsWordVideoLibraryRootDir() {
  return path.join(process.cwd(), GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR);
}

export async function resolveGodsWordFinalLibraryFile() {
  const root = godsWordVideoLibraryRootDir();
  for (const fileName of FINAL_FILE_CANDIDATES) {
    const absolutePath = path.join(root, fileName);
    try {
      await access(absolutePath);
      return {
        absolutePath,
        fileName,
        relativePath: path.join(GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR, fileName),
      };
    } catch {
      // try next
    }
  }

  try {
    const entries = await readdir(root);
    const hit = entries.find((entry) => {
      const base = entry.replace(/\.[^.]+$/, "").toLowerCase();
      return base === "final";
    });
    if (hit) {
      const absolutePath = path.join(root, hit);
      await access(absolutePath);
      return {
        absolutePath,
        fileName: hit,
        relativePath: path.join(GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR, hit),
      };
    }
  } catch {
    // missing library
  }

  return null;
}

export async function attachGodsWordFinalClipToScene({
  videoId,
  sceneId,
  previousClipLocalPath,
}: {
  videoId: string;
  sceneId: string;
  previousClipLocalPath?: string | null;
}) {
  const libraryFile = await resolveGodsWordFinalLibraryFile();
  if (!libraryFile) {
    throw new Error(
      `Missing Gods Word video-library FINAL clip. Place FINAL.mp4 under ${GODS_WORD_VIDEO_LIBRARY_RELATIVE_DIR}.`,
    );
  }

  const probe = await probeMedia(libraryFile.absolutePath);
  if (!probe.ok || probe.durationSec <= 0) {
    throw new Error("Gods Word FINAL library clip has no valid media stream.");
  }

  const ext = path.extname(libraryFile.fileName).toLowerCase() || ".mp4";
  const fileName = sceneClipFileName(sceneId, ext);
  await ensureSceneClipsDir(videoId);
  const clipLocalPath = sceneClipRelativePath(videoId, fileName);
  const destAbs = path.join(process.cwd(), clipLocalPath);
  await copyFile(libraryFile.absolutePath, destAbs);
  await removePreviousSceneClip(previousClipLocalPath);

  const durationSec = Math.max(1, Math.ceil(probe.durationSec));
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
      visualIdea: "SECTION_CLIP | FINAL: end bumper",
      visualPurpose: buildSectionClipVisualPurpose("FINAL"),
      scriptText: "",
      sceneType: "insert",
      voiceoverProvider: "video-library",
      voiceoverStatus: "attached",
      voiceoverError: null,
      imageStatus: "attached",
      imageError: null,
    },
  });

  return {
    durationSec: probe.durationSec,
    clipLocalPath,
    voiceoverLocalPath: exclusiveAudio.relativePath,
    libraryFile: libraryFile.fileName,
  };
}

/**
 * Ensure a SECTION_CLIP | FINAL scene exists, then attach FINAL.mp4 from the
 * Gods Word video library. Safe to call after visual-plan import.
 */
export async function ensureAndAttachGodsWordFinalSectionClip(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { channelKey: true },
  });
  if (video?.channelKey !== THE_GODS_WORD_CHANNEL_KEY) {
    return { attached: false as const, reason: "not-gods-word" as const };
  }

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      visualIdea: true,
      clipLocalPath: true,
      scriptText: true,
    },
  });

  let finalScene = scenes.find(
    (scene) => sectionClipTagFromVisualIdea(scene.visualIdea) === "FINAL",
  );

  if (!finalScene) {
    const nextOrder =
      scenes.length > 0
        ? Math.max(...scenes.map((scene) => scene.sortOrder)) + 1
        : 1;
    finalScene = await prisma.scene.create({
      data: {
        videoId,
        sortOrder: nextOrder,
        scriptText: "",
        sceneType: "insert",
        visualPurpose: buildSectionClipVisualPurpose("FINAL"),
        visualIdea: "SECTION_CLIP | FINAL: end bumper",
        // Empty prompt so Flow/image batches ignore this bumper.
        imagePrompt: "",
        duration: 5,
        status: "planned",
        imageStatus: "pending",
      },
      select: {
        id: true,
        sortOrder: true,
        visualIdea: true,
        clipLocalPath: true,
        scriptText: true,
      },
    });
  } else {
    const needsNormalize =
      sectionClipTagFromVisualIdea(finalScene.visualIdea) !== "FINAL" ||
      Boolean((finalScene.scriptText ?? "").trim());
    if (needsNormalize) {
      await prisma.scene.update({
        where: { id: finalScene.id },
        data: {
          visualIdea: "SECTION_CLIP | FINAL: end bumper",
          visualPurpose: buildSectionClipVisualPurpose("FINAL"),
          imagePrompt: "",
          scriptText: "",
        },
      });
    }
  }

  const attached = await attachGodsWordFinalClipToScene({
    videoId,
    sceneId: finalScene.id,
    previousClipLocalPath: finalScene.clipLocalPath,
  });

  return {
    attached: true as const,
    sortOrder: finalScene.sortOrder,
    ...attached,
  };
}

/** @deprecated Prefer ensureAndAttachGodsWordFinalSectionClip — kept for clarity. */
export function buildGodsWordFinalVisualIdea() {
  return buildSectionClipVisualIdea("FINAL").replace(
    "final thanks bumper",
    "end bumper",
  );
}
