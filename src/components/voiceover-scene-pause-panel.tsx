"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { voiceoverSpeakerKindFromVisualIdea } from "@/lib/script-sections";

/** Keep in sync with DEFAULT_SCENE_PAUSE_AFTER_MS in voiceover-scenes.ts */
const DEFAULT_SCENE_PAUSE_AFTER_MS = 180;

export type VoiceoverPauseSceneMeta = {
  sortOrder: number;
  sceneType: string;
  visualIdea: string | null;
  pauseAfterMs: number | null;
};

type SelectSet =
  | "all"
  | "none"
  | "emma"
  | "leo"
  | "chapter_covers"
  | "structure"
  | "avatar"
  | "insert"
  | "space"
  | "pause_zero"
  | "pause_null";

function isChapterCoverIdea(visualIdea: string | null) {
  return /^Chapter cover:/i.test((visualIdea ?? "").trim());
}

function matchesSet(scene: VoiceoverPauseSceneMeta, set: SelectSet) {
  switch (set) {
    case "all":
      return true;
    case "none":
      return false;
    case "emma":
      return voiceoverSpeakerKindFromVisualIdea(scene.visualIdea) === "teacher";
    case "leo":
      return voiceoverSpeakerKindFromVisualIdea(scene.visualIdea) === "student";
    case "chapter_covers":
      return isChapterCoverIdea(scene.visualIdea);
    case "structure":
      // Official openers: chapter/final covers (same visualIdea prefix today).
      return isChapterCoverIdea(scene.visualIdea);
    case "avatar":
      return scene.sceneType === "avatar";
    case "insert":
      return scene.sceneType === "insert" && !isChapterCoverIdea(scene.visualIdea);
    case "space":
      return scene.sceneType === "space";
    case "pause_zero":
      return scene.pauseAfterMs === 0;
    case "pause_null":
      return scene.pauseAfterMs == null;
    default:
      return false;
  }
}

export function VoiceoverScenePausePanel({
  formId,
  scenes,
  applyAction,
  disabled = false,
}: {
  formId: string;
  scenes: VoiceoverPauseSceneMeta[];
  applyAction: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  const applySet = (set: SelectSet) => {
    const wanted = new Set(
      scenes.filter((scene) => matchesSet(scene, set)).map((scene) => scene.sortOrder),
    );
    const inputs = document.querySelectorAll<HTMLInputElement>(
      `input[name="selectedSceneVoiceoverOrders"][form="${CSS.escape(formId)}"]`,
    );
    for (const input of inputs) {
      const order = Number(input.value);
      input.checked = wanted.has(order);
    }
  };

  const counts = {
    all: scenes.length,
    emma: scenes.filter(
      (s) => voiceoverSpeakerKindFromVisualIdea(s.visualIdea) === "teacher",
    ).length,
    leo: scenes.filter(
      (s) => voiceoverSpeakerKindFromVisualIdea(s.visualIdea) === "student",
    ).length,
    chapter_covers: scenes.filter((s) => isChapterCoverIdea(s.visualIdea)).length,
    avatar: scenes.filter((s) => s.sceneType === "avatar").length,
    insert: scenes.filter(
      (s) => s.sceneType === "insert" && !isChapterCoverIdea(s.visualIdea),
    ).length,
    space: scenes.filter((s) => s.sceneType === "space").length,
    pause_zero: scenes.filter((s) => s.pauseAfterMs === 0).length,
    pause_null: scenes.filter((s) => s.pauseAfterMs == null).length,
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-4">
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
            defaultValue={DEFAULT_SCENE_PAUSE_AFTER_MS}
            placeholder="ms"
          />
          <p className="text-xs text-muted-foreground">
            Silence after each selected scene when stitching (ms). App default
            micro-gap is {DEFAULT_SCENE_PAUSE_AFTER_MS}ms when pause is unset
            (null). Explicit 0 disables the gap.
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
      </div>

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
            onClick={() => applySet("all")}
          >
            All ({counts.all})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={scenes.length === 0}
            onClick={() => applySet("none")}
          >
            None
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.emma === 0}
            onClick={() => applySet("emma")}
            title="TEACHER_EMMA scenes and PART covers (Emma narration)"
          >
            Emma ({counts.emma})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.leo === 0}
            onClick={() => applySet("leo")}
            title="STUDENT_LEO scenes"
          >
            Leo ({counts.leo})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.chapter_covers === 0}
            onClick={() => applySet("chapter_covers")}
          >
            Chapter covers ({counts.chapter_covers})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.chapter_covers === 0}
            onClick={() => applySet("structure")}
            title="Structural openers (chapter/final covers)"
          >
            Structure ({counts.chapter_covers})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.avatar === 0}
            onClick={() => applySet("avatar")}
          >
            Avatar ({counts.avatar})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.insert === 0}
            onClick={() => applySet("insert")}
          >
            Inserts ({counts.insert})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.space === 0}
            onClick={() => applySet("space")}
          >
            Space ({counts.space})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.pause_zero === 0}
            onClick={() => applySet("pause_zero")}
            title="Scenes with explicit 0ms (overrides default)"
          >
            Pause 0ms ({counts.pause_zero})
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={counts.pause_null === 0}
            onClick={() => applySet("pause_null")}
            title="Unset pauses (will use app default at stitch)"
          >
            Unset ({counts.pause_null})
          </Button>
        </div>
      </div>
    </div>
  );
}
