import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

type DraftPreviewRouteProps = {
  params: Promise<{ id: string }>;
};

const rendersRoot = path.resolve(process.cwd(), "storage", "renders");

function parseRangeHeader(rangeHeader: string | null, fileSize: number) {
  if (!rangeHeader?.startsWith("bytes=")) {
    return null;
  }

  const [startPart, endPart] = rangeHeader.slice("bytes=".length).split("-");
  const suffixLength = !startPart && endPart ? Number.parseInt(endPart, 10) : null;
  const start =
    suffixLength === null
      ? startPart
        ? Number.parseInt(startPart, 10)
        : 0
      : Math.max(fileSize - suffixLength, 0);
  const end =
    suffixLength === null
      ? endPart
        ? Number.parseInt(endPart, 10)
        : fileSize - 1
      : fileSize - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    (suffixLength !== null && (!Number.isFinite(suffixLength) || suffixLength <= 0)) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return "invalid" as const;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

async function respondWithDraft(
  request: Request,
  { params }: DraftPreviewRouteProps,
  includeBody: boolean,
) {
  const { id } = await params;
  const safeVideoId = path.basename(decodeURIComponent(id));
  const filePath = path.resolve(rendersRoot, safeVideoId, "draft.mp4");

  if (!filePath.startsWith(`${rendersRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Draft preview not found." }, { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    const range = parseRangeHeader(request.headers.get("range"), fileStat.size);

    if (range === "invalid") {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileStat.size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    if (range) {
      const body = includeBody
        ? (Readable.toWeb(
            createReadStream(filePath, { start: range.start, end: range.end }),
          ) as ReadableStream)
        : null;

      return new NextResponse(body, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }

    const body = includeBody ? await readFile(filePath) : null;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileStat.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch {
    return NextResponse.json({ error: "Draft preview not found." }, { status: 404 });
  }
}

export async function GET(request: Request, props: DraftPreviewRouteProps) {
  return respondWithDraft(request, props, true);
}

export async function HEAD(request: Request, props: DraftPreviewRouteProps) {
  return respondWithDraft(request, props, false);
}
