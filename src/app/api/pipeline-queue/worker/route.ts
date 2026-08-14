import { after, NextResponse } from "next/server";

import { isPipelineWorkerRunning } from "@/lib/pipeline-cancel";
import {
  runPipelineWorkerLoop,
  stopPipelineWorkerAndSafeguard,
} from "@/lib/pipeline-worker";

export const runtime = "nodejs";
export const maxDuration = 3600;

export async function POST() {
  if (isPipelineWorkerRunning()) {
    return NextResponse.json(
      { ok: false, reason: "already_running" },
      { status: 409 },
    );
  }

  after(async () => {
    try {
      await runPipelineWorkerLoop();
    } catch (error) {
      console.error("[pipeline-queue-worker] crashed", error);
    }
  });

  return NextResponse.json({ ok: true, started: true });
}

export async function GET() {
  return NextResponse.json({ running: isPipelineWorkerRunning() });
}

/**
 * Stop worker and safeguard progress:
 * parks running queue items as queued (checkpoints kept), cancels in-flight
 * ChatGPT/visual waits, clears the in-memory running flag.
 */
export async function DELETE() {
  const result = await stopPipelineWorkerAndSafeguard();
  return NextResponse.json(result);
}
