/**
 * In-place Wealth Insights visual refill (Cast Lock / story prefixes).
 * Keeps scriptText, duration, pauseAfterMs, and voiceovers. Updates visuals only.
 * Marks images pending when visualIdea/imagePrompt change.
 *
 *   npx tsx scripts/refill-wealth-visuals-inplace.ts [videoId]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { runVisualPlanRefillInPlaceViaBrowser, VisualPlanRunError } from "../src/lib/visual-plan-run";
import { VisualPlanCanceledError } from "../src/lib/visual-plan-cancel";

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

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

async function main() {
  console.log(`[refill] videoId=${VIDEO_ID}`);
  const before = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      visualIdea: true,
      imagePrompt: true,
      sceneType: true,
      visualPurpose: true,
    },
  });
  console.log(`[refill] existing scenes=${before.length}`);

  const result = await runVisualPlanRefillInPlaceViaBrowser({
    videoId: VIDEO_ID,
    resetCheckpoint: true,
  });

  const byOrder = new Map(result.scenes.map((scene) => [scene.order, scene]));
  let updated = 0;
  let storyPrefixes = 0;
  let imagesMarkedPending = 0;

  for (const old of before) {
    const next = byOrder.get(old.sortOrder);
    if (!next) {
      console.warn(`[refill] missing fill for order ${old.sortOrder}`);
      continue;
    }

    const visualIdeaChanged =
      normalizeText(old.visualIdea) !== normalizeText(next.visualIdea);
    const imagePromptChanged =
      normalizeText(old.imagePrompt) !== normalizeText(next.imagePrompt);
    const sceneTypeChanged = old.sceneType !== next.sceneType;
    const purposeChanged =
      normalizeText(old.visualPurpose) !== normalizeText(next.visualPurpose);

    if (
      !visualIdeaChanged &&
      !imagePromptChanged &&
      !sceneTypeChanged &&
      !purposeChanged
    ) {
      continue;
    }

    const data: {
      visualIdea: string;
      visualPurpose: string;
      imagePrompt: string;
      sceneType: string;
      status: string;
      imageStatus?: string;
      imageLocalPath?: null;
      imageFileName?: null;
    } = {
      visualIdea: next.visualIdea,
      visualPurpose: next.visualPurpose,
      imagePrompt: next.imagePrompt,
      sceneType: next.sceneType,
      status: "planned",
    };

    if (visualIdeaChanged || imagePromptChanged) {
      data.imageStatus = "pending";
      data.imageLocalPath = null;
      data.imageFileName = null;
      imagesMarkedPending += 1;
    }

    await prisma.scene.update({
      where: { id: old.id },
      data,
    });
    updated += 1;

    if (
      /^STORY_CHARACTER:/i.test(next.visualIdea) ||
      /^STORY_PAIR:/i.test(next.visualIdea) ||
      /^MAIN HOST \+ STORY:/i.test(next.visualIdea)
    ) {
      storyPrefixes += 1;
    }
  }

  const prefixCounts = await prisma.$queryRaw<
    Array<{ prefix: string; count: bigint }>
  >`
    SELECT
      CASE
        WHEN "visualIdea" ILIKE 'STORY_CHARACTER:%' THEN 'STORY_CHARACTER'
        WHEN "visualIdea" ILIKE 'STORY_PAIR:%' THEN 'STORY_PAIR'
        WHEN "visualIdea" ILIKE 'MAIN HOST + STORY:%' THEN 'MAIN HOST + STORY'
        WHEN "visualIdea" ILIKE 'MAIN HOST:%' THEN 'MAIN HOST'
        ELSE 'OTHER'
      END AS prefix,
      COUNT(*)::bigint AS count
    FROM "Scene"
    WHERE "videoId" = ${VIDEO_ID}
    GROUP BY 1
    ORDER BY count DESC
  `;

  console.log("[refill] done", {
    providerKey: result.providerKey,
    filledFromChatGpt: result.filledFromChatGpt,
    skippedChunks: result.skippedChunks,
    chunkCount: result.chunkCount,
    updated,
    storyPrefixes,
    imagesMarkedPending,
    prefixCounts: Object.fromEntries(
      prefixCounts.map((row) => [row.prefix, Number(row.count)]),
    ),
  });
}

main()
  .catch((error) => {
    if (error instanceof VisualPlanCanceledError) {
      console.error("[refill] canceled:", error.message);
    } else if (error instanceof VisualPlanRunError) {
      console.error("[refill] failed:", error.message);
      if (error.rawText) {
        console.error("[refill] rawText head:", error.rawText.slice(0, 500));
      }
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
