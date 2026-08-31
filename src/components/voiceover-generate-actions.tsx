"use client";

import { useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { CancelSceneVoiceoverButton } from "@/components/cancel-scene-voiceover-button";
import { useVoiceoverSceneSelection } from "@/components/voiceover-scene-selection";

type FormAction = (formData: FormData) => void | Promise<void>;

/**
 * Voiceover generate actions.
 *
 * Important: the shared ElevenLabs <form> used to treat Enter as "first submit
 * button" — historically Generate ALL — which queued every scene after a
 * stitch redirect cleared checkbox selection. Generate ALL is therefore a
 * plain button (never Enter-default); only explicit clicks after confirm run it.
 */
export function VoiceoverGenerateActions({
  formId,
  videoId,
  sceneCount,
  missingCount,
  generatedCount,
  generateAllAction,
  generateMissingAction,
  generateSelectedAction,
  retryFailedAction,
  stitchAction,
}: {
  formId: string;
  videoId: string;
  sceneCount: number;
  missingCount: number;
  generatedCount: number;
  generateAllAction: FormAction;
  generateMissingAction: FormAction;
  generateSelectedAction: FormAction;
  retryFailedAction: FormAction;
  stitchAction: FormAction;
}) {
  const { selectedCount } = useVoiceoverSceneSelection();
  const hasSelection = selectedCount > 0;
  const allSubmitRef = useRef<HTMLButtonElement>(null);
  const [isPendingAll, startAllTransition] = useTransition();

  function runGenerateAll() {
    const ok = window.confirm(
      `Generate voiceovers for ALL ${sceneCount} scenes?\n\n` +
        `This is not “selected only”. If you only wanted the checked scene(s), click Cancel and use “Generate selected (${selectedCount})” instead.`,
    );
    if (!ok) {
      return;
    }
    // Prefer native form submit so Next.js formAction + redirect behave
    // exactly like the other voiceover buttons.
    startAllTransition(() => {
      allSubmitRef.current?.click();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          form={formId}
          disabled={sceneCount === 0 || !hasSelection}
          formAction={generateSelectedAction}
          data-voiceover-action="selected"
          title={
            hasSelection
              ? `Regenerate only the ${selectedCount} checked scene${selectedCount === 1 ? "" : "s"}`
              : "Select one or more scenes in the table (or Leo/Emma) first"
          }
        >
          Generate selected ({selectedCount})
        </Button>
        <Button
          type="submit"
          variant="outline"
          form={formId}
          disabled={missingCount === 0}
          formAction={generateMissingAction}
          data-voiceover-action="missing"
        >
          Generate missing ({missingCount})
        </Button>
        <Button
          type="submit"
          variant="outline"
          form={formId}
          disabled={sceneCount === 0}
          formAction={retryFailedAction}
          data-voiceover-action="retry"
        >
          Retry failed scenes
        </Button>
        <Button
          type="submit"
          variant="outline"
          form={formId}
          disabled={generatedCount === 0}
          formAction={stitchAction}
          data-voiceover-action="stitch"
        >
          Stitch master voiceover
        </Button>
        <CancelSceneVoiceoverButton videoId={videoId} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-2">
        {/* Hidden real submit — never the Enter default (comes after other submits
            and is only clicked programmatically after confirm). */}
        <button
          ref={allSubmitRef}
          type="submit"
          form={formId}
          formAction={generateAllAction}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          data-voiceover-action="all"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={sceneCount === 0 || isPendingAll}
          onClick={runGenerateAll}
        >
          {isPendingAll
            ? "Starting ALL…"
            : `Generate ALL scenes (${sceneCount})`}
        </Button>
        <p className="text-xs text-muted-foreground">
          {hasSelection
            ? `You have ${selectedCount} scene${selectedCount === 1 ? "" : "s"} selected — use “Generate selected”, not ALL.`
            : "ALL is click-only (Enter in voice settings will not start it). Existing audio is skipped unless “Overwrite existing” is checked."}
        </p>
      </div>
    </div>
  );
}
