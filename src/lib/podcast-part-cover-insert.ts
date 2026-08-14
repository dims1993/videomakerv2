import {
  assemblePodcastPartCoverImagePrompt,
} from "@/lib/podcast-english-lessons-image-prompt-contract";
import {
  extractPartCoverDisplayTitle,
  isPartCoverVisualIdea,
  type PodcastPartHeading,
  parsePodcastPartHeading,
  sanitizePodcastAvatarScriptText,
} from "@/lib/podcast-part-covers";
import { buildPodcastVisualPlanSkeleton } from "@/lib/visual-plan-skeleton";
import { sortExistingScenesForUpwardShift } from "@/lib/scene-prepend";
import { prisma } from "@/lib/prisma";

export type PodcastPartCoverInsertPlanItem = {
  displayTitle: string;
  spokenText: string;
  visualIdea: string;
  visualPurpose: string;
  imagePrompt: string;
  duration: number;
  insertBeforeSortOrder: number;
  anchorSceneOrder: number;
  anchorPreview: string;
};

export type PodcastPartCoverInsertPlan = {
  items: PodcastPartCoverInsertPlanItem[];
  skippedExisting: string[];
  unmatched: string[];
};

function normalizeSpeech(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findSceneByScriptText<
  T extends { sortOrder: number; scriptText: string },
>(scenes: T[], scriptText: string): T | null {
  const needle = normalizeSpeech(scriptText);
  if (needle.length < 8) {
    return null;
  }

  const exact = scenes.find(
    (scene) => normalizeSpeech(scene.scriptText) === needle,
  );
  if (exact) {
    return exact;
  }

  const prefix = needle.slice(0, Math.min(56, needle.length));
  const fuzzy = scenes.find((scene) => {
    const hay = normalizeSpeech(scene.scriptText);
    // Empty / cue scenes must never match.
    if (hay.length < 8) {
      return false;
    }
    return hay.startsWith(prefix) || hay.includes(prefix);
  });
  return fuzzy ?? null;
}

function coverFromSkeletonScene(scene: {
  scriptText: string;
  visualIdea: string;
  visualPurpose: string;
  imagePrompt: string;
  duration: number;
}) {
  const displayTitle =
    extractPartCoverDisplayTitle({
      visualIdea: scene.visualIdea,
      scriptText: scene.scriptText,
      imagePrompt: scene.imagePrompt,
    }) ??
    scene.visualIdea
      .replace(/^PART_COVER\s*\|\s*COMP_PART_COVER\s*:\s*/i, "")
      .trim();

  return {
    displayTitle,
    spokenText: scene.scriptText,
    visualIdea: scene.visualIdea,
    visualPurpose: scene.visualPurpose,
    imagePrompt:
      scene.imagePrompt?.trim() ||
      assemblePodcastPartCoverImagePrompt(displayTitle),
    duration: scene.duration,
  };
}

/**
 * Plan PART cover inserts from the video script against existing scenes.
 * Does not require re-running Visual Plan Batch.
 */
export function planPodcastPartCoverInserts(options: {
  script: string;
  scenes: Array<{
    sortOrder: number;
    scriptText: string;
    visualIdea?: string | null;
  }>;
}): PodcastPartCoverInsertPlan {
  const skeleton = buildPodcastVisualPlanSkeleton(options.script);
  const skeletonCovers = skeleton.scenes.filter((scene) =>
    isPartCoverVisualIdea(scene.visualIdea),
  );

  const existingTitles = new Set(
    options.scenes
      .filter((scene) => isPartCoverVisualIdea(scene.visualIdea))
      .map(
        (scene) =>
          extractPartCoverDisplayTitle({
            visualIdea: scene.visualIdea,
            scriptText: scene.scriptText,
          }) ?? "",
      )
      .filter(Boolean),
  );

  const items: PodcastPartCoverInsertPlanItem[] = [];
  const skippedExisting: string[] = [];
  const unmatched: string[] = [];

  for (const cover of skeletonCovers) {
    const prepared = coverFromSkeletonScene(cover);
    if (existingTitles.has(prepared.displayTitle)) {
      skippedExisting.push(prepared.displayTitle);
      continue;
    }

    const following = skeleton.scenes.filter(
      (scene) => scene.order > cover.order,
    );
    const nextSpoken = following.find((scene) => scene.scriptText.trim());
    if (!nextSpoken) {
      unmatched.push(prepared.displayTitle);
      continue;
    }

    const dbSpoken = findSceneByScriptText(options.scenes, nextSpoken.scriptText);
    if (!dbSpoken) {
      unmatched.push(prepared.displayTitle);
      continue;
    }

    let insertBeforeSortOrder = dbSpoken.sortOrder;
    const musicBetween = following.some(
      (scene) =>
        scene.order < nextSpoken.order &&
        scene.speaker === "music",
    );
    if (musicBetween) {
      const musicBefore = [...options.scenes]
        .filter((scene) => scene.sortOrder < dbSpoken.sortOrder)
        .reverse()
        .find((scene) =>
          (scene.visualIdea ?? "").toUpperCase().includes("MUSIC_BED"),
        );
      if (
        musicBefore &&
        musicBefore.sortOrder === dbSpoken.sortOrder - 1
      ) {
        insertBeforeSortOrder = musicBefore.sortOrder;
      }
    }

    items.push({
      ...prepared,
      insertBeforeSortOrder,
      anchorSceneOrder: dbSpoken.sortOrder,
      anchorPreview: dbSpoken.scriptText.slice(0, 80),
    });
  }

  // Stable: later inserts first so earlier orders stay valid while applying.
  items.sort((a, b) => b.insertBeforeSortOrder - a.insertBeforeSortOrder);

  return { items, skippedExisting, unmatched };
}

export async function insertPodcastPartCoversFromScript(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      script: true,
      channelKey: true,
      scenes: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          scriptText: true,
          visualIdea: true,
        },
      },
    },
  });

  if (!video) {
    throw new Error("Video not found.");
  }
  if (!video.script?.trim()) {
    throw new Error("Video has no script.");
  }

  const plan = planPodcastPartCoverInserts({
    script: video.script,
    scenes: video.scenes,
  });

  if (plan.items.length === 0) {
    const cleanedLeakedHeadings = await stripLeakedPartHeadingsFromScenes(videoId);
    return {
      inserted: 0,
      plan,
      createdOrders: [] as number[],
      cleanedLeakedHeadings,
    };
  }

  const createdOrders: number[] = [];

  await prisma.$transaction(async (tx) => {
    for (const item of plan.items) {
      const existing = await tx.scene.findMany({
        where: { videoId },
        select: { id: true, sortOrder: true },
      });
      const toShift = sortExistingScenesForUpwardShift(
        existing.filter((scene) => scene.sortOrder >= item.insertBeforeSortOrder),
      );

      for (const scene of toShift) {
        await tx.scene.update({
          where: { id: scene.id },
          data: { sortOrder: scene.sortOrder + 1 },
        });
      }

      await tx.scene.create({
        data: {
          videoId,
          sortOrder: item.insertBeforeSortOrder,
          scriptText: item.spokenText,
          sceneType: "insert",
          visualPurpose: item.visualPurpose,
          visualIdea: item.visualIdea,
          imagePrompt: item.imagePrompt,
          duration: item.duration,
          status: "planned",
          imageStatus: "pending",
          pauseAfterMs: null,
        },
      });
      createdOrders.push(item.insertBeforeSortOrder);
    }
  });

  createdOrders.sort((a, b) => a - b);

  // PART headings must not remain glued onto the previous avatar turn.
  const cleanedLeakedHeadings = await stripLeakedPartHeadingsFromScenes(videoId);

  return {
    inserted: plan.items.length,
    plan,
    createdOrders,
    cleanedLeakedHeadings,
  };
}

/** Strip trailing `PART N — TITLE` from non-cover scenes (voiceover-safe). */
export async function stripLeakedPartHeadingsFromScenes(videoId: string) {
  const scenes = await prisma.scene.findMany({
    where: { videoId },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      visualIdea: true,
    },
  });

  let cleaned = 0;
  for (const scene of scenes) {
    if (isPartCoverVisualIdea(scene.visualIdea)) {
      continue;
    }
    const next = sanitizePodcastAvatarScriptText(scene.scriptText);
    if (next === scene.scriptText) {
      continue;
    }
    await prisma.scene.update({
      where: { id: scene.id },
      data: { scriptText: next },
    });
    cleaned += 1;
  }
  return cleaned;
}

/** Parse PART headings directly from script text (debug / UI). */
export function listPodcastPartHeadingsFromScript(script: string): PodcastPartHeading[] {
  const headings: PodcastPartHeading[] = [];
  for (const line of script.split(/\r?\n/)) {
    const parsed = parsePodcastPartHeading(line);
    if (parsed) {
      headings.push(parsed);
    }
  }
  return headings;
}
