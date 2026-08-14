export type ScriptSectionKind =
  | "introduction"
  | "lecture"
  | "reflection_prayer"
  | "closing"
  | "teacher"
  | "student"
  | "other";

export type ScriptSection = {
  id: string;
  label: string;
  kind: ScriptSectionKind;
  startIndex: number;
  endIndex: number;
};

export type SceneSectionAssignment = {
  sortOrder: number;
  sectionId: string;
  sectionLabel: string;
  sectionKind: ScriptSectionKind;
};

/** Contiguous script blocks (Bible chapters, etc.). */
export type VoiceoverGroupingMode = "sections" | "speakers";

/** Kinds that represent interleaved dialogue roles, not contiguous blocks. */
export const INTERLEAVED_SPEAKER_KINDS = new Set<ScriptSectionKind>([
  "teacher",
  "student",
]);

export function detectVoiceoverGroupingMode(
  assignments: SceneSectionAssignment[],
): VoiceoverGroupingMode {
  const hasSpeakers = assignments.some((assignment) =>
    INTERLEAVED_SPEAKER_KINDS.has(assignment.sectionKind),
  );
  return hasSpeakers ? "speakers" : "sections";
}

function kindFromVisualIdea(
  visualIdea: string | null | undefined,
): ScriptSectionKind | null {
  const normalized = (visualIdea ?? "").trim().toUpperCase();
  if (normalized.startsWith("TEACHER_EMMA")) {
    return "teacher";
  }
  if (normalized.startsWith("STUDENT_LEO")) {
    return "student";
  }
  // Emma narrates PART title covers.
  if (
    normalized.startsWith("PART_COVER:") ||
    normalized.startsWith("PART_COVER |")
  ) {
    return "teacher";
  }
  if (normalized.startsWith("MUSIC_BED") || normalized.startsWith("PAUSE_CARD")) {
    return null;
  }
  if (normalized.startsWith("SECTION_CLIP")) {
    return null;
  }
  return null;
}

/** Emma / Leo voiceover ownership from Visual Plan prefixes (incl. PART covers → Emma). */
export function voiceoverSpeakerKindFromVisualIdea(
  visualIdea: string | null | undefined,
): "teacher" | "student" | null {
  const kind = kindFromVisualIdea(visualIdea);
  if (kind === "teacher" || kind === "student") {
    return kind;
  }
  return null;
}

const SECTION_LABEL_PATTERN = /^\[([^\]]+)\]\s*$/;

function normalizeSectionLabel(label: string) {
  return label.trim().replace(/\s+/g, " ");
}

/**
 * Non-spoken production cues. They must not start a new voice section —
 * the current speaker section continues across the cue.
 */
export function isPodcastCueLabel(label: string): boolean {
  const normalized = normalizeSectionLabel(label).toUpperCase();
  if (
    normalized === "PAUSE" ||
    normalized.startsWith("PAUSE:") ||
    normalized === "LONG PAUSE" ||
    normalized.startsWith("LONG PAUSE:")
  ) {
    return true;
  }
  if (normalized === "MUSIC" || normalized.startsWith("MUSIC:")) {
    return true;
  }
  if (
    normalized === "INTRO" ||
    normalized === "LESSON" ||
    normalized === "CLOSING" ||
    normalized === "FINAL" ||
    normalized === "COLD OPEN" ||
    /^PART\s+\d+\s*[—–\-]/.test(normalized)
  ) {
    return true;
  }
  if (
    normalized === "LAUGHS" ||
    normalized === "LAUGH" ||
    normalized === "SIGHS" ||
    normalized === "SIGH"
  ) {
    return true;
  }
  return false;
}

export function classifyScriptSectionLabel(label: string): ScriptSectionKind {
  const normalized = normalizeSectionLabel(label).toUpperCase();

  if (
    normalized === "EMMA" ||
    normalized === "TEACHER" ||
    normalized === "HOST" ||
    normalized === "MAX"
  ) {
    return "teacher";
  }

  if (
    normalized === "LEO" ||
    normalized === "STUDENT" ||
    normalized === "GUEST" ||
    normalized === "SARA"
  ) {
    return "student";
  }

  if (normalized === "INTRODUCTION") {
    return "introduction";
  }

  if (normalized.startsWith("CHAPTER COVER")) {
    return "lecture";
  }

  if (normalized === "REFLECTION AND PRAYER") {
    return "reflection_prayer";
  }

  if (normalized === "CLOSING") {
    return "closing";
  }

  return "other";
}

