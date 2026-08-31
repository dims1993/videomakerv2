/**
 * Re-apply strict episode cast identity locks to existing Wealth scene imagePrompts
 * (no ChatGPT refill). Marks affected images pending for regeneration.
 *
 *   npx tsx scripts/relock-wealth-cast-prompts.ts [videoId]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { extractWealthEpisodeCastLock } from "../src/lib/wealth-insights-episode-cast";
import { normalizeWealthInsightsImagePrompt } from "../src/lib/wealth-insights-image-prompt";

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

async function main() {
  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: { script: true, ideaJson: true, channelKey: true, title: true },
  });
  if (!video) throw new Error("Video not found");
  if (video.channelKey !== "wealth-insights") {
    throw new Error("Only wealth-insights supported");
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
  console.log("[relock]", {
    videoId: VIDEO_ID,
    title: video.title,
    cast: cast.characters.map((c) => ({
      name: c.name,
      lockHead: c.descriptor.slice(0, 120),
    })),
  });

  const scenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID },
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

  let updated = 0;
  let pending = 0;
  for (const scene of scenes) {
    const nextPrompt = normalizeWealthInsightsImagePrompt({
      imagePrompt: scene.imagePrompt,
      scriptText: scene.scriptText,
      visualIdea: scene.visualIdea,
      visualPurpose: scene.visualPurpose,
      cast,
    });
    if (nextPrompt === (scene.imagePrompt ?? "").trim()) {
      continue;
    }
    const touchesCast = cast.characters.some((member) =>
      nextPrompt.includes(`named ${member.name}`),
    );
    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        imagePrompt: nextPrompt,
        ...(touchesCast
          ? {
              imageStatus: "pending",
              imageLocalPath: null,
              imageFileName: null,
              status: "planned",
            }
          : {}),
      },
    });
    updated += 1;
    if (touchesCast) pending += 1;
  }

  console.log("[relock] done", { updated, pending, total: scenes.length });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
