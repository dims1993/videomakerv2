import { access, copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  generatedImagesDir,
  localImageUrl,
  stableSceneImageFileName,
} from "@/lib/image-batches";
import { resolveImageOutputFolderAbsolute } from "@/lib/image-output-folder";
import {
  isPodcastFlowOnlyScene,
  isPodcastSectionClipScene,
  PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
} from "@/lib/podcast-image-library-shared";
import { resolvePipelineSettings } from "@/lib/pipeline-settings";
import { prisma } from "@/lib/prisma";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function listStillFiles(folderAbs: string) {
  try {
    const entries = await readdir(folderAbs);
    const files: Array<{
      fileName: string;
      fullPath: string;
      modifiedMs: number;
    }> = [];

    for (const entry of entries) {
      const fullPath = path.join(folderAbs, entry);
      const entryStat = await stat(fullPath);
      if (
        entryStat.isFile() &&
        IMAGE_EXTENSIONS.has(path.extname(entry).toLowerCase())
      ) {
        files.push({
          fileName: entry,
          fullPath,
          modifiedMs: entryStat.mtimeMs,
        });
      }
    }

    return files.sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch {
    return [];
  }
}

/**
 * Browser Select only gives a folder name and historically remapped it to
 * storage/generated-images/<name> (often empty). Also try the image-library
 * paths where users commonly drop an episode still folder.
 */
async function resolveFolderWithStills(
  preferred: string | null | undefined,
  videoId: string,
  videoTitle: string | null,
): Promise<{
  folderAbs: string;
  files: Awaited<ReturnType<typeof listStillFiles>>;
}> {
  const primary = resolveImageOutputFolderAbsolute(
    preferred,
    videoId,
    videoTitle,
  );
  const primaryFiles = await listStillFiles(primary);
  if (primaryFiles.length > 0) {
    return { folderAbs: primary, files: primaryFiles };
  }

  const basename = path.basename(
    (preferred?.trim() || primary).replace(/[\\/]+$/, ""),
  );
  if (!basename || basename === "." || basename === "..") {
    return { folderAbs: primary, files: primaryFiles };
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data", "image-library", "podcast-english-lessons", basename),
    path.join(cwd, "data", "image-library", basename),
    path.join(cwd, "storage", "generated-images", basename),
    path.join(
      cwd,
      "data",
      "image-library",
      "podcast-english-lessons",
      path.basename(primary),
    ),
  ];

  for (const candidate of candidates) {
    if (path.resolve(candidate) === path.resolve(primary)) {
      continue;
    }
    const files = await listStillFiles(candidate);
    if (files.length > 0) {
      return { folderAbs: candidate, files };
    }
  }

  return { folderAbs: primary, files: primaryFiles };
}

export type PodcastFolderStillAttachResult = {
  assigned: number;
  skippedFlowOnly: number;
  skippedSectionClip: number;
  sourceFileName: string | null;
  sourceFolder: string;
  sharedRelativePath: string | null;
};

/**
 * Attach one still from a folder to every podcast scene that is not:
 * - PART / episode cover (Flow)
 * - INTRO / LESSON / CLOSING / FINAL section video clips
 *
 * If the folder has multiple images, the first (stable sorted) file is used
 * for all eligible scenes — matching the "one episode still" workflow.
 */
export async function attachPodcastFolderStillToVideo(
  videoId: string,
  options: {
    folderPath?: string | null;
    overwrite?: boolean;
  } = {},
): Promise<PodcastFolderStillAttachResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, channelKey: true, title: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  if (video.channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    throw new Error("Folder still attach is only for podcast-english-lessons.");
  }

  const settings = await resolvePipelineSettings(videoId);
  const preferred =
    options.folderPath?.trim() || settings.assets.imageOutputFolder;
  const { folderAbs, files } = await resolveFolderWithStills(
    preferred,
    videoId,
    video.title,
  );

  if (files.length === 0) {
    await access(folderAbs).catch(() => {
      throw new Error(`Folder not found: ${folderAbs}`);
    });
    return {
      assigned: 0,
      skippedFlowOnly: 0,
      skippedSectionClip: 0,
      sourceFileName: null,
      sourceFolder: folderAbs,
      sharedRelativePath: null,
    };
  }

  const source = files[0]!;
  const destDir = generatedImagesDir(videoId, video.title);
  await mkdir(destDir, { recursive: true });
  const sharedFileName = `episode-still${path.extname(source.fileName).toLowerCase() || ".png"}`;
  const sharedAbs = path.join(destDir, sharedFileName);
  await copyFile(source.fullPath, sharedAbs);
  const sharedRelativePath = path.relative(process.cwd(), sharedAbs);

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      visualIdea: true,
      scriptText: true,
      imageLocalPath: true,
      imageUrl: true,
    },
  });

  const overwrite = options.overwrite !== false;
  let assigned = 0;
  let skippedFlowOnly = 0;
  let skippedSectionClip = 0;

  for (const scene of scenes) {
    if (isPodcastFlowOnlyScene(scene)) {
      skippedFlowOnly += 1;
      continue;
    }
    if (isPodcastSectionClipScene(scene)) {
      skippedSectionClip += 1;
      continue;
    }

    const alreadyAttached = Boolean(
      scene.imageLocalPath?.trim() || scene.imageUrl?.trim(),
    );
    if (alreadyAttached && !overwrite) {
      continue;
    }

    const fileName = stableSceneImageFileName(
      scene.id,
      path.extname(sharedFileName) || ".png",
    );
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        imageLocalPath: sharedRelativePath,
        imageFileName: fileName,
        imageUrl: localImageUrl(videoId, fileName),
        imageStatus: "attached",
        imageError: null,
        imageBatchId: null,
        status: "planned",
      },
    });
    assigned += 1;
  }

  return {
    assigned,
    skippedFlowOnly,
    skippedSectionClip,
    sourceFileName: source.fileName,
    sourceFolder: folderAbs,
    sharedRelativePath,
  };
}