export function parseScriptSections(script: string): ScriptSection[] {
  const sections: ScriptSection[] = [];
  let current: ScriptSection | null = null;
  let cursor = 0;

  while (cursor <= script.length) {
    const nextNl = script.indexOf("\n", cursor);
    const lineEnd = nextNl < 0 ? script.length : nextNl;
    const rawLine = script.slice(cursor, lineEnd);
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    const match = trimmed.match(SECTION_LABEL_PATTERN);

    if (match?.[1]) {
      const label = normalizeSectionLabel(match[1]);

      // Keep pause/music/acting cues inside the current speaker turn.
      if (!isPodcastCueLabel(label)) {
        if (current) {
          current.endIndex = cursor;
          sections.push(current);
        }

        current = {
          id: `section-${sections.length + 1}`,
          label,
          kind: classifyScriptSectionLabel(label),
          startIndex: cursor,
          endIndex: script.length,
        };
      }
    }

    if (nextNl < 0) {
      break;
    }
    // Advance past the real newline sequence (\n or \r\n).
    cursor = nextNl + 1;
  }

  if (current) {
    current.endIndex = script.length;
    sections.push(current);
  }

  return sections;
}

export function groupScenesByScriptSection({
  script,
  scenes,
}: {
  script: string;
  scenes: Array<{
    sortOrder: number;
    scriptText: string;
    visualIdea?: string | null;
  }>;
}): SceneSectionAssignment[] {
  const sections = parseScriptSections(script);
  if (sections.length === 0) {
    return scenes.map((scene) => {
      const fromVisual = kindFromVisualIdea(scene.visualIdea);
      if (fromVisual) {
        return {
          sortOrder: scene.sortOrder,
          sectionId: `visual-${fromVisual}`,
          sectionLabel: fromVisual === "teacher" ? "EMMA" : "LEO",
          sectionKind: fromVisual,
        };
      }
      return {
        sortOrder: scene.sortOrder,
        sectionId: "section-1",
        sectionLabel: "Full script",
        sectionKind: "other" as const,
      };
    });
  }

  let searchFrom = 0;
  const assignments: SceneSectionAssignment[] = [];

  for (const scene of scenes) {
    const needle = scene.scriptText.trim();
    const fromVisual = kindFromVisualIdea(scene.visualIdea);

    // Non-spoken music/pause inserts: do not advance the speaker cursor.
    if (!needle && fromVisual == null) {
      assignments.push({
        sortOrder: scene.sortOrder,
        sectionId: "cue-nonspeaking",
        sectionLabel: "Music / cue",
        sectionKind: "other",
      });
      continue;
    }

    let index = needle ? script.indexOf(needle, searchFrom) : -1;

    if (index < 0 && needle) {
      // Soft fallback: try from the start once (planner wording drift).
      index = script.indexOf(needle);
    }

    let section =
      index >= 0
        ? sections.find(
            (entry) => index >= entry.startIndex && index < entry.endIndex,
          )
        : null;

    // Podcast character lock on visualIdea wins over script-position matching.
    // (Also protects against short lines like "No." matching the wrong turn.)
    if (fromVisual === "teacher" || fromVisual === "student") {
      assignments.push({
        sortOrder: scene.sortOrder,
        sectionId: `visual-${fromVisual}-${scene.sortOrder}`,
        sectionLabel: fromVisual === "teacher" ? "EMMA" : "LEO",
        sectionKind: fromVisual,
      });
      if (needle && index >= 0) {
        searchFrom = index + needle.length;
      }
      continue;
    }

    section = section ?? sections[sections.length - 1]!;

    assignments.push({
      sortOrder: scene.sortOrder,
      sectionId: section.id,
      sectionLabel: section.label,
      sectionKind: section.kind,
    });

    if (needle && index >= 0) {
      searchFrom = index + needle.length;
    }
  }

  return assignments;
}

