import { NextResponse } from "next/server";

import {
  parseAndValidateHandoffResponse,
  scenesToImportJson,
} from "@/lib/chatgpt-scene-handoff";
import { prisma } from "@/lib/prisma";
import { getVideoPrompt } from "@/lib/video-prompts";
import {
  VisualPlanCanceledError,
  clearVisualPlanCancel,
} from "@/lib/visual-plan-cancel";
import { runVisualPlanViaBrowser, VisualPlanRunError } from "@/lib/visual-plan-run";
import {
  buildWealthInsightsVisualModeSection,
  resolveWealthInsightsVisualMode,
} from "@/lib/wealth-insights-visual-mode";

export const runtime = "nodejs";
export const maxDuration = 1800;

type RouteProps = {
  params: Promise<{ id: string }>;
};

function buildGeneratePromptFromAssembler({
  videoId,
  videoTitle,
  channelKey,
  topicCategory,
  ideaJson,
  fullPrompt,
}: {
  videoId: string;
  videoTitle: string;
  channelKey: string;
  topicCategory: string | null;
  ideaJson: unknown;
  fullPrompt: string;
}) {
  const wealthMode =
    channelKey === "wealth-insights"
      ? resolveWealthInsightsVisualMode({ topicCategory, ideaJson })
      : null;

  return [
    "GENERATE_VISUAL_PLAN",
    "# ChatGPT Scene Generation Request",
    "## Task\n\nGenerate Scenes JSON for the current video.",
    "## Generation Mode\n\nFULL",
    [
      "## Prompt Context Snapshot",
      "",
      `* generatedAt: ${new Date().toISOString()}`,
      `* videoId: ${videoId}`,
      `* videoTitle: ${videoTitle}`,
      `* channelKey: ${channelKey}`,
      `* topicCategory: ${topicCategory ?? "none"}`,
      `* requestFormat: agent-supervised-run-batch`,
    ].join("\n"),
    fullPrompt.trim(),
    ...(wealthMode
      ? [
          `## Wealth Insights Visual Mode\n\n${buildWealthInsightsVisualModeSection(wealthMode)}`,
        ]
      : []),
    [
      "## Output Requirements",
      "",
      "Return a JSON array only.",
      "Paste the full JSON array inline in the assistant message.",
      "Do not attach, upload, or link a .json file.",
      "Do not return markdown.",
      "Do not return explanations.",
      "Do not wrap inside an object.",
      "Every scene must include: order, scriptText, sceneType, visualPurpose, visualIdea, duration, imagePrompt, status.",
      "sceneType must be avatar, insert, or space.",
      "status must be planned.",
    ].join("\n"),
  ].join("\n\n");
}

async function importScenesReplace(videoId: string, scenesJson: string) {
  const validation = parseAndValidateHandoffResponse(scenesJson, {
    requireVisualIdeaPrefixes: false,
  });
  if (validation.errors.length > 0) {
    throw new Error(
      `Import validation failed: ${validation.errors.slice(0, 3).join(" ")}`,
    );
  }
  if (validation.scenes.length === 0) {
    throw new Error("No scenes to import.");
  }

  const normalized = JSON.parse(scenesToImportJson(validation.scenes)) as Array<{
    order: number;
    scriptText: string;
    sceneType: string;
    visualPurpose: string;
    visualIdea: string;
    imagePrompt: string;
    duration: number;
    status: string;
    pauseAfterMs?: number | null;
  }>;

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { videoId } }),
    prisma.scene.createMany({
      data: normalized.map((scene) => ({
        videoId,
        sortOrder: scene.order,
        scriptText: scene.scriptText,
        sceneType: scene.sceneType,
        visualPurpose: scene.visualPurpose,
        visualIdea: scene.visualIdea,
        imagePrompt: scene.imagePrompt,
        duration: scene.duration,
        status: scene.status || "planned",
        pauseAfterMs:
          typeof scene.pauseAfterMs === "number" && Number.isFinite(scene.pauseAfterMs)
            ? Math.round(scene.pauseAfterMs)
            : null,
      })),
    }),
  ]);

  return normalized.length;
}

export async function POST(request: Request, { params }: RouteProps) {
  const { id: videoId } = await params;
  clearVisualPlanCancel(videoId);

  try {
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: string;
      importMode?: string;
    };

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        title: true,
        channelKey: true,
        topicCategory: true,
        ideaJson: true,
        script: true,
      },
    });

    if (!video) {
      return NextResponse.json({ ok: false, error: "Video not found." }, { status: 404 });
    }

    if (!video.script?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Video has no script." },
        { status: 400 },
      );
    }

    let prompt = body.prompt?.trim() || "";
    if (!prompt) {
      const fullPrompt = await getVideoPrompt(videoId, "visual-planner");
      if (!fullPrompt?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Could not build visual-planner prompt." },
          { status: 400 },
        );
      }
      let ideaJson: unknown = null;
      if (video.ideaJson?.trim()) {
        try {
          ideaJson = JSON.parse(video.ideaJson);
        } catch {
          ideaJson = video.ideaJson;
        }
      }
      prompt = buildGeneratePromptFromAssembler({
        videoId: video.id,
        videoTitle: video.title,
        channelKey: video.channelKey,
        topicCategory: video.topicCategory,
        ideaJson,
        fullPrompt,
      });
    }

    console.info("[visual-plan-batch-api] starting Run Batch", {
      videoId,
      promptChars: prompt.length,
      channelKey: video.channelKey,
      topicCategory: video.topicCategory,
    });

    const result = await runVisualPlanViaBrowser({
      videoId,
      prompt,
    });

    const importedCount = await importScenesReplace(videoId, result.scenesJson);

    console.info("[visual-plan-batch-api] finished", {
      videoId,
      importedCount,
      draftNumber: result.draftNumber,
      version: result.version,
    });

    return NextResponse.json({
      ok: true,
      videoId,
      importedCount,
      providerKey: result.providerKey,
      draftNumber: result.draftNumber,
      version: result.version,
      scenesJsonLength: result.scenesJson.length,
    });
  } catch (error) {
    if (error instanceof VisualPlanCanceledError) {
      return NextResponse.json(
        { ok: false, canceled: true, error: error.message },
        { status: 499 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Visual Plan Batch failed.";
    const rawText =
      error instanceof VisualPlanRunError ? error.rawText : null;
    const debugPath =
      error instanceof VisualPlanRunError ? error.debugPath : null;
    const callType =
      error instanceof VisualPlanRunError ? error.callType : null;

    console.error("[visual-plan-batch-api] failed", {
      videoId,
      message,
      callType,
      debugPath,
      rawTextLength: rawText?.length ?? 0,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
        callType,
        debugPath,
        rawTextPreview: rawText?.slice(0, 2000) ?? null,
      },
      { status: 500 },
    );
  }
}
