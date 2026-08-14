"use client";

import { Loader2, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  cancelThumbnailBatchAction,
  deleteThumbnailPromptMasterAction,
  markThumbnailReadyAction,
  resetThumbnailAction,
  saveThumbnailPromptMasterAction,
  selectVideoThumbnailPromptMasterAction,
  setDefaultThumbnailPromptMasterAction,
} from "@/app/thumbnail-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ThumbnailPromptMaster } from "@/lib/thumbnail-prompt-masters";

type ThumbnailMasterWorkflowProps = {
  videoId: string;
  videoTitle: string;
  channelKey: string;
  channelName: string;
  thumbnailStatus: string;
  resolvedPrompt: string | null;
  thumbnailNotes: string | null;
  previewSrc: string | null;
  fileName: string | null;
  selectedMasterId: string | null;
  masters: ThumbnailPromptMaster[];
  defaultMasterId: string | null;
};

export function ThumbnailMasterWorkflow({
  videoId,
  videoTitle,
  channelKey,
  channelName,
  thumbnailStatus,
  resolvedPrompt,
  thumbnailNotes,
  previewSrc,
  fileName,
  selectedMasterId,
  masters: initialMasters,
  defaultMasterId: initialDefaultMasterId,
}: ThumbnailMasterWorkflowProps) {
  const router = useRouter();
  const [masters, setMasters] = useState(initialMasters);
  const [defaultMasterId, setDefaultMasterId] = useState(initialDefaultMasterId);
  const [selectedId, setSelectedId] = useState(
    selectedMasterId || initialDefaultMasterId || initialMasters[0]?.id || "",
  );
  const selected = useMemo(
    () => masters.find((master) => master.id === selectedId) ?? null,
    [masters, selectedId],
  );

  const [name, setName] = useState(selected?.name ?? "Prompt master");
  const [prompt, setPrompt] = useState(selected?.prompt ?? "");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  function loadMaster(master: ThumbnailPromptMaster | null) {
    if (!master) {
      setSelectedId("");
      setName("Prompt master");
      setPrompt("");
      return;
    }
    setSelectedId(master.id);
    setName(master.name);
    setPrompt(master.prompt);
  }

  function saveMaster(asNew: boolean) {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("channelKey", channelKey);
        formData.set("videoId", videoId);
        formData.set("name", name);
        formData.set("prompt", prompt);
        if (!asNew && selectedId) {
          formData.set("masterId", selectedId);
        }
        if (setAsDefault || asNew) {
          formData.set("setAsDefault", "true");
        }
        const result = await saveThumbnailPromptMasterAction(formData);
        setMasters(result.channel.masters);
        setDefaultMasterId(result.channel.defaultMasterId);
        loadMaster(result.master);
        setSetAsDefault(false);
        setMessage(
          asNew
            ? `Saved new prompt master “${result.master.name}”.`
            : `Updated prompt master “${result.master.name}”.`,
        );
        router.refresh();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save prompt master.",
        );
      }
    });
  }

  function setDefault() {
    if (!selectedId) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("channelKey", channelKey);
        formData.set("videoId", videoId);
        formData.set("masterId", selectedId);
        const channel = await setDefaultThumbnailPromptMasterAction(formData);
        setMasters(channel.masters);
        setDefaultMasterId(channel.defaultMasterId);
        setMessage("Default prompt master updated for this channel.");
        router.refresh();
      } catch (defaultError) {
        setError(
          defaultError instanceof Error
            ? defaultError.message
            : "Failed to set default.",
        );
      }
    });
  }

  function deleteMaster() {
    if (!selectedId) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("channelKey", channelKey);
        formData.set("videoId", videoId);
        formData.set("masterId", selectedId);
        const channel = await deleteThumbnailPromptMasterAction(formData);
        setMasters(channel.masters);
        setDefaultMasterId(channel.defaultMasterId);
        loadMaster(channel.masters[0] ?? null);
        setMessage("Prompt master deleted.");
        router.refresh();
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete prompt master.",
        );
      }
    });
  }

  function useForVideo() {
    if (!selected) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("masterId", selected.id);
        formData.set("masterName", selected.name);
        await selectVideoThumbnailPromptMasterAction(videoId, formData);
        setMessage(`Using “${selected.name}” for this video.`);
        router.refresh();
      } catch (selectError) {
        setError(
          selectError instanceof Error
            ? selectError.message
            : "Failed to select master for video.",
        );
      }
    });
  }

  async function runBatch() {
    setError("");
    setMessage("Starting thumbnail batch…");
    setIsRunning(true);
    try {
      if (selected) {
        const formData = new FormData();
        formData.set("masterId", selected.id);
        formData.set("masterName", selected.name);
        await selectVideoThumbnailPromptMasterAction(videoId, formData);
      }

      const response = await fetch(
        `/api/videos/${encodeURIComponent(videoId)}/thumbnail-batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ masterId: selectedId || null }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        canceled?: boolean;
        error?: string;
        fileName?: string;
      };

      if (response.status === 499 || body.canceled) {
        setMessage("Thumbnail batch canceled.");
        return;
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error || `Thumbnail batch failed (${response.status}).`);
      }

      setMessage(
        body.fileName
          ? `Thumbnail saved as ${body.fileName}.`
          : "Thumbnail batch finished.",
      );
      router.refresh();
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Thumbnail batch failed.",
      );
    } finally {
      setIsRunning(false);
      setIsCancelling(false);
    }
  }

  function cancelBatch() {
    setIsCancelling(true);
    startTransition(async () => {
      try {
        await cancelThumbnailBatchAction(videoId);
        setMessage("Cancel requested…");
      } catch (cancelError) {
        setError(
          cancelError instanceof Error
            ? cancelError.message
            : "Failed to cancel batch.",
        );
        setIsCancelling(false);
      }
    });
  }

  const busy = isPending || isRunning;

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/20 p-4 space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Prompt master — {channelName}</h3>
          <p className="text-xs text-muted-foreground">
            Paste a template with variables. Save it for this channel, mark one as
            default, then run the batch: ChatGPT fills variables from the video
            title, then generates the thumbnail image.
          </p>
          <p className="text-xs text-muted-foreground">
            Video title used for variables: <span className="font-medium text-foreground">{videoTitle}</span>
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(180px,240px)_1fr]">
          <div className="space-y-2">
            <Label htmlFor="thumbnail-master-select">Channel masters</Label>
            <select
              id="thumbnail-master-select"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedId}
              disabled={busy}
              onChange={(event) => {
                const next = masters.find((master) => master.id === event.target.value);
                loadMaster(next ?? null);
              }}
            >
              {masters.length === 0 ? (
                <option value="">No masters yet</option>
              ) : (
                masters.map((master) => (
                  <option key={master.id} value={master.id}>
                    {master.name}
                    {master.id === defaultMasterId ? " (default)" : ""}
                  </option>
                ))
              )}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !selectedId}
                onClick={useForVideo}
              >
                Use for this video
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !selectedId || selectedId === defaultMasterId}
                onClick={setDefault}
              >
                Set as default
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || !selectedId}
                onClick={deleteMaster}
              >
                Delete
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="thumbnail-master-name">Name</Label>
              <Input
                id="thumbnail-master-name"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder="Gods Word CTR master"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="thumbnail-master-prompt">Prompt</Label>
              <textarea
                id="thumbnail-master-prompt"
                className="min-h-48 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                value={prompt}
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Paste the master thumbnail prompt with {{variables}} or [PLACEHOLDERS]…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setAsDefault}
                disabled={busy}
                onChange={(event) => setSetAsDefault(event.target.checked)}
              />
              Also set as channel default
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !name.trim() || !prompt.trim()}
                onClick={() => saveMaster(false)}
              >
                Save master
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !name.trim() || !prompt.trim()}
                onClick={() => saveMaster(true)}
              >
                Save as new
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-muted/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Generate thumbnail</h3>
            <p className="text-xs text-muted-foreground">
              1) Resolve variables with ChatGPT · 2) Generate image · 3) Download &amp; save
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isRunning ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCancelling}
                onClick={cancelBatch}
              >
                {isCancelling ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Square />
                )}
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy || (!selectedId && !prompt.trim())}
                onClick={() => void runBatch()}
              >
                <Play />
                Run thumbnail batch
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium">{thumbnailStatus}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Selected master</p>
            <p className="font-medium">{selected?.name ?? "None"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Saved file</p>
            <p className="font-medium">{fileName ?? "—"}</p>
          </div>
        </div>

        {resolvedPrompt ? (
          <div className="space-y-1">
            <Label>Resolved prompt</Label>
            <textarea
              readOnly
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              value={resolvedPrompt}
            />
            {thumbnailNotes ? (
              <p className="text-xs text-muted-foreground">{thumbnailNotes}</p>
            ) : null}
          </div>
        ) : null}

        {previewSrc ? (
          <div className="space-y-2">
            <Label>Thumbnail preview</Label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="Generated thumbnail"
              className="max-h-80 w-auto rounded-md border bg-background object-contain"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !previewSrc}
            onClick={() => {
              startTransition(async () => {
                await markThumbnailReadyAction(videoId);
                setMessage("Thumbnail marked ready.");
                router.refresh();
              });
            }}
          >
            Mark ready
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              startTransition(async () => {
                await resetThumbnailAction(videoId);
                setMessage("Thumbnail reset.");
                router.refresh();
              });
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {isRunning ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Batch running in ChatGPT browser… keep the CDP Chrome window open.
        </p>
      ) : null}
    </div>
  );
}
