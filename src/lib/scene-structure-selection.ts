/**
 * Map scenes to script structure markers for operator multi-select
 * ([INTRO], [PART N - TITLE], [CHAPTER N - …], [CLOSING], …).
 */

import { sectionClipTagFromVisualIdea } from "@/lib/podcast-video-library-shared";

export type SelectableStructureSection = {
  id: string;
  /** Display label without brackets, e.g. INTRO or PART 1 — TITLE */
  label: string;
  startIndex: number;
  endIndex: number;
};

export type SceneStructureAssignment = {
  sortOrder: number;
  sectionId: string;
  sectionLabel: string;
};

export type SceneStructureSelectGroup = {
  id: string;
  label: string;
  sceneIds: string[];
  count: number;
};

const BRACKET_LINE = /^\[([^\]]+)\]\s*$/;

const FIXED_STRUCTURE_LABELS = new Set([
  "HOOK",
  "INTRODUCTION",
  "INTRO",
  "LESSON",
  "CLOSING",
  "FINAL",
  "REFLECTION AND PRAYER",
  "COLD OPEN",
]);

function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, " ");
}

function normalizeLabelKey(label: string) {
  return normalizeLabel(label)
    .toUpperCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSelectableStructureStartLabel(label: string) {
  const normalized = normalizeLabel(label);
  const upper = normalized.toUpperCase();

  if (FIXED_STRUCTURE_LABELS.has(upper)) {
    return upper !== "END HOOK" && upper !== "ENDHOOK";
  }
  if (/^PART\s+\d+\s*[—–\-]/.test(upper)) {
    return true;
  }
  if (/^CHAPTER\s+\d+\s*[—–\-]/.test(upper)) {
    return true;
  }
  if (/^FINAL\s*[—–\-]/.test(upper)) {
    return true;
  }
  if (/^CHAPTER\s+COVER\b/i.test(normalized)) {
    return true;
  }
  return false;
}

/**
 * Split script into contiguous structural ranges for selection.
 * `[HOOK]…[END HOOK]` stays one block.
 */
export function splitScriptIntoSelectableStructureSections(
  script: string,
): SelectableStructureSection[] {
  const normalizedScript = script.replace(/\r\n/g, "\n");
  const lines = normalizedScript.split("\n");
  const sections: Array<{ label: string; start: number; end: number }> = [];
  let current: { label: string; start: number; end: number } | null = null;
  let inHook = false;
  let offset = 0;

  const closeCurrent = (end: number) => {
    if (current) {
      current.end = end;
      sections.push(current);
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineStart = offset;
    const lineEnd = offset + line.length + (i < lines.length - 1 ? 1 : 0);
    offset = lineEnd;

    const trimmed = line.trim();
    const bracket = trimmed.match(BRACKET_LINE);
    const label = bracket?.[1] ? normalizeLabel(bracket[1]) : null;
    const upper = label?.toUpperCase() ?? "";

    if (label && upper === "HOOK") {
      closeCurrent(lineStart);
      inHook = true;
      current = { label, start: lineStart, end: lineEnd };
      continue;
    }

    if (label && (upper === "END HOOK" || upper === "ENDHOOK")) {
      if (!current) {
        current = { label: "HOOK", start: lineStart, end: lineEnd };
      } else {
        current.end = lineEnd;
      }
      sections.push(current);
      current = null;
      inHook = false;
      continue;
    }

    if (label && !inHook && isSelectableStructureStartLabel(label)) {
      closeCurrent(lineStart);
      current = { label, start: lineStart, end: lineEnd };
      continue;
    }

    if (!current) {
      current = { label: "PREAMBLE", start: lineStart, end: lineEnd };
      continue;
    }

    current.end = lineEnd;
  }

  if (current) {
    sections.push(current);
  }

  return sections
    .filter((section) => section.end > section.start)
    .filter((section) => section.label.toUpperCase() !== "PREAMBLE")
    .map((section, index) => ({
      id: `structure-${index + 1}`,
      label: section.label,
      startIndex: section.start,
      endIndex: section.end,
    }));
}

function partCoverLabelFromVisualIdea(
  visualIdea: string | null | undefined,
): string | null {
  const match = (visualIdea ?? "")
    .trim()
    .match(/PART_COVER\s*\|\s*COMP_PART_COVER\s*:\s*(.+)$/i);
  const title = match?.[1]?.trim();
  return title ? normalizeLabel(title) : null;
}

function findSectionByLabelKey(
  sections: SelectableStructureSection[],
  label: string,
) {
  const key = normalizeLabelKey(label);
  return (
    sections.find((section) => normalizeLabelKey(section.label) === key) ??
    sections.find((section) =>
      normalizeLabelKey(section.label).startsWith(key),
    ) ??
    sections.find((section) =>
      key.startsWith(normalizeLabelKey(section.label)),
    ) ??
    null
  );
}

function sectionAtIndex(
  sections: SelectableStructureSection[],
  index: number,
) {
  return (
    sections.find(
      (section) => index >= section.startIndex && index < section.endIndex,
    ) ?? null
  );
}

/**
 * Assign each scene to a structural script section when possible.
 */
export function groupScenesBySelectableStructure({
  script,
  scenes,
}: {
  script: string;
  scenes: Array<{
    id: string;
    sortOrder: number;
    scriptText: string;
    visualIdea?: string | null;
  }>;
}): {
  sections: SelectableStructureSection[];
  assignments: Array<SceneStructureAssignment & { sceneId: string }>;
  groups: SceneStructureSelectGroup[];
} {
  const normalizedScript = script.replace(/\r\n/g, "\n");
  const sections = splitScriptIntoSelectableStructureSections(normalizedScript);
  const ordered = [...scenes].sort((a, b) => a.sortOrder - b.sortOrder);
  const assignments: Array<SceneStructureAssignment & { sceneId: string }> = [];
  let searchFrom = 0;
  let lastSection: SelectableStructureSection | null = null;

  for (const scene of ordered) {
    const clipTag = sectionClipTagFromVisualIdea(scene.visualIdea);
    if (clipTag) {
      const section = findSectionByLabelKey(sections, clipTag);
      if (section) {
        lastSection = section;
        assignments.push({
          sceneId: scene.id,
          sortOrder: scene.sortOrder,
          sectionId: section.id,
          sectionLabel: section.label,
        });
        continue;
      }
    }

    const partCover = partCoverLabelFromVisualIdea(scene.visualIdea);
    if (partCover) {
      const section = findSectionByLabelKey(sections, partCover);
      if (section) {
        lastSection = section;
        assignments.push({
          sceneId: scene.id,
          sortOrder: scene.sortOrder,
          sectionId: section.id,
          sectionLabel: section.label,
        });
        continue;
      }
    }

    const needle = scene.scriptText.trim();
    let index = needle ? normalizedScript.indexOf(needle, searchFrom) : -1;
    if (index < 0 && needle) {
      index = normalizedScript.indexOf(needle);
    }

    let section = index >= 0 ? sectionAtIndex(sections, index) : null;

    if (!section && lastSection) {
      section = lastSection;
    }

    if (!section) {
      continue;
    }

    lastSection = section;
    assignments.push({
      sceneId: scene.id,
      sortOrder: scene.sortOrder,
      sectionId: section.id,
      sectionLabel: section.label,
    });

    if (needle && index >= 0) {
      searchFrom = index + needle.length;
    }
  }

  const bySection = new Map<string, SceneStructureSelectGroup>();
  for (const section of sections) {
    bySection.set(section.id, {
      id: section.id,
      label: section.label,
      sceneIds: [],
      count: 0,
    });
  }
  for (const assignment of assignments) {
    const group = bySection.get(assignment.sectionId);
    if (!group) {
      continue;
    }
    group.sceneIds.push(assignment.sceneId);
    group.count = group.sceneIds.length;
  }

  return {
    sections,
    assignments,
    groups: [...bySection.values()].filter((group) => group.count > 0),
  };
}