export const VOICEOVER_SECTION_GROUPS: Array<{
  kind: ScriptSectionKind;
  label: string;
  description: string;
}> = [
  {
    kind: "teacher",
    label: "Host A (Max / Emma)",
    description:
      "Max in Natural Daily Conversations, or Emma in English-in-Action challenge episodes.",
  },
  {
    kind: "student",
    label: "Host B (Sara / Leo)",
    description:
      "Sara in Natural Daily Conversations, or Leo in English-in-Action challenge episodes.",
  },
  {
    kind: "introduction",
    label: "Introduction",
    description: "Opening welcome and listening focus.",
  },
  {
    kind: "lecture",
    label: "Lecture / Scripture",
    description: "Chapter covers, announcements, and WEBUS reading.",
  },
  {
    kind: "reflection_prayer",
    label: "Reflection & Prayer",
    description: "Reflection and pastoral prayer section.",
  },
  {
    kind: "closing",
    label: "Closing",
    description: "Progress invitation and final blessing.",
  },
  {
    kind: "other",
    label: "Other",
    description: "Any scenes outside known section labels.",
  },
];

export function summarizeSceneSections(assignments: SceneSectionAssignment[]) {
  const grouped = new Map<ScriptSectionKind, number[]>();

  for (const assignment of assignments) {
    const orders = grouped.get(assignment.sectionKind) ?? [];
    orders.push(assignment.sortOrder);
    grouped.set(assignment.sectionKind, orders);
  }

  return VOICEOVER_SECTION_GROUPS.map((group) => {
    const orders = (grouped.get(group.kind) ?? []).sort((a, b) => a - b);
    return {
      ...group,
      sceneCount: orders.length,
      startSortOrder: orders[0] ?? null,
      endSortOrder: orders.length > 0 ? orders[orders.length - 1]! : null,
    };
  }).filter((group) => group.sceneCount > 0);
}

/**
 * For podcast-style scripts, only teacher/student rows belong in the voices UI.
 * Bible section labels (introduction/lecture/…) stay available in "sections" mode.
 */
export function filterVoiceoverGroupsForMode<
  T extends { kind: ScriptSectionKind; sceneCount: number },
>(groups: T[], mode: VoiceoverGroupingMode): T[] {
  if (mode !== "speakers") {
    return groups;
  }
  return groups.filter((group) => INTERLEAVED_SPEAKER_KINDS.has(group.kind));
}

export type SectionSceneRange = {
  startSortOrder: number;
  endSortOrder: number;
};

export type VoiceoverSectionRanges = Partial<
  Record<ScriptSectionKind, SectionSceneRange>
>;

/**
 * Rebuild scene→section assignments using optional manual sortOrder ranges.
 * Manual ranges win for contiguous section kinds (introduction/lecture/…).
 *
 * Teacher/student are interleaved dialogue roles: contiguous ranges would
 * overwrite the other speaker. Those kinds keep auto script/visual detection.
 */
export function applyManualSectionRanges({
  autoAssignments,
  ranges,
}: {
  autoAssignments: SceneSectionAssignment[];
  ranges: VoiceoverSectionRanges | null | undefined;
}): SceneSectionAssignment[] {
  if (!ranges || Object.keys(ranges).length === 0) {
    return autoAssignments;
  }

  const priority = VOICEOVER_SECTION_GROUPS.map((group) => group.kind).filter(
    (kind) => !INTERLEAVED_SPEAKER_KINDS.has(kind),
  );
  const labelByKind = new Map(
    VOICEOVER_SECTION_GROUPS.map((group) => [group.kind, group.label]),
  );

  return autoAssignments.map((assignment) => {
    // Never smear interleaved speaker roles with contiguous From–To ranges.
    if (INTERLEAVED_SPEAKER_KINDS.has(assignment.sectionKind)) {
      return assignment;
    }

    for (const kind of priority) {
      const range = ranges[kind];
      if (!range) {
        continue;
      }
      const start = Math.min(range.startSortOrder, range.endSortOrder);
      const end = Math.max(range.startSortOrder, range.endSortOrder);
      if (
        assignment.sortOrder >= start &&
        assignment.sortOrder <= end
      ) {
        return {
          ...assignment,
          sectionId: `manual-${kind}`,
          sectionLabel: labelByKind.get(kind) ?? kind,
          sectionKind: kind,
        };
      }
    }
    return assignment;
  });
}
