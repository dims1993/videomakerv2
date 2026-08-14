import { NextResponse } from "next/server";

import {
  getVideoPrompt,
  type VideoPromptKind,
} from "@/lib/video-prompts";

type PromptRouteProps = {
  params: Promise<{ id: string; kind: string }>;
};

const promptKinds = new Set<VideoPromptKind>([
  "angle-builder",
  "script-writer",
  "visual-planner",
  "metadata-writer",
]);

function isVideoPromptKind(value: string): value is VideoPromptKind {
  return promptKinds.has(value as VideoPromptKind);
}

export async function GET(request: Request, { params }: PromptRouteProps) {
  try {
    const { id, kind } = await params;

    if (!isVideoPromptKind(kind)) {
      return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const includeReferenceTranscripts =
      url.searchParams.get("includeReferences") === "1" ||
      url.searchParams.get("includeReferenceTranscripts") === "1";
    const referenceDocumentIds = url.searchParams
      .getAll("referenceIds")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);

    const prompt = await getVideoPrompt(id, kind, {
      includeReferenceTranscripts,
      referenceDocumentIds,
    });

    if (prompt === null) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    return new NextResponse(prompt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not build prompt.";
    console.error("[prompts-api]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
