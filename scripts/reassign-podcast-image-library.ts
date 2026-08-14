import { PrismaClient } from "@prisma/client";
import { access } from "node:fs/promises";
import path from "node:path";

import { assignPodcastImageLibraryToVideo } from "../src/lib/podcast-image-library";

async function main() {
  const videoId = process.argv[2] ?? "cms7alvzy0000nu84mv44maz6";
  const result = await assignPodcastImageLibraryToVideo(videoId, {
    overwrite: true,
    minGap: 3,
  });
  console.log(JSON.stringify(result, null, 2));

  const prisma = new PrismaClient();
  const scenes = await prisma.scene.findMany({
    where: { videoId, imageLocalPath: { not: null } },
    select: { sortOrder: true, imageLocalPath: true, visualIdea: true },
  });
  let ok = 0;
  let missing = 0;
  let partCovers = 0;
  for (const scene of scenes) {
    if ((scene.visualIdea ?? "").toUpperCase().includes("PART_COVER")) {
      partCovers += 1;
      continue;
    }
    try {
      await access(path.resolve(process.cwd(), scene.imageLocalPath!));
      ok += 1;
    } catch {
      missing += 1;
    }
  }
  console.log({ totalWithPath: scenes.length, libraryOk: ok, libraryMissing: missing, partCovers });
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
