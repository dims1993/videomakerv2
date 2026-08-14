import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  localImageUrl,
  removePreviousGeneratedImage,
  stableSceneImageFileName,
} from "@/lib/image-batches";
import { resolveVideoImageOutputFolderAbsolute } from "@/lib/pipeline-settings";
import { prisma } from "@/lib/prisma";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function sceneOrderFromFileName(fileName: string) {
  const baseName = path.basename(fileName, path.extname(fileName));
  const preferredMatch = baseName.match(/^(?:scene|sc|shot|image|generated)[-_\s]?(\d{1,4})(?:\D|$)/i);

  if (preferredMatch) {
    return Number(preferredMatch[1]);
  }

  const leadingMatch = baseName.match(/^(\d{1,4})(?:\D|$)/);

  return leadingMatch ? Number(leadingMatch[1]) : null;
}

async function listImageFiles(folderPath: string) {
  const absoluteFolder = path.isAbsolute(folderPath)
    ? folderPath
    : path.resolve(process.cwd(), folderPath);
  const entries = await readdir(absoluteFolder);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(absoluteFolder, entry);
    const entryStat = await stat(fullPath);

    if (entryStat.isFile() && imageExtensions.has(path.extname(entry).toLowerCase())) {
      files.push({
        fileName: entry,
        fullPath,
        modifiedMs: entryStat.mtimeMs,
      });
    }
  }

  return files;
}

type ImportMatchReason =
  | "exact_filename"
  | "explicit_scene_number"
  | "scoped_order"
  | "latest_selected";

type ImageFile = Awaited<ReturnType<typeof listImageFiles>>[number];

type SceneForImport = {
  id: string;
  sortOrder: number;
  imageFileName: string | null;
  imageLocalPath: string | null;
};

type ProposedMatch = {
  fileName: string;
  sceneId: string;
  sceneSortOrder: number;
  targetFileName: string;
  matchReason: ImportMatchReason;
  willOverwrite: boolean;
};

type UnmatchedFile = {
  fileName: string;
  reason: string;
};

