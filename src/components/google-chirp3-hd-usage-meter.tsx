"use client";

import { useEffect, useState, useTransition } from "react";

import { getChirp3HdUsageSummaryAction } from "@/app/voice-catalog-actions";
import type { Chirp3HdUsageSummary } from "@/lib/google-tts-shared";

type GoogleChirp3HdUsageMeterProps = {
  initialSummary?: Chirp3HdUsageSummary | null;
};

function formatChars(value: number) {
  return Math.floor(value).toLocaleString("en-US");
}

export function GoogleChirp3HdUsageMeter({
  initialSummary = null,
}: GoogleChirp3HdUsageMeterProps) {
  const [summary, setSummary] = useState<Chirp3HdUsageSummary | null>(
    initialSummary,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const next = await getChirp3HdUsageSummaryAction();
        setSummary(next);
      } catch {
        // Keep last known summary; meter is informational.
      }
    });
  }, []);

  if (!summary) {
    return null;
  }

  const barColor = summary.blocked
    ? "bg-destructive"
    : summary.percentUsed >= 85
      ? "bg-amber-500"
      : "bg-emerald-600";

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">Chirp 3 HD usage (this month UTC)</p>
        <p className="font-mono text-xs text-muted-foreground">
          {summary.monthKey}
          {isPending ? " · refreshing…" : ""}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, summary.percentUsed)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatChars(summary.charactersUsed)} /{" "}
        {formatChars(summary.softLimit)} characters used
        {summary.blocked
          ? " — blocked (soft limit). Use Standard/Neural2 or wait for next month."
          : ` · ${formatChars(summary.remaining)} remaining before soft stop (free tier ${formatChars(summary.freeTierChars)}).`}
      </p>
    </div>
  );
}
