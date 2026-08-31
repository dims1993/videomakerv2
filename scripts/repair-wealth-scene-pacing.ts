/**
 * Repair Wealth Insights scene pacing in place:
 * rebuild beats from the local skeleton (hook ≤5.5s, body ≤8s),
 * inherit visuals/images/VO from overlapping old scenes when possible.
 *
 *   npx tsx scripts/repair-wealth-scene-pacing.ts [videoId]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";

import { getComputedVideoStatus } from "../src/lib/status";
import { normalizeForScriptCoverage } from "../src/lib/visual-plan-script";
import {
  buildWealthInsightsVisualPlanSkeleton,
  assertWealthSkeletonCoverage,
} from "../src/lib/wealth-insights-visual-skeleton";
import { spokenWealthScript } from "../src/lib/wealth-insights-visual-sections";

for (const file of [".env", ".env.local"]) {
  try {
    const raw = readFileSync(path.join(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]!]) continue;
      let value = match[2] ?? "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]!] = value;
    }
  } catch {
    // ignore
  }
}

const VIDEO_ID = process.argv[2] || "cmszscjhp02f1nu8z78uj77gh";
const prisma = new PrismaClient();

type OldScene = Awaited<
  ReturnType<typeof prisma.scene.findMany>
>[number];

type Span = { start: number; end: number; scene: OldScene };

function buildSpans(fullNorm: string, texts: string[], scenes: OldScene[]) {
  const spans: Span[] = [];
  let searchFrom = 0;
  for (let i = 0; i < texts.length; i += 1) {
    const scene = scenes[i]!;
    const pieceNorm = normalizeForScriptCoverage(texts[i] || "");
    if (!pieceNorm) {
      spans.push({ start: searchFrom, end: searchFrom, scene });
      continue;
    }
    let idx = fullNorm.indexOf(pieceNorm, searchFrom);
    if (idx < 0) {
      idx = fullNorm.indexOf(pieceNorm);
    }
    if (idx < 0) {
      spans.push({
        start: searchFrom,
        end: searchFrom + pieceNorm.length,
        scene,
      });
      searchFrom += pieceNorm.length;
      continue;
    }
    spans.push({ start: idx, end: idx + pieceNorm.length, scene });
    searchFrom = idx + pieceNorm.length;
  }
  return spans;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

async function main() {
  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: {
      id: true,
      title: true,
      script: true,
      channelKey: true,
      ideaJson: true,
      metadataJson: true,
      status: true,
    },
  });
  if (!video) {
    throw new Error(`Video not found: ${VIDEO_ID}`);
  }
  if (video.channelKey !== "wealth-insights") {
    throw new Error(
      `Expected wealth-insights, got ${video.channelKey}. Refusing to run.`,
    );
  }
  if (!video.script?.trim()) {
    throw new Error("Video has no script.");
  }

  const oldScenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { sortOrder: "asc" },
  });

  const skeleton = buildWealthInsightsVisualPlanSkeleton(video.script);
  const coverage = assertWealthSkeletonCoverage(video.script, skeleton.scenes);
  if (!coverage.ok) {
    throw new Error(
      `Skeleton coverage failed: expected=${coverage.expectedChars} actual=${coverage.actualChars}`,
    );
  }

  const fullNorm = normalizeForScriptCoverage(spokenWealthScript(video.script));
  const oldSpans = buildSpans(
    fullNorm,
    oldScenes.map((s) => s.scriptText || ""),
    oldScenes,
  );
  const newSpans = buildSpans(
    fullNorm,
    skeleton.scenes.map((s) => s.scriptText),
    // placeholder — only need offsets; reuse oldScenes[0] typed dummy via cast
    skeleton.scenes.map((_, i) => oldScenes[Math.min(i, oldScenes.length - 1)]!),
  );

  type Inherit = {
    scene: OldScene;
    overlap: number;
    exactText: boolean;
  };

  const inherits: Inherit[] = skeleton.scenes.map((beat, index) => {
    const span = newSpans[index]!;
    let best: Inherit | null = null;
    for (const old of oldSpans) {
      const ov = overlap(span.start, span.end, old.start, old.end);
      if (ov <= 0) continue;
      const exactText =
        normalizeForScriptCoverage(beat.scriptText) ===
        normalizeForScriptCoverage(old.scene.scriptText || "");
      if (
        !best ||
        ov > best.overlap ||
        (ov === best.overlap && exactText && !best.exactText)
      ) {
        best = { scene: old.scene, overlap: ov, exactText };
      }
    }
    if (!best) {
      // Fallback: nearest old by order ratio
      const ratio =
        oldScenes.length <= 1
          ? 0
          : Math.round(
              (index / Math.max(1, skeleton.scenes.length - 1)) *
                (oldScenes.length - 1),
            );
      return {
        scene: oldScenes[ratio]!,
        overlap: 0,
        exactText: false,
      };
    }
    return best;
  });

  // One old scene may feed many new beats — only the best-overlap child keeps
  // binary assets (image file / voiceover file).
  const assetWinnerByOldId = new Map<string, number>();
  inherits.forEach((inh, index) => {
    const prev = assetWinnerByOldId.get(inh.scene.id);
    if (prev == null) {
      assetWinnerByOldId.set(inh.scene.id, index);
      return;
    }
    const prevInh = inherits[prev]!;
    if (inh.overlap > prevInh.overlap) {
      assetWinnerByOldId.set(inh.scene.id, index);
    } else if (inh.overlap === prevInh.overlap && inh.exactText && !prevInh.exactText) {
      assetWinnerByOldId.set(inh.scene.id, index);
    }
  });

  let keptExact = 0;
  let keptVisualOnly = 0;
  let fresh = 0;
  let clearedVo = 0;
  let clearedImageFile = 0;

  const creates = skeleton.scenes.map((beat, index) => {
    const inh = inherits[index]!;
    const old = inh.scene;
    const isWinner = assetWinnerByOldId.get(old.id) === index;
    const exact = inh.exactText && isWinner;

    const duration = Math.max(
      2,
      Math.round(Number(beat.duration) || 4),
    );

    if (exact) {
      keptExact += 1;
      return {
        videoId: VIDEO_ID,
        sortOrder: index + 1,
        scriptText: beat.scriptText,
        sceneType: old.sceneType || beat.sceneType,
        visualPurpose: old.visualPurpose ?? beat.visualPurpose,
        visualIdea: old.visualIdea ?? beat.visualIdea,
        imagePrompt: old.imagePrompt ?? beat.imagePrompt,
        duration,
        imageUrl: old.imageUrl,
        imageStatus: old.imageStatus,
        imageLocalPath: old.imageLocalPath,
        imageError: old.imageError,
        imageBatchId: old.imageBatchId,
        imageFileName: old.imageFileName,
        clipLocalPath: old.clipLocalPath,
        clipFileName: old.clipFileName,
        clipMuted: old.clipMuted,
        voiceoverStatus: old.voiceoverStatus,
        voiceoverLocalPath: old.voiceoverLocalPath,
        voiceoverFileName: old.voiceoverFileName,
        voiceoverDuration: old.voiceoverDuration,
        voiceoverError: old.voiceoverError,
        voiceoverProvider: old.voiceoverProvider,
        voiceoverSettingsJson: old.voiceoverSettingsJson ?? undefined,
        pauseAfterMs: old.pauseAfterMs,
        status: old.status,
      };
    }

    // Split / remapped beat: keep prompts & idea, drop binary assets unless winner
    // with substantial overlap (reuse image file on primary child only).
    const keepImageFile = isWinner && inh.overlap > 0 && Boolean(old.imageLocalPath);
    const keepVo = false; // script changed → VO must be regenerated
    if (keepImageFile) {
      keptVisualOnly += 1;
    } else if (old.imagePrompt || old.visualIdea) {
      keptVisualOnly += 1;
      if (old.imageLocalPath) clearedImageFile += 1;
    } else {
      fresh += 1;
    }
    if (old.voiceoverLocalPath) clearedVo += 1;

    return {
      videoId: VIDEO_ID,
      sortOrder: index + 1,
      scriptText: beat.scriptText,
      sceneType: old.sceneType || beat.sceneType,
      visualPurpose: old.visualPurpose ?? beat.visualPurpose,
      visualIdea: old.visualIdea ?? beat.visualIdea,
      imagePrompt: old.imagePrompt ?? beat.imagePrompt,
      duration,
      imageUrl: keepImageFile ? old.imageUrl : null,
      imageStatus: keepImageFile ? old.imageStatus : "pending",
      imageLocalPath: keepImageFile ? old.imageLocalPath : null,
      imageError: null,
      imageBatchId: null,
      imageFileName: keepImageFile ? old.imageFileName : null,
      clipLocalPath: keepImageFile ? old.clipLocalPath : null,
      clipFileName: keepImageFile ? old.clipFileName : null,
      clipMuted: old.clipMuted ?? true,
      voiceoverStatus: keepVo ? old.voiceoverStatus : "none",
      voiceoverLocalPath: keepVo ? old.voiceoverLocalPath : null,
      voiceoverFileName: keepVo ? old.voiceoverFileName : null,
      voiceoverDuration: keepVo ? old.voiceoverDuration : null,
      voiceoverError: null,
      voiceoverProvider: keepVo ? old.voiceoverProvider : null,
      voiceoverSettingsJson: keepVo
        ? (old.voiceoverSettingsJson ?? undefined)
        : undefined,
      pauseAfterMs: null,
      status: old.status === "rejected" ? "planned" : old.status,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.voiceoverSegment.deleteMany({ where: { videoId: VIDEO_ID } });
    await tx.scene.deleteMany({ where: { videoId: VIDEO_ID } });
    // createMany in chunks
    const chunkSize = 50;
    for (let i = 0; i < creates.length; i += chunkSize) {
      await tx.scene.createMany({ data: creates.slice(i, i + chunkSize) });
    }

    const computed = getComputedVideoStatus({
      ideaJson: video.ideaJson,
      script: video.script,
      metadataJson: video.metadataJson,
      scenes: creates.map((s) => ({
        imagePrompt: s.imagePrompt,
        status: s.status,
      })),
    });

    await tx.video.update({
      where: { id: VIDEO_ID },
      data: {
        status: computed,
        voiceoverAudioPath: null,
        voiceoverFileName: null,
        voiceoverStatus: "needs_update",
        voiceoverDurationSec: null,
        subtitleStatus: "needs_update",
        formattedSubtitleJson: Prisma.JsonNull,
        formattedSubtitleText: null,
        styledSubtitleJson: Prisma.JsonNull,
        styledSubtitleAss: null,
        renderDraftStatus: "pending",
      },
    });
  });

  const stillBad = creates.filter((s) => {
    // quick check via duration int only — skeleton already validated estimates
    const isHook = (skeleton.scenes[s.sortOrder - 1]?.visualPurpose || "").startsWith(
      "Hook",
    );
    return isHook ? s.duration > 6 : s.duration > 8;
  });

  console.log(
    JSON.stringify(
      {
        videoId: VIDEO_ID,
        title: video.title,
        before: oldScenes.length,
        after: creates.length,
        keptExact,
        keptVisualOnly,
        fresh,
        clearedVo,
        clearedImageFile,
        stillBadDurationField: stillBad.length,
        note: "Master VO/subtitles invalidated. Regenerate missing scene VO; primary image files kept on split winners.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
