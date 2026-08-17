"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import {
  buildScenePatchPreview,
  summarizePatchItemPreview,
  type ScenePatchPreview,
} from "@/lib/scene-patch";
import { fetchPatchScenes } from "@/lib/fetch-patch-scenes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ScenePatcherPanelProps = {
  action: (formData: FormData) => void | Promise<void>;
  videoId: string;
  channelKey: string;
  scenesJsonUrl: string;
};

export function HookAutoFixPanel({
  action,
  videoId,
  channelKey,
  scenesJsonUrl,
}: ScenePatcherPanelProps) {
  const [rawText, setRawText] = useState("");
  const [allowScriptTextChanges, setAllowScriptTextChanges] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState(false);
  const [confirmLargePatch, setConfirmLargePatch] = useState(false);
  const [confirmDuplicateTargets, setConfirmDuplicateTargets] = useState(false);
  const [confirmClearImages, setConfirmClearImages] = useState(false);
  const [preview, setPreview] = useState<ScenePatchPreview | null>(null);
  const [parseError, setParseError] = useState("");
  const [loadingScenes, setLoadingScenes] = useState(false);

  useEffect(() => {
    if (!rawText.trim()) {
      setPreview(null);
      setParseError("");
      setLoadingScenes(false);
      return;
    }

    let cancelled = false;
    setLoadingScenes(true);

    void (async () => {
      try {
        const scenes = await fetchPatchScenes(scenesJsonUrl);
        if (cancelled) return;
        setPreview(
          buildScenePatchPreview({
            rawText,
            scenes: scenes.map((scene) => ({
              id: scene.id,
              order: scene.sortOrder,
              scriptText: scene.scriptText,
              visualIdea: scene.visualIdea,
              imagePrompt: scene.imagePrompt,
              hasGeneratedImage: Boolean(scene.hasGeneratedImage),
            })),
            channelKey,
            currentVideoId: videoId,
            allowScriptTextChanges,
          }),
        );
        setParseError("");
      } catch (error) {
        if (cancelled) return;
        setPreview(null);
        setParseError(
          error instanceof Error ? error.message : "Could not parse patch JSON.",
        );
      } finally {
        if (!cancelled) setLoadingScenes(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    allowScriptTextChanges,
    channelKey,
    rawText,
    scenesJsonUrl,
    videoId,
  ]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setRawText(await file.text());
    setConfirmPreview(false);
    setConfirmLargePatch(false);
    setConfirmDuplicateTargets(false);
    setConfirmClearImages(false);
  }

  const requiresLargePatchConfirmation = (preview?.totalCount ?? 0) > 50;
  const requiresDuplicateConfirmation = (preview?.duplicateTargetCount ?? 0) > 0;
  const requiresClearImageConfirmation = (preview?.clearImageCount ?? 0) > 0;
  const canSubmit =
    Boolean(preview) &&
    !parseError &&
    !loadingScenes &&
    (preview?.validCount ?? 0) > 0 &&
    confirmPreview &&
    (!requiresLargePatchConfirmation || confirmLargePatch) &&
    (!requiresDuplicateConfirmation || confirmDuplicateTargets) &&
    (!requiresClearImageConfirmation || confirmClearImages);

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="space-y-1">
        <h3 className="text-base font-medium">Scene Patcher</h3>
        <p className="text-sm text-muted-foreground">
          Paste or upload a JSON patch for specific scenes by <code>order</code>{" "}
          or <code>id</code>. Only those scenes are overwritten. Untouched scenes
          keep their images, order, and Flow file mapping.
        </p>
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="scenePatcherJson">Patch JSON</Label>
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
          id="scenePatcherJson"
          value={rawText}
          onChange={(event) => {
            setRawText(event.target.value);
            setConfirmPreview(false);
            setConfirmLargePatch(false);
            setConfirmDuplicateTargets(false);
            setConfirmClearImages(false);
          }}
          className="min-h-56 font-mono text-sm"
          placeholder='[{"order":42,"visualIdea":"...","imagePrompt":"..."}]'
        />
        <p className="text-xs text-muted-foreground">
          Accepted formats: scene array, {"{"}&quot;patch&quot;: [...]{"}"}, or a
          same-length hook_replacement_patch (converted to in-place updates).
          Structural replacements that change scene count are blocked to protect
          existing images.
        </p>
      </div>

      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowScriptTextChanges}
            onChange={(event) => {
              setAllowScriptTextChanges(event.target.checked);
              setConfirmPreview(false);
            }}
            className="size-4"
          />
          Allow scriptText changes (also clears that scene&apos;s voiceover only)
        </label>
      </div>

      {loadingScenes ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading scene context…</p>
      ) : null}

      {parseError ? (
        <p className="mt-3 text-sm text-destructive">{parseError}</p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
            <PreviewMetric label="Patch items" value={preview.totalCount} />
            <PreviewMetric label="Valid matches" value={preview.validCount} />
            <PreviewMetric label="Prepend inserts" value={preview.prependCount} />
            <PreviewMetric label="Will clear images" value={preview.clearImageCount} />
            <PreviewMetric label="Warnings" value={preview.warningCount} />
            <PreviewMetric label="Invalid / missing" value={preview.invalidCount} />
          </div>

          {preview.globalWarnings.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {preview.globalWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {preview.prependCount > 0
              ? "Negative-order items are prepended and existing scenes shift, but keep their images by scene id. Positive-order updates apply first against current orders."
              : "Untouched scenes are not renumbered, deleted, or modified. Their generated images stay attached for Flow batches."}
          </div>

          <div className="max-h-[420px] overflow-auto rounded-md border">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Fields</th>
                  <th className="px-3 py-2 font-medium">Image</th>
                  <th className="px-3 py-2 font-medium">Visual idea</th>
                  <th className="px-3 py-2 font-medium">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.key} className="border-b align-top">
                    <td className="px-3 py-2">
                      {row.matchStatus === "insert_prepend"
                        ? `Prepend ${row.targetOrder}`
                        : row.targetOrder != null
                          ? `Scene ${row.targetOrder}`
                          : "Unknown scene"}
                    </td>
                    <td className="px-3 py-2">{row.matchStatus}</td>
                    <td className="px-3 py-2">
                      {row.fieldsToUpdate.join(", ") || "None"}
                    </td>
                    <td className="px-3 py-2">
                      {row.willClearImage && row.hasExistingImage
                        ? "Will clear"
                        : row.hasExistingImage
                          ? "Keep"
                          : "None"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          {summarizePatchItemPreview(row.oldVisualIdea) || "Empty"}
                        </p>
                        <p>
                          {summarizePatchItemPreview(row.newVisualIdea) || "Empty"}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.warnings.length > 0 ? row.warnings.join(" ") : "OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={action} className="space-y-3">
            <input type="hidden" name="patchJson" value={rawText} />
            <input type="hidden" name="channelKey" value={channelKey} />
            <input
              type="hidden"
              name="allowScriptTextChanges"
              value={allowScriptTextChanges ? "on" : ""}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmPreview}
                onChange={(event) => setConfirmPreview(event.target.checked)}
                className="size-4"
              />
              I reviewed the dry-run preview. Only the listed scenes will be
              overwritten.
            </label>

            {requiresClearImageConfirmation ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmClearImages"
                  checked={confirmClearImages}
                  onChange={(event) => setConfirmClearImages(event.target.checked)}
                  className="size-4"
                />
                Clear generated images on {preview.clearImageCount} patched
                scene(s) so they can be regenerated
              </label>
            ) : null}

            {requiresLargePatchConfirmation ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmLargePatch"
                  checked={confirmLargePatch}
                  onChange={(event) => setConfirmLargePatch(event.target.checked)}
                  className="size-4"
                />
                Confirm applying a patch with more than 50 items
              </label>
            ) : (
              <input type="hidden" name="confirmLargePatch" value="" />
            )}

            {requiresDuplicateConfirmation ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmDuplicateTargets"
                  checked={confirmDuplicateTargets}
                  onChange={(event) =>
                    setConfirmDuplicateTargets(event.target.checked)
                  }
                  className="size-4"
                />
                Confirm duplicate targets and use the last patch item for each
                repeated scene
              </label>
            ) : (
              <input type="hidden" name="confirmDuplicateTargets" value="" />
            )}

            <Button type="submit" disabled={!canSubmit}>
              Apply scene patch
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
