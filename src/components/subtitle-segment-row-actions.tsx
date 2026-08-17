"use client";

import { useState, useTransition } from "react";

import { dispatchSegmentSubtitleRowAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function SubtitleSegmentRowActions({
  videoId,
  voiceoverSegmentId,
  subtitleSegmentId,
}: {
  videoId: string;
  voiceoverSegmentId: string;
  subtitleSegmentId?: string | null;
}) {
  const [intent, setIntent] = useState("generate");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    const formData = new FormData();
    formData.set("videoId", videoId);
    if (intent === "mark-ready") {
      if (!subtitleSegmentId) {
        setError("No subtitle segment yet.");
        return;
      }
      formData.set(
        "subtitleRowAction",
        `mark-ready|${subtitleSegmentId}`,
      );
    } else {
      formData.set(
        "subtitleRowAction",
        `${intent}|${voiceoverSegmentId}`,
      );
    }
    startTransition(() => {
      void dispatchSegmentSubtitleRowAction(formData).catch((runError) => {
        setError(
          runError instanceof Error ? runError.message : "Action failed.",
        );
      });
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          className="h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-xs"
          disabled={pending}
        >
          <option value="generate">Generate</option>
          <option value="regenerate">Regenerate</option>
          {subtitleSegmentId ? (
            <option value="mark-ready">Mark ready</option>
          ) : null}
        </select>
        <Button type="button" size="sm" onClick={run} disabled={pending}>
          {pending ? "…" : "Run"}
        </Button>
      </div>
      {error ? (
        <span className="max-w-[180px] text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
