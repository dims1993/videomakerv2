import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * On-demand scenes JSON so visual-plan does not embed multi‑MB prompt blobs
 * in the page HTML (Copy Current Scenes JSON / patch dry-run).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id: videoId } = await params;
  const forPatch =
    new URL(request.url).searchParams.get("for")?.trim() === "patch";

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const scenes = await prisma.scene.findMany({
    where: { videoId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      scriptText: true,
      sceneType: true,
      visualPurpose: true,
      visualIdea: true,
      duration: true,
      imagePrompt: true,
      imageLocalPath: true,
      imageFileName: true,
      imageUrl: true,
    },
  });

  const body = forPatch
    ? JSON.stringify(
        scenes.map((scene) => ({
          id: scene.id,
          sortOrder: scene.sortOrder,
          scriptText: scene.scriptText,
          visualIdea: scene.visualIdea,
          imagePrompt: scene.imagePrompt,
          hasGeneratedImage: Boolean(
            scene.imageLocalPath || scene.imageFileName || scene.imageUrl,
          ),
        })),
      )
    : JSON.stringify(
        scenes.map((scene) => ({
          scriptText: scene.scriptText,
          sceneType: scene.sceneType,
          visualPurpose: scene.visualPurpose ?? "",
          visualIdea: scene.visualIdea ?? "",
          duration: scene.duration ?? 8,
          imagePrompt: scene.imagePrompt ?? "",
          status: "planned",
        })),
        null,
        2,
      );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="scenes.json"',
    },
  });
}
