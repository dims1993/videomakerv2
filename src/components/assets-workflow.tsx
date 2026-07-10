"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, Copy, ImagePlus, Square } from "lucide-react";

import {
  cancelImageBatch,
  forceResetSelectedImageScenes,
  generateSelectedImageBatch,
  importDownloadedImages,
  prepareImageBatch,
  resetSelectedImageScenes,
  retryFailedScenes,
  retrySelectedImageScenes,
  runImageBatch,
  updateScene,
} from "@/app/actions";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatSceneTypeShare } from "@/lib/format";
import { sceneStatuses, statusLabel } from "@/lib/status";

type AssetScene = {
  id: string;
  sortOrder: number;
  scriptText: string;
  sceneType: string;
  visualPurpose: string | null;
  visualIdea: string | null;
  imagePrompt: string | null;
  duration: number | null;
  imageUrl: string | null;
  imageLocalPath: string | null;
  imageStatus: string;
  imageError: string | null;
  imageBatchId: string | null;
  imageFileName: string | null;
  status: string;
};

type AssetBatch = {
  id: string;
  name: string;
  status: string;
  parallelCount: number;
  outputFolder: string;
  payloadPath: string | null;
  logs: Array<{ at: string; message: string }>;
  createdAt: string;
};

type FilterValue =
  | "all"
  | "pending"
  | "queued"
  | "generating"
  | "waiting_manual"
  | "needs_retry"
  | "downloaded"
  | "attached"
  | "failed"
  | "missing-images"
  | "missing-prompts";

const VISIBLE_LOG_LIMIT = 50;

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function isSceneType(scene: AssetScene, sceneType: string) {
  return scene.sceneType.trim().toLowerCase() === sceneType;
}

