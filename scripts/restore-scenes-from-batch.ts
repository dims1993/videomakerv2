/**
 * Restore Scene rows wiped by pipeline restart → visual_plan.
 * Rebuilds from the latest image-batch payload + voiceover segments,
 * and extracts stills from render scene-segments when images were deleted.
 *
 *   npx tsx scripts/restore-scenes-from-batch.ts [videoId] [batchJsonPath?]
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { getComputedVideoStatus } from "../src/lib/status";

const VIDEO_ID = process.argv[2] || "cmszscjhp02f1nu8z78uj77gh";
const BATCH_PATH_ARG = process.argv[3];

type BatchItem = {
  sceneId: string;
  sceneOrder: number | string;
  fileName: string;
  imagePrompt: string;
  scriptText: string;
  sceneType: string;
};

type BatchPayload = {
  batchId: string;
  videoId: string;
  items: BatchItem[];
};

function parseNarrativeMeaning(prompt: string): string | null {
  const match = prompt.match(
    /Narrative meaning:\s*\n?"([\s\S]*?)"\s*\n\s*Create:/i,
  );
  return match?.[1]?.trim() || null;
}

function findLatestBatchPath(videoId: string): string {
  if (BATCH_PATH_ARG) {
    return path.resolve(BATCH_PATH_ARG);
  }
  const dir = path.join(process.cwd(), "storage", "batches");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  let best: { mtime: number; file: string; count: number } | null = null;
  for (const file of files) {
    const absolute = path.join(dir, file);
    try {
      const payload = JSON.parse(readFileSync(absolute, "utf8")) as BatchPayload;
      if (payload.videoId !== videoId) continue;
      const count = payload.items?.length ?? 0;
      if (count < 1) continue;
      const mtime = statSync(absolute).mtimeMs;
      if (
        !best ||
        count > best.count ||
        (count === best.count && mtime > best.mtime)
      ) {
        best = { mtime, file: absolute, count };
      }
    } catch {
      // skip
    }
  }
  if (!best) {
    throw new Error(`No batch payload found for video ${videoId}`);
  }
  return best.file;
}

function extractFrame(segmentPath: string, outPng: string) {
  execFileSync(
    "ffmpeg",
    ["-y", "-ss", "0.05", "-i", segmentPath, "-frames:v", "1", "-q:v", "2", outPng],
    { stdio: "ignore" },
  );
}

async function main() {
  const prisma = new PrismaClient();
  const batchPath = findLatestBatchPath(VIDEO_ID);
  const payload = JSON.parse(readFileSync(batchPath, "utf8")) as BatchPayload;

  if (payload.videoId !== VIDEO_ID) {
    throw new Error(`Batch videoId mismatch: ${payload.videoId}`);
  }

  const existing = await prisma.scene.count({ where: { videoId: VIDEO_ID } });
  if (existing > 0) {
    throw new Error(
      `Video already has ${existing} scenes. Refusing to restore over existing rows.`,
    );
  }

  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: {
      id: true,
      title: true,
      ideaJson: true,
      script: true,
      metadataJson: true,
    },
  });
  if (!video) throw new Error(`Video not found: ${VIDEO_ID}`);

  const voiceovers = await prisma.voiceoverSegment.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { index: "asc" },
  });
  const voByOrder = new Map(
    voiceovers.map((segment) => [segment.sceneStartOrder, segment]),
  );

  const imagesDir = path.join(
    process.cwd(),
    "storage",
    "generated-images",
    "why-real-wealth-looks-completely-boring-invisible-images",
  );
  mkdirSync(imagesDir, { recursive: true });

  const segmentsDir = path.join(
    process.cwd(),
    "storage",
    "renders",
    VIDEO_ID,
    "scene-segments",
  );

  const items = [...payload.items].sort(
    (a, b) => Number(a.sceneOrder) - Number(b.sceneOrder),
  );

  console.log("[restore]", {
    videoId: VIDEO_ID,
    title: video.title,
    batchPath,
    batchId: payload.batchId,
    scenes: items.length,
    voiceovers: voiceovers.length,
  });

  let framesOk = 0;
  let framesFail = 0;
  const creates = [];

  for (const item of items) {
    const order = Number(item.sceneOrder);
    const vo = voByOrder.get(order);
    const fileName = item.fileName?.trim() || `scene_${item.sceneId}.png`;
    const imageLocalPath = path.join(imagesDir, fileName);
    const segmentPath = path.join(
      segmentsDir,
      `scene_${String(order).padStart(4, "0")}.mp4`,
    );

    let imageStatus = "pending";
    let imageFileName: string | null = null;
    let resolvedImagePath: string | null = null;

    if (existsSync(imageLocalPath)) {
      imageStatus = "ready";
      imageFileName = fileName;
      resolvedImagePath = imageLocalPath;
      framesOk += 1;
    } else if (existsSync(segmentPath)) {
      try {
        extractFrame(segmentPath, imageLocalPath);
        imageStatus = "ready";
        imageFileName = fileName;
        resolvedImagePath = imageLocalPath;
        framesOk += 1;
      } catch {
        framesFail += 1;
      }
    }

    const durationSec = vo?.durationSec ?? null;
    const duration =
      durationSec != null && Number.isFinite(durationSec)
        ? Math.max(1, Math.round(durationSec))
        : null;

    const voiceoverRel = vo?.audioPath?.replace(/\\/g, "/").trim() || null;
    const voiceoverLocalPath =
      voiceoverRel &&
      (path.isAbsolute(voiceoverRel)
        ? voiceoverRel
        : path.join(process.cwd(), voiceoverRel));
    const voiceoverExists = Boolean(
      voiceoverLocalPath && existsSync(voiceoverLocalPath),
    );
    const voiceoverStoredPath = voiceoverExists
      ? path.isAbsolute(voiceoverRel!)
        ? path.relative(process.cwd(), voiceoverRel!).replace(/\\/g, "/")
        : voiceoverRel
      : null;

    creates.push({
      id: item.sceneId,
      videoId: VIDEO_ID,
      sortOrder: order,
      scriptText: item.scriptText,
      sceneType: item.sceneType || "avatar",
      visualPurpose: null,
      visualIdea: parseNarrativeMeaning(item.imagePrompt),
      imagePrompt: item.imagePrompt,
      duration,
      imageUrl: null,
      imageStatus,
      imageLocalPath: resolvedImagePath,
      imageError: null,
      imageBatchId: payload.batchId,
      imageFileName,
      clipLocalPath: null,
      clipFileName: null,
      clipMuted: true,
      voiceoverStatus: voiceoverExists ? "generated" : "pending",
      voiceoverLocalPath: voiceoverStoredPath,
      voiceoverFileName: voiceoverExists ? vo?.fileName ?? null : null,
      voiceoverDuration: voiceoverExists ? vo?.durationSec ?? null : null,
      voiceoverError: null,
      voiceoverProvider: voiceoverExists ? vo?.provider ?? null : null,
      pauseAfterMs: 0,
      status: imageStatus === "ready" ? "asset_ready" : "asset_needed",
    });
  }

  const masterVo = path.join(
    process.cwd(),
    "storage",
    "voiceovers",
    VIDEO_ID,
    "voiceover_by_scene_master.wav",
  );
  const assPath = path.join(
    process.cwd(),
    "storage",
    "renders",
    VIDEO_ID,
    "draft_subtitles.ass",
  );
  const assText = existsSync(assPath) ? readFileSync(assPath, "utf8") : null;

  await prisma.$transaction(async (tx) => {
    await tx.scene.createMany({ data: creates });

    const scenes = await tx.scene.findMany({
      where: { videoId: VIDEO_ID },
      select: { imagePrompt: true, status: true },
    });
    const computed = getComputedVideoStatus({
      ideaJson: video.ideaJson,
      script: video.script,
      metadataJson: video.metadataJson,
      scenes,
    });

    await tx.video.update({
      where: { id: VIDEO_ID },
      data: {
        status: computed,
        voiceoverStatus: existsSync(masterVo) ? "generated" : "needs_update",
        voiceoverAudioPath: existsSync(masterVo) ? masterVo : null,
        voiceoverFileName: existsSync(masterVo)
          ? "voiceover_by_scene_master.wav"
          : null,
        voiceoverDurationSec: null,
        subtitleStatus: assText ? "ready" : "needs_update",
        styledSubtitleAss: assText,
        renderDraftStatus: "pending",
      },
    });

    await tx.pipelineQueueItem.updateMany({
      where: { videoId: VIDEO_ID },
      data: {
        currentStep: "assets",
        status: "paused",
        enabled: false,
        errorMessage: null,
        finishedAt: null,
      },
    });
  });

  const finalCount = await prisma.scene.count({ where: { videoId: VIDEO_ID } });
  const ready = await prisma.scene.count({
    where: { videoId: VIDEO_ID, imageStatus: "ready" },
  });
  const withVo = await prisma.scene.count({
    where: { videoId: VIDEO_ID, voiceoverStatus: "generated" },
  });

  console.log("[restore] done", {
    scenes: finalCount,
    imagesReady: ready,
    framesFail,
    voiceoversLinked: withVo,
    batchId: payload.batchId,
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
