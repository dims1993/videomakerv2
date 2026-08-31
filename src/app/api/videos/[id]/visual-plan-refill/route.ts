import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  VisualPlanCanceledError,
  clearVisualPlanCancel,
} from "@/lib/visual-plan-cancel";
import {
  runVisualPlanRefillInPlaceViaBrowser,
  VisualPlanRunError,
} from "@/lib/visual-plan-run";

export const runtime = "nodejs";
export const maxDuration = 1800;

type RouteProps = {
  params: Promise<{ id: string }>;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * POST /api/videos/[id]/visual-plan-refill
 * Refill visual fields in place (keeps scriptText/duration/VO/pauses).
 * Body JSON optional: { resetCheckpoint?: boolean }
 */
export async function POST(request: Request, { params }: RouteProps) {
  const { id: videoId } = await params;
  clearVisualPlanCancel(videoId);

  let resetCheckpoint = true;
  try {
    const body = (await request.json()) as { resetCheckpoint?: boolean };
    if (typeof body.resetCheckpoint === "boolean") {
      resetCheckpoint = body.resetCheckpoint;
    }
  } catch {
    // empty body ok
  }

  const before = await prisma.scene.findMany({
    where: { videoId },
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

  try {
    const result = await runVisualPlanRefillInPlaceViaBrowser({
      videoId,
      resetCheckpoint,
    });

    const byOrder = new Map(result.scenes.map((scene) => [scene.order, scene]));
    let updated = 0;
    let storyPrefixes = 0;
    let imagesMarkedPending = 0;

    for (const old of before) {
      const next = byOrder.get(old.sortOrder);
      if (!next) continue;

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

    return NextResponse.json({
      ok: true,
      videoId,
      providerKey: result.providerKey,
      sceneCount: result.sceneCount,
      filledFromChatGpt: result.filledFromChatGpt,
      skippedChunks: result.skippedChunks,
      chunkCount: result.chunkCount,
      updated,
      storyPrefixes,
      imagesMarkedPending,
    });
  } catch (error) {
    if (error instanceof VisualPlanCanceledError) {
      return NextResponse.json(
        { ok: false, canceled: true, message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof VisualPlanRunError) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
          callType: error.callType,
          rawTextHead: error.rawText?.slice(0, 800) ?? null,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Visual plan refill failed.",
      },
      { status: 500 },
    );
  }
}