function preview(text: string, length = 140) {
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function formatLogTime(isoValue: string) {
  const time = isoValue.match(/T(\d{2}:\d{2}:\d{2})/)?.[1];
  return time ?? isoValue.slice(0, 19);
}

function parseLogs(logsJson: string | null) {
  if (!logsJson) {
    return [];
  }

  try {
    const logs = JSON.parse(logsJson);
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

function getLogKey(log: { at: string; message: string }) {
  return `${log.at}-${log.message}`;
}

function getLogLevel(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("missing") ||
    normalized.includes("not configured")
  ) {
    return "error";
  }

  if (
    normalized.includes("warning") ||
    normalized.includes("manual intervention") ||
    normalized.includes("selector missing")
  ) {
    return "warning";
  }

  if (
    normalized.includes("connected") ||
    normalized.includes("completed") ||
    normalized.includes("attached") ||
    normalized.includes("created")
  ) {
    return "success";
  }

  return "default";
}

function getLogRowClass(message: string) {
  const level = getLogLevel(message);

  if (level === "error") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  if (level === "warning") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  }

  if (level === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  return "border-border bg-background text-muted-foreground";
}

export function mapImageBatchForClient(batch: {
  id: string;
  name: string;
  status: string;
  parallelCount: number;
  outputFolder: string;
  payloadPath: string | null;
  logsJson: string | null;
  createdAt: Date;
}): AssetBatch {
  return {
    id: batch.id,
    name: batch.name,
    status: batch.status,
    parallelCount: batch.parallelCount,
    outputFolder: batch.outputFolder,
    payloadPath: batch.payloadPath,
    logs: parseLogs(batch.logsJson),
    createdAt: batch.createdAt.toISOString(),
  };
}

export function AssetsWorkflow({
  videoId,
  defaultOutputFolder,
  notice,
  scenes,
  batches,
}: {
  videoId: string;
  defaultOutputFolder: string;
  notice?: { type: "error" | "success"; message: string } | null;
  scenes: AssetScene[];
  batches: AssetBatch[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [outputFolder, setOutputFolder] = useState(defaultOutputFolder);
  const [hiddenLogKeys, setHiddenLogKeys] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const selectedIdValue = selectedIds.join(",");
  const latestBatch = batches[0] ?? null;
  const latestBatchScenes = latestBatch
    ? scenes.filter((scene) => scene.imageBatchId === latestBatch.id)
    : [];
  const filteredScenes = useMemo(
    () =>
      scenes.filter((scene) => {
        if (filter === "all") return true;
        if (filter === "missing-images") {
          return !hasText(scene.imageUrl) && !hasText(scene.imageLocalPath);
        }
        if (filter === "missing-prompts") return !hasText(scene.imagePrompt);

        return scene.imageStatus === filter;
      }),
    [filter, scenes],
  );

  const selectedScenes = scenes.filter((scene) => selectedIds.includes(scene.id));
  const promptReadyCount = scenes.filter((scene) => hasText(scene.imagePrompt)).length;
  const attachedCount = scenes.filter(
    (scene) => hasText(scene.imageUrl) || hasText(scene.imageLocalPath),
  ).length;
  const failedCount = scenes.filter((scene) =>
    ["failed", "needs_retry"].includes(scene.imageStatus),
  ).length;
  const avatarCount = scenes.filter((scene) => isSceneType(scene, "avatar")).length;
  const insertCount = scenes.filter((scene) => isSceneType(scene, "insert")).length;
  const spaceCount = scenes.filter((scene) => isSceneType(scene, "space")).length;
  const latestQueuedCount = latestBatchScenes.filter((scene) =>
    ["queued", "generating"].includes(scene.imageStatus),
  ).length;
  const latestCompletedCount = latestBatchScenes.filter((scene) =>
    ["downloaded", "attached"].includes(scene.imageStatus),
  ).length;
  const latestFailedCount = latestBatchScenes.filter((scene) =>
    ["failed", "needs_retry"].includes(scene.imageStatus),
  ).length;
  const latestAttachedCount = latestBatchScenes.filter(
    (scene) => scene.imageStatus === "attached",
  ).length;
  const visibleLogs = useMemo(() => {
    if (!latestBatch) {
      return [];
    }

    const hidden = new Set(hiddenLogKeys);

    return latestBatch.logs
      .filter((log) => !hidden.has(getLogKey(log)))
      .slice(-VISIBLE_LOG_LIMIT);
  }, [hiddenLogKeys, latestBatch]);
  const visibleLogTotal = latestBatch
    ? latestBatch.logs.filter((log) => !hiddenLogKeys.includes(getLogKey(log))).length
    : 0;

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [visibleLogs.length, latestBatch?.status]);

  useEffect(() => {
    setOutputFolder(defaultOutputFolder);
  }, [defaultOutputFolder]);

  useEffect(() => {
    if (!notice || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);

    if (!url.searchParams.has("assetNotice")) {
      return;
    }

    url.searchParams.delete("assetNotice");
    url.searchParams.delete("assetNoticeType");
    url.searchParams.set("tab", "assets");
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [notice]);

  function toggleScene(sceneId: string) {
    setSelectedIds((current) =>
      current.includes(sceneId)
        ? current.filter((id) => id !== sceneId)
        : [...current, sceneId],
    );
  }

  function selectWhere(predicate: (scene: AssetScene) => boolean) {
    setSelectedIds(scenes.filter(predicate).map((scene) => scene.id));
  }

  function selectRange() {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return;
    }

    const min = Math.min(start, end);
    const max = Math.max(start, end);
    selectWhere((scene) => scene.sortOrder >= min && scene.sortOrder <= max);
  }

  function clearVisibleLogs() {
    setHiddenLogKeys((current) => [
      ...current,
      ...visibleLogs.map((log) => getLogKey(log)),
    ]);
  }

  function chooseOutputFolder(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] as
      | (File & { webkitRelativePath?: string })
      | undefined;
    const rootFolder = file?.webkitRelativePath?.split("/")[0];

    if (rootFolder) {
      setOutputFolder(`storage/generated-images/${rootFolder}`);
    }

    event.target.value = "";
  }

  return (
    <div className="grid gap-4">
      {notice ? (
        <div
          className={
            notice.type === "success"
              ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
              : "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          }
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Assets Summary</CardTitle>
          <CardDescription>
            Missing image URLs are expected until images are imported or attached.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
            <SummaryTile label="Scenes" value={scenes.length} />
            <SummaryTile label="Selected" value={selectedScenes.length} />
            <SummaryTile
              label="Prompts ready"
              value={`${promptReadyCount} / ${scenes.length}`}
            />
            <SummaryTile
              label="Images attached"
              value={`${attachedCount} / ${scenes.length}`}
            />
            <SummaryTile label="Missing images" value={scenes.length - attachedCount} />
            <SummaryTile label="Failed" value={failedCount} />
            <SummaryTile
              label="Avatars"
              value={formatSceneTypeShare(avatarCount, scenes.length)}
            />
            <SummaryTile
              label="Inserts"
              value={formatSceneTypeShare(insertCount, scenes.length)}
            />
            <SummaryTile
              label="Space"
              value={formatSceneTypeShare(spaceCount, scenes.length)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch Generation</CardTitle>
          <CardDescription>
            Prepare payloads for Google Flow, then import the downloaded images.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">Use your logged-in Chrome profile</div>
            <p className="mt-1 text-muted-foreground">
              To use your logged-in Google account, start Chrome with remote debugging enabled:
            </p>
            <p className="mt-1 text-muted-foreground">
              If the wrong Chrome opens, quit all Chrome windows first, then launch this command so port 9222 belongs to the dedicated profile.
            </p>
            <code className="mt-2 block break-all rounded bg-background p-2 text-xs">
              /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/Users/davidisraelmunozsalinas/.videomaker-flow-chrome"
            </code>
          </div>

          <form
            action={prepareImageBatch.bind(null, videoId)}
            className="grid gap-4 lg:grid-cols-[1fr_1fr_140px_140px_140px]"
          >
            <input type="hidden" name="selectedSceneIds" value={selectedIdValue} />
            <div className="grid gap-2">
              <Label htmlFor="batchName">Batch name</Label>
              <Input id="batchName" name="batchName" placeholder="Scenes 1-20" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outputFolder">Output folder</Label>
              <div className="flex gap-2">
                <Input
                  id="outputFolder"
                  name="outputFolder"
                  value={outputFolder}
                  onChange={(event) => setOutputFolder(event.target.value)}
                  placeholder={defaultOutputFolder}
                />
                <Button asChild type="button" variant="outline">
                  <label htmlFor="outputFolderPicker" className="cursor-pointer">
                    Select
                  </label>
                </Button>
                <input
                  id="outputFolderPicker"
                  type="file"
                  className="sr-only"
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  onChange={chooseOutputFolder}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="parallelCount">Flow batch size</Label>
              <Input id="parallelCount" name="parallelCount" type="number" min="1" max="8" defaultValue={4} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="delayMs">Delay ms</Label>
              <Input id="delayMs" name="delayMs" type="number" min="0" defaultValue={0} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="retryCount">Retries</Label>
              <Input id="retryCount" name="retryCount" type="number" min="0" defaultValue={0} />
            </div>
            <div className="flex flex-wrap gap-2 lg:col-span-5">
              <Button type="submit" disabled={selectedIds.length === 0}>
                Prepare Batch Only
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={selectedIds.length === 0}
                formAction={generateSelectedImageBatch.bind(null, videoId)}
              >
                <ImagePlus />
                Generate Selected Scenes
              </Button>
            </div>
          </form>

          <form
            action={importDownloadedImages.bind(null, videoId)}
            className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto]"
          >
            <input type="hidden" name="batchId" value={latestBatch?.id ?? ""} />
            <input type="hidden" name="selectedSceneIds" value={selectedIdValue} />
            <div className="grid gap-2">
              <Label htmlFor="importFolderPath">Import scoped downloaded images</Label>
              <Input
                id="importFolderPath"
                name="importFolderPath"
                placeholder="/Users/.../Downloads"
              />
            </div>
            <label className="mt-7 flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="overwriteImages" />
              Overwrite
            </label>
            <label className="mt-7 flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="latestOnly" disabled={selectedIds.length === 0} />
              Latest selected
            </label>
            <Button type="submit" className="mt-7" variant="outline">
              Import Downloaded Images
            </Button>
          </form>

          {latestBatch ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{statusLabel(latestBatch.status)}</Badge>
                  <span className="font-medium">{latestBatch.name}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <span>Queue: {latestQueuedCount}</span>
                  <span>Completed: {latestCompletedCount}</span>
                  <span>Failed: {latestFailedCount}</span>
                  <span>Attached: {latestAttachedCount}</span>
                </div>
                <div className="mt-3 break-all text-xs text-muted-foreground">
                  Payload: {latestBatch.payloadPath ?? "Not written yet."}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={runImageBatch.bind(null, videoId)}>
                    <input type="hidden" name="batchId" value={latestBatch.id} />
                    <Button type="submit" size="sm">Run Batch</Button>
                  </form>
                  <form action={retryFailedScenes.bind(null, videoId)}>
                    <input type="hidden" name="batchId" value={latestBatch.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Retry Failed Scenes
                    </Button>
                  </form>
                  <form action={cancelImageBatch.bind(null, videoId)}>
                    <input type="hidden" name="batchId" value={latestBatch.id} />
                    <input type="hidden" name="selectedSceneIds" value={selectedIdValue} />
                    <Button type="submit" size="sm" variant="outline">
                      Cancel Running Batch
                    </Button>
                  </form>
                  {latestBatch.payloadPath ? (
                    <>
                      <CopyPromptButton label="Copy payload path" prompt={latestBatch.payloadPath} />
                      <Button asChild size="sm" variant="outline">
                        <a href={`/api/image-batches/${latestBatch.id}/payload`} target="_blank">
                          Inspect payload
                        </a>
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Recent logs</div>
                    {visibleLogTotal > VISIBLE_LOG_LIMIT ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Showing latest {VISIBLE_LOG_LIMIT} of {visibleLogTotal} logs
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={visibleLogs.length === 0}
                    onClick={clearVisibleLogs}
                  >
                    Clear visible logs
                  </Button>
                </div>
                <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
                  {visibleLogs.length === 0 ? (
                    <div className="text-muted-foreground">No logs to show.</div>
                  ) : (
                    visibleLogs.map((log) => (
                      <div
                        key={getLogKey(log)}
                        className={`rounded border px-2 py-1.5 ${getLogRowClass(log.message)}`}
                      >
                        <span className="font-mono text-[11px]">
                          {formatLogTime(log.at)}
                        </span>
                        <span className="ml-2">{log.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scene Selection</CardTitle>
          <CardDescription>
            Work in small batches for Google Flow, then import the downloaded files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => selectWhere(() => true)}>
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedIds([])}>
              Clear selection
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                selectWhere((scene) => !hasText(scene.imageUrl) && !hasText(scene.imageLocalPath))
              }
            >
              Missing images
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                selectWhere((scene) =>
                  ["failed", "needs_retry"].includes(scene.imageStatus),
                )
              }
            >
              Failed / needs retry
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => selectWhere((scene) => hasText(scene.imagePrompt))}
            >
              With prompts
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => selectWhere((scene) => !hasText(scene.imagePrompt))}
            >
              Without prompts
            </Button>
            <form action={resetSelectedImageScenes.bind(null, videoId)}>
              <input type="hidden" name="selectedSceneIds" value={selectedIdValue} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0}
              >
                Reset selected scenes
              </Button>
            </form>
            <form action={retrySelectedImageScenes.bind(null, videoId)}>
              <input type="hidden" name="selectedSceneIds" value={selectedIdValue} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0}
              >
                Retry selected scenes
              </Button>
            </form>
            <form action={forceResetSelectedImageScenes.bind(null, videoId)}>
              <input type="hidden" name="selectedSceneIds" value={selectedIdValue} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0}
              >
                Force reset selected scenes
              </Button>
            </form>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_120px_120px_auto]">
            <div className="grid gap-2">
              <Label htmlFor="assetFilter">Filter</Label>
              <select
                id="assetFilter"
                value={filter}
                onChange={(event) => setFilter(event.target.value as FilterValue)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="queued">Queued</option>
                <option value="generating">Generating</option>
                <option value="waiting_manual">Waiting manual</option>
                <option value="needs_retry">Needs retry</option>
                <option value="downloaded">Downloaded</option>
                <option value="attached">Attached</option>
                <option value="failed">Failed</option>
                <option value="missing-images">Missing images</option>
                <option value="missing-prompts">Missing prompts</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rangeStart">Range start</Label>
              <Input id="rangeStart" type="number" min="1" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rangeEnd">Range end</Label>
              <Input id="rangeEnd" type="number" min="1" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
            </div>
            <Button type="button" variant="outline" className="mt-7" onClick={selectRange}>
              Select range
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredScenes.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            No scenes match this filter.
          </CardContent>
        </Card>
      ) : (
        filteredScenes.map((scene) => (
          <Card key={scene.id}>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => toggleScene(scene.id)}
                    className="mt-1 text-muted-foreground"
                    aria-label={`Select scene ${scene.sortOrder}`}
                  >
                    {selectedIds.includes(scene.id) ? <CheckSquare /> : <Square />}
                  </button>
                  <div>
                    <CardTitle>Scene {scene.sortOrder}</CardTitle>
                    <CardDescription>
                      {scene.sceneType} - {preview(scene.scriptText)}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="muted">{statusLabel(scene.imageStatus)}</Badge>
                  <Badge variant="outline">{statusLabel(scene.status)}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
                <div className="aspect-video overflow-hidden rounded-md border bg-muted">
                  {scene.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${scene.sortOrder}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-medium">Image prompt</div>
                    <p className="mt-1 text-muted-foreground">{scene.imagePrompt || "No prompt yet."}</p>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                    <div>Image status: {statusLabel(scene.imageStatus)}</div>
                    <div className="break-all">Image URL: {scene.imageUrl || "Missing"}</div>
                    <div className="break-all">Local path: {scene.imageLocalPath || "Missing"}</div>
                    <div>File name: {scene.imageFileName || "Not assigned"}</div>
                    <div>Batch: {scene.imageBatchId || "None"}</div>
                  </div>
                  {scene.imageError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      {scene.imageError}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <CopyPromptButton label="Copy Prompt" prompt={scene.imagePrompt ?? ""} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleScene(scene.id)}
                    >
                      <Copy />
                      {selectedIds.includes(scene.id) ? "Unselect" : "Select"}
                    </Button>
                  </div>
                </div>
              </div>

              <form action={updateScene.bind(null, scene.id, videoId)} className="space-y-4">
                <input type="hidden" name="order" value={scene.sortOrder} />
                <input type="hidden" name="scriptText" value={scene.scriptText} />
                <input type="hidden" name="sceneType" value={scene.sceneType} />
                <input type="hidden" name="visualPurpose" value={scene.visualPurpose ?? ""} />
                <input type="hidden" name="visualIdea" value={scene.visualIdea ?? ""} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`asset-prompt-${scene.id}`}>Image prompt</Label>
                    <Textarea
                      id={`asset-prompt-${scene.id}`}
                      name="imagePrompt"
                      defaultValue={scene.imagePrompt ?? ""}
                      placeholder="Prompt for the scene image..."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`asset-url-${scene.id}`}>Image URL</Label>
                    <Input
                      id={`asset-url-${scene.id}`}
                      name="imageUrl"
                      defaultValue={scene.imageUrl ?? ""}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`asset-duration-${scene.id}`}>Duration</Label>
                    <Input
                      id={`asset-duration-${scene.id}`}
                      name="duration"
                      type="number"
                      min="1"
                      defaultValue={scene.duration ?? ""}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`asset-status-${scene.id}`}>Status</Label>
                    <select
                      id={`asset-status-${scene.id}`}
                      name="status"
                      defaultValue={scene.status}
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      {sceneStatuses.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button type="submit" size="sm">Save asset info</Button>
              </form>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
