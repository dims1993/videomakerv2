import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { generatedImagesDir } from "@/lib/generated-images-path";
import { prisma } from "@/lib/prisma";

type GeneratedImageRouteProps = {
  params: Promise<{ videoId: string; fileName: string }>;
};

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function isPathInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function GET(_request: Request, { params }: GeneratedImageRouteProps) {
  const { videoId, fileName } = await params;
  const decodedVideoId = decodeURIComponent(videoId);
  const safeFileName = path.basename(decodeURIComponent(fileName));
  const scene = await prisma.scene.findFirst({
    where: {
      videoId: decodedVideoId,
      imageFileName: safeFileName,
      imageLocalPath: { not: null },
    },
    select: { imageLocalPath: true },
  });
  const video = scene
    ? null
    : await prisma.video.findUnique({
        where: { id: decodedVideoId },
        select: { title: true },
      });

  const cwd = process.cwd();
  const candidatePaths: string[] = [];

  if (scene?.imageLocalPath?.trim()) {
    const resolved = path.resolve(cwd, scene.imageLocalPath.trim());
    // Allow video storage images and the shared podcast image library.
    if (
      isPathInside(path.join(cwd, "storage"), resolved) ||
      isPathInside(path.join(cwd, "data", "image-library"), resolved)
    ) {
      candidatePaths.push(resolved);
    }
  } else {
    candidatePaths.push(
      path.join(generatedImagesDir(decodedVideoId, video?.title), safeFileName),
      path.join(generatedImagesDir(decodedVideoId), safeFileName),
    );
  }

  for (const filePath of candidatePaths) {
    try {
      const image = await readFile(filePath);
      const contentType =
        contentTypes[path.extname(filePath).toLowerCase()] ??
        contentTypes[path.extname(safeFileName).toLowerCase()] ??
        "application/octet-stream";

      return new NextResponse(image, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // Try the next compatible storage location.
    }
  }

  return NextResponse.json({ error: "Image not found." }, { status: 404 });
}
