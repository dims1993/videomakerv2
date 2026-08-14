import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

type SceneClipRouteProps = {
  params: Promise<{ path: string[] }>;
};

const sceneClipsRoot = path.resolve(process.cwd(), "storage", "scene-clips");

function contentTypeForExtension(extension: string) {
  switch (extension.toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".mov":
    case ".m4v":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _request: Request,
  { params }: SceneClipRouteProps,
) {
  const routeParams = await params;
  const safeParts = routeParams.path.map((part) =>
    path.basename(decodeURIComponent(part)),
  );
  const filePath = path.resolve(sceneClipsRoot, ...safeParts);

  if (!filePath.startsWith(`${sceneClipsRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Clip not found." }, { status: 404 });
  }

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentTypeForExtension(path.extname(filePath)),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Clip not found." }, { status: 404 });
  }
}
