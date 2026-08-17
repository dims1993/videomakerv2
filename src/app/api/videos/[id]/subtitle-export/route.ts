import { NextResponse } from "next/server";

import { getCaptionStylePreset } from "@/lib/caption-styles";
import { prisma } from "@/lib/prisma";
import {
  exportActiveWordCaptionsToAss,
  exportActiveWordCaptionsToJson,
} from "@/lib/subtitle-alignment";
import {
  exportCuesToSrt,
  exportCuesToVtt,
  parseFormattedSubtitleCues,
} from "@/lib/subtitles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORMATS = new Set([
  "srt",
  "vtt",
  "ass",
  "active-word-json",
] as const);

type ExportFormat = "srt" | "vtt" | "ass" | "active-word-json";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * On-demand subtitle export so the video page does not embed multi‑MB SRT/VTT/ASS
 * blobs in the HTML (critical on 8GB machines / long videos).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id: videoId } = await params;
  const format = new URL(request.url).searchParams.get("format")?.trim() as
    | ExportFormat
    | undefined;

  if (!format || !FORMATS.has(format)) {
    return NextResponse.json(
      { error: "format must be srt | vtt | ass | active-word-json" },
      { status: 400 },
    );
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      formattedSubtitleJson: true,
      styledSubtitleAss: true,
      styledSubtitleJson: true,
      captionStylePreset: true,
      subtitleStatus: true,
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const cues = parseFormattedSubtitleCues(video.formattedSubtitleJson);
  if (cues.length === 0) {
    return NextResponse.json(
      { error: "No combined subtitles available yet." },
      { status: 404 },
    );
  }

  let body: string;
  let contentType = "text/plain; charset=utf-8";
  let filename = `subtitles.${format}`;

  switch (format) {
    case "srt":
      body = exportCuesToSrt(cues);
      filename = "subtitles.srt";
      break;
    case "vtt":
      body = exportCuesToVtt(cues);
      filename = "subtitles.vtt";
      break;
    case "ass":
      body =
        video.styledSubtitleAss?.trim() ||
        exportActiveWordCaptionsToAss(
          cues,
          getCaptionStylePreset(video.captionStylePreset),
        );
      filename = "subtitles.ass";
      break;
    case "active-word-json":
      body = JSON.stringify(
        video.styledSubtitleJson ?? exportActiveWordCaptionsToJson(cues),
        null,
        2,
      );
      contentType = "application/json; charset=utf-8";
      filename = "active-word-captions.json";
      break;
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
