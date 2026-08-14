/**
 * One-shot: rebuild Wealth Insights imagePrompts with fixed MAIN HOST + Style locks.
 * Idempotent — already-correct prompts are left unchanged; never stacks duplicate locks.
 *
 * Usage:
 *   npx tsx scripts/normalize-wealth-image-prompts.ts <videoId>           # dry-run
 *   npx tsx scripts/normalize-wealth-image-prompts.ts <videoId> --apply   # write DB
 */

import { PrismaClient } from "@prisma/client";

import {
  normalizeWealthInsightsImagePrompt,
  wealthImagePromptLockCounts,
} from "../src/lib/wealth-insights-image-prompt";
import { resolveWealthInsightsVisualMode } from "../src/lib/wealth-insights-visual-mode";

async function main() {
  const videoId = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!videoId) {
    console.error(
      "Usage: npx tsx scripts/normalize-wealth-image-prompts.ts <videoId> [--apply]",
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        channelKey: true,
        topicCategory: true,
        ideaJson: true,
        title: true,
      },
    });
    if (!video) {
      throw new Error(`Video not found: ${videoId}`);
    }
    if (video.channelKey !== "wealth-insights") {
      throw new Error(
        `Refusing: channelKey=${video.channelKey} (expected wealth-insights)`,
      );
    }

    const mode = resolveWealthInsightsVisualMode({
      topicCategory: video.topicCategory,
      ideaJson: video.ideaJson,
    });
    if (mode === "narrative_economics_stories") {
      throw new Error(
        "Refusing: Narrative Economics mode — host/style locks do not apply",
      );
    }

    const scenes = await prisma.scene.findMany({
      where: { videoId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        sortOrder: true,
        scriptText: true,
        visualIdea: true,
        visualPurpose: true,
        imagePrompt: true,
      },
    });

    let unchanged = 0;
    let wouldUpdate = 0;
    let updated = 0;
    let emptySkipped = 0;
    const badLocks: Array<{ sortOrder: number; counts: ReturnType<typeof wealthImagePromptLockCounts> }> =
      [];
    const samples: Array<{ sortOrder: number; beforeLen: number; afterLen: number }> =
      [];

    for (const scene of scenes) {
      if (!scene.imagePrompt?.trim()) {
        emptySkipped += 1;
        continue;
      }

      const next = normalizeWealthInsightsImagePrompt({
        imagePrompt: scene.imagePrompt,
        scriptText: scene.scriptText,
        visualIdea: scene.visualIdea,
        visualPurpose: scene.visualPurpose,
      });
      const counts = wealthImagePromptLockCounts(next);
      if (
        counts.hostLockCount !== 1 ||
        counts.styleLockCount !== 1 ||
        counts.styleSectionCount !== 1
      ) {
        badLocks.push({ sortOrder: scene.sortOrder, counts });
      }

      if (next === scene.imagePrompt) {
        unchanged += 1;
        continue;
      }

      wouldUpdate += 1;
      if (samples.length < 5) {
        samples.push({
          sortOrder: scene.sortOrder,
          beforeLen: scene.imagePrompt.length,
          afterLen: next.length,
        });
      }

      if (apply) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { imagePrompt: next },
        });
        updated += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          videoId,
          title: video.title,
          mode,
          apply,
          totalScenes: scenes.length,
          emptySkipped,
          unchanged,
          wouldUpdate,
          updated,
          badLocks,
          samples,
        },
        null,
        2,
      ),
    );

    if (badLocks.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
