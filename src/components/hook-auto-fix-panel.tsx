"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Check, Download, Upload } from "lucide-react";

import {
  buildHookReplacementPreview,
  HOOK_PACING_PRESETS,
  type HookPacingPresetId,
  type HookReplacementPreview,
} from "@/lib/hook-replacement-patch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type HookAutoFixPanelProps = {
  action: (formData: FormData) => void | Promise<void>;
  videoId: string;
  selectedFromOrder: number;
  selectedToOrder: number;
  currentScenes: {
    order: number;
    scriptText: string;
    duration: number | null;
  }[];
  optimizationPacks: Record<HookPacingPresetId, string>;
  defaultPacing: HookPacingPresetId;
};

export function HookAutoFixPanel({
  action,
  videoId,
  selectedFromOrder,
  selectedToOrder,
  currentScenes,
  optimizationPacks,
  defaultPacing,
}: HookAutoFixPanelProps) {
  const [targetPacing, setTargetPacing] =
    useState<HookPacingPresetId>(defaultPacing);
  const [rawText, setRawText] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState(false);
  const [confirmNarrationMismatch, setConfirmNarrationMismatch] = useState(false);
  const [confirmNarrationOverlap, setConfirmNarrationOverlap] = useState(false);

  const selectedPack = optimizationPacks[targetPacing];

  const { preview, parseError } = useMemo<{
    preview: HookReplacementPreview | null;
    parseError: string;
  }>(() => {
    if (!rawText.trim()) {
      return { preview: null, parseError: "" };
    }

    try {
      return {
        preview: buildHookReplacementPreview({
          rawText,
          currentVideoId: videoId,
          selectedFromOrder,
          selectedToOrder,
          currentScenes,
        }),
        parseError: "",
      };
    } catch (error) {
      return {
        preview: null,
        parseError:
          error instanceof Error
            ? error.message
            : "Could not parse hook replacement patch.",
      };
    }
  }, [currentScenes, rawText, selectedFromOrder, selectedToOrder, videoId]);

  async function copyOptimizationPack() {
    await navigator.clipboard.writeText(selectedPack);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setRawText(await file.text());
    setConfirmPreview(false);
    setConfirmNarrationMismatch(false);
    setConfirmNarrationOverlap(false);
  }

  const canSubmit =
    Boolean(preview) &&
    !parseError &&
    confirmPreview &&
    (preview?.narrationMatches || confirmNarrationMismatch) &&
    ((preview?.duplicateAfterRangeCount ?? 0) === 0 || confirmNarrationOverlap);

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-medium">Hook Auto-Fix</h3>
          <p className="text-sm text-muted-foreground">
            Export the selected hook range, optimize it externally, then import a replacement patch for that range only.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="hook-target-pacing" className="sr-only">
            Target pacing
          </Label>
          <select
            id="hook-target-pacing"
            value={targetPacing}
            onChange={(event) => {
              setTargetPacing(event.target.value as HookPacingPresetId);
              setCopied(false);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {(Object.keys(HOOK_PACING_PRESETS) as HookPacingPresetId[]).map(
              (presetId) => {
                const preset = HOOK_PACING_PRESETS[presetId];

                return (
                  <option key={presetId} value={presetId}>
                    {preset.label}: target {preset.targetRange}, max{" "}
                    {preset.maxSceneDurationSeconds}s
                  </option>
                );
              },
            )}
          </select>
          <Button type="button" variant="outline" onClick={copyOptimizationPack}>
            {copied ? <Check /> : <Download />}
            {copied ? "Copied" : "Export Hook Optimization Pack"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="hookReplacementPatchJson">
            Import Hook Replacement Patch
          </Label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Upload className="size-4" />
            <input
              type="file"
              accept=".json,.txt,application/json,text/plain"
              onChange={handleFileUpload}
            />
          </label>
        </div>
        <Textarea
          id="hookReplacementPatchJson"
          value={rawText}
          onChange={(event) => {
            setRawText(event.target.value);
            setConfirmPreview(false);
            setConfirmNarrationMismatch(false);
            setConfirmNarrationOverlap(false);
          }}
          className="min-h-48 font-mono text-sm"
          placeholder='{"task":"hook_replacement_patch","videoId":"...","replace":{"fromOrder":1,"toOrder":28},"scenes":[...]}'
        />
      </div>

      {parseError ? (
        <p className="mt-3 text-sm text-destructive">{parseError}</p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <PreviewMetric label="Scenes removed" value={preview.removedScenes} />
            <PreviewMetric label="Scenes inserted" value={preview.insertedScenes} />
            <PreviewMetric
              label="Old hook duration"
              value={`${preview.oldHookDurationSeconds.toFixed(1)}s`}
            />
            <PreviewMetric
              label="New hook duration"
              value={`${preview.newHookDurationSeconds.toFixed(1)}s`}
            />
            <PreviewMetric label="Old scene count" value={preview.oldSceneCount} />
            <PreviewMetric label="New scene count" value={preview.newSceneCount} />
            <PreviewMetric
              label="New average"
              value={`${preview.newAverageDurationSeconds.toFixed(1)}s`}
            />
            <PreviewMetric
              label="Warnings remaining"
              value={preview.warningsRemaining}
            />
          </div>

          {preview.globalWarnings.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {preview.globalWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          {preview.narrationWarning ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p>{preview.narrationWarning}</p>
              <p className="mt-1">
                Cancel is recommended unless this wording change is intentional.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Replacement narration exactly matches the selected hook text.
            </div>
          )}

          {preview.duplicateAfterRangeWarning ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <p>{preview.duplicateAfterRangeWarning}</p>
            </div>
          ) : null}

          <div className="max-h-[320px] overflow-auto rounded-md border">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">New order</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Script text</th>
                  <th className="px-3 py-2 font-medium">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {preview.replacementScenes.map((scene, index) => (
                  <tr key={`${scene.order}-${index}`} className="border-b align-top">
                    <td className="px-3 py-2">{scene.order}</td>
                    <td className="px-3 py-2">
                      {scene.duration !== null ? `${scene.duration}s` : "Default"}
                    </td>
                    <td className="px-3 py-2">{scene.scriptText}</td>
                    <td className="px-3 py-2">
                      {scene.warnings.length > 0 ? scene.warnings.join(", ") : "OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={action} className="space-y-3">
            <input type="hidden" name="patchJson" value={rawText} />
            <input
              type="hidden"
              name="selectedFromOrder"
              value={selectedFromOrder}
            />
            <input type="hidden" name="selectedToOrder" value={selectedToOrder} />
            <input
              type="hidden"
              name="confirmNarrationMismatch"
              value={confirmNarrationMismatch ? "on" : ""}
            />
            <input
              type="hidden"
              name="confirmNarrationOverlap"
              value={confirmNarrationOverlap ? "on" : ""}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmPreview}
                onChange={(event) => setConfirmPreview(event.target.checked)}
                className="size-4"
              />
              I reviewed the dry-run preview and want to replace the range declared by this patch.
            </label>

            {preview.narrationWarning ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmNarrationMismatch}
                  onChange={(event) =>
                    setConfirmNarrationMismatch(event.target.checked)
                  }
                  className="size-4"
                />
                Apply anyway even though the hook narration differs.
              </label>
            ) : null}

            {preview.duplicateAfterRangeWarning ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmNarrationOverlap}
                  onChange={(event) =>
                    setConfirmNarrationOverlap(event.target.checked)
                  }
                  className="size-4"
                />
                Apply anyway even though replacement narration still exists after the patch range.
              </label>
            ) : null}

            <Button type="submit" disabled={!canSubmit}>
              Apply Hook Replacement Patch
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function PreviewMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium">{value}</p>
    </div>
  );
}
