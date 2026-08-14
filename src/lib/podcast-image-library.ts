import { access, copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  inferPodcastImagePromptRole,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import {
  isPodcastFlowOnlyScene,
  isPodcastSectionClipScene,
  libraryTagForRole,
  PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
  type PodcastImageLibraryTag,
} from "@/lib/podcast-image-library-shared";
import {
  generatedImagesDir,
  localImageUrl,
  stableSceneImageFileName,
} from "@/lib/image-batches";
import {
  resolveImageOutputFolderAbsolute,
} from "@/lib/image-output-folder";
import { resolvePipelineSettings } from "@/lib/pipeline-settings";
import { prisma } from "@/lib/prisma";

export {
  isPodcastFlowOnlyScene,
  isPodcastSectionClipScene,
  libraryTagForRole,
  PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
  type PodcastImageLibraryTag,
} from "@/lib/podcast-image-library-shared";

export const PODCAST_IMAGE_LIBRARY_RELATIVE_DIR = path.join(
  "data",
  "image-library",
  "podcast-english-lessons",
);

export type PodcastImageLibraryAsset = {
  id: string;
  tag: PodcastImageLibraryTag;
  /** Relative to process.cwd() */
  relativePath: string;
  fileName: string;
  /**
   * Setting / location pool. Root files under emma|leo|music use "default".
   * Subfolder `emma/shopping-mall/*.png` → scenario "shopping-mall".
   */
  scenario?: string;
  sourceSceneOrder?: number;
  sourceVideoId?: string;
};

export type PodcastImageLibraryManifest = {
  version: 1;
  channelKey: typeof PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;
  updatedAt: string;
  assets: PodcastImageLibraryAsset[];
};

/** Special scenario keys for assign / UI. */
export const PODCAST_LIBRARY_SCENARIO_ALL = "all";
export const PODCAST_LIBRARY_SCENARIO_DEFAULT = "default";

export type PodcastLibraryAssignOptions = {
  /** Do not reuse the same asset within this many preceding scenes (default 3). */
  minGap?: number;
  /** Re-assign scenes that already have an attached image. */
  overwrite?: boolean;
  sceneIds?: string[];
  seed?: number;
  /**
   * Restrict pools to one scenario:
   * - "all" / omitted → every asset (legacy behavior)
   * - "default" → only root emma|leo|music files
   * - "shopping-mall" → only that scenario subfolder
   */
  scenario?: string | null;
};

export type PodcastLibraryAssignResult = {
  assigned: number;
  skippedFlowOnly: number;
  skippedAlreadyAttached: number;
  skippedNoPool: number;
  skippedUnknownRole: number;
  prunedMissingAssets: number;
  libraryCounts: Record<PodcastImageLibraryTag, number>;
  scenario: string;
  scenarioCounts: Record<PodcastImageLibraryTag, number>;
};

export type PodcastLibraryScenarioSummary = {
  id: string;
  label: string;
  total: number;
  counts: Record<PodcastImageLibraryTag, number>;
};

const MANIFEST_FILE = "manifest.json";
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp)$/i;
const SCENARIO_FOLDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function podcastImageLibraryRootDir() {
  return path.join(process.cwd(), PODCAST_IMAGE_LIBRARY_RELATIVE_DIR);
}

export function podcastImageLibraryManifestPath() {
  return path.join(podcastImageLibraryRootDir(), MANIFEST_FILE);
}

export function podcastImageLibraryTagDir(tag: PodcastImageLibraryTag) {
  return path.join(podcastImageLibraryRootDir(), tag);
}

export function podcastImageLibraryScenarioDir(
  tag: PodcastImageLibraryTag,
  scenario: string,
) {
  const normalized = normalizePodcastLibraryScenarioId(scenario);
  if (!normalized || normalized === PODCAST_LIBRARY_SCENARIO_DEFAULT) {
    return podcastImageLibraryTagDir(tag);
  }
  return path.join(podcastImageLibraryTagDir(tag), normalized);
}

function emptyCounts(): Record<PodcastImageLibraryTag, number> {
  return { emma: 0, leo: 0, music: 0 };
}

