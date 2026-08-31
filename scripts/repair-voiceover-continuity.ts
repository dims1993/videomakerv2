/**
 * Repair VO continuity in place (no Visual Plan / assets regen).
 *
 * 1. Clears flat pipeline pauseAfterMs (so punctuation+continuation wins)
 * 2. Applies smart punctuation pauses (continuation hard-joins)
 * 3. Regenerates bridge-related scene VOs with universal speak-and-trim
 *    (or all spoken scenes with --all)
 * 4. Re-stitches master voiceover
 *
 *   npx tsx scripts/repair-voiceover-continuity.ts <videoId> [--all]
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

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

import {
  applySmartPunctuationScenePauses,
  resolvePipelineSettings,
} from "../src/lib/pipeline-settings";
import {
  MUSIC_BED_PROVIDER,
  isMusicBedScene,
} from "../src/lib/music-beds";
import { stitchSceneVoiceoverAudio } from "../src/lib/render/audio";
import { shouldBridgeProsody } from "../src/lib/voiceover-continuity";
import { sceneVoiceoverMasterRelativePath } from "../src/lib/voiceover-scenes";
import { buildVoiceoverFormDataForRepair } from "../src/lib/repair-voiceover-continuity";

const VIDEO_ID = process.argv[2];
const REGEN_ALL = process.argv.includes("--all");

if (!VIDEO_ID) {
  console.error(
    "Usage: npx tsx scripts/repair-voiceover-continuity.ts <videoId> [--all]",
  );
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  const video = await prisma.video.findUnique({
    where: { id: VIDEO_ID },
    select: {
      id: true,
      title: true,
      channelKey: true,
      pipelineSettingsJson: true,
    },
  });
  if (!video) {
    throw new Error(`Video not found: ${VIDEO_ID}`);
  }

  console.log(`Repairing: ${video.title} (${video.id}) [${video.channelKey}]`);

  // Prefer punctuation/continuation pauses on future pipeline VO runs.
  if (video.pipelineSettingsJson?.trim()) {
    try {
      const parsed = JSON.parse(video.pipelineSettingsJson) as Record<
        string,
        unknown
      >;
      const voiceover =
        parsed.voiceover && typeof parsed.voiceover === "object"
          ? { ...(parsed.voiceover as Record<string, unknown>) }
          : {};
      voiceover.pauseAfterMs = null;
      parsed.voiceover = voiceover;
      await prisma.video.update({
        where: { id: VIDEO_ID },
        data: { pipelineSettingsJson: JSON.stringify(parsed, null, 2) },
      });
      console.log("Cleared flat pipeline pauseAfterMs → null");
    } catch {
      // keep existing
    }
  }

  const applied = await applySmartPunctuationScenePauses(VIDEO_ID);
  console.log(`Applied punctuation/continuation pauses to ${applied.updated} scenes`);

  const scenes = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID, status: { not: "rejected" } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      visualIdea: true,
      pauseAfterMs: true,
      voiceoverDuration: true,
      voiceoverLocalPath: true,
      voiceoverProvider: true,
      voiceoverStatus: true,
      clipLocalPath: true,
      clipMuted: true,
    },
  });

  const bridgeOrders = new Set<number>();
  for (let i = 0; i < scenes.length; i += 1) {
    const cur = scenes[i]!;
    const next = scenes[i + 1];
    if (!cur.scriptText?.trim()) continue;
    if (isMusicBedScene(cur)) continue;
    if (next && shouldBridgeProsody(cur.scriptText, next.scriptText)) {
      bridgeOrders.add(cur.sortOrder);
      bridgeOrders.add(next.sortOrder);
    }
  }

  const spokenOrders = scenes
    .filter(
      (scene) =>
        scene.scriptText?.trim() &&
        !isMusicBedScene(scene) &&
        scene.voiceoverProvider !== MUSIC_BED_PROVIDER,
    )
    .map((scene) => scene.sortOrder);

  const selectedOrders = REGEN_ALL
    ? spokenOrders
    : spokenOrders.filter((order) => bridgeOrders.has(order));

  console.log(
    REGEN_ALL
      ? `Regenerating ALL spoken scenes: ${selectedOrders.length}`
      : `Regenerating bridge-related scenes: ${selectedOrders.length} / ${spokenOrders.length} spoken`,
  );

  if (selectedOrders.length === 0) {
    console.log("No scenes to regenerate; stitching with updated pauses only.");
  } else {
    const { generateVoiceoverForScenesForRepair } = await import(
      "../src/lib/repair-voiceover-continuity"
    );
    const formData = await buildVoiceoverFormDataForRepair(VIDEO_ID);
    formData.set("overwriteSceneVoiceovers", "on");
    formData.set("autoStitchMasterVoiceover", "on");
    formData.set("updateSceneDurationsFromAudio", "on");

    const result = await generateVoiceoverForScenesForRepair(
      VIDEO_ID,
      formData,
      {
        selectedOrders,
        overwrite: true,
      },
    );
    console.log(
      `VO regen: generated=${result.generated} skipped=${result.skipped} failed=${result.failed}`,
    );
    if (result.failed > 0) {
      throw new Error(`Voiceover repair finished with ${result.failed} failure(s).`);
    }
  }

  const fresh = await prisma.scene.findMany({
    where: { videoId: VIDEO_ID, status: { not: "rejected" } },
    orderBy: { sortOrder: "asc" },
    select: {
      sortOrder: true,
      pauseAfterMs: true,
      voiceoverLocalPath: true,
      voiceoverProvider: true,
      visualIdea: true,
      clipLocalPath: true,
      clipMuted: true,
    },
  });

  const stitchClips = fresh
    .filter((scene) => scene.voiceoverLocalPath?.trim())
    .map((scene) => ({
      sortOrder: scene.sortOrder,
      audioPath: scene.voiceoverLocalPath!,
      pauseAfterMs: scene.pauseAfterMs,
      isMusicBed:
        scene.voiceoverProvider === MUSIC_BED_PROVIDER ||
        isMusicBedScene(scene),
    }));

  if (stitchClips.length === 0) {
    throw new Error("No scene voiceover files to stitch.");
  }

  const settings = await resolvePipelineSettings(VIDEO_ID);
  const outputRelativePath = sceneVoiceoverMasterRelativePath(VIDEO_ID);
  const stitched = await stitchSceneVoiceoverAudio(
    VIDEO_ID,
    stitchClips,
    outputRelativePath,
    {
      defaultPauseAfterMs: settings.voiceover.pauseAfterMs ?? 80,
    },
  );

  await prisma.video.update({
    where: { id: VIDEO_ID },
    data: {
      voiceoverAudioPath: outputRelativePath,
      voiceoverFileName: path.basename(outputRelativePath),
      voiceoverDurationSec: stitched.durationSec,
      voiceoverStatus: "ready",
      subtitleStatus: "needs_update",
      renderDraftStatus: "pending",
    },
  });

  console.log(
    JSON.stringify(
      {
        videoId: VIDEO_ID,
        title: video.title,
        pausesUpdated: applied.updated,
        regenerated: selectedOrders.length,
        mode: REGEN_ALL ? "all" : "bridges",
        masterDurSec: Number(stitched.durationSec.toFixed(3)),
        note: "Regenerate subtitles in the UI if you burn captions.",
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