function parseJsonStringArray(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function stableTargetFileName(scene: SceneForImport, sourceFileName: string) {
  const extension = path.extname(sourceFileName).toLowerCase() || ".png";

  return stableSceneImageFileName(scene.id, extension);
}

function addMatch({
  file,
  scene,
  reason,
  matches,
  unmatchedFiles,
  usedSceneIds,
  overwrite,
}: {
  file: ImageFile;
  scene: SceneForImport | null | undefined;
  reason: ImportMatchReason;
  matches: ProposedMatch[];
  unmatchedFiles: UnmatchedFile[];
  usedSceneIds: Set<string>;
  overwrite: boolean;
}) {
  if (!scene) {
    return false;
  }

  if (usedSceneIds.has(scene.id)) {
    unmatchedFiles.push({ fileName: file.fileName, reason: "scene_already_matched" });
    return false;
  }

  if (scene.imageLocalPath && !overwrite) {
    unmatchedFiles.push({ fileName: file.fileName, reason: "skipped_existing" });
    return false;
  }

  matches.push({
    fileName: file.fileName,
    sceneId: scene.id,
    sceneSortOrder: scene.sortOrder,
    targetFileName: stableTargetFileName(scene, file.fileName),
    matchReason: reason,
    willOverwrite: Boolean(scene.imageLocalPath && overwrite),
  });
  usedSceneIds.add(scene.id);

  return true;
}

export async function importDownloadedImagesFromFolder({
  videoId,
  batchId,
  folderPath,
  overwrite,
  selectedSceneIds = [],
  matchMode = "smart",
  dryRun = false,
  latestOnly = false,
}: {
  videoId: string;
  batchId?: string | null;
  folderPath: string;
  overwrite: boolean;
  selectedSceneIds?: string[];
  matchMode?: "strict" | "smart";
  dryRun?: boolean;
  latestOnly?: boolean;
}) {
  const sourceFolder = folderPath.trim();

  if (!sourceFolder) {
    throw new Error("Import folder is required.");
  }

  const batch = batchId
    ? await prisma.imageBatch.findUnique({
        where: { id: batchId },
        select: { sceneIdsJson: true },
      })
    : null;
  const batchSceneIds = parseJsonStringArray(batch?.sceneIdsJson);
  const scopedSceneIds =
    selectedSceneIds.length > 0
      ? selectedSceneIds
      : batchSceneIds.length > 0
        ? batchSceneIds
        : [];
  const hasExplicitScope = scopedSceneIds.length > 0;

  const [video, scenes, files] = await Promise.all([
    prisma.video.findUnique({
      where: { id: videoId },
      select: { title: true },
    }),
    prisma.scene.findMany({
      where: {
        videoId,
        ...(hasExplicitScope ? { id: { in: scopedSceneIds } } : {}),
      },
      orderBy: { sortOrder: "asc" },
    }),
    listImageFiles(sourceFolder),
  ]);

  const scenesByFileName = new Map(
    scenes
      .filter((scene) => scene.imageFileName)
      .map((scene) => [scene.imageFileName?.toLowerCase(), scene]),
  );
  const scenesByOrder = new Map(scenes.map((scene) => [scene.sortOrder, scene]));
  const outputFolder = await resolveVideoImageOutputFolderAbsolute(videoId);

  const usedSceneIds = new Set<string>();
  const matches: ProposedMatch[] = [];
  const unmatchedFiles: UnmatchedFile[] = [];
  let failed = 0;
  const candidateFiles = latestOnly && scenes.length > 0
    ? [...files]
        .sort((a, b) => b.modifiedMs - a.modifiedMs)
        .slice(0, scenes.length)
        .sort((a, b) => a.modifiedMs - b.modifiedMs)
    : [...files].sort((a, b) => a.modifiedMs - b.modifiedMs);

  if (latestOnly && !hasExplicitScope) {
    for (const file of candidateFiles) {
      unmatchedFiles.push({
        fileName: file.fileName,
        reason: "latest_only_requires_selected_scenes_or_batch_scope",
      });
    }
  } else if (latestOnly) {
    const scopedScenes = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);

    for (let index = 0; index < candidateFiles.length; index += 1) {
      addMatch({
        file: candidateFiles[index],
        scene: scopedScenes[index],
        reason: "latest_selected",
        matches,
        unmatchedFiles,
        usedSceneIds,
        overwrite,
      });
    }
  } else {
    for (const file of candidateFiles) {
      const exactScene = scenesByFileName.get(file.fileName.toLowerCase());

      if (exactScene) {
        addMatch({
          file,
          scene: exactScene,
          reason: "exact_filename",
          matches,
          unmatchedFiles,
          usedSceneIds,
          overwrite,
        });
        continue;
      }

      const fallbackOrder = sceneOrderFromFileName(file.fileName);
      const fallbackScene =
        fallbackOrder === null ? null : scenesByOrder.get(fallbackOrder) ?? null;

      if (fallbackScene) {
        addMatch({
          file,
          scene: fallbackScene,
          reason: "explicit_scene_number",
          matches,
          unmatchedFiles,
          usedSceneIds,
          overwrite,
        });
        continue;
      }

      if (matchMode === "smart" && hasExplicitScope) {
        const nextScene = scenes.find((scene) => !usedSceneIds.has(scene.id));

        if (addMatch({
          file,
          scene: nextScene,
          reason: "scoped_order",
          matches,
          unmatchedFiles,
          usedSceneIds,
          overwrite,
        })) {
          continue;
        }

        unmatchedFiles.push({ fileName: file.fileName, reason: "scope_exhausted" });
        continue;
      }

      unmatchedFiles.push({
        fileName: file.fileName,
        reason:
          matchMode === "strict"
            ? "strict_mode_no_match"
            : "whole_video_ordered_fallback_requires_explicit_scope",
      });
    }
  }

  if (!dryRun) {
    await mkdir(outputFolder, { recursive: true });
  }

  for (const match of matches) {
    const file = candidateFiles.find((candidate) => candidate.fileName === match.fileName);
    const scene = scenes.find((candidate) => candidate.id === match.sceneId);

    if (!file || !scene || dryRun) {
      continue;
    }

    const targetFileName = match.targetFileName;
    const targetPath = path.join(outputFolder, targetFileName);

    try {
      await copyFile(file.fullPath, targetPath);
      await removePreviousGeneratedImage(scene.imageLocalPath, targetPath);
      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          imageLocalPath: path.relative(process.cwd(), targetPath),
          imageUrl: localImageUrl(videoId, targetFileName),
          imageStatus: "attached",
          imageError: null,
          imageFileName: targetFileName,
          status: "asset_ready",
        },
      });
    } catch {
      failed += 1;
    }
  }

  if (batchId && !dryRun) {
    await prisma.imageBatch.update({
      where: { id: batchId },
      data: {
        status:
          failed > 0
            ? "failed"
            : matches.length === 0
              ? "failed"
              : matches.length < scenes.length
                ? "partial"
                : "imported",
      },
    });
  }

  return {
    matched: matches.length,
    unmatched: unmatchedFiles.length,
    overwritten: matches.filter((match) => match.willOverwrite).length,
    failed,
    scanned: files.length,
    candidateFiles: candidateFiles.length,
    matches,
    unmatchedFiles,
  };
}
