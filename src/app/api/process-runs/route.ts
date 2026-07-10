import { NextResponse } from "next/server";

import { listProcessRuns } from "@/lib/process-runs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId");
  const limit = Number(url.searchParams.get("limit") ?? 8);
  const includeGlobal = url.searchParams.get("includeGlobal") === "true";

  const processes = await listProcessRuns({
    videoId,
    includeGlobal,
    limit: Number.isFinite(limit) ? limit : 8,
  });

  return NextResponse.json({
    processes: processes.map((process) => ({
      id: process.id,
      type: process.type,
      videoId: process.videoId,
      channelKey: process.channelKey,
      title: process.title,
      description: process.description,
      status: process.status,
      currentStep: process.currentStep,
      totalSteps: process.totalSteps,
      progressPercent: process.progressPercent,
      startedAt: process.startedAt.toISOString(),
      updatedAt: process.updatedAt.toISOString(),
      finishedAt: process.finishedAt?.toISOString() ?? null,
      errorMessage: process.errorMessage,
      logs: process.logsJson,
      result: process.resultJson,
    })),
  });
}
