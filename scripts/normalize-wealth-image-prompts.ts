/**
 * One-shot: rebuild Wealth Insights imagePrompts with fixed MAIN HOST + Style locks.
 * Idempotent — already-correct prompts are left unchanged; never stacks duplicate locks.
 *
 * Usage:
 *   npx tsx scripts/normalize-wealth-image-prompts.ts <videoId>           # dry-run
 *   npx tsx scripts/normalize-wealth-image-prompts.ts <videoId> --apply   # write DB
 *   npx tsx scripts/normalize-wealth-image-prompts.ts <videoId> --apply --pending-only
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { extractWealthEpisodeCastLock } from "../src/lib/wealth-insights-episode-cast";
import {
  normalizeWealthInsightsImagePrompt,
  wealthImagePromptLockCounts,
} from "../src/lib/wealth-insights-image-prompt";
import { resolveWealthInsightsVisualMode } from "../src/lib/wealth-insights-visual-mode";

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

async function main() {
  const videoId = process.argv[2];
  const apply = process.argv.includes("--apply");
  const pendingOnly = process.argv.includes("--pending-only");
  if (!videoId) {
    console.error(
      "Usage: npx tsx scripts/normalize-wealth-image-prompts.ts <videoId> [--apply] [--pending-only]",
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
        script: true,
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

    let ideaJson: unknown = null;
    if (video.ideaJson?.trim()) {
      try {
        ideaJson = JSON.parse(video.ideaJson);
      } catch {
        ideaJson = video.ideaJson;
      }
    }
    const cast = extractWealthEpisodeCastLock({
      script: video.script ?? "",
      ideaJson,
    });

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
        imageStatus: true,
        imageLocalPath: true,
      },
    });

    let unchanged = 0;
    let wouldUpdate = 0;
    let updated = 0;
    let skippedNotPending = 0;
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
      if (
        pendingOnly &&
        scene.imageStatus !== "pending" &&
        scene.imageLocalPath
      ) {
        skippedNotPending += 1;
        continue;
      }

      const next = normalizeWealthInsightsImagePrompt({
        imagePrompt: scene.imagePrompt,
        scriptText: scene.scriptText,
        visualIdea: scene.visualIdea,
        visualPurpose: scene.visualPurpose,
        cast,
      });
      const counts = wealthImagePromptLockCounts(next);
      if (
        counts.hostLockCount !== 1 ||
        counts.styleLockCount !== 1 ||
        counts.styleSectionCount !== 1
      ) {
        // Story-character scenes may omit host lock — only flag when host expected
        const expectsHost =
          !scene.visualIdea?.trim().startsWith("STORY_CHARACTER:") &&
          !scene.visualIdea?.trim().startsWith("STORY_PAIR:");
        if (expectsHost && counts.hostLockCount !== 1) {
          badLocks.push({ sortOrder: scene.sortOrder, counts });
        }
      }

      if (next === scene.imagePrompt) {
        unchanged += 1;
        continue;
      }

      wouldUpdate += 1;
      if (samples.length < 8) {
        samples.push({
          sortOrder: scene.sortOrder,
          beforeLen: scene.imagePrompt.length,
          afterLen: next.length,
        });
      }

      if (apply) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: {
            imagePrompt: next,
            imageStatus: "pending",
            imageLocalPath: null,
            imageFileName: null,
            imageError: null,
            status: "planned",
          },
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
          pendingOnly,
          cast: cast.characters.map((c) => c.name),
          totalScenes: scenes.length,
          emptySkipped,
          skippedNotPending,
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
