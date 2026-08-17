"use client";

import type React from "react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2, Play, Square, Upload } from "lucide-react";

import {
  runVisualPlanBatch,
  saveVideoImageOutputFolderAction,
  updateVideoImageOutputFolder,
} from "@/app/actions";
import { CopyPromptButton } from "@/components/copy-prompt-button";
import { ImageOutputFolderField } from "@/components/image-output-folder-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ImportScenesState } from "@/lib/action-types";
import { formatDateTime } from "@/lib/format";
import {
  extractScriptSegmentByPercent,
  parseScriptFromCurrentVideoData,
  parseAndValidateHandoffResponse,
  scenesToImportJson,
  validateSegmentPercentRange,
  type ChatGptGenerationMode,
  type SceneHandoffValidation,
} from "@/lib/chatgpt-scene-handoff";
import { getChannelSceneGenerationModes } from "@/lib/channels";
import {
  buildTheGodsWordFlowVisualBrief,
  buildTheGodsWordTimingRules,
  buildTheGodsWordGenerationModeInstructions,
} from "@/lib/the-gods-word-visual-brief";
import {
  buildBibleOneYearVisualBrief,
  buildBibleOneYearOutputRequirementsSection,
  buildBibleOneYearGenerationModeInstructions,
  buildBibleOneYearTimingRules,
} from "@/lib/the-bible-in-one-year-visual-brief";
import {
  buildBibleOneYearCoverBeatDirectives,
  prepareBibleOneYearCompactScript,
} from "@/lib/the-bible-in-one-year-compact-script";
import { isBibleOneYearCategory } from "@/lib/the-bible-in-one-year-shared";
import {
  buildWealthInsightsVisualModeSection,
  resolveWealthInsightsVisualMode,
} from "@/lib/wealth-insights-visual-mode";
import { ensureHookMarkersInScript } from "@/lib/visual-plan-script";

const initialState: ImportScenesState = {
  status: "idle",
  message: "",
};

const GENERATION_MODE_LABELS: Record<ChatGptGenerationMode, string> = {
  FULL_VIDEO: "Full Video",
  TEN_SCENE_TEST: "10-Scene Test",
  HOOK_TEST: "Hook Test",
  SEGMENTED_BY_PERCENT: "Segmented by Percent",
};

type SceneImportMode = "replace" | "append" | "prepend";

function getSuggestedSceneImportMode({
  generationMode,
  startPercent,
}: {
  generationMode: ChatGptGenerationMode;
  startPercent: number;
}): SceneImportMode {
  if (generationMode === "SEGMENTED_BY_PERCENT" && startPercent > 0) {
    return "append";
  }

  return "replace";
}

function getDefaultGenerationMode(
  allowedModes: ChatGptGenerationMode[],
): ChatGptGenerationMode {
  if (allowedModes.includes("TEN_SCENE_TEST")) {
    return "TEN_SCENE_TEST";
  }

  return allowedModes.includes("FULL_VIDEO")
    ? "FULL_VIDEO"
    : allowedModes[0];
}

function resolveGenerationMode(
  mode: ChatGptGenerationMode,
  allowedModes: ChatGptGenerationMode[],
): ChatGptGenerationMode {
  if (allowedModes.includes(mode)) {
    return mode;
  }

  return allowedModes.includes("FULL_VIDEO")
    ? "FULL_VIDEO"
    : allowedModes[0];
}

