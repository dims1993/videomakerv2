"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useVoiceoverSceneSelection,
  type VoiceoverSceneSelectSet,
  type VoiceoverSelectableScene,
} from "@/components/voiceover-scene-selection";

/** Keep in sync with VOICEOVER_PAUSE_DEFAULT_MS in voiceover-punctuation-pause.ts */
const DEFAULT_SCENE_PAUSE_AFTER_MS = 80;

export function VoiceoverScenePausePanel({
  formId,
  scenes,
  applyAction,
  smartPauseAction,
  disabled = false,
  defaultPauseAfterMs = DEFAULT_SCENE_PAUSE_AFTER_MS,
  narrationBlocksEnabled = false,
}: {
  formId: string;
  scenes: VoiceoverSelectableScene[];
  applyAction: (formData: FormData) => void | Promise<void>;
  /** Overwrite all scenes with punctuation-based pauses (,/;/:/./¶). */
  smartPauseAction?: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
  /** Soft fallback shown in copy when pause is unset. */
  defaultPauseAfterMs?: number;
  /** When true, pauses are computed at generation/stitch — hide manual controls. */
  narrationBlocksEnabled?: boolean;
}) {
  const { applySet, setCounts } = useVoiceoverSceneSelection();

  const apply = (set: VoiceoverSceneSelectSet) => {
    applySet(set);
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-4">
      {narrationBlocksEnabled ? (
        <p className="text-xs text-muted-foreground">
          Pauses are automatic with narration blocks: 0ms between scenes in
          the same take, soft gap at block boundaries from punctuation (~80ms+).
          Re-generate voiceover to refresh them — no manual editing needed.
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="scenePauseAfterMs">Pause after selected scenes</Label>
            <Input
              id="scenePauseAfterMs"
              name="scenePauseAfterMs"
              form={formId}
              type="number"
              min="0"
              step="10"
              defaultValue={defaultPauseAfterMs}
              placeholder="ms"
            />
            <p className="text-xs text-muted-foreground">
              Silence after each selected scene when stitching (ms). App default
              micro-gap uses punctuation defaults when pause is unset
              (null): , ≈100ms · ;/: ≈177ms · . ≈245ms · ¶ ≈423ms
              (fallback {defaultPauseAfterMs}ms). Explicit 0 disables the gap.
            </p>
          </div>
          <Button
            type="submit"
            variant="outline"
            form={formId}
            disabled={disabled || scenes.length === 0}
            formAction={applyAction}
          >
            Apply pause to selected
          </Button>
          {smartPauseAction ? (
            <Button
              type="submit"
              variant="secondary"
              form={formId}
              disabled={disabled || scenes.length === 0}
              formAction={smartPauseAction}
              title=", ≈100ms · ;/: ≈177ms · . ≈245ms · paragraph ≈423ms · fallback 80ms"
            >
              Apply punctuation pauses
            </Button>
          ) : null}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Select scene sets
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={scenes.length === 0}
            onClick={() => apply("all")}
          >
            All ({setCounts.all})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={scenes.length === 0}
            onClick={() => apply("none")}
          >
            None
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.emma === 0}
            onClick={() => apply("emma")}
            title="TEACHER_EMMA scenes and PART covers (Emma narration)"
          >
            Emma ({setCounts.emma})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.leo === 0}
            onClick={() => apply("leo")}
            title="STUDENT_LEO scenes"
          >
            Leo ({setCounts.leo})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.chapter_covers === 0}
            onClick={() => apply("chapter_covers")}
          >
            Chapter covers ({setCounts.chapter_covers})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.chapter_covers === 0}
            onClick={() => apply("structure")}
            title="Structural openers (chapter/final covers)"
          >
            Structure ({setCounts.chapter_covers})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.avatar === 0}
            onClick={() => apply("avatar")}
          >
            Avatar ({setCounts.avatar})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.insert === 0}
            onClick={() => apply("insert")}
          >
            Inserts ({setCounts.insert})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={setCounts.space === 0}
            onClick={() => apply("space")}
          >
            Space ({setCounts.space})
          </Button>
          {!narrationBlocksEnabled ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setCounts.pause_zero === 0}
                onClick={() => apply("pause_zero")}
                title="Scenes with explicit 0ms (overrides default)"
              >
                Pause 0ms ({setCounts.pause_zero})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setCounts.pause_null === 0}
                onClick={() => apply("pause_null")}
                title="Unset pauses (will use app default at stitch)"
              >
                Unset ({setCounts.pause_null})
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
