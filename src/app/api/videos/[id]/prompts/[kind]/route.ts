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

export async function GET(_request: Request, { params }: PromptRouteProps) {
  const { id, kind } = await params;

  if (!isVideoPromptKind(kind)) {
    return NextResponse.json({ error: "Prompt not found." }, { status: 404 });
  }

  const prompt = await getVideoPrompt(id, kind);

  if (prompt === null) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  return new NextResponse(prompt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