export function normalizePodcastLibraryScenarioId(
  value: string | null | undefined,
): string | null {
  const trimmed = (value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!trimmed || trimmed === PODCAST_LIBRARY_SCENARIO_ALL) {
    return null;
  }
  if (trimmed === PODCAST_LIBRARY_SCENARIO_DEFAULT) {
    return PODCAST_LIBRARY_SCENARIO_DEFAULT;
  }
  if (!SCENARIO_FOLDER_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function scenarioLabelFromId(scenarioId: string) {
  if (scenarioId === PODCAST_LIBRARY_SCENARIO_ALL) {
    return "All scenarios";
  }
  if (scenarioId === PODCAST_LIBRARY_SCENARIO_DEFAULT) {
    return "Default (root pool)";
  }
  return scenarioId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function assetScenarioId(
  asset: Pick<PodcastImageLibraryAsset, "scenario">,
) {
  const normalized = normalizePodcastLibraryScenarioId(asset.scenario);
  return normalized ?? PODCAST_LIBRARY_SCENARIO_DEFAULT;
}

export function filterLibraryAssetsByScenario(
  assets: PodcastImageLibraryAsset[],
  scenario: string | null | undefined,
): PodcastImageLibraryAsset[] {
  const normalized = normalizePodcastLibraryScenarioId(scenario);
  if (!normalized) {
    return assets;
  }
  return assets.filter((asset) => assetScenarioId(asset) === normalized);
}

export async function loadPodcastImageLibrary(): Promise<PodcastImageLibraryManifest> {
  try {
    const raw = await readFile(podcastImageLibraryManifestPath(), "utf8");
    const parsed = JSON.parse(raw) as PodcastImageLibraryManifest;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.assets) ||
      parsed.channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY
    ) {
      return {
        version: 1,
        channelKey: PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
        updatedAt: new Date(0).toISOString(),
        assets: [],
      };
    }
    return parsed;
  } catch {
    return {
      version: 1,
      channelKey: PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
      updatedAt: new Date(0).toISOString(),
      assets: [],
    };
  }
}

export async function savePodcastImageLibrary(
  manifest: PodcastImageLibraryManifest,
) {
  await mkdir(podcastImageLibraryRootDir(), { recursive: true });
  for (const tag of ["emma", "leo", "music"] as const) {
    await mkdir(podcastImageLibraryTagDir(tag), { recursive: true });
  }
  await writeFile(
    podcastImageLibraryManifestPath(),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

export function summarizePodcastImageLibrary(
  manifest: PodcastImageLibraryManifest,
) {
  const counts = emptyCounts();
  const scenarioMap = new Map<string, PodcastLibraryScenarioSummary>();

  for (const asset of manifest.assets) {
    counts[asset.tag] += 1;
    const scenarioId = assetScenarioId(asset);
    const existing = scenarioMap.get(scenarioId) ?? {
      id: scenarioId,
      label: scenarioLabelFromId(scenarioId),
      total: 0,
      counts: emptyCounts(),
    };
    existing.total += 1;
    existing.counts[asset.tag] += 1;
    scenarioMap.set(scenarioId, existing);
  }

  const scenarios = [...scenarioMap.values()].sort((a, b) => {
    if (a.id === PODCAST_LIBRARY_SCENARIO_DEFAULT) return -1;
    if (b.id === PODCAST_LIBRARY_SCENARIO_DEFAULT) return 1;
    return a.label.localeCompare(b.label);
  });

  return {
    total: manifest.assets.length,
    counts,
    scenarios,
  };
}

/**
 * Drop deleted files from the manifest and pick up any new files on disk.
 * Call this after manually curating the library folders.
 *
 * Layout:
 * - `emma/*.png` → scenario "default"
 * - `emma/shopping-mall/*.png` → scenario "shopping-mall"
 * (same for leo / music)
 */
export async function syncPodcastImageLibraryManifest() {
  await mkdir(podcastImageLibraryRootDir(), { recursive: true });
  const previous = await loadPodcastImageLibrary();
  const byPath = new Map(
    previous.assets.map((asset) => [asset.relativePath, asset]),
  );
  const assets: PodcastImageLibraryAsset[] = [];
  let added = 0;

  async function collectTagFiles(
    tag: PodcastImageLibraryTag,
    scenario: string,
    absoluteDir: string,
    relativeDir: string,
  ) {
    await mkdir(absoluteDir, { recursive: true });
    let names: string[] = [];
    try {
      names = await readdir(absoluteDir);
    } catch {
      return;
    }

    for (const entry of names) {
      if (entry.startsWith(".")) {
        continue;
      }
      const absoluteEntry = path.join(absoluteDir, entry);
      const relativeEntry = path.join(relativeDir, entry);

      if (IMAGE_FILE_PATTERN.test(entry)) {
        const existing = byPath.get(relativeEntry);
        if (existing) {
          assets.push({
            ...existing,
            tag,
            scenario,
            relativePath: relativeEntry,
            fileName: entry,
          });
          continue;
        }
        added += 1;
        assets.push({
          id: `${tag}-${scenario}-${entry.replace(IMAGE_FILE_PATTERN, "")}`,
          tag,
          scenario,
          relativePath: relativeEntry,
          fileName: entry,
        });
        continue;
      }

      // One level of scenario subfolders under the tag root only.
      if (scenario !== PODCAST_LIBRARY_SCENARIO_DEFAULT) {
        continue;
      }
      const scenarioId = normalizePodcastLibraryScenarioId(entry);
      if (!scenarioId || scenarioId === PODCAST_LIBRARY_SCENARIO_DEFAULT) {
        continue;
      }
      try {
        const info = await stat(absoluteEntry);
        if (!info.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      await collectTagFiles(tag, scenarioId, absoluteEntry, relativeEntry);
    }
  }

  for (const tag of ["emma", "leo", "music"] as const) {
    await collectTagFiles(
      tag,
      PODCAST_LIBRARY_SCENARIO_DEFAULT,
      podcastImageLibraryTagDir(tag),
      path.join(PODCAST_IMAGE_LIBRARY_RELATIVE_DIR, tag),
    );
  }

  const keepPaths = new Set(assets.map((asset) => asset.relativePath));
  const removed = previous.assets.filter(
    (asset) => !keepPaths.has(asset.relativePath),
  ).length;

  const manifest: PodcastImageLibraryManifest = {
    version: 1,
    channelKey: PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
    updatedAt: new Date().toISOString(),
    assets,
  };
  await savePodcastImageLibrary(manifest);

  return {
    total: assets.length,
    removed,
    added,
    counts: summarizePodcastImageLibrary(manifest).counts,
    scenarios: summarizePodcastImageLibrary(manifest).scenarios,
    manifest,
  };
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickLibraryAsset(options: {
  pool: PodcastImageLibraryAsset[];
  recentIds: string[];
  minGap: number;
  random: () => number;
}): PodcastImageLibraryAsset | null {
  const { pool, recentIds, minGap, random } = options;
  if (pool.length === 0) {
    return null;
  }
  const blocked = new Set(recentIds.slice(-Math.max(0, minGap - 1)));
  const eligible = pool.filter((asset) => !blocked.has(asset.id));
  const choices = eligible.length > 0 ? eligible : pool;
  const index = Math.floor(random() * choices.length);
  return choices[index] ?? null;
}

/**
 * Import curated scene images into the channel library (copy + manifest).
 * Default: source scenes with sortOrder 1..maxOrder that still have files.
 */
export async function importPodcastImageLibraryFromVideo(options: {
  videoId: string;
  maxOrder?: number;
  /** Also pull every MUSIC_BED image beyond maxOrder (music pool is usually thin). */
  includeExtraMusicBeds?: boolean;
}) {
  const maxOrder = options.maxOrder ?? 150;
  const includeExtraMusicBeds = options.includeExtraMusicBeds !== false;

  const video = await prisma.video.findUnique({
    where: { id: options.videoId },
    select: { id: true, channelKey: true, title: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  if (video.channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    throw new Error("Image library import is only for podcast-english-lessons.");
  }

  const settings = await resolvePipelineSettings(video.id);
  const customOutput = resolveImageOutputFolderAbsolute(
    settings.assets.imageOutputFolder,
    video.id,
    video.title,
  );

  const scenes = await prisma.scene.findMany({
    where: { videoId: options.videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      visualIdea: true,
      scriptText: true,
      sceneType: true,
      imageLocalPath: true,
      imageFileName: true,
    },
  });

  const selected = scenes.filter((scene) => {
    if (scene.sortOrder <= maxOrder) {
      return true;
    }
    if (!includeExtraMusicBeds) {
      return false;
    }
    const role = inferPodcastImagePromptRole(scene);
    return role === "music";
  });

  await mkdir(podcastImageLibraryRootDir(), { recursive: true });
  for (const tag of ["emma", "leo", "music"] as const) {
    await mkdir(podcastImageLibraryTagDir(tag), { recursive: true });
  }

  const videoImageDirs = [
    customOutput,
    generatedImagesDir(video.id, video.title),
    generatedImagesDir(video.id),
  ];

  async function resolveSourceAbs(scene: {
    imageLocalPath: string | null;
    imageFileName: string | null;
  }): Promise<string | null> {
    const candidates: string[] = [];
    if (scene.imageLocalPath?.trim()) {
      candidates.push(path.resolve(process.cwd(), scene.imageLocalPath.trim()));
    }
    if (scene.imageFileName?.trim()) {
      for (const dir of videoImageDirs) {
        candidates.push(path.join(dir, scene.imageFileName.trim()));
      }
    }
    for (const candidate of candidates) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // try next
      }
    }
    return null;
  }

  const assets: PodcastImageLibraryAsset[] = [];
  const skipped: Array<{ order: number; reason: string }> = [];

  for (const scene of selected) {
    if (isPodcastFlowOnlyScene(scene) || isPodcastSectionClipScene(scene)) {
      skipped.push({
        order: scene.sortOrder,
        reason: isPodcastSectionClipScene(scene)
          ? "section video clip"
          : "flow-only cover",
      });
      continue;
    }
    const role = inferPodcastImagePromptRole(scene);
    const tag = libraryTagForRole(role);
    if (!tag) {
      skipped.push({ order: scene.sortOrder, reason: `role=${role}` });
      continue;
    }

    const sourceAbs = await resolveSourceAbs(scene);
    if (!sourceAbs) {
      skipped.push({ order: scene.sortOrder, reason: "file not found on disk" });
      continue;
    }

    const ext = path.extname(sourceAbs) || ".png";
    const fileName = `${tag}-${String(scene.sortOrder).padStart(3, "0")}-${scene.id.slice(-8)}${ext}`;
    const destAbs = path.join(podcastImageLibraryTagDir(tag), fileName);
    const relativePath = path.join(
      PODCAST_IMAGE_LIBRARY_RELATIVE_DIR,
      tag,
      fileName,
    );

    try {
      await copyFile(sourceAbs, destAbs);
    } catch {
      skipped.push({ order: scene.sortOrder, reason: "copy failed" });
      continue;
    }

    assets.push({
      id: `${tag}-${scene.sortOrder}-${scene.id.slice(-8)}`,
      tag,
      scenario: PODCAST_LIBRARY_SCENARIO_DEFAULT,
      relativePath,
      fileName,
      sourceSceneOrder: scene.sortOrder,
      sourceVideoId: options.videoId,
    });
  }

  const manifest: PodcastImageLibraryManifest = {
    version: 1,
    channelKey: PODCAST_ENGLISH_LESSONS_CHANNEL_KEY,
    updatedAt: new Date().toISOString(),
    assets,
  };
  await savePodcastImageLibrary(manifest);

  return {
    imported: assets.length,
    skipped: skipped.length,
    skippedDetails: skipped.slice(0, 40),
    counts: summarizePodcastImageLibrary(manifest).counts,
    manifestPath: podcastImageLibraryManifestPath(),
  };
}

/**
 * Assign library stills to podcast scenes (shared imageLocalPath, unique imageFileName).
 * Leaves PART / episode covers untouched for Google Flow.
 */
export async function assignPodcastImageLibraryToVideo(
  videoId: string,
  options: PodcastLibraryAssignOptions = {},
): Promise<PodcastLibraryAssignResult> {
  const minGap = Math.max(1, options.minGap ?? 3);
  const overwrite = Boolean(options.overwrite);
  const random = mulberry32(options.seed ?? Date.now() % 1_000_000_000);
  const scenarioKey =
    normalizePodcastLibraryScenarioId(options.scenario) ??
    PODCAST_LIBRARY_SCENARIO_ALL;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, channelKey: true },
  });
  if (!video) {
    throw new Error("Video not found.");
  }
  if (video.channelKey !== PODCAST_ENGLISH_LESSONS_CHANNEL_KEY) {
    throw new Error("Library assign is only for podcast-english-lessons.");
  }

  // Always sync first so deleted curated files are not reassigned.
  const synced = await syncPodcastImageLibraryManifest();
  const manifest = synced.manifest;
  const scopedAssets = filterLibraryAssetsByScenario(
    manifest.assets,
    scenarioKey === PODCAST_LIBRARY_SCENARIO_ALL ? null : scenarioKey,
  );
  const pools: Record<PodcastImageLibraryTag, PodcastImageLibraryAsset[]> = {
    emma: scopedAssets.filter((asset) => asset.tag === "emma"),
    leo: scopedAssets.filter((asset) => asset.tag === "leo"),
    music: scopedAssets.filter((asset) => asset.tag === "music"),
  };
  const fullCounts = summarizePodcastImageLibrary(manifest).counts;
  const scenarioCounts = {
    emma: pools.emma.length,
    leo: pools.leo.length,
    music: pools.music.length,
  };

  const scenes = await prisma.scene.findMany({
    where: {
      videoId,
      ...(options.sceneIds?.length ? { id: { in: options.sceneIds } } : {}),
    },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      visualIdea: true,
      scriptText: true,
      sceneType: true,
      imageLocalPath: true,
      imageUrl: true,
      imageStatus: true,
    },
  });

  let assigned = 0;
  let skippedFlowOnly = 0;
  let skippedAlreadyAttached = 0;
  let skippedNoPool = 0;
  let skippedUnknownRole = 0;
  const recentByTag: Record<PodcastImageLibraryTag, string[]> = {
    emma: [],
    leo: [],
    music: [],
  };

  for (const scene of scenes) {
    if (isPodcastFlowOnlyScene(scene) || isPodcastSectionClipScene(scene)) {
      skippedFlowOnly += 1;
      continue;
    }

    const alreadyAttached = Boolean(
      scene.imageLocalPath?.trim() || scene.imageUrl?.trim(),
    );
    if (alreadyAttached && !overwrite) {
      skippedAlreadyAttached += 1;
      // Still track recent for gap continuity when not overwriting.
      const role = inferPodcastImagePromptRole(scene);
      const tag = libraryTagForRole(role);
      if (tag && scene.imageLocalPath) {
        const existing = pools[tag].find(
          (asset) => asset.relativePath === scene.imageLocalPath,
        );
        if (existing) {
          recentByTag[tag].push(existing.id);
        }
      }
      continue;
    }

    const role = inferPodcastImagePromptRole(scene);
    const tag = libraryTagForRole(role);
    if (!tag) {
      skippedUnknownRole += 1;
      continue;
    }

    const asset = pickLibraryAsset({
      pool: pools[tag],
      recentIds: recentByTag[tag],
      minGap,
      random,
    });
    if (!asset) {
      skippedNoPool += 1;
      continue;
    }

    const fileName = stableSceneImageFileName(scene.id, path.extname(asset.fileName) || ".png");
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        imageLocalPath: asset.relativePath,
        imageFileName: fileName,
        imageUrl: localImageUrl(videoId, fileName),
        imageStatus: "attached",
        imageError: null,
        imageBatchId: null,
        status: "planned",
      },
    });

    recentByTag[tag].push(asset.id);
    assigned += 1;
  }

  return {
    assigned,
    skippedFlowOnly,
    skippedAlreadyAttached,
    skippedNoPool,
    skippedUnknownRole,
    prunedMissingAssets: synced.removed,
    libraryCounts: fullCounts,
    scenario: scenarioKey,
    scenarioCounts,
  };
}
