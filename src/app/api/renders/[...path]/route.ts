import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

type RenderRouteProps = {
  params: Promise<{ path: string[] }>;
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

export async function GET(request: Request, { params }: RenderRouteProps) {
  const routeParams = await params;
  const safeParts = routeParams.path.map((part) =>
    path.basename(decodeURIComponent(part)),
  );
  const filePath = path.resolve(rendersRoot, ...safeParts);

  if (!filePath.startsWith(`${rendersRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Render not found." }, { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    const contentType =
      path.extname(filePath).toLowerCase() === ".mp4"
        ? "video/mp4"
        : "application/octet-stream";

    if (contentType === "video/mp4") {
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
        const stream = createReadStream(filePath, {
          start: range.start,
          end: range.end,
        });

        return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(range.end - range.start + 1),
            "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        });
      }
    }

    const file = await readFile(filePath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        ...(contentType === "video/mp4" ? { "Accept-Ranges": "bytes" } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Render not found." }, { status: 404 });
  }
}
