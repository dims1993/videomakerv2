import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ videoId: string; fileName: string }> },
) {
  const { videoId, fileName } = await params;
  const safeFileName = path.basename(fileName);
  const thumbnailsRoot = path.resolve(process.cwd(), "storage", "thumbnails");
  const filePath = path.resolve(thumbnailsRoot, videoId, safeFileName);

  if (!filePath.startsWith(`${thumbnailsRoot}${path.sep}`)) {
    return new NextResponse("Invalid thumbnail path.", { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    const contentType =
      contentTypes[path.extname(safeFileName).toLowerCase()] ??
      "application/octet-stream";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch {
    return new NextResponse("Thumbnail not found.", { status: 404 });
  }
}
