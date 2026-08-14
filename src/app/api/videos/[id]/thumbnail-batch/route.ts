import { NextResponse } from "next/server";

import {
  ThumbnailBatchCanceledError,
  clearThumbnailBatchCancel,
} from "@/lib/thumbnail-batch-cancel";
import {
  ThumbnailBatchRunError,
  runThumbnailBatchViaBrowser,
} from "@/lib/thumbnail-batch-run";

export const runtime = "nodejs";
export const maxDuration = 1800;

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const { id: videoId } = await params;

  let masterId: string | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as {
        masterId?: string;
      };
      masterId = body.masterId?.trim() || null;
    }
  } catch {
    // defaults
  }

  clearThumbnailBatchCancel(videoId);

  console.info("[thumbnail-batch-api] starting", { videoId, masterId });

  try {
    const result = await runThumbnailBatchViaBrowser({ videoId, masterId });
    console.info("[thumbnail-batch-api] finished", {
      videoId,
      masterId: result.masterId,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
    });
    return NextResponse.json({
      ok: true,
      videoId: result.videoId,
      masterId: result.masterId,
      masterName: result.masterName,
      providerKey: result.providerKey,
      resolvedPrompt: result.resolvedPrompt,
      fileName: result.fileName,
      imageUrl: result.imageUrl,
      sizeBytes: result.sizeBytes,
    });
  } catch (error) {
    if (error instanceof ThumbnailBatchCanceledError) {
      return NextResponse.json(
        { ok: false, canceled: true, error: error.message },
        { status: 499 },
      );
    }

    const message =
      error instanceof ThumbnailBatchRunError || error instanceof Error
        ? error.message
        : "Thumbnail batch failed.";
    console.error("[thumbnail-batch-api] failed", { videoId, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
