import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

type GeneratedAudioRouteProps = {
  params: Promise<{ path: string[] }>;
};

const voiceoversRoot = path.resolve(process.cwd(), "storage", "voiceovers");

function contentTypeForAudioPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") {
    return "audio/wav";
  }
  if (ext === ".ogg") {
    return "audio/ogg";
  }
  if (ext === ".m4a" || ext === ".mp4") {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

export async function GET(
  _request: Request,
  { params }: GeneratedAudioRouteProps,
) {
  const routeParams = await params;
  const safeParts = routeParams.path.map((part) =>
    path.basename(decodeURIComponent(part)),
  );
  const filePath = path.resolve(voiceoversRoot, ...safeParts);

  if (!filePath.startsWith(`${voiceoversRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  }

  try {
    const audio = await readFile(filePath);

    return new NextResponse(audio, {
      headers: {
        "Content-Type": contentTypeForAudioPath(filePath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  }
}
