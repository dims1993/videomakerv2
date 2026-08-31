/**
 * Persist narration block manifest on disk (no DB migration).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ensureNarrationBlocksDir,
  type NarrationBlockRecord,
} from "@/lib/voiceover-blocks";

export type NarrationManifest = {
  videoId: string;
  generatedAt: string;
  blocks: NarrationBlockRecord[];
};

export function narrationManifestPath(videoId: string) {
  return path.join(
    process.cwd(),
    "storage",
    "voiceovers",
    videoId,
    "blocks",
    "manifest.json",
  );
}

export async function writeNarrationManifest(
  videoId: string,
  blocks: NarrationBlockRecord[],
): Promise<NarrationManifest> {
  await ensureNarrationBlocksDir(videoId);
  const manifest: NarrationManifest = {
    videoId,
    generatedAt: new Date().toISOString(),
    blocks,
  };
  await writeFile(
    narrationManifestPath(videoId),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export async function readNarrationManifest(
  videoId: string,
): Promise<NarrationManifest | null> {
  try {
    const raw = await readFile(narrationManifestPath(videoId), "utf8");
    const parsed = JSON.parse(raw) as NarrationManifest;
    if (!parsed || parsed.videoId !== videoId || !Array.isArray(parsed.blocks)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Replace blocks that touch any of the new block's scenes; keep unrelated blocks. */
export function mergeNarrationBlockRecords(
  existing: NarrationBlockRecord[],
  incoming: NarrationBlockRecord[],
): NarrationBlockRecord[] {
  if (incoming.length === 0) {
    return existing;
  }
  const touchedSceneIds = new Set(
    incoming.flatMap((block) => block.sceneIds),
  );
  const kept = existing.filter(
    (block) => !block.sceneIds.some((sceneId) => touchedSceneIds.has(sceneId)),
  );
  return [...kept, ...incoming].sort((a, b) => a.index - b.index);
}

export async function writeNarrationManifestMerged(
  videoId: string,
  incoming: NarrationBlockRecord[],
): Promise<NarrationManifest> {
  const existing = await readNarrationManifest(videoId);
  const blocks = mergeNarrationBlockRecords(existing?.blocks ?? [], incoming);
  return writeNarrationManifest(videoId, blocks);
}
