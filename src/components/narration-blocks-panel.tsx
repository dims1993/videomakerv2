"use client";

import { Button } from "@/components/ui/button";
import type { NarrationManifest } from "@/lib/voiceover-block-manifest";

type NarrationBlocksPanelProps = {
  videoId: string;
  formId: string;
  manifest: NarrationManifest | null;
  regenerateBlockAction: (
    videoId: string,
    blockId: string,
    formData: FormData,
  ) => void | Promise<void>;
};

export function NarrationBlocksPanel({
  videoId,
  formId,
  manifest,
  regenerateBlockAction,
}: NarrationBlocksPanelProps) {
  if (!manifest || manifest.blocks.length === 0) {
    return null;
  }

  const multiSceneBlocks = manifest.blocks.filter(
    (block) => (block.sceneIds?.length ?? 0) > 1,
  );
  if (multiSceneBlocks.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <p className="font-medium">Narration blocks</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Multi-scene TTS takes with aligned timings. Scene durations sync from
        the manifest after generation and stitch. Pauses between scenes inside a
        block are 0ms; block boundaries get an automatic micro-gap from
        punctuation.
      </p>
      <ul className="mt-3 space-y-2">
        {multiSceneBlocks.map((block) => {
          const sceneCount = block.sceneIds.length;
          const duration =
            block.durationSec != null
              ? `${block.durationSec.toFixed(1)}s`
              : "—";
          const confidence =
            block.alignmentConfidence != null
              ? `${Math.round(block.alignmentConfidence * 100)}%`
              : "n/a";
          return (
            <li
              key={block.blockId}
              className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background/70 px-2 py-2"
            >
              <div className="min-w-0 text-xs">
                <p className="font-medium">
                  Block {block.index + 1}{" "}
                  <span className="text-muted-foreground">
                    ({block.provider})
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {sceneCount} scenes · {duration} · align{" "}
                  {block.alignmentProvider ?? "—"} · conf {confidence}
                </p>
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                form={formId}
                formAction={regenerateBlockAction.bind(
                  null,
                  videoId,
                  block.blockId,
                )}
              >
                Regenerate block
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
