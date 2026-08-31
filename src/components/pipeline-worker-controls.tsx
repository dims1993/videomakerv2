"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { stopPipelineQueueWorkerAction } from "@/app/pipeline-actions";
import { Button } from "@/components/ui/button";

const KEEP_ALIVE_KEY = "pipeline-worker-keep-alive";

type PipelineWorkerControlsProps = {
  initiallyRunning: boolean;
  /** When true, keep-alive may auto-restart after Next.js/network drops. */
  hasQueuedWork?: boolean;
};

async function fetchWorkerStatus(): Promise<{ running: boolean } | null> {
  try {
    const response = await fetch("/api/pipeline-queue/worker", {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as { running: boolean };
  } catch {
    // Next.js mid-restart often throws TypeError: network error
    return null;
  }
}

async function startWorkerRequest(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const response = await fetch("/api/pipeline-queue/worker", {
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      reason?: string;
    };
    if (response.status === 409 || body.reason === "already_running") {
      return { ok: true, reason: "already_running" };
    }
    if (!response.ok || !body.ok) {
      return { ok: false, reason: body.reason || "start_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

/**
 * router.refresh() RSC fetches often throw TypeError("network error") when
 * Next.js is restarting / the tab is busy. That surfaces as a red overlay on
 * the Server Component tree (misleading stack on pipeline-queue page).
 */
function safeRouterRefresh(
  router: ReturnType<typeof useRouter>,
  startTransition: (cb: () => void) => void,
) {
  startTransition(() => {
    try {
      const result = router.refresh() as void | Promise<void>;
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).catch(() => undefined);
      }
    } catch {
      // ignore mid-restart blips
    }
  });
}

export function PipelineWorkerControls({
  initiallyRunning,
}: PipelineWorkerControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(initiallyRunning);
  const [keepAlive, setKeepAlive] = useState(false);
  const restartingRef = useRef(false);
  const refreshCooldownRef = useRef(false);

  const refreshQueue = useCallback(() => {
    if (refreshCooldownRef.current) {
      return;
    }
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    refreshCooldownRef.current = true;
    safeRouterRefresh(router, startTransition);
    window.setTimeout(() => {
      refreshCooldownRef.current = false;
    }, 2500);
  }, [router, startTransition]);

  useEffect(() => {
    setRunning(initiallyRunning);
  }, [initiallyRunning]);

  useEffect(() => {
    try {
      setKeepAlive(window.localStorage.getItem(KEEP_ALIVE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  // Next.js RSC refresh failures often bubble as unhandled TypeError("network error")
  // and the overlay mis-attributes them to PipelineQueuePage JSX.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      if (
        reason instanceof TypeError &&
        /^network error$/i.test(message.trim())
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  function setKeepAliveFlag(value: boolean) {
    setKeepAlive(value);
    try {
      if (value) {
        window.localStorage.setItem(KEEP_ALIVE_KEY, "1");
      } else {
        window.localStorage.removeItem(KEEP_ALIVE_KEY);
      }
    } catch {
      // ignore
    }
  }

  // While keep-alive is on: poll worker health and auto-restart after
  // Next.js memory restarts / network blips (orphan reclaim runs on Start).
  useEffect(() => {
    if (!keepAlive) {
      return;
    }

    const tick = async () => {
      const status = await fetchWorkerStatus();
      if (status === null) {
        // Server restarting — wait; don't clear keep-alive.
        setNotice(
          "Server unreachable (likely Next.js restart). Keep-alive will resume the worker…",
        );
        return;
      }

      if (status.running) {
        setRunning(true);
        setNotice("");
        return;
      }

      setRunning(false);
      // Always try restart while keep-alive is on. Start worker reclaims orphans
      // (running→queued). If the queue is truly empty the loop exits cleanly.
      if (restartingRef.current) {
        return;
      }
      restartingRef.current = true;
      setNotice(
        "Worker died (network/Next restart). Auto-restarting and reclaiming progress…",
      );
      const started = await startWorkerRequest();
      restartingRef.current = false;
      if (started.ok) {
        setRunning(true);
        setNotice("Worker auto-restarted. Checkpoints/queue preserved.");
        refreshQueue();
      } else if (started.reason === "network_error") {
        setNotice(
          "Auto-restart waiting — server still coming back from network error…",
        );
      } else {
        setError(
          `Auto-restart failed (${started.reason}). Click Start worker when ready.`,
        );
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [keepAlive, refreshQueue]);

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setInterval(() => {
      refreshQueue();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [running, refreshQueue]);

  function startWorker() {
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const started = await startWorkerRequest();
        if (!started.ok) {
          throw new Error(
            started.reason === "network_error"
              ? "Network error starting worker (server may be restarting). Try again in a few seconds."
              : "Could not start worker.",
          );
        }
        setKeepAliveFlag(true);
        setRunning(true);
        setNotice(
          "Worker started with keep-alive — auto-restarts after Next.js/network drops.",
        );
        refreshQueue();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start worker.");
      }
    });
  }

  function stopWorker() {
    setError("");
    startTransition(async () => {
      try {
        setKeepAliveFlag(false);
        const response = await fetch("/api/pipeline-queue/worker", {
          method: "DELETE",
        });
        const body = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          parkedItems?: number;
          error?: string;
        };
        if (!response.ok || body.ok === false) {
          await stopPipelineQueueWorkerAction();
        }
        setRunning(false);
        setNotice(
          body.message ||
            "Worker stopped. Progress preserved — Start worker to resume.",
        );
        refreshQueue();
      } catch (err) {
        // Even if DELETE fails mid-network blip, clear keep-alive so we don't
        // immediately restart after an intentional Stop.
        setKeepAliveFlag(false);
        setError(err instanceof Error ? err.message : "Could not stop worker.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {running || keepAlive ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={stopWorker}
            title="Stops the worker and parks the current video. Checkpoints are kept; Start worker resumes. Also disables keep-alive."
          >
            Stop worker
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={startWorker}>
            Start worker
          </Button>
        )}
      </div>
      {keepAlive ? (
        <p className="max-w-sm text-right text-xs text-muted-foreground">
          Keep-alive on — recovers after Next.js memory/network restarts.
        </p>
      ) : null}
      {notice ? (
        <p className="max-w-sm text-right text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
