"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopySubtitleButtonProps = {
  label: string;
  /** Prefer fetchUrl so multi‑MB exports are not embedded in the page HTML. */
  fetchUrl?: string;
  /** Legacy inline text (short strings only). */
  text?: string;
};

export function CopySubtitleButton({
  label,
  fetchUrl,
  text = "",
}: CopySubtitleButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCopy = Boolean(fetchUrl?.trim() || text.trim());

  async function handleCopy() {
    setError(null);
    setBusy(true);
    try {
      let payload = text;
      if (fetchUrl?.trim()) {
        const response = await fetch(fetchUrl, { cache: "no-store" });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(
            detail.trim() || `Export failed (${response.status})`,
          );
        }
        payload = await response.text();
      }
      if (!payload.trim()) {
        throw new Error("Nothing to copy.");
      }
      await navigator.clipboard.writeText(payload);
    } catch (copyError) {
      setError(
        copyError instanceof Error ? copyError.message : "Copy failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleCopy()}
        disabled={!canCopy || busy}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Copy />}
        {label}
      </Button>
      {error ? (
        <span className="max-w-[220px] text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
