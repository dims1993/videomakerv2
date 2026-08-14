import { NextResponse } from "next/server";

import { getYoutubeChaptersExport } from "@/lib/youtube-chapters";

type YoutubeChaptersRouteProps = {
  params: Promise<{ id: string }>;
};

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
}

export async function GET(_request: Request, { params }: YoutubeChaptersRouteProps) {
  const { id } = await params;
  const exportData = await getYoutubeChaptersExport(id);

  if (!exportData) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  if (exportData.chapters.length === 0) {
    return NextResponse.json(
      {
        error:
          "No chapters found. For podcast lessons, ensure SECTION_CLIP / PART_COVER scenes exist. Otherwise add [CHAPTER 01 — Title] markers or section opener scenes.",
      },
      { status: 400 },
    );
  }

  return new NextResponse(exportData.downloadText, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeFileName(
        exportData.title,
      )}-youtube-chapters.txt"`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
