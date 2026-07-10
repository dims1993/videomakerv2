"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

type ExportVideoPackageButtonProps = {
  exportUrl: string;
};

function fileNameFromResponse(response: Response) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/);

  return match?.[1] ?? "video-package.json";
}

export function ExportVideoPackageButton({ exportUrl }: ExportVideoPackageButtonProps) {
  async function exportPackage() {
    const response = await fetch(exportUrl);

    if (!response.ok) {
      throw new Error("Could not export video package.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileNameFromResponse(response);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" onClick={exportPackage}>
      <Download />
      Export Video Package
    </Button>
  );
}
