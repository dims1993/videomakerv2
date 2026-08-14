"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  checkWhisperXHealthAction,
  getWhisperXProcessStatusAction,
  startWhisperXServerAction,
  stopWhisperXServerAction,
} from "@/app/whisperx-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AlignmentProvider } from "@/lib/alignment-provider";

type SubtitleAlignmentProviderPickerProps = {
  formId: string;
  defaultProvider: AlignmentProvider;
  /** When true, renders a named select for pipeline settings forms. */
  name?: string;
  id?: string;
  disabled?: boolean;
  showHealth?: boolean;
};

const READY_POLL_MS = 2_000;
const READY_TIMEOUT_MS = 180_000;

function normalizeProvider(value: unknown): AlignmentProvider {
  return value === "whisperx" ? "whisperx" : "elevenlabs";
}

export function SubtitleAlignmentProviderPicker({
  formId,
  defaultProvider,
  name = "alignmentProvider",
  id = "alignmentProvider",
  disabled = false,
  showHealth = true,
}: SubtitleAlignmentProviderPickerProps) {
  const [provider, setProvider] = useState<AlignmentProvider>(() =>
    normalizeProvider(defaultProvider),
  );
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [installReady, setInstallReady] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isStarting, setIsStarting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearReadyPoll() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function applyStatus(status: {
    healthy: boolean;
    baseUrl: string;
    installReady: boolean;
    processAlive: boolean;
    message: string;
  }) {
    setHealthy(status.healthy);
    setBaseUrl(status.baseUrl);
    setInstallReady(status.installReady);
    setStatusMessage(status.message);
    if (status.healthy) {
      setError("");
      setIsStarting(false);
      clearReadyPoll();
    } else if (status.processAlive) {
      setError("");
    } else if (!isStarting) {
      setError(status.message);
    }
  }

  function refreshStatus() {
    startTransition(async () => {
      try {
        const status = await getWhisperXProcessStatusAction();
        applyStatus(status);
      } catch {
        const health = await checkWhisperXHealthAction();
        setHealthy(health.ok);
        setBaseUrl(health.baseUrl);
        setStatusMessage(health.message);
        setError(health.ok ? "" : health.message);
      }
    });
  }

  useEffect(() => {
    setProvider(normalizeProvider(defaultProvider));
  }, [defaultProvider]);

  useEffect(() => {
    if (!showHealth || provider !== "whisperx") {
      clearReadyPoll();
      setHealthy(null);
      setError("");
      setStatusMessage("");
      setIsStarting(false);
      return;
    }
    refreshStatus();
    return () => clearReadyPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount probe when provider/health toggles
  }, [provider, showHealth]);

  function startReadyPoll() {
    clearReadyPoll();
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        try {
          const status = await getWhisperXProcessStatusAction();
          applyStatus(status);
          if (status.healthy) {
            return;
          }
          if (Date.now() - startedAt > READY_TIMEOUT_MS) {
            clearReadyPoll();
            setIsStarting(false);
            setError(
              `WhisperX did not become ready within ${Math.round(READY_TIMEOUT_MS / 1000)}s. Check storage/logs/whisperx-server.log.`,
            );
          }
        } catch (pollError) {
          clearReadyPoll();
          setIsStarting(false);
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Failed while waiting for WhisperX.",
          );
        }
      })();
    }, READY_POLL_MS);
  }

  function startServer() {
    setIsStarting(true);
    setError("");
    setStatusMessage(
      "Starting WhisperX… first boot can take a minute (align model load).",
    );
    startTransition(async () => {
      try {
        const status = await startWhisperXServerAction();
        applyStatus(status);
        if (!status.healthy) {
          startReadyPoll();
        }
      } catch (startError) {
        setIsStarting(false);
        setHealthy(false);
        setError(
          startError instanceof Error
            ? startError.message
            : "Failed to start WhisperX server.",
        );
      }
    });
  }

  function stopServer() {
    clearReadyPoll();
    setIsStarting(false);
    setError("");
    startTransition(async () => {
      try {
        const status = await stopWhisperXServerAction();
        applyStatus(status);
        setStatusMessage(status.healthy ? status.message : "WhisperX stopped.");
      } catch (stopError) {
        setError(
          stopError instanceof Error
            ? stopError.message
            : "Failed to stop WhisperX server.",
        );
      }
    });
  }

  const busy = isPending || isStarting;

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Subtitle alignment</Label>
      <select
        id={id}
        name={name}
        form={formId}
        className="flex h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
        value={provider}
        disabled={disabled}
        onChange={(event) =>
          setProvider(normalizeProvider(event.target.value))
        }
      >
        <option value="elevenlabs">ElevenLabs forced alignment</option>
        <option value="whisperx">WhisperX (local)</option>
      </select>
      {showHealth && provider === "whisperx" ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={
                healthy === true
                  ? "text-emerald-700 dark:text-emerald-400"
                  : healthy === false
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              {healthy === null
                ? "Checking WhisperX…"
                : healthy
                  ? `Online · ${baseUrl}`
                  : isStarting
                    ? `Starting… · ${baseUrl || "WHISPERX_BASE_URL"}`
                    : `Offline · ${baseUrl || "WHISPERX_BASE_URL"}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={refreshStatus}
              disabled={busy || disabled}
            >
              Refresh
            </Button>
            {healthy ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stopServer}
                disabled={busy || disabled}
              >
                Stop server
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={startServer}
                disabled={busy || disabled || !installReady}
                title={
                  installReady
                    ? "Spawn WhisperX-Server/venv python locally"
                    : "WhisperX-Server/venv not found — see WhisperX-Server/README.md"
                }
              >
                {isStarting ? "Starting…" : "Start server"}
              </Button>
            )}
          </div>
          {statusMessage && (healthy === false || isStarting) ? (
            <p className="text-xs text-muted-foreground">{statusMessage}</p>
          ) : null}
          {error && !isStarting ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Word timestamps from known scene text + audio (forced alignment).
        </p>
      )}
    </div>
  );
}
