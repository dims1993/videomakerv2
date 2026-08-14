"use client";

import { useEffect, useState } from "react";
import { Loader2, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

const ACTIVE = new Set(["queued", "running", "waiting"]);

type ProcessRun = {
  type: string;
  status: string;
};

export function CancelSceneVoiceoverButton({ videoId }: { videoId: string }) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const params = new URLSearchParams({
          videoId,
          limit: "6",
          includeGlobal: "false",
        });
        const response = await fetch(`/api/process-runs?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { processes?: ProcessRun[] };
        const active = (data.processes ?? []).some(
          (process) =>
            process.type === "scene_voiceover_generation" &&
            ACTIVE.has(process.status),
        );
        if (!cancelled) {
          setIsActive(active);
          if (!active) {
            setIsCancelling(false);
          }
        }
      } catch {
        if (!cancelled) {
          setIsActive(false);
        }
      }

      if (!cancelled) {
        timeoutId = setTimeout(poll, isActive || isCancelling ? 1000 : 2500);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [videoId, isActive, isCancelling]);

  function cancelGeneration() {
    setIsCancelling(true);
    void fetch(`/api/videos/${videoId}/cancel-batch?kind=scene-voiceover`, {
      method: "POST",
      keepalive: true,
    });
  }

  return (
    <Button
      type="button"
      variant={isActive || isCancelling ? "destructive" : "outline"}
      onClick={cancelGeneration}
      disabled={isCancelling}
      data-process-guard="off"
      title={
        isActive
          ? "Stop scene voiceover generation after the current scene"
          : "Cancel a running scene voiceover generation"
      }
    >
      {isCancelling ? <Loader2 className="animate-spin" /> : <Square />}
      {isCancelling ? "Cancelling…" : "Cancel generation"}
    </Button>
  );
}
