"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ProcessLogItem = {
  timestamp: string;
  level: "info" | "warning" | "error" | "success";
  message: string;
};

type ProcessRun = {
  id: string;
  type: string;
  videoId?: string | null;
  title: string;
  description: string | null;
  status: string;
  currentStep: string | null;
  totalSteps: number | null;
  progressPercent: number | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  logs: unknown;
};

const ACTIVE_STATUSES = new Set(["queued", "running", "waiting"]);
const STALE_AFTER_MS = 45_000;

function formatElapsed(startedAt: string, finishedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function formatLogTime(value: string) {
  return value.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] ?? value.slice(0, 19);
}

function parseLogs(value: unknown): ProcessLogItem[] {
  return Array.isArray(value) ? (value as ProcessLogItem[]) : [];
}

function statusVariant(status: string) {
  if (status === "success") return "default";
  if (status === "failed") return "outline";
  return "outline";
}

function logClass(level: ProcessLogItem["level"]) {
  if (level === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (level === "warning") return "border-yellow-500/30 bg-yellow-500/10 text-yellow-700";
  if (level === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  return "border-border bg-background text-muted-foreground";
}

function ProcessIcon({ status }: { status: string }) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 text-emerald-600" />;
  }

  if (status === "failed") {
    return <AlertCircle className="size-4 text-destructive" />;
  }

  if (ACTIVE_STATUSES.has(status)) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }

  return null;
}

export function ProcessStatusCard({ process }: { process: ProcessRun }) {
  const [expanded, setExpanded] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const logs = parseLogs(process.logs);
  const latestLog = logs[logs.length - 1];
  const updatedAt = new Date(process.updatedAt).getTime();
  const isActive = ACTIVE_STATUSES.has(process.status);
  const isStale = isActive && Date.now() - updatedAt > STALE_AFTER_MS;
  const progress = process.progressPercent;
  const canCancelSceneVoiceover =
    isActive &&
    process.type === "scene_voiceover_generation" &&
    Boolean(process.videoId);

  function cancelSceneVoiceover() {
    if (!process.videoId) {
      return;
    }
    setIsCancelling(true);
    void fetch(
      `/api/videos/${process.videoId}/cancel-batch?kind=scene-voiceover`,
      {
        method: "POST",
        keepalive: true,
      },
    );
  }

  return (
    <div className="rounded-md border bg-background p-3 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProcessIcon status={process.status} />
            <div className="font-medium">{process.title}</div>
            <Badge variant={statusVariant(process.status)}>
              {process.status}
            </Badge>
          </div>
          {process.description ? (
            <div className="text-xs text-muted-foreground">{process.description}</div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {process.currentStep ?? "No current step"} · {formatElapsed(process.startedAt, process.finishedAt)}
          </div>
          {canCancelSceneVoiceover ? (
            <div className="pt-1">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7"
                onClick={cancelSceneVoiceover}
                disabled={isCancelling}
              >
                {isCancelling ? "Cancelling…" : "Cancel"}
              </Button>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {typeof progress === "number" ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={
                process.status === "failed"
                  ? "h-full bg-destructive transition-all"
                  : "h-full bg-primary transition-all"
              }
              style={{ width: `${Math.max(2, Math.min(progress, 100))}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[11px] text-muted-foreground">
            {Math.round(progress)}%
          </div>
        </div>
      ) : ACTIVE_STATUSES.has(process.status) ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}

      {isStale ? (
        <div className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-700">
          Still running, no recent updates.
        </div>
      ) : null}

      {process.errorMessage ? (
        <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {process.errorMessage}
        </div>
      ) : null}

      {latestLog && !expanded ? (
        <div className="mt-2 truncate text-xs text-muted-foreground">
          {latestLog.message}
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-3 max-h-52 space-y-1 overflow-auto pr-1">
          {logs.length === 0 ? (
            <div className="text-xs text-muted-foreground">No logs yet.</div>
          ) : (
            logs.map((log) => (
              <div
                key={`${log.timestamp}-${log.message}`}
                className={`rounded border px-2 py-1 text-xs ${logClass(log.level)}`}
              >
                <span className="font-mono text-[11px]">{formatLogTime(log.timestamp)}</span>
                <span className="ml-2">{log.message}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InlineProcessFeedback({
  processes,
}: {
  processes: ProcessRun[];
}) {
  const active = processes.filter((process) => ACTIVE_STATUSES.has(process.status));

  if (active.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      {active.slice(0, 2).map((process) => (
        <ProcessStatusCard key={process.id} process={process} />
      ))}
    </div>
  );
}

export function GlobalProcessTray({
  videoId,
  includeGlobal = true,
}: {
  videoId?: string;
  includeGlobal?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [processes, setProcesses] = useState<ProcessRun[]>([]);
  const [open, setOpen] = useState(true);
  const effectiveVideoId =
    videoId ?? pathname.match(/^\/videos\/([^/?#]+)/)?.[1] ?? undefined;
  const wasActiveRef = useRef(false);

  const hasActive = useMemo(
    () => processes.some((process) => ACTIVE_STATUSES.has(process.status)),
    [processes],
  );

  useEffect(() => {
    if (hasActive) {
      // Remember we saw work in flight (survives Strict Mode cleanup).
      wasActiveRef.current = true;
      return;
    }
    if (!wasActiveRef.current) {
      return;
    }

    // A watched process just finished — pull fresh scene/audio rows.
    // Strict Mode safe: only clear the flag after the refresh actually runs.
    let cancelled = false;
    const timers = [
      window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        router.refresh();
      }, 400),
      window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        wasActiveRef.current = false;
        router.refresh();
      }, 1400),
    ];
    return () => {
      cancelled = true;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [hasActive, router]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const params = new URLSearchParams({
        limit: "8",
        includeGlobal: includeGlobal ? "true" : "false",
      });

      if (effectiveVideoId) {
        params.set("videoId", effectiveVideoId);
      }

      try {
        const response = await fetch(`/api/process-runs?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { processes?: ProcessRun[] };

        if (!cancelled) {
          setProcesses(data.processes ?? []);
        }
      } catch {
        if (!cancelled) {
          setProcesses([]);
        }
      }

      if (!cancelled) {
        timeoutId = setTimeout(poll, hasActive ? 1500 : 3500);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [effectiveVideoId, hasActive, includeGlobal]);

  if (processes.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
      <div className="rounded-md border bg-background/95 shadow-lg backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="font-medium">
            {hasActive ? "Processes running" : "Recent processes"}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {processes.length}
            {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </span>
        </button>
        {open ? (
          <div className="max-h-[70vh] space-y-2 overflow-auto border-t p-2">
            {processes.map((process) => (
              <ProcessStatusCard key={process.id} process={process} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
