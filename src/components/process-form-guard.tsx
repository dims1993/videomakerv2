"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const CLEAR_FALLBACK_MS = 90_000;
const LIGHT_CLEAR_FALLBACK_MS = 8_000;

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (typeof input !== "string" && !(input instanceof URL) && input.method) {
    return input.method.toUpperCase();
  }

  return "GET";
}

function isTrackedActionFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = getRequestMethod(input, init);
  if (method === "GET" || method === "HEAD") {
    return false;
  }

  const url = getRequestUrl(input);
  // Keep background polling out of the submit watcher so its errors don't
  // surface as ProcessFormGuard stack frames and don't delay banner clear.
  if (url.includes("/api/process-runs") || url.includes("/cancel-batch")) {
    return false;
  }

  return true;
}

export function ProcessFormGuard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  useEffect(() => {
    let clearTimer: number | null = null;
    let lightTimer: number | null = null;
    let settleTimer: number | null = null;
    let activeSubmitter: HTMLButtonElement | null = null;
    let restoreFetch: (() => void) | null = null;

    function restoreSubmitter(submitter: HTMLButtonElement | null) {
      if (!submitter?.dataset.originalText) {
        return;
      }

      submitter.disabled = false;
      submitter.textContent = submitter.dataset.originalText;
      delete submitter.dataset.originalText;
    }

    function clearPending() {
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
        clearTimer = null;
      }
      if (lightTimer !== null) {
        window.clearTimeout(lightTimer);
        lightTimer = null;
      }
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }

      restoreFetch?.();
      restoreFetch = null;
      restoreSubmitter(activeSubmitter);
      activeSubmitter = null;
      setPendingLabel(null);
    }

    function armFetchSettleWatcher() {
      const originalFetch = window.fetch.bind(window);
      let pendingFetches = 0;
      let sawTrackedFetch = false;

      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const [input, init] = args;

        if (!isTrackedActionFetch(input, init)) {
          return originalFetch(...args);
        }

        sawTrackedFetch = true;
        pendingFetches += 1;

        try {
          return await originalFetch(...args);
        } catch (error) {
          clearPending();
          throw error;
        } finally {
          pendingFetches -= 1;
          if (pendingFetches <= 0) {
            if (settleTimer !== null) {
              window.clearTimeout(settleTimer);
            }
            settleTimer = window.setTimeout(() => {
              clearPending();
            }, 50);
          }
        }
      };

      restoreFetch = () => {
        window.fetch = originalFetch;
      };

      lightTimer = window.setTimeout(() => {
        if (!sawTrackedFetch) {
          clearPending();
        }
      }, LIGHT_CLEAR_FALLBACK_MS);
    }

    function handleSubmit(event: SubmitEvent) {
      const submitter =
        event.submitter instanceof HTMLButtonElement ? event.submitter : null;

      if (submitter?.dataset.processGuard === "off") {
        return;
      }

      const originalText = submitter?.textContent?.trim() || "Running";

      // Drop any previous patch/timers before arming a new watcher.
      clearPending();

      if (submitter) {
        submitter.dataset.originalText = originalText;
        submitter.disabled = true;
        submitter.textContent = "Running...";
        activeSubmitter = submitter;
      }

      setPendingLabel(originalText);
      armFetchSettleWatcher();

      clearTimer = window.setTimeout(() => {
        clearPending();
      }, CLEAR_FALLBACK_MS);
    }

    window.addEventListener("submit", handleSubmit, true);

    // Navigation / query changes (successful redirects) unwind the patch.
    clearPending();

    return () => {
      clearPending();
      window.removeEventListener("submit", handleSubmit, true);
    };
  }, [pathname, searchParams]);

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
