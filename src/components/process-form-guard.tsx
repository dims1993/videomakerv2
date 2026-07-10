"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function ProcessFormGuard() {
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const submitter = event.submitter;

      if (!(submitter instanceof HTMLButtonElement)) {
        setPendingLabel("Starting process...");
        return;
      }

      if (submitter.dataset.processGuard === "off") {
        return;
      }

      const originalText = submitter.textContent?.trim() || "Running";
      submitter.dataset.originalText = originalText;
      submitter.disabled = true;
      submitter.textContent = "Running...";
      setPendingLabel(originalText);

      window.setTimeout(() => {
        if (!submitter.isConnected || submitter.dataset.originalText !== originalText) {
          return;
        }

        submitter.disabled = false;
        submitter.textContent = originalText;
        setPendingLabel(null);
      }, 90_000);
    }

    window.addEventListener("submit", handleSubmit, true);

    return () => {
      window.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  if (!pendingLabel) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-[min(360px,calc(100vw-2rem))] items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
      <Loader2 className="size-4 animate-spin" />
      <span className="truncate">{pendingLabel} running...</span>
    </div>
  );
}
