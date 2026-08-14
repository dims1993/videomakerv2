"use client";

import { Check, Copy, Loader2, Play, Square } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";

type ReferenceOption = {
  id: string;
  title: string;
  sourceName: string | null;
  wordCount: number;
};

type CheckpointSummary = {
  draftNumber: number;
  version: string;
  score: number | null;
  briefReason: string | null;
  phase: "drafted" | "scored";
  scriptLength: number;
  updatedAt: string;
  stale?: boolean;
};

export function ScriptWriterBatchControls({
  videoId,
  channelKey,
  promptUrl,
  copyLabel,
  references,
  runAction,
  disabled,
  disabledReason,
  checkpoint,
}: {
  videoId: string;
  channelKey: string;
  promptUrl: string;
  copyLabel: string;
  references: ReferenceOption[];
  runAction: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string | null;
  checkpoint?: CheckpointSummary | null;
}) {
  const [includeReferences, setIncludeReferences] = useState(false);
  const [resetCheckpoint, setResetCheckpoint] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    references.map((item) => item.id),
  );
  const [copied, setCopied] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPending, startTransition] = useTransition();

  const effectiveSelectedIds = useMemo(() => {
    if (!includeReferences) {
      return [];
    }
    return selectedIds.filter((id) => references.some((item) => item.id === id));
  }, [includeReferences, references, selectedIds]);

  const resolvedPromptUrl = useMemo(() => {
    const url = new URL(promptUrl, "http://local.invalid");
    if (includeReferences) {
      url.searchParams.set("includeReferences", "1");
      for (const id of effectiveSelectedIds) {
        url.searchParams.append("referenceIds", id);
      }
    }
    return `${url.pathname}${url.search}`;
  }, [effectiveSelectedIds, includeReferences, promptUrl]);

  const busy = isPending || isCancelling;
  const canResume = Boolean(checkpoint && !checkpoint.stale && !resetCheckpoint);

  async function copyPrompt() {
    const response = await fetch(resolvedPromptUrl);
    if (!response.ok) {
      let detail = "";
      try {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const body = (await response.json()) as { error?: string };
          detail = body.error?.trim() || "";
        } else {
          detail = (await response.text()).trim().slice(0, 240);
        }
      } catch {
        // ignore parse failures
      }
      throw new Error(
        detail
          ? `Could not load prompt (${response.status}): ${detail}`
          : `Could not load prompt (${response.status}).`,
      );
    }
    const text = await response.text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function toggleReference(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((item) => item !== id);
    });
  }

  function runBatch() {
    const formData = new FormData();
    if (includeReferences) {
      formData.set("includeReferenceTranscripts", "1");
      for (const id of effectiveSelectedIds) {
        formData.append("referenceDocumentIds", id);
      }
    }
    if (resetCheckpoint) {
      formData.set("resetCheckpoint", "1");
    }

    setIsCancelling(false);
    startTransition(async () => {
      await runAction(formData);
    });
  }

  function cancelBatch() {
    setIsCancelling(true);
    void fetch(`/api/videos/${videoId}/cancel-batch?kind=script-writer`, {
      method: "POST",
      keepalive: true,
    });
    window.location.assign(
      `/videos/${videoId}?tab=script&scriptNotice=${encodeURIComponent(
        "Cancel requested. The batch stops at the next ChatGPT checkpoint. Run Batch again to resume from the last saved draft.",
      )}&scriptNoticeType=error`,
    );
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      {checkpoint ? (
        <div className="space-y-2 rounded-md border bg-background px-3 py-2 text-xs">
          <p className="font-medium text-foreground">
            {checkpoint.stale
              ? "Stale script checkpoint (idea changed)"
              : "Script checkpoint ready to resume"}
          </p>
          <p className="text-muted-foreground">
            {checkpoint.version}
            {checkpoint.score != null
              ? ` · score ${checkpoint.score.toFixed(1)}`
              : ""}
            {` · ${checkpoint.phase}`}
            {` · ${checkpoint.scriptLength} chars`}
            {` · saved ${formatDateTime(checkpoint.updatedAt)}`}
          </p>
          {checkpoint.briefReason ? (
            <p className="text-muted-foreground">
              Critique: {checkpoint.briefReason}
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={resetCheckpoint}
              onChange={(event) => setResetCheckpoint(event.target.checked)}
              disabled={busy}
            />
            <span>
              Discard checkpoint and start from a fresh V1
              <span className="mt-1 block text-xs text-muted-foreground">
                Leave unchecked to resume after ChatGPT send failures or cancel.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={includeReferences}
            onChange={(event) => setIncludeReferences(event.target.checked)}
            disabled={busy}
          />
          <span>
            Include reference transcripts in the Script Writer request
            <span className="mt-1 block text-xs text-muted-foreground">
              Optional. When enabled, selected transcripts from Reference Library
              are added for pattern analysis only (not for copying).
            </span>
          </span>
        </label>
      </div>

      {includeReferences ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Reference transcripts for {channelKey}</Label>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/reference-library">Manage library</Link>
            </Button>
          </div>

          {references.length > 0 ? (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-background p-3">
              {references.map((reference) => {
                const checked = selectedIds.includes(reference.id);
                return (
                  <label
                    key={reference.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(event) =>
                        toggleReference(reference.id, event.target.checked)
                      }
                      disabled={busy}
                    />
                    <span>
                      <span className="font-medium">{reference.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {reference.sourceName
                          ? `${reference.sourceName} · `
                          : ""}
                        {reference.wordCount} words
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No active transcripts for this channel yet. Add them in{" "}
              <Link href="/reference-library" className="underline">
                Reference Library
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={copyPrompt}
          disabled={disabled || busy}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : copyLabel}
        </Button>

        {isPending ? (
          <Button
            type="button"
            variant="destructive"
            onClick={cancelBatch}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Square />
            )}
            {isCancelling ? "Cancelling…" : "Cancel Batch"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={runBatch}
            disabled={disabled || busy}
            title={disabled ? disabledReason ?? undefined : undefined}
          >
            <Play />
            {canResume ? "Resume Batch" : "Run Batch"}
          </Button>
        )}
      </div>

      {disabled && disabledReason ? (
        <p className="text-xs text-destructive">{disabledReason}</p>
      ) : null}

      {isPending && !isCancelling ? (
        <p className="text-xs text-muted-foreground">
          Running Batch… Use Cancel Batch to stop; the UI should unlock right
          away while ChatGPT stops at the next checkpoint.
        </p>
      ) : isCancelling ? (
        <p className="text-xs text-muted-foreground">
          Cancelling… unlocking UI.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {canResume
            ? "Resume continues from the last saved draft instead of rewriting V1."
            : includeReferences
              ? `Copy and Run Batch use the same request with ${
                  effectiveSelectedIds.length
                } selected transcript${
                  effectiveSelectedIds.length === 1 ? "" : "s"
                }.`
              : "Copy and Run Batch use the same request without reference transcripts."}
        </p>
      )}
    </div>
  );
}
