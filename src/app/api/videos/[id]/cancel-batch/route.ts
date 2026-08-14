import { NextResponse } from "next/server";

import { requestImageBatchCancel } from "@/lib/image-batches";
import { prisma } from "@/lib/prisma";
import { requestSceneVoiceoverCancel } from "@/lib/scene-voiceover-cancel";
import { requestScriptWriterCancel } from "@/lib/script-writer-cancel";
import { requestVisualPlanCancel } from "@/lib/visual-plan-cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight cancel endpoint.
 * Must NOT be a Server Action: those can queue behind the long Run Batch POST
 * and make Cancel feel stuck for minutes.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const videoId = id?.trim();
  if (!videoId) {
    return NextResponse.json({ ok: false, error: "Missing video id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "").trim();

  if (kind === "script-writer") {
    // Memory flag on globalThis so Hot Reload / separate module graphs still
    // share cancel state with the long-running Server Action batch.
    requestScriptWriterCancel(videoId);
    console.info("[cancel-batch] script-writer cancel requested", { videoId });
    return NextResponse.json({ ok: true, kind });
  }

  if (kind === "visual-plan") {
    requestVisualPlanCancel(videoId);
    console.info("[cancel-batch] visual-plan cancel requested", { videoId });
    return NextResponse.json({ ok: true, kind });
  }

  if (kind === "scene-voiceover") {
    // Memory flag (same Node process) + DB status so Server Actions see cancel
    // even across Hot Reload / separate module instances.
    requestSceneVoiceoverCancel(videoId);
    const result = await prisma.processRun.updateMany({
      where: {
        videoId,
        type: "scene_voiceover_generation",
        status: { in: ["queued", "running", "waiting"] },
      },
      data: {
        status: "cancelled",
        currentStep: "Cancel requested — stopping after current scene",
        finishedAt: new Date(),
        errorMessage: "Cancel requested.",
      },
    });
    return NextResponse.json({ ok: true, kind, cancelledProcesses: result.count });
  }

  if (kind === "image-batch") {
    let body: { batchId?: unknown; selectedSceneIds?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }

    const batchId =
      (typeof body.batchId === "string" && body.batchId.trim()) ||
      url.searchParams.get("batchId")?.trim() ||
      "";

    if (!batchId) {
      return NextResponse.json(
        { ok: false, error: "batchId is required for image-batch cancel." },
        { status: 400 },
      );
    }

    const selectedSceneIds = Array.isArray(body.selectedSceneIds)
      ? body.selectedSceneIds.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];

    const result = await requestImageBatchCancel({
      videoId,
      batchId,
      selectedSceneIds,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, kind, error: result.error },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      kind,
      resetCount: result.resetCount,
      selectedOrphanResetCount: result.selectedOrphanResetCount,
      cancelledProcesses: result.cancelledProcesses,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        'kind must be "script-writer", "visual-plan", "scene-voiceover", or "image-batch".',
    },
    { status: 400 },
  );
}
