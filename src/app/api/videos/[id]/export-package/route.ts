import { NextResponse } from "next/server";

import { getVideoExportPackage } from "@/lib/video-export-package";

type ExportPackageRouteProps = {
  params: Promise<{ id: string }>;
};

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export async function GET(_request: Request, { params }: ExportPackageRouteProps) {
  const { id } = await params;
  const packageData = await getVideoExportPackage(id);

  if (!packageData) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(packageData, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${safeFileName(packageData.title)}-package.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
