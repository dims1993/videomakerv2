import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type ImageBatchPayloadRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  { params }: ImageBatchPayloadRouteProps,
) {
  const { id } = await params;
  const batch = await prisma.imageBatch.findUnique({
    where: { id },
    select: { payloadPath: true },
  });

  if (!batch?.payloadPath) {
    return NextResponse.json({ error: "Payload not found." }, { status: 404 });
  }

  try {
    const payload = await readFile(batch.payloadPath, "utf8");

    return new NextResponse(payload, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "Payload not found." }, { status: 404 });
  }
}
