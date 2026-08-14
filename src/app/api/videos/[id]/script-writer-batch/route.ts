import { NextResponse } from "next/server";

import {
  ScriptWriterCanceledError,
  clearScriptWriterCancel,
} from "@/lib/script-writer-cancel";
import {
  ScriptWriterRunError,
  runScriptWriterViaBrowser,
} from "@/lib/script-writer-run";

export const runtime = "nodejs";
export const maxDuration = 1800;

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  const { id: videoId } = await params;

  let resetCheckpoint = false;
  let includeReferenceTranscripts = false;
  let referenceDocumentIds: string[] = [];

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as {
        resetCheckpoint?: boolean;
        includeReferenceTranscripts?: boolean;
        referenceDocumentIds?: string[];
      };
      resetCheckpoint = Boolean(body.resetCheckpoint);
      includeReferenceTranscripts = Boolean(body.includeReferenceTranscripts);
      referenceDocumentIds = Array.isArray(body.referenceDocumentIds)
        ? body.referenceDocumentIds.map(String).filter(Boolean)
        : [];
    }
  } catch {
    // defaults
  }

  clearScriptWriterCancel(videoId);

  console.info("[script-writer-batch-api] starting", {
    videoId,
    resetCheckpoint,
    includeReferenceTranscripts,
    referenceCount: referenceDocumentIds.length,
  });

  try {
    const result = await runScriptWriterViaBrowser({
      videoId,
      resetCheckpoint,
      includeReferenceTranscripts,
      referenceDocumentIds,
    });

    console.info("[script-writer-batch-api] finished", {
      videoId,
      draftNumber: result.draftNumber,
      score: result.score,
      passed: result.passed,
      resumed: result.resumed,
      scriptLength: result.scriptLength,
      briefReason: result.briefReason,
    });

    return NextResponse.json({
      ok: true,
      videoId: result.videoId,
      providerKey: result.providerKey,
      draftNumber: result.draftNumber,
      version: result.version,
      score: result.score,
      briefReason: result.briefReason,
      mustFix: result.mustFix,
      rewritePriority: result.rewritePriority,
      passed: result.passed,
      resumed: result.resumed,
      passScore: result.passScore,
      maxDrafts: result.maxDrafts,
      scriptLength: result.scriptLength,
      scriptPreview: result.script?.slice(0, 240) ?? null,
    });
  } catch (error) {
    if (error instanceof ScriptWriterCanceledError) {
      return NextResponse.json(
        { ok: false, canceled: true, error: error.message },
        { status: 499 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Script Writer Batch failed.";
    const rawText =
      error instanceof ScriptWriterRunError ? error.rawText : null;

    console.error("[script-writer-batch-api] failed", {
      videoId,
      message,
      rawTextLength: rawText?.length ?? 0,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
        rawTextPreview: rawText?.slice(0, 2000) ?? null,
      },
      { status: 500 },
    );
  }
}