export function ImportScenesForm({
  action,
  visualPlanPromptUrl,
  channelName,
  videoId,
  videoTitle,
  channelKey,
  topicCategory,
  projectBiblePath,
  imagePromptBiblePath,
  characterBiblePath,
  visualPlannerPath,
  scriptLength,
  currentSceneCount,
  currentScenesJsonUrl,
  hybridCheckpoint = null,
  clearHybridProgressAction,
  buildFromScriptAction,
  imageOutputFolder,
}: {
  action: (
    previousState: ImportScenesState,
    formData: FormData,
  ) => Promise<ImportScenesState>;
  visualPlanPromptUrl: string;
  channelName: string;
  videoId: string;
  videoTitle: string;
  channelKey: string;
  topicCategory?: string | null;
  projectBiblePath: string;
  imagePromptBiblePath: string;
  characterBiblePath?: string;
  visualPlannerPath: string;
  scriptLength: number;
  currentSceneCount: number;
  currentScenesJsonUrl: string;
  hybridCheckpoint?: {
    filled: number;
    total: number;
    updatedAt: string;
    mode?: "fill" | "section_generate";
    unit?: "scenes" | "sections";
    stale?: boolean;
  } | null;
  clearHybridProgressAction?: () => Promise<void>;
  buildFromScriptAction?: (imageOutputFolder?: string | null) => Promise<void>;
  imageOutputFolder: string;
}) {
  const allowedModes = useMemo(
    () => getChannelSceneGenerationModes(channelKey),
    [channelKey],
  );
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [isBatchPending, startBatchTransition] = useTransition();
  const [isBatchCancelling, setIsBatchCancelling] = useState(false);
  const [isClearingCheckpoint, startClearCheckpointTransition] = useTransition();
  const [isBuildingFromScript, startBuildFromScriptTransition] = useTransition();
  const [isSavingImageFolder, startSaveImageFolderTransition] = useTransition();
  const [imageFolder, setImageFolder] = useState(imageOutputFolder);
  const [resetHybridCheckpoint, setResetHybridCheckpoint] = useState(false);
  const usesFillHybrid = channelKey === "podcast-english-lessons";
  const usesSectionHybrid =
    channelKey === "the-gods-word" || channelKey === "wealth-insights";
  const supportsHybridVisualPlan =
    usesFillHybrid || usesSectionHybrid || Boolean(hybridCheckpoint);
  const hybridUnit =
    hybridCheckpoint?.unit ??
    (usesSectionHybrid ? "sections" : "scenes");
  const hybridUnitLabel = hybridUnit === "sections" ? "sections" : "scenes";
  const [mode, setMode] = useState<ChatGptGenerationMode>(() =>
    getDefaultGenerationMode(allowedModes),
  );
  const [startPercent, setStartPercent] = useState(0);
  const [endPercent, setEndPercent] = useState(10);
  const [importMode, setImportMode] = useState<SceneImportMode>("replace");
  const [importModeAutoSet, setImportModeAutoSet] = useState(false);
  const [request, setRequest] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestWarnings, setRequestWarnings] = useState<string[]>([]);
  const [response, setResponse] = useState("");
  const [responseFileName, setResponseFileName] = useState<string | null>(null);
  const [manualScenesJson, setManualScenesJson] = useState("");
  const [validation, setValidation] = useState<SceneHandoffValidation | null>(
    null,
  );
  const [manualValidation, setManualValidation] =
    useState<SceneHandoffValidation | null>(null);
  const [copied, setCopied] = useState(false);
  const responseFileInputRef = useRef<HTMLInputElement>(null);
  const segmentValidationError = useMemo(
    () => validateSegmentPercentRange(startPercent, endPercent),
    [startPercent, endPercent],
  );
  const parsedScenesJson = useMemo(
    () => (validation ? scenesToImportJson(validation.scenes) : ""),
    [validation],
  );
  const parsedManualScenesJson = useMemo(
    () =>
      manualValidation ? scenesToImportJson(manualValidation.scenes) : "",
    [manualValidation],
  );

  useEffect(() => {
    setMode((currentMode) => resolveGenerationMode(currentMode, allowedModes));
  }, [allowedModes]);

  useEffect(() => {
    setImageFolder(imageOutputFolder);
  }, [imageOutputFolder]);

  useEffect(() => {
    const suggestedImportMode = getSuggestedSceneImportMode({
      generationMode: mode,
      startPercent,
    });

    setImportMode(suggestedImportMode);
    setImportModeAutoSet(
      mode === "SEGMENTED_BY_PERCENT" && startPercent > 0,
    );
  }, [mode, startPercent]);

  async function generateRequest() {
    setRequestError("");
    setRequestWarnings([]);

    if (mode === "SEGMENTED_BY_PERCENT" && segmentValidationError) {
      setRequestError(segmentValidationError);
      return;
    }

    try {
      await buildRequestText();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Could not generate ChatGPT request.",
      );
    }
  }

  async function copyRequest() {
    if (!request) {
      return;
    }

    await navigator.clipboard.writeText(request);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function buildRequestText() {
    const promptResponse = await fetch(visualPlanPromptUrl);
    if (!promptResponse.ok) {
      throw new Error("Could not load the Visual Planner prompt.");
    }

    const fullPrompt = await promptResponse.text();
    const chatGptRequest = buildChatGptRequest({
      fullPrompt,
      mode,
      videoId,
      videoTitle,
      channelKey,
      topicCategory,
      projectBiblePath,
      imagePromptBiblePath,
      characterBiblePath,
      visualPlannerPath,
      scriptLength,
      segmentRange:
        mode === "SEGMENTED_BY_PERCENT"
          ? { startPercent, endPercent }
          : undefined,
    });

    setRequest(chatGptRequest.request);
    setRequestWarnings(chatGptRequest.warnings);
    return chatGptRequest.request;
  }

  function runBatch() {
    setRequestError("");
    setIsBatchCancelling(false);

    if (mode === "SEGMENTED_BY_PERCENT" && segmentValidationError) {
      setRequestError(segmentValidationError);
      return;
    }

    startBatchTransition(async () => {
      try {
        const promptText = request?.trim()
          ? request
          : await buildRequestText();

        const formData = new FormData();
        formData.set("prompt", promptText);
        formData.set("importMode", importMode);
        if (resetHybridCheckpoint) {
          formData.set("resetHybridCheckpoint", "1");
        }
        await runVisualPlanBatch(videoId, formData);
      } catch (error) {
        setRequestError(
          error instanceof Error
            ? error.message
            : "Could not run Visual Plan Batch.",
        );
      }
    });
  }

  function cancelBatch() {
    setIsBatchCancelling(true);
    // Fire-and-forget API cancel. Do not await a Server Action here: it can
    // queue behind the long Run Batch POST and stall the UI for a long time.
    void fetch(`/api/videos/${videoId}/cancel-batch?kind=visual-plan`, {
      method: "POST",
      keepalive: true,
    });
    window.location.assign(
      `/videos/${videoId}?tab=visual-plan&assetNoticeType=error&assetNotice=${encodeURIComponent(
        "Cancel requested. Visual Plan batch stops at the next ChatGPT checkpoint.",
      )}`,
    );
  }

  function parseResponse() {
    try {
      setValidation(parseAndValidateHandoffResponse(response));
    } catch (error) {
      setValidation({
        scenes: [],
        errors: [
          error instanceof Error
            ? error.message
            : "Could not find a valid JSON array in the pasted response.",
        ],
        warnings: [],
        summary: {
          totalScenes: 0,
          avatarScenes: 0,
          insertScenes: 0,
          spaceScenes: 0,
          averageDuration: 0,
          totalDuration: 0,
          mainHostScenes: 0,
          supportingCharacterScenes: 0,
          insertTaggedScenes: 0,
          spaceTaggedScenes: 0,
          hookScenes: 0,
          bodyScenes: 0,
          otherSectionScenes: 0,
          sectionCounts: {},
        },
      });
    }
  }

  function parseManualScenesJson() {
    try {
      setManualValidation(parseAndValidateHandoffResponse(manualScenesJson));
    } catch (error) {
      setManualValidation({
        scenes: [],
        errors: [
          error instanceof Error
            ? error.message
            : "Could not find a valid JSON array in the pasted Manual Scenes JSON.",
        ],
        warnings: [],
        summary: {
          totalScenes: 0,
          avatarScenes: 0,
          insertScenes: 0,
          spaceScenes: 0,
          averageDuration: 0,
          totalDuration: 0,
          mainHostScenes: 0,
          supportingCharacterScenes: 0,
          insertTaggedScenes: 0,
          spaceTaggedScenes: 0,
          hookScenes: 0,
          bodyScenes: 0,
          otherSectionScenes: 0,
          sectionCounts: {},
        },
      });
    }
  }

  async function handleResponseFileUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setResponse(text);
      setResponseFileName(file.name);
      setValidation(null);
    } catch {
      setRequestError(`Could not read file: ${file.name}`);
    } finally {
      event.target.value = "";
    }
  }

  function confirmReplace() {
    if (importMode === "append" || importMode === "prepend") {
      return true;
    }

    return (
      currentSceneCount === 0 ||
      window.confirm(
        `This will replace ${currentSceneCount} existing scene(s). Continue?`,
      )
    );
  }

  function handleChatGptImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!confirmReplace()) {
      event.preventDefault();
    }
  }

  function handleManualImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (
      !manualValidation ||
      manualValidation.errors.length > 0 ||
      manualValidation.scenes.length === 0
    ) {
      event.preventDefault();
      parseManualScenesJson();
      return;
    }

    if (!confirmReplace()) {
      event.preventDefault();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-medium">ChatGPT Scene Generation</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate a complete request packet for ChatGPT. Copy it manually,
              or Run Batch to send it through Chrome CDP and import scenes
              automatically.
              {usesFillHybrid
                ? " Preferred for this channel: Build scenes from script (local skeleton + library). Run Batch is optional when you want ChatGPT to refine visual fields."
                : null}
              {usesSectionHybrid
                ? channelKey === "wealth-insights"
                  ? " Run Batch isolates the editorial HOOK section first (from [HOOK]…[END HOOK] markers or a 15–20s timing boundary), then plans BODY chunks with continuity, and assembles the final scenes JSON (progress is checkpointed so you can resume)."
                  : " Run Batch splits the script by structural sections ([HOOK], [INTRODUCTION], [CHAPTER N - Title], …) and asks ChatGPT to fully plan each section (progress is saved so you can resume)."
                : null}
            </p>
            {buildFromScriptAction ? (
              <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
                <p>
                  Build scenes from script labels locally. If the folder below
                  has an image, that still is used for every Emma/Leo/music
                  scene. PART covers stay for Flow; INTRO/LESSON/CLOSING/FINAL
                  stay as section videos. Emma/Leo library only runs when the
                  folder has no image.
                </p>
                <ImageOutputFolderField
                  id="buildFromScriptImageFolder"
                  name="imageOutputFolder"
                  label="Episode still folder"
                  description="Paste the full path, e.g. data/image-library/podcast-english-lessons/JustOnePic. “Use name” maps to that library path (not storage/). One image → all spoken scenes; PART/INTRO stay untouched."
                  value={imageFolder}
                  onChange={setImageFolder}
                  disabled={
                    isPending ||
                    isBatchPending ||
                    isBatchCancelling ||
                    isBuildingFromScript ||
                    isSavingImageFolder
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      isPending ||
                      isBatchPending ||
                      isBatchCancelling ||
                      isBuildingFromScript ||
                      isSavingImageFolder
                    }
                    onClick={() => {
                      startSaveImageFolderTransition(async () => {
                        await updateVideoImageOutputFolder(videoId, imageFolder);
                      });
                    }}
                  >
                    {isSavingImageFolder ? "Saving folder…" : "Save folder"}
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      isPending ||
                      isBatchPending ||
                      isBatchCancelling ||
                      isBuildingFromScript ||
                      isSavingImageFolder ||
                      scriptLength <= 0
                    }
                    onClick={() => {
                      startBuildFromScriptTransition(async () => {
                        await buildFromScriptAction(imageFolder);
                      });
                    }}
                  >
                    {isBuildingFromScript
                      ? "Building scenes…"
                      : currentSceneCount > 0
                        ? "Rebuild scenes from script"
                        : "Build scenes from script"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border bg-background/60 px-3 py-2 text-sm">
                <ImageOutputFolderField
                  id="visualPlanImageFolder"
                  name="imageOutputFolder"
                  label="Image folder (attach source / Flow output)"
                  description="Paste a full path to attach existing images, or leave the default generated-images folder for Flow. Browser Select cannot read absolute paths."
                  value={imageFolder}
                  onChange={setImageFolder}
                  disabled={isPending || isSavingImageFolder}
                />
                <form
                  action={saveVideoImageOutputFolderAction.bind(null, videoId)}
                >
                  <input
                    type="hidden"
                    name="imageOutputFolder"
                    value={imageFolder}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={isPending || isSavingImageFolder}
                  >
                    Save image folder
                  </Button>
                </form>
              </div>
            )}
            {supportsHybridVisualPlan ? (
              <div className="space-y-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
                {hybridCheckpoint ? (
                  <p>
                    {hybridCheckpoint.stale ? (
                      <>
                        Stale hybrid checkpoint found (
                        <strong>
                          {hybridCheckpoint.filled}/{hybridCheckpoint.total}
                        </strong>{" "}
                        {hybridUnitLabel}
                        {hybridCheckpoint.updatedAt
                          ? `, updated ${formatDateTime(hybridCheckpoint.updatedAt)}`
                          : ""}
                        ). Script changed since it was saved — clear it or
                        restart before Run Batch.
                      </>
                    ) : hybridCheckpoint.filled > 0 ? (
                      <>
                        Hybrid progress saved:{" "}
                        <strong>
                          {hybridCheckpoint.filled}/{hybridCheckpoint.total}
                        </strong>{" "}
                        {hybridUnitLabel} done
                        {hybridCheckpoint.updatedAt
                          ? ` (updated ${formatDateTime(hybridCheckpoint.updatedAt)})`
                          : ""}
                        . The next Run Batch resumes from the first unfinished{" "}
                        {hybridUnit === "sections" ? "section" : "chunk"}.
                      </>
                    ) : (
                      <>
                        Hybrid checkpoint file present (
                        <strong>
                          0/{hybridCheckpoint.total}
                        </strong>{" "}
                        {hybridUnitLabel} done
                        {hybridCheckpoint.updatedAt
                          ? `, updated ${formatDateTime(hybridCheckpoint.updatedAt)}`
                          : ""}
                        ). No finished{" "}
                        {hybridUnit === "sections" ? "sections" : "chunks"} yet
                        — Clear progress if you want a clean start.
                      </>
                    )}
                  </p>
                ) : (
                  <p>
                    {usesSectionHybrid
                      ? "Hybrid checkpoint: each finished script section is saved automatically. If a later section fails or you cancel, Run Batch resumes instead of starting over."
                      : "Hybrid checkpoint: each finished ChatGPT chunk is saved automatically. If a later chunk fails or you cancel, Run Batch resumes instead of starting over."}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={resetHybridCheckpoint}
                      onChange={(event) =>
                        setResetHybridCheckpoint(event.target.checked)
                      }
                      disabled={
                        isBatchPending ||
                        isBatchCancelling ||
                        !hybridCheckpoint
                      }
                    />
                    Restart from{" "}
                    {hybridUnit === "sections" ? "section 1" : "chunk 1"}{" "}
                    (ignore saved progress)
                  </label>
                  {clearHybridProgressAction ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        isBatchPending ||
                        isBatchCancelling ||
                        isClearingCheckpoint ||
                        !hybridCheckpoint
                      }
                      onClick={() => {
                        startClearCheckpointTransition(async () => {
                          await clearHybridProgressAction();
                        });
                      }}
                    >
                      {isClearingCheckpoint ? "Clearing…" : "Clear progress"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[220px_auto_auto_auto_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="generationMode">Generation mode</Label>
              <select
                id="generationMode"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as ChatGptGenerationMode)
                }
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                disabled={isBatchPending || isBatchCancelling}
              >
                {allowedModes.map((allowedMode) => (
                  <option key={allowedMode} value={allowedMode}>
                    {GENERATION_MODE_LABELS[allowedMode]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              className="mt-7"
              onClick={generateRequest}
              disabled={isBatchPending || isBatchCancelling}
            >
              Generate ChatGPT Request
            </Button>
            <Button
              type="button"
              className="mt-7"
              variant="outline"
              disabled={!request || isBatchPending || isBatchCancelling}
              onClick={copyRequest}
            >
              {copied ? "Copied" : "Copy ChatGPT Request"}
            </Button>
            {isBatchPending ? (
              <Button
                type="button"
                className="mt-7"
                variant="destructive"
                onClick={cancelBatch}
                disabled={isBatchCancelling}
              >
                {isBatchCancelling ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Square />
                )}
                {isBatchCancelling ? "Cancelling…" : "Cancel Batch"}
              </Button>
            ) : (
              <Button
                type="button"
                className="mt-7"
                onClick={runBatch}
                disabled={isPending || scriptLength <= 0}
              >
                <Play />
                Run Batch
              </Button>
            )}
          </div>

          {isBatchPending ? (
            <p className="text-sm text-muted-foreground">
              Running Visual Plan Batch via ChatGPT CDP… one GENERATE request,
              then import with mode: {importMode}.
            </p>
          ) : null}

          {mode === "SEGMENTED_BY_PERCENT" ? (
            <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="segmentStartPercent">Start percent</Label>
                <Input
                  id="segmentStartPercent"
                  type="number"
                  min={0}
                  max={100}
                  value={startPercent}
                  onChange={(event) =>
                    setStartPercent(Number(event.target.value))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="segmentEndPercent">End percent</Label>
                <Input
                  id="segmentEndPercent"
                  type="number"
                  min={0}
                  max={100}
                  value={endPercent}
                  onChange={(event) => setEndPercent(Number(event.target.value))}
                />
              </div>
              {segmentValidationError ? (
                <p
                  className="text-sm text-destructive sm:col-span-2"
                  role="alert"
                >
                  {segmentValidationError}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Generate scenes for approximately {startPercent}% to{" "}
                  {endPercent}% of the script.
                </p>
              )}
            </div>
          ) : null}

          {requestError ? (
            <p className="text-sm text-destructive" role="alert">
              {requestError}
            </p>
          ) : null}

          {requestWarnings.length > 0 ? (
            <ValidationList
              title="Context warning"
              items={requestWarnings}
              variant="warning"
            />
          ) : null}

          {request ? (
            <details className="rounded-md border bg-background p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Preview generated request
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                {request}
              </pre>
            </details>
          ) : null}

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="chatGptResponse">ChatGPT Response</Label>
              <div className="flex flex-wrap items-center gap-2">
                {responseFileName ? (
                  <span className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {responseFileName}
                  </span>
                ) : null}
                <input
                  ref={responseFileInputRef}
                  type="file"
                  accept=".json,.txt,application/json,text/plain"
                  className="hidden"
                  onChange={handleResponseFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => responseFileInputRef.current?.click()}
                >
                  <Upload />
                  Upload JSON file
                </Button>
              </div>
            </div>
            <Textarea
              id="chatGptResponse"
              value={response}
              onChange={(event) => {
                setResponse(event.target.value);
                setResponseFileName(null);
                setValidation(null);
              }}
              className="min-h-64 font-mono text-sm"
              placeholder="Paste ChatGPT's response here, or upload the downloaded .json / .txt file. Raw JSON, fenced JSON, or JSON surrounded by explanation text are supported."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sceneImportMode">Import mode</Label>
            <select
              id="sceneImportMode"
              value={importMode}
              onChange={(event) => {
                setImportMode(event.target.value as SceneImportMode);
                setImportModeAutoSet(false);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="replace">Replace existing scenes</option>
              <option value="append">Append to existing scenes</option>
              <option value="prepend">
                Prepend (shift existing, keep images)
              </option>
            </select>
            {importMode === "prepend" ? (
              <p className="text-sm text-muted-foreground">
                New scenes are inserted at the start. Existing scenes keep their
                images and move to higher order numbers. Negative `order` values
                are sorted before positive ones.
              </p>
            ) : null}
            {importModeAutoSet ? (
              <p className="text-sm text-muted-foreground">
                Append was selected automatically because this is a later script
                segment. You can switch to Replace below if needed.
              </p>
            ) : null}
            {mode === "SEGMENTED_BY_PERCENT" &&
            importMode === "replace" &&
            startPercent > 0 ? (
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                You are importing a later segment with Replace selected. This
                will remove existing scenes.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={parseResponse}>
              Parse & Validate Response
            </Button>
            <form action={formAction} onSubmit={handleChatGptImportSubmit}>
              <input type="hidden" name="scenesJson" value={parsedScenesJson} />
              <input type="hidden" name="importMode" value={importMode} />
              <Button
                type="submit"
                disabled={
                  isPending ||
                  !validation ||
                  validation.errors.length > 0 ||
                  validation.scenes.length === 0
                }
              >
                {isPending
                  ? "Importing..."
                  : importMode === "append"
                    ? "Append Parsed Scenes"
                    : importMode === "prepend"
                      ? "Prepend Parsed Scenes"
                      : "Replace Parsed Scenes"}
              </Button>
            </form>
          </div>

          {validation ? <HandoffPreview validation={validation} /> : null}
        </div>
      </div>

      <form
        action={formAction}
        className="space-y-4"
        onSubmit={handleManualImportSubmit}
      >
        <div className="grid gap-2">
          <Label htmlFor="scenesJson">Manual Scenes JSON</Label>
          <p className="text-sm text-muted-foreground">
            Paste a scenes JSON array (or a ChatGPT reply that contains one).
            Use Parse & Validate to check schema before replacing scenes.
          </p>
          <Textarea
            id="scenesJsonManual"
            value={manualScenesJson}
            onChange={(event) => {
              setManualScenesJson(event.target.value);
              setManualValidation(null);
            }}
            className="min-h-80 font-mono text-sm"
            placeholder='[{"scriptText":"","sceneType":"avatar","visualPurpose":"","visualIdea":"","duration":8,"imagePrompt":"","status":"planned"}]'
            required
          />
          {/* Submit the normalized validated JSON, not the raw paste. */}
          <input
            type="hidden"
            name="scenesJson"
            value={parsedManualScenesJson || manualScenesJson}
          />
          <input type="hidden" name="importMode" value="replace" />
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyPromptButton
            label={`Copy Visual Planner Prompt — ${channelName}`}
            promptUrl={visualPlanPromptUrl}
          />
          <CopyPromptButton
            label="Copy Current Scenes JSON"
            promptUrl={currentScenesJsonUrl}
          />
          <Button type="button" variant="outline" onClick={parseManualScenesJson}>
            Parse & Validate Manual JSON
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={
              isPending ||
              !manualValidation ||
              manualValidation.errors.length > 0 ||
              manualValidation.scenes.length === 0
            }
          >
            {isPending ? "Replacing..." : "Replace Scenes Manually"}
          </Button>
        </div>

        {manualValidation ? (
          <HandoffPreview validation={manualValidation} />
        ) : null}
      </form>

      {state.status !== "idle" ? (
        <p
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function HandoffPreview({ validation }: { validation: SceneHandoffValidation }) {
  const { summary } = validation;

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="font-medium">Preview</div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <PreviewItem label="Total scenes" value={summary.totalScenes} />
        <PreviewItem label="Avatars" value={summary.avatarScenes} />
        <PreviewItem label="Inserts" value={summary.insertScenes} />
        <PreviewItem label="Space" value={summary.spaceScenes} />
        <PreviewItem
          label="Total duration"
          value={`${Math.round(summary.totalDuration)}s`}
        />
        <PreviewItem
          label="Average duration"
          value={`${summary.averageDuration.toFixed(1)}s`}
        />
        <PreviewItem label="Main host" value={summary.mainHostScenes} />
        <PreviewItem
          label="Supporting character"
          value={summary.supportingCharacterScenes}
        />
        <PreviewItem label="INSERT tagged" value={summary.insertTaggedScenes} />
        <PreviewItem label="SPACE tagged" value={summary.spaceTaggedScenes} />
        <PreviewItem label="Hook section" value={summary.hookScenes} />
        <PreviewItem label="Body section" value={summary.bodyScenes} />
        <PreviewItem label="Other section" value={summary.otherSectionScenes} />
      </div>

      {Object.keys(summary.sectionCounts).length > 0 ? (
        <div className="mt-3 rounded border bg-muted/30 p-2 text-sm">
          <div className="text-xs uppercase text-muted-foreground">
            Sections
          </div>
          <div className="mt-1">
            {Object.entries(summary.sectionCounts)
              .map(([section, count]) => `${section}: ${count}`)
              .join(" · ")}
          </div>
        </div>
      ) : null}

      {validation.errors.length > 0 ? (
        <ValidationList
          title="Validation errors"
          items={validation.errors}
          variant="error"
        />
      ) : null}

      {validation.warnings.length > 0 ? (
        <ValidationList
          title="Validation warnings"
          items={validation.warnings}
          variant="warning"
        />
      ) : null}

      {validation.errors.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Parsed scenes are ready to import.
        </p>
      ) : null}
    </div>
  );
}

function PreviewItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function ValidationList({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "error" | "warning";
}) {
  return (
    <div
      className={
        variant === "error"
          ? "mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          : "mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300"
      }
    >
      <div className="font-medium">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const promptSectionTitles = [
  "Channel Profile",
  "Project Bible",
  "Image Prompt Bible",
  "Character Bible",
  "Visual Planner Prompt",
  "Current Video Data",
] as const;

/** TheGodsWord channel key — illustrated Bible-study explainer compact-flow is scoped to this channel only. */
const THE_GODS_WORD_CHANNEL_KEY = "the-gods-word";

/** Set true to include full bibles in TheGodsWord ChatGPT scene requests (debug). */
const THE_GODS_WORD_FULL_CONTEXT = false;

function isTheGodsWordChannel(channelKey: string) {
  return channelKey === THE_GODS_WORD_CHANNEL_KEY;
}

function useTheGodsWordCompactFlowRequest(channelKey: string) {
  return isTheGodsWordChannel(channelKey) && !THE_GODS_WORD_FULL_CONTEXT;
}

type PromptSectionTitle = (typeof promptSectionTitles)[number];

const suspiciousMinimumLengths: Partial<Record<PromptSectionTitle, number>> = {
  "Project Bible": 1000,
  "Image Prompt Bible": 5000,
  "Character Bible": 5000,
  "Visual Planner Prompt": 10000,
};

function splitPromptSections(fullPrompt: string) {
  const sections = new Map<string, string>();

  promptSectionTitles.forEach((title) => {
    const marker = `# ${title}\n\n`;
    const start = fullPrompt.indexOf(marker);

    if (start === -1) {
      return;
    }

    const bodyStart = start + marker.length;
    const nextSectionStart = promptSectionTitles.reduce<number | null>(
      (nearestStart, nextTitle) => {
        const nextMarker = `\n\n---\n\n# ${nextTitle}\n\n`;
        const nextStart = fullPrompt.indexOf(nextMarker, bodyStart);

        if (nextStart === -1) {
          return nearestStart;
        }

        return nearestStart === null || nextStart < nearestStart
          ? nextStart
          : nearestStart;
      },
      null,
    );

    sections.set(
      title,
      fullPrompt.slice(bodyStart, nextSectionStart ?? undefined),
    );
  });

  return sections;
}

function findSuspiciousPromptSections(
  sections: Map<string, string>,
  options?: { characterBibleConfigured?: boolean },
) {
  return promptSectionTitles.flatMap((title) => {
    const minimumLength = suspiciousMinimumLengths[title];

    if (!minimumLength) {
      return [];
    }

    // Character Bible is optional per channel — only warn when the channel
    // registers a path (otherwise a missing section is expected, not a load failure).
    if (
      title === "Character Bible" &&
      options?.characterBibleConfigured === false
    ) {
      return [];
    }

    const content = sections.get(title) ?? "";

    if (content.length >= minimumLength) {
      return [];
    }

    return `${title} is suspiciously short (${content.length} characters; expected at least ${minimumLength}). Verify the source file loaded completely before sending this request.`;
  });
}

// TheGodsWord compact-flow helpers below are used only when channelKey === "the-gods-word".
function parseCurrentVideoDataJson(currentVideoDataSection: string) {
  const trimmed = currentVideoDataSection.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function pickIdeaJsonString(ideaJson: unknown, ...keys: string[]) {
  if (!ideaJson || typeof ideaJson !== "object" || Array.isArray(ideaJson)) {
    return undefined;
  }

  const record = ideaJson as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function buildOptionalVisualContext(ideaJson: unknown) {
  const openingReference = pickIdeaJsonString(
    ideaJson,
    "visual_anchor",
    "visualAnchor",
  );
  const rawMotif =
    ideaJson && typeof ideaJson === "object" && !Array.isArray(ideaJson)
      ? ((ideaJson as Record<string, unknown>).main_visual_motif ??
        (ideaJson as Record<string, unknown>).mainVisualMotif)
      : undefined;

  let recurringElements: string[] | undefined;

  if (Array.isArray(rawMotif)) {
    recurringElements = rawMotif
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());
  } else if (typeof rawMotif === "string" && rawMotif.trim()) {
    recurringElements = [rawMotif.trim()];
  }

  if (
    !openingReference &&
    (!recurringElements || recurringElements.length === 0)
  ) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries({
      opening_reference: openingReference,
      recurring_elements:
        recurringElements && recurringElements.length > 0
          ? recurringElements
          : undefined,
    }).filter(([, value]) => value !== undefined),
  );
}

function buildCompactTheGodsWordCurrentVideoData(
  currentVideoDataSection: string,
  options?: { bibleOneYear?: boolean },
) {
  const parsed = parseCurrentVideoDataJson(currentVideoDataSection);

  if (!parsed) {
    return currentVideoDataSection;
  }

  const ideaJson = parsed.ideaJson;
  const optionalVisualContext = buildOptionalVisualContext(ideaJson);
  const ideaHook = pickIdeaJsonString(ideaJson, "hook");
  const rawScript = typeof parsed.script === "string" ? parsed.script : undefined;
  const markedScript = rawScript
    ? options?.bibleOneYear
      ? prepareBibleOneYearCompactScript(rawScript, { ideaHook })
      : ensureHookMarkersInScript(rawScript, { ideaHook }).script
    : undefined;
  const compact: Record<string, unknown> = {
    videoId: parsed.id,
    title: parsed.title,
    topic: parsed.topic,
    hook: ideaHook,
    key_line: pickIdeaJsonString(ideaJson, "key_line", "keyLine"),
    main_scripture: pickIdeaJsonString(
      ideaJson,
      "main_scripture",
      "mainScripture",
    ),
    ...(optionalVisualContext
      ? { optional_visual_context: optionalVisualContext }
      : {}),
    script: markedScript,
  };

  return JSON.stringify(
    Object.fromEntries(
      Object.entries(compact).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    ),
    null,
    2,
  );
}

function buildCompactVideoContextSection(
  compactVideoData: string,
  options?: { bibleOneYear?: boolean },
) {
  if (options?.bibleOneYear) {
    return [
      "## Compact Video Context",
      "",
      "Optional visual context is only reference material. Use it only when the assigned scriptText naturally calls for it. The assigned scriptText always wins.",
      "",
      "Follow the Bible in One Year Visual Brief. Use only markers and spoken lines present in the script. Do not invent markers from other formats.",
      "Preserve [INTRODUCTION], [CHAPTER COVER — …], [REFLECTION AND PRAYER], [CLOSING]. [HOOK]/[END HOOK] never replace those section markers.",
      "If [INTRODUCTION] is missing, the first welcome/day-identification spoken line before Scripture reading is still a narrated introduction cover.",
      "",
      compactVideoData,
    ].join("\n");
  }

  return [
    "## Compact Video Context",
    "",
    "Optional visual context is only reference material. Do not force these elements into every scene. Use them only when the assigned scriptText naturally calls for them. The assigned scriptText always wins.",
    "",
    "If script contains [HOOK]…[END HOOK], treat that block as the hook for segmentation and timing. Preserve chapter markers. Do not narrate the markers themselves.",
    "Structural labels ([HOOK], [END HOOK], [CHAPTER…], [FINAL…], [INTRODUCTION], [CHAPTER COVER — …], [REFLECTION AND PRAYER], [CLOSING]) must never appear as bracket text in scriptText. When a label is followed by a spoken opener, that opener is the cover or section opener scene — do not create silent empty covers. [CLOSING] is segmentation only and must not become a cover.",
    "",
    compactVideoData,
  ].join("\n");
}

function buildCompactSegmentInstructions(options?: { bibleOneYear?: boolean }) {
  return [
    "## Segment Instructions",
    "",
    "Generate scenes only for the Current Script Segment.",
    "Do not generate the full video.",
    "Do not generate scenes for script text outside the Current Script Segment.",
    "Preserve spoken scriptText coverage only from the Current Script Segment.",
    options?.bibleOneYear
      ? "Follow the Bible in One Year Visual Brief."
      : "Follow the TheGodsWord Flow Visual Brief.",
    "Return a JSON array only.",
    "Start scene order at 1 for this segment. The importer will normalize order on import.",
    "Use only the existing scene schema.",
    'sceneType must be exactly "avatar", "insert", or "space" on every scene.',
    "Do not invent other sceneType values.",
    "Do not add new fields.",
  ].join("\n");
}

function buildCompactVisualContinuityGuidance(options?: {
  bibleOneYear?: boolean;
}) {
  return [
    "## Visual Continuity Guidance",
    "",
    options?.bibleOneYear
      ? "Continue the same warm watercolor-and-ink Bible study style from the Bible in One Year Visual Brief."
      : "Continue the same watercolor/ink style from the Flow Visual Brief.",
    "Avoid repeating the exact same image twice in a row.",
    "The Current Script Segment remains the source of truth.",
  ].join("\n");
}

function buildOutputRequirementsSection() {
  return [
    "## Output Requirements",
    "",
    "Return valid JSON only.",
    "Return a JSON array only.",
    "Do not include markdown.",
    "Do not include explanations.",
    'Do not wrap the result inside an object.',
    'Do not include top-level keys like "scenes".',
    "Use only the existing scene schema:",
    "",
    "[",
    "{",
    '"order": 1,',
    '"scriptText": "",',
    '"sceneType": "avatar",',
    '"visualPurpose": "",',
    '"visualIdea": "",',
    '"duration": 4,',
    '"imagePrompt": "",',
    '"status": "planned"',
    "}",
    "]",
    "",
    "Hard sceneType rule:",
    'Every scene MUST use exactly one of these lowercase strings: "avatar", "insert", or "space".',
    "Do not invent sceneType values.",
    "Do not use aliases, synonyms, camelCase variants, or descriptive labels such as character, host, person, object, card, closeup, broll, landscape, establishing, environment, transition, atmosphere, graphic, or symbol.",
    "If unsure, choose the closest allowed type:",
    "- people / emotion / decision / identification → avatar",
    "- object / detail / cover / compact card → insert",
    "- concrete place / pause / transition → space",
    "",
    "Do not add new fields.",
  ].join("\n");
}

function buildTheGodsWordOutputRequirementsSection() {
  return [
    buildOutputRequirementsSection(),
    "",
    "JSON safety:",
    "Return strict valid JSON.",
    "",
    "Do not use unescaped double quotes inside JSON string values.",
    "Prefer avoiding quotation marks inside imagePrompt text. For visible text instructions, write:",
    "exact readable visible title: HE WAS HEARD",
    "instead of:",
    'exact readable visible title: "HE WAS HEARD"',
    "",
    "If double quotes are necessary inside a string, escape them as \\\".",
    "Do not break JSON strings with raw newlines inside quotes.",
    "Invalid JSON is a failed output.",
    "",
    "scriptText hard rule:",
    "scriptText must contain only spoken narration for voiceover.",
    "Never include structural labels such as [HOOK], [END HOOK], [CHAPTER…], [FINAL…], [INTRODUCTION], [CHAPTER COVER — …], [REFLECTION AND PRAYER], or [CLOSING] as bracket text in scriptText.",
    "When a label is followed by a spoken opener (title, chapter announcement, section start), that opener is the cover scene with voiceover. Do not create silent empty covers.",
    "",
    "Do not include markdown fences.",
    "Do not include explanations.",
    "Return the JSON array only.",
  ].join("\n");
}

function generationModeInstructions(mode: ChatGptGenerationMode) {
  if (mode === "FULL_VIDEO") {
    return [
      "GENERATION MODE:",
      "Generate the full visual plan for the complete script.",
      "Use the Visual Planner rules.",
      'Every sceneType must be exactly "avatar", "insert", or "space".',
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "TEN_SCENE_TEST") {
    return [
      "GENERATION MODE:",
      "Generate only the first 10 scenes from the script.",
      "This is a test of scene ratio, character universe, prompt quality, and image generation reliability.",
      'Every sceneType must be exactly "avatar", "insert", or "space".',
      "Return a JSON array only.",
    ].join("\n");
  }

  if (mode === "SEGMENTED_BY_PERCENT") {
    return [
      "GENERATION MODE:",
      "Generate scenes only for the Current Script Segment.",
      "Do not generate scenes for the rest of the script.",
      "Return a JSON array only.",
      "Use the existing scene schema.",
      'Every sceneType must be exactly "avatar", "insert", or "space".',
      "Do not add new fields.",
      "Start scene order at 1 for this segment.",
    ].join("\n");
  }

  return [
    "GENERATION MODE:",
    "Generate only the hook scenes from the opening retention section.",
    "Focus on the opening 45 to 120 seconds depending on script length.",
    'Every sceneType must be exactly "avatar", "insert", or "space".',
    "Return a JSON array only.",
  ].join("\n");
}

function buildSegmentInstructions() {
  return [
    "## Segment Instructions",
    "",
    "Generate scenes only for the Current Script Segment.",
    "Do not generate the full video.",
    "Do not generate scenes for script text outside the Current Script Segment.",
    "Preserve exact scriptText only from the Current Script Segment.",
    "Do not include scriptText from outside this segment.",
    "Continue the same visual style and continuity from the Image Prompt Bible and Character Bible.",
    "Return a JSON array only.",
    "Start scene order at 1 for this segment. The importer will normalize order on import.",
    "Use only the existing scene schema.",
    'Every sceneType must be exactly "avatar", "insert", or "space".',
    "Do not add new fields.",
  ].join("\n");
}

function buildVisualContinuityGuidance() {
  return [
    "## Visual Continuity Guidance",
    "",
    "Continue the same visual world, style, color palette, and character rules established by the channel bibles.",
    "Treat this segment as part of a longer video, not an isolated visual plan.",
    "Avoid unnecessary repetition of the same composition or visual idea from scene to scene.",
    "If a central motif returns, vary its composition, scale, camera distance, symbolic function, emotional tone, or surrounding elements.",
    "Prefer visual progression over simple repetition.",
    "Do not introduce a different art style just to create variety.",
    "Do not contradict the Current Script Segment.",
    "The Current Script Segment remains the source of truth.",
    "Generate scenes only for the Current Script Segment.",
  ].join("\n");
}

function buildCurrentScriptSegmentSection({
  script,
  startPercent,
  endPercent,
}: {
  script: string;
  startPercent: number;
  endPercent: number;
}) {
  const segment = extractScriptSegmentByPercent(script, startPercent, endPercent);

  const metadataLines = [
    `* startPercent: ${segment.startPercent}`,
    `* endPercent: ${segment.endPercent}`,
    `* approximateCharacterRange: ${segment.startChar}-${segment.endChar}`,
    `* segmentLength: ${segment.segmentLength}`,
    `* fullScriptLength: ${segment.fullScriptLength}`,
  ];

  if (segment.extractionWarning) {
    metadataLines.push(`* extractionWarning: ${segment.extractionWarning}`);
  }

  if (segment.startCutReason) {
    metadataLines.push(`* startCutReason: ${segment.startCutReason}`);
  }

  if (segment.endCutReason) {
    metadataLines.push(`* endCutReason: ${segment.endCutReason}`);
  }

  return [
    "## Current Script Segment",
    "",
    ...metadataLines,
    "",
    segment.fragment || "(No script text found for this segment.)",
  ].join("\n");
}

function buildChatGptRequest({
  fullPrompt,
  mode,
  videoId,
  videoTitle,
  channelKey,
  topicCategory,
  projectBiblePath,
  imagePromptBiblePath,
  characterBiblePath,
  visualPlannerPath,
  scriptLength,
  segmentRange,
}: {
  fullPrompt: string;
  mode: ChatGptGenerationMode;
  videoId: string;
  videoTitle: string;
  channelKey: string;
  topicCategory?: string | null;
  projectBiblePath: string;
  imagePromptBiblePath: string;
  characterBiblePath?: string;
  visualPlannerPath: string;
  scriptLength: number;
  segmentRange?: {
    startPercent: number;
    endPercent: number;
  };
}): { request: string; warnings: string[] } {
  const sections = splitPromptSections(fullPrompt);
  const projectBible = sections.get("Project Bible") ?? "";
  const imagePromptBible = sections.get("Image Prompt Bible") ?? "";
  const characterBible = sections.get("Character Bible") ?? "";
  const visualPlannerPrompt = sections.get("Visual Planner Prompt") ?? "";
  const currentVideoData = sections.get("Current Video Data") ?? "";
  const useCompactTheGodsWordRequest = useTheGodsWordCompactFlowRequest(channelKey);
  const bibleOneYear = isBibleOneYearCategory(topicCategory);
  const compactVisualBrief = bibleOneYear
    ? buildBibleOneYearVisualBrief()
    : buildTheGodsWordFlowVisualBrief();
  const warnings = useCompactTheGodsWordRequest
    ? []
    : findSuspiciousPromptSections(sections, {
        characterBibleConfigured: Boolean(characterBiblePath?.trim()),
      });

  if (mode === "SEGMENTED_BY_PERCENT" && segmentRange) {
    const script = parseScriptFromCurrentVideoData(currentVideoData);

    if (!script?.trim()) {
      warnings.push(
        "Current Video Data does not include a usable script. Segmented generation may fail until a script is saved on the video.",
      );
    }
  }

  const segmentedSections =
    mode === "SEGMENTED_BY_PERCENT" && segmentRange
      ? (() => {
          const script = parseScriptFromCurrentVideoData(currentVideoData) ?? "";

          return [
            useCompactTheGodsWordRequest
              ? buildCompactSegmentInstructions({ bibleOneYear })
              : buildSegmentInstructions(),
            useCompactTheGodsWordRequest
              ? buildCompactVisualContinuityGuidance({ bibleOneYear })
              : buildVisualContinuityGuidance(),
            buildCurrentScriptSegmentSection({
              script,
              startPercent: segmentRange.startPercent,
              endPercent: segmentRange.endPercent,
            }),
          ];
        })()
      : [];

  const timingRulesSection = isTheGodsWordChannel(channelKey)
    ? [
        bibleOneYear
          ? buildBibleOneYearTimingRules()
          : buildTheGodsWordTimingRules(),
      ]
    : [];

  const wealthVisualModeSection =
    channelKey === "wealth-insights"
      ? (() => {
          const parsed = parseCurrentVideoDataJson(currentVideoData);
          const mode = resolveWealthInsightsVisualMode({
            topicCategory,
            ideaJson: parsed?.ideaJson ?? null,
          });
          return `## Wealth Insights Visual Mode\n\n${buildWealthInsightsVisualModeSection(mode)}`;
        })()
      : null;

  if (useCompactTheGodsWordRequest) {
    const sourceScript = parseScriptFromCurrentVideoData(currentVideoData) ?? "";
    const compactVideoData = buildCompactTheGodsWordCurrentVideoData(
      currentVideoData,
      { bibleOneYear },
    );
    const coverBeatDirectives = bibleOneYear
      ? buildBibleOneYearCoverBeatDirectives(sourceScript)
      : "";

    const request = [
      "# ChatGPT Scene Generation Request",
      "## Task\n\nGenerate Scenes JSON for the current video.",
      `## Generation Mode\n\n${mode}`,
      [
        "## Prompt Context Snapshot",
        "",
        `* generatedAt: ${new Date().toISOString()}`,
        `* videoId: ${videoId}`,
        `* videoTitle: ${videoTitle}`,
        `* channelKey: ${channelKey}`,
        `* requestFormat: compact-flow`,
        ...(bibleOneYear ? ["* categoryFormat: bible-in-one-year"] : []),
        `* scriptLength: ${scriptLength}`,
        ...(segmentRange
          ? [
              `* segmentStartPercent: ${segmentRange.startPercent}`,
              `* segmentEndPercent: ${segmentRange.endPercent}`,
            ]
          : []),
      ].join("\n"),
      compactVisualBrief,
      ...(coverBeatDirectives ? [coverBeatDirectives] : []),
      buildCompactVideoContextSection(compactVideoData, { bibleOneYear }),
      ...segmentedSections,
      ...timingRulesSection,
      bibleOneYear
        ? buildBibleOneYearOutputRequirementsSection()
        : buildTheGodsWordOutputRequirementsSection(),
      bibleOneYear
        ? buildBibleOneYearGenerationModeInstructions(mode)
        : buildTheGodsWordGenerationModeInstructions(mode),
    ].join("\n\n");

    return { request, warnings };
  }

  const request = [
    "# ChatGPT Scene Generation Request",
    "## Task\n\nGenerate Scenes JSON for the current video.",
    `## Generation Mode\n\n${mode}`,
    [
      "## Prompt Context Snapshot",
      "",
      `* generatedAt: ${new Date().toISOString()}`,
      `* videoId: ${videoId}`,
      `* videoTitle: ${videoTitle}`,
      `* channelKey: ${channelKey}`,
      `* projectBiblePath: ${projectBiblePath}`,
      `* imagePromptBiblePath: ${imagePromptBiblePath}`,
      `* characterBiblePath: ${characterBiblePath ?? "none"}`,
      `* visualPlannerPath: ${visualPlannerPath}`,
      `* projectBibleLength: ${projectBible.length}`,
      `* imagePromptBibleLength: ${imagePromptBible.length}`,
      `* characterBibleLength: ${characterBible.length}`,
      `* visualPlannerLength: ${visualPlannerPrompt.length}`,
      `* scriptLength: ${scriptLength}`,
      ...(segmentRange
        ? [
            `* segmentStartPercent: ${segmentRange.startPercent}`,
            `* segmentEndPercent: ${segmentRange.endPercent}`,
          ]
        : []),
    ].join("\n"),
    `## Channel Profile\n\n${sections.get("Channel Profile") ?? ""}`,
    `## Project Bible\n\n${projectBible}`,
    `## Character Bible\n\n${characterBible}`,
    `## Image Prompt Bible\n\n${imagePromptBible}`,
    `## Visual Planner Prompt\n\n${visualPlannerPrompt}`,
    ...(wealthVisualModeSection ? [wealthVisualModeSection] : []),
    `## Current Video Data\n\n${currentVideoData}`,
    ...segmentedSections,
    ...timingRulesSection,
    buildOutputRequirementsSection(),
    generationModeInstructions(mode),
  ].join("\n\n");

  return { request, warnings };
}
