import { insertPodcastPartCoversFromScript } from "../src/lib/podcast-part-cover-insert";
import { planPodcastPartCoverInserts } from "../src/lib/podcast-part-cover-insert";
import { PrismaClient } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const videoId =
    args.find((arg) => !arg.startsWith("--")) ?? "cms7alvzy0000nu84mv44maz6";
  const prisma = new PrismaClient();

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      title: true,
      script: true,
      scenes: {
        orderBy: { sortOrder: "asc" },
        select: { sortOrder: true, scriptText: true, visualIdea: true },
      },
    },
  });
  console.log("video", video?.id, video?.title, "scriptChars", video?.script?.length ?? 0);
  if (!video?.script) {
    throw new Error("Video/script not found");
  }

  const plan = planPodcastPartCoverInserts({
    script: video.script,
    scenes: video.scenes,
  });
  console.log(
    JSON.stringify(
      {
        dryRun,
        toInsert: plan.items.map((item) => ({
          title: item.displayTitle,
          spoken: item.spokenText,
          insertBefore: item.insertBeforeSortOrder,
          anchor: item.anchorSceneOrder,
          preview: item.anchorPreview,
        })),
        skippedExisting: plan.skippedExisting,
        unmatched: plan.unmatched,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  const result = await insertPodcastPartCoversFromScript(videoId);
  console.log(
    JSON.stringify(
      {
        inserted: result.inserted,
        createdOrders: result.createdOrders,
        unmatched: result.plan.unmatched,
        skippedExisting: result.plan.skippedExisting,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
