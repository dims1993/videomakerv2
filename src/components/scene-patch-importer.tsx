"use client";

import type React from "react";
import { useMemo, useState } from "react";

import {
  buildScenePatchPreview,
  summarizePatchItemPreview,
  type ScenePatchPreview,
} from "@/lib/scene-patch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ScenePatchImporterProps = {
  action: (formData: FormData) => void | Promise<void>;
  videoId: string;
  channelKey: string;
  scenes: {
    id: string;
    sortOrder: number;
    scriptText: string;
    visualIdea: string | null;
    imagePrompt: string | null;
    hasGeneratedImage?: boolean;
  }[];
};

export function ScenePatchImporter({
  action,
  videoId,
  channelKey,
  scenes,
}: ScenePatchImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [allowScriptTextChanges, setAllowScriptTextChanges] = useState(false);
  const [confirmLargePatch, setConfirmLargePatch] = useState(false);
  const [confirmDuplicateTargets, setConfirmDuplicateTargets] = useState(false);
  const [confirmClearImages, setConfirmClearImages] = useState(false);

  const { preview, parseError } = useMemo<{
    preview: ScenePatchPreview | null;
    parseError: string;
  }>(() => {
    if (!rawText.trim()) {
      return { preview: null, parseError: "" };
    }

    try {
      return {
        preview: buildScenePatchPreview({
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
        parseError: "",
      };
    } catch (error) {
      return {
        preview: null,
        parseError:
          error instanceof Error
            ? error.message
            : "Could not parse patch JSON.",
      };
    }
  }, [allowScriptTextChanges, channelKey, rawText, scenes, videoId]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setRawText(await file.text());
  }

  const requiresLargePatchConfirmation = (preview?.totalCount ?? 0) > 50;
  const requiresDuplicateConfirmation = (preview?.duplicateTargetCount ?? 0) > 0;
  const requiresClearImageConfirmation = (preview?.clearImageCount ?? 0) > 0;
  const canSubmit =
    Boolean(preview) &&
    !parseError &&
    (preview?.validCount ?? 0) > 0 &&
    (!requiresLargePatchConfirmation || confirmLargePatch) &&
    (!requiresDuplicateConfirmation || confirmDuplicateTargets) &&
    (!requiresClearImageConfirmation || confirmClearImages);

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-medium">Import Scene Patch</h3>
          <p className="text-sm text-muted-foreground">
            Apply focused updates by `id` or positive `order`. Use negative
            `order` (e.g. -16…-1) to prepend new scenes; existing scenes shift
            and keep their images.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setIsOpen((value) => !value)}>
          {isOpen ? "Hide importer" : "Open importer"}
        </Button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="scenePatchJson">Patch JSON</Label>
            <Textarea
              id="scenePatchJson"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="min-h-56 font-mono text-sm"
              placeholder='[{"order":1,"visualIdea":"...","imagePrompt":"..."}]'
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowScriptTextChanges}
                onChange={(event) => setAllowScriptTextChanges(event.target.checked)}
                className="size-4"
              />
              Allow scriptText changes
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="file"
                accept=".json,.txt,application/json,text/plain"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {parseError ? (
            <p className="text-sm text-destructive">{parseError}</p>
          ) : null}

          {preview ? (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
                <PreviewMetric label="Patch items" value={preview.totalCount} />
                <PreviewMetric label="Valid matches" value={preview.validCount} />
                <PreviewMetric label="Prepend inserts" value={preview.prependCount} />
                <PreviewMetric
                  label="Will clear images"
                  value={preview.clearImageCount}
                />
                <PreviewMetric label="Warnings" value={preview.warningCount} />
                <PreviewMetric label="Invalid" value={preview.invalidCount} />
              </div>

              {preview.globalWarnings.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {preview.globalWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              <div className="max-h-[420px] overflow-auto rounded-md border">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">Target</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Fields</th>
                      <th className="px-3 py-2 font-medium">Visual idea</th>
                      <th className="px-3 py-2 font-medium">Image prompt</th>
                      <th className="px-3 py-2 font-medium">Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.key} className="border-b align-top">
                        <td className="px-3 py-2">
                          {row.matchStatus === "insert_prepend"
                            ? `Prepend ${row.targetOrder}`
                            : row.targetSceneId
                              ? `Scene ${row.targetOrder}`
                              : "Unknown scene"}
                        </td>
                        <td className="px-3 py-2">{row.matchStatus}</td>
                        <td className="px-3 py-2">{row.fieldsToUpdate.join(", ") || "None"}</td>
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">
                              {summarizePatchItemPreview(row.oldVisualIdea) || "Empty"}
                            </p>
                            <p>{summarizePatchItemPreview(row.newVisualIdea) || "Empty"}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {row.oldImagePromptExists ? "Existing" : "Empty"} to{" "}
                          {row.newImagePromptExists ? "Present" : "Empty"}
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
                ) : null}

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
                    scene(s); untouched scenes keep theirs
                  </label>
                ) : null}

                {requiresDuplicateConfirmation ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="confirmDuplicateTargets"
                      checked={confirmDuplicateTargets}
                      onChange={(event) => setConfirmDuplicateTargets(event.target.checked)}
                      className="size-4"
                    />
                    Confirm duplicate targets and use the last patch item for each repeated scene
                  </label>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!canSubmit}>
                    Apply patch
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
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
  value: number;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium">{value}</p>
    </div>
  );
}
