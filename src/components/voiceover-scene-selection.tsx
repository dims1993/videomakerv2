"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { voiceoverSpeakerKindFromVisualIdea } from "@/lib/script-sections";

export type VoiceoverSelectableScene = {
  sortOrder: number;
  sceneType: string;
  visualIdea: string | null;
  pauseAfterMs: number | null;
};

export type VoiceoverSceneSelectSet =
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

export function matchesVoiceoverSceneSelectSet(
  scene: VoiceoverSelectableScene,
  set: VoiceoverSceneSelectSet,
) {
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

export function countVoiceoverSceneSelectSet(
  scenes: VoiceoverSelectableScene[],
  set: VoiceoverSceneSelectSet,
) {
  if (set === "all") {
    return scenes.length;
  }
  if (set === "none") {
    return 0;
  }
  return scenes.filter((scene) => matchesVoiceoverSceneSelectSet(scene, set)).length;
}

type VoiceoverSceneSelectionContextValue = {
  selected: ReadonlySet<number>;
  selectedCount: number;
  toggleScene: (sortOrder: number, checked: boolean) => void;
  applySet: (set: VoiceoverSceneSelectSet) => void;
  setCounts: Record<Exclude<VoiceoverSceneSelectSet, "none">, number>;
};

const VoiceoverSceneSelectionContext =
  createContext<VoiceoverSceneSelectionContextValue | null>(null);

export function VoiceoverSceneSelectionProvider({
  formId,
  scenes,
  children,
}: {
  formId: string;
  scenes: VoiceoverSelectableScene[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const setCounts = useMemo(
    () => ({
      all: scenes.length,
      emma: countVoiceoverSceneSelectSet(scenes, "emma"),
      leo: countVoiceoverSceneSelectSet(scenes, "leo"),
      chapter_covers: countVoiceoverSceneSelectSet(scenes, "chapter_covers"),
      structure: countVoiceoverSceneSelectSet(scenes, "structure"),
      avatar: countVoiceoverSceneSelectSet(scenes, "avatar"),
      insert: countVoiceoverSceneSelectSet(scenes, "insert"),
      space: countVoiceoverSceneSelectSet(scenes, "space"),
      pause_zero: countVoiceoverSceneSelectSet(scenes, "pause_zero"),
      pause_null: countVoiceoverSceneSelectSet(scenes, "pause_null"),
    }),
    [scenes],
  );

  const applySet = useCallback(
    (set: VoiceoverSceneSelectSet) => {
      if (set === "none") {
        setSelected(new Set());
        return;
      }
      setSelected(
        new Set(
          scenes
            .filter((scene) => matchesVoiceoverSceneSelectSet(scene, set))
            .map((scene) => scene.sortOrder),
        ),
      );
    },
    [scenes],
  );

  const toggleScene = useCallback((sortOrder: number, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(sortOrder);
      } else {
        next.delete(sortOrder);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      selected,
      selectedCount: selected.size,
      toggleScene,
      applySet,
      setCounts,
    }),
    [selected, toggleScene, applySet, setCounts],
  );

  return (
    <VoiceoverSceneSelectionContext.Provider value={value}>
      {[...selected].map((sortOrder) => (
        <input
          key={sortOrder}
          type="hidden"
          form={formId}
          name="selectedSceneVoiceoverOrders"
          value={String(sortOrder)}
          readOnly
        />
      ))}
      {children}
    </VoiceoverSceneSelectionContext.Provider>
  );
}

export function useVoiceoverSceneSelection() {
  const context = useContext(VoiceoverSceneSelectionContext);
  if (!context) {
    throw new Error(
      "useVoiceoverSceneSelection must be used within VoiceoverSceneSelectionProvider",
    );
  }
  return context;
}

export function VoiceoverSceneSelectCheckbox({
  sortOrder,
  disabled = false,
}: {
  sortOrder: number;
  disabled?: boolean;
}) {
  const { selected, toggleScene } = useVoiceoverSceneSelection();

  if (disabled) {
    return <span className="text-xs text-destructive">—</span>;
  }

  return (
    <input
      type="checkbox"
      className="size-4"
      checked={selected.has(sortOrder)}
      onChange={(event) => toggleScene(sortOrder, event.target.checked)}
      aria-label={`Select scene ${sortOrder}`}
    />
  );
}

export function VoiceoverSceneSelectionSummary({
  listTruncated = false,
  visibleSceneCount = 0,
  totalSceneCount = 0,
  narrationBlocksEnabled = false,
}: {
  listTruncated?: boolean;
  visibleSceneCount?: number;
  totalSceneCount?: number;
  narrationBlocksEnabled?: boolean;
}) {
  const { selectedCount } = useVoiceoverSceneSelection();

  return (
    <div className="rounded-md border border-sky-300/60 bg-sky-50/80 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-950/40">
      <span className="font-semibold text-sky-900 dark:text-sky-100">
        {selectedCount} scene{selectedCount === 1 ? "" : "s"} selected
      </span>
      <span className="text-sky-800/90 dark:text-sky-200/90">
        {" "}
        for Generate selected
        {narrationBlocksEnabled ? "" : " / Apply pause"}
      </span>
      {listTruncated ? (
        <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-300/90">
          Table shows {visibleSceneCount} of {totalSceneCount} scenes, but
          selection uses the full list — speaker buttons (Emma/Leo) select every
          matching scene, not only visible rows.
        </p>
      ) : null}
    </div>
  );
}
