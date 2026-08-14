"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  addChatterboxPredefinedVoiceAction,
  checkChatterboxHealthAction,
  cloneChatterboxVoiceAction,
  getChatterboxProcessStatusAction,
  listChatterboxPredefinedVoicesAction,
  startChatterboxServerAction,
  stopChatterboxServerAction,
} from "@/app/chatterbox-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChatterboxPredefinedVoice } from "@/lib/tts-voices";

const READY_POLL_MS = 2_000;
const READY_TIMEOUT_MS = 180_000;

export function ChatterboxVoiceCloner() {
  const router = useRouter();
  const [voiceName, setVoiceName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [predefinedVoices, setPredefinedVoices] = useState<
    ChatterboxPredefinedVoice[]
  >([]);
  const [selectedPredefined, setSelectedPredefined] = useState("");
  const [predefinedDisplayName, setPredefinedDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [installReady, setInstallReady] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isStarting, setIsStarting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearReadyPoll() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  async function loadPredefinedVoices() {
    try {
      const voices = await listChatterboxPredefinedVoicesAction();
      setPredefinedVoices(voices);
      if (!selectedPredefined && voices[0]) {
        setSelectedPredefined(voices[0].filename);
        setPredefinedDisplayName(voices[0].displayName);
      }
    } catch {
      setPredefinedVoices([]);
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
      setMessage(status.message);
      setError("");
      setIsStarting(false);
      clearReadyPoll();
      void loadPredefinedVoices();
    } else if (status.processAlive) {
      setError("");
    } else if (!isStarting) {
      setError(status.message);
    }
  }

  function refreshStatus() {
    startTransition(async () => {
      try {
        const status = await getChatterboxProcessStatusAction();
        applyStatus(status);
      } catch {
        const health = await checkChatterboxHealthAction();
        setHealthy(health.ok);
        setBaseUrl(health.baseUrl);
        setError(health.ok ? "" : health.message);
        setStatusMessage(health.message);
        if (health.ok) {
          setPredefinedVoices(health.predefinedVoices ?? []);
          if (!selectedPredefined && health.predefinedVoices?.[0]) {
            setSelectedPredefined(health.predefinedVoices[0].filename);
            setPredefinedDisplayName(health.predefinedVoices[0].displayName);
          }
        }
      }
    });
  }

  useEffect(() => {
    refreshStatus();
    return () => clearReadyPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only health probe
  }, []);

  function startReadyPoll() {
    clearReadyPoll();
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        try {
          const status = await getChatterboxProcessStatusAction();
          applyStatus(status);
          if (status.healthy) {
            return;
          }
          if (Date.now() - startedAt > READY_TIMEOUT_MS) {
            clearReadyPoll();
            setIsStarting(false);
            setError(
              `Chatterbox did not become ready within ${Math.round(READY_TIMEOUT_MS / 1000)}s. Check storage/logs/chatterbox-server.log.`,
            );
          }
        } catch (pollError) {
          clearReadyPoll();
          setIsStarting(false);
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Failed while waiting for Chatterbox.",
          );
        }
      })();
    }, READY_POLL_MS);
  }

  function startServer() {
    setIsStarting(true);
    setError("");
    setMessage(
      "Starting Chatterbox… first boot can take 1–2 minutes (model load).",
    );
    startTransition(async () => {
      try {
        const status = await startChatterboxServerAction();
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
            : "Failed to start Chatterbox server.",
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
        const status = await stopChatterboxServerAction();
        applyStatus(status);
        setMessage(status.healthy ? status.message : "Chatterbox stopped.");
      } catch (stopError) {
        setError(
          stopError instanceof Error
            ? stopError.message
            : "Failed to stop Chatterbox server.",
        );
      }
    });
  }

  function addPredefinedVoice() {
    const filename = selectedPredefined.trim();
    if (!filename) {
      setError("Pick a built-in Chatterbox voice first.");
      return;
    }

    startTransition(async () => {
      setError("");
      setMessage("");
      try {
        const result = await addChatterboxPredefinedVoiceAction({
          filename,
          name: predefinedDisplayName.trim() || null,
        });
        setMessage(
          `Saved “${result.voice.name}” to the catalog (Chatterbox predefined · ${result.voice.voiceId}).`,
        );
        router.refresh();
      } catch (addError) {
        setError(
          addError instanceof Error
            ? addError.message
            : "Failed to add predefined Chatterbox voice.",
        );
      }
    });
  }

  function cloneVoice() {
    const name = voiceName.trim();
    if (!name || !file) {
      setError("Provide a voice name and a short reference audio sample.");
      return;
    }

    startTransition(async () => {
      setError("");
      setMessage("");
      try {
        const formData = new FormData();
        formData.set("name", name);
        formData.set("sample", file);
        const result = await cloneChatterboxVoiceAction(formData);
        setMessage(
          `Saved “${result.voice.name}” to the catalog (Chatterbox clone · ${result.voice.voiceId}).`,
        );
        setVoiceName("");
        setFile(null);
        router.refresh();
      } catch (cloneError) {
        setError(
          cloneError instanceof Error
            ? cloneError.message
            : "Failed to clone Chatterbox voice.",
        );
      }
    });
  }

  const busy = isPending || isStarting;

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Chatterbox voices</h3>
        <p className="text-xs text-muted-foreground">
          Add a built-in Chatterbox voice (stable pack) or clone from a sample.
          Then assign it below / in Pipeline Configure.
        </p>
      </div>

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
            ? "Checking Chatterbox server…"
            : healthy
              ? `Online · ${baseUrl}`
              : isStarting
                ? `Starting… · ${baseUrl || "CHATTERBOX_BASE_URL"}`
                : `Offline · ${baseUrl || "CHATTERBOX_BASE_URL"}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refreshStatus}
          disabled={busy}
        >
          Refresh
        </Button>
        {healthy ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={stopServer}
            disabled={busy}
          >
            Stop server
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={startServer}
            disabled={busy || !installReady}
            title={
              installReady
                ? "Spawn Chatterbox-TTS-Server/venv python locally"
                : "Chatterbox-TTS-Server/venv not found"
            }
          >
            {isStarting ? "Starting…" : "Start server"}
          </Button>
        )}
      </div>
      {statusMessage && (healthy === false || isStarting) ? (
        <p className="text-xs text-muted-foreground">{statusMessage}</p>
      ) : null}

      <div className="space-y-3 rounded-md border border-dashed bg-background/60 p-3">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Built-in predefined voice</h4>
          <p className="text-xs text-muted-foreground">
            No upload needed — uses Chatterbox’s `voices/` pack (e.g. Emily,
            Alice). Prefer this for a stable default.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(200px,1fr)_minmax(160px,220px)_auto]">
          <div className="grid gap-2">
            <Label htmlFor="chatterbox-predefined-select">Voice</Label>
            <select
              id="chatterbox-predefined-select"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedPredefined}
              disabled={busy || healthy !== true || predefinedVoices.length === 0}
              onChange={(event) => {
                const filename = event.target.value;
                setSelectedPredefined(filename);
                const match = predefinedVoices.find(
                  (voice) => voice.filename === filename,
                );
                if (match) {
                  setPredefinedDisplayName(match.displayName);
                }
              }}
            >
              {predefinedVoices.length === 0 ? (
                <option value="">
                  {healthy === true
                    ? "No predefined voices found"
                    : "Start Chatterbox to load voices…"}
                </option>
              ) : (
                predefinedVoices.map((voice) => (
                  <option key={voice.filename} value={voice.filename}>
                    {voice.displayName} ({voice.filename})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="chatterbox-predefined-name">Catalog name</Label>
            <Input
              id="chatterbox-predefined-name"
              value={predefinedDisplayName}
              onChange={(event) => setPredefinedDisplayName(event.target.value)}
              placeholder="Emily"
              disabled={busy || healthy !== true}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={addPredefinedVoice}
              disabled={
                busy ||
                healthy !== true ||
                !selectedPredefined ||
                predefinedVoices.length === 0
              }
            >
              {busy && !isStarting ? "Adding…" : "Add to catalog"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-dashed bg-background/60 p-3">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Clone from sample</h4>
          <p className="text-xs text-muted-foreground">
            Upload a clean 5–30s sample when you need a custom voice (Max/Sara,
            etc.).
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,220px)_1fr_auto]">
          <div className="grid gap-2">
            <Label htmlFor="chatterbox-voice-name">Voice name</Label>
            <Input
              id="chatterbox-voice-name"
              value={voiceName}
              onChange={(event) => setVoiceName(event.target.value)}
              placeholder="Max clone"
              disabled={busy}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="chatterbox-sample">Reference sample</Label>
            <Input
              id="chatterbox-sample"
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp3,audio/x-wav,.wav,.mp3"
              disabled={busy}
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={cloneVoice}
              disabled={busy || !voiceName.trim() || !file || healthy !== true}
            >
              {busy && !isStarting ? "Cloning…" : "Clone & add to catalog"}
            </Button>
          </div>
        </div>
      </div>

      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
