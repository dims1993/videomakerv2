import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  buildPodcastVisualPlanSkeleton,
  chunkPodcastSkeletonScenes,
} from "@/lib/visual-plan-skeleton";

test("real podcast script skeleton stays under ChatGPT-friendly chunk sizes", async () => {
  const prisma = new PrismaClient();
  try {
    const video = await prisma.video.findUnique({
      where: { id: "cms7alvzy0000nu84mv44maz6" },
      select: { script: true },
    });
    const script = video?.script?.trim()
      ? video.script
      : `COLD OPEN\n[MUSIC: begin]\n${Array.from({ length: 80 }, (_, index) =>
          index % 2 === 0
            ? `[EMMA]\nTeaching line number ${index + 1} with enough words to speak.`
            : `[LEO]\nStudent reply number ${index + 1}.`,
        ).join("\n")}\n[MUSIC: fade]\n`;

    const skeleton = buildPodcastVisualPlanSkeleton(script);
    const chunks = chunkPodcastSkeletonScenes(skeleton.scenes, 20);

    console.log("skeleton", {
      scenes: skeleton.scenes.length,
      spoken: skeleton.spokenTurnCount,
      music: skeleton.musicBedCount,
      chunks: chunks.length,
    });

    assert.ok(skeleton.scenes.length > 10);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 20));
  } finally {
    await prisma.$disconnect();
  }
});
