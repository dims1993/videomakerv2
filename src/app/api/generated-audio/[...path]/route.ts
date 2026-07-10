import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

type GeneratedAudioRouteProps = {
  params: Promise<{ path: string[] }>;
};

const voiceoversRoot = path.resolve(process.cwd(), "storage", "voiceovers");

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
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  }
}
