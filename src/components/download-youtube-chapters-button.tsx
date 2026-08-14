"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type DownloadYoutubeChaptersButtonProps = {
  downloadUrl: string;
  disabled?: boolean;
};

function fileNameFromResponse(response: Response) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/);

  return match?.[1] ?? "youtube-chapters.txt";
}

export function DownloadYoutubeChaptersButton({
  downloadUrl,
  disabled = false,
}: DownloadYoutubeChaptersButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function downloadChapters() {
    setError(null);
    setPending(true);

    try {
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "Could not download YouTube chapters transcript.",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = fileNameFromResponse(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Don't revoke immediately — Safari/Chrome often abort the download
      // and leave a 0-byte / unopenable file if the blob URL dies too soon.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not download YouTube chapters transcript.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
        onClick={downloadChapters}
      >
        <Download />
        {pending ? "Preparing…" : "Download YouTube chapters"}
      </Button>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Downloads a .txt with YouTube chapter timestamps from script markers
          like [CHAPTER 01 — Title], plus the timed script.
        </p>
      )}
    </div>
  );
}
