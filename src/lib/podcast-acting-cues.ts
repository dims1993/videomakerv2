/**
 * Podcast acting cues ([laughs], [sighs], …) from the raw script.
 * Mapped onto Visual Plan scenes so ElevenLabs v3 can receive audio tags
 * only on those scenes (cheaper turbo elsewhere).
 */

export const ELEVENLABS_EXPRESSIVE_MODEL_ID = "eleven_v3";
export const ELEVENLABS_EFFICIENT_MODEL_ID = "eleven_turbo_v2_5";

const SECTION_LABEL_PATTERN = /^\[([^\]]+)\]\s*$/;

/** Known cues we route to eleven_v3 audio tags (podcast whitelist). */
const ACTING_CUE_ALIASES: Record<string, string> = {
  laugh: "laughs",
  laughs: "laughs",
  laughing: "laughs",
  chuckle: "laughs",
  chuckles: "laughs",
  sigh: "sighs",
  sighs: "sighs",
  hungry: "hungry",
  confused: "confused",
  nervous: "nervous",
  excited: "excited",
  proud: "proud",
  whisper: "whispers",
  whispers: "whispers",
};

export type PodcastActingCue = {
  /** Canonical tag body, e.g. "laughs" */
  tag: string;
  /** Bracket form for Eleven v3, e.g. "[laughs]" */
  audioTag: string;
};

export type PodcastActingCueSceneMatch = {
  sortOrder: number;
  cues: PodcastActingCue[];
  dialoguePreview: string;
};

function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSpeech(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePodcastActingCueLabel(label: string): PodcastActingCue | null {
  const normalized = normalizeLabel(label);
  const canonical = ACTING_CUE_ALIASES[normalized];
  if (!canonical) {
    return null;
  }
  return {
    tag: canonical,
    audioTag: `[${canonical}]`,
  };
}

export function isPodcastActingCueLabel(label: string) {
  return Boolean(parsePodcastActingCueLabel(label));
}

type ScriptTurn = {
  cues: PodcastActingCue[];
  dialogue: string;
};

/**
 * Split the podcast script into spoken turns with any leading acting cues.
 */
export function extractPodcastScriptTurnsWithActingCues(
  script: string,
): ScriptTurn[] {
  const turns: ScriptTurn[] = [];
  let pendingCues: PodcastActingCue[] = [];
  let dialogueLines: string[] = [];

  const flush = () => {
    const dialogue = dialogueLines.join(" ").replace(/\s+/g, " ").trim();
    if (dialogue) {
      turns.push({
        cues: [...pendingCues],
        dialogue,
      });
    }
    pendingCues = [];
    dialogueLines = [];
  };

  for (const rawLine of script.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const bracket = trimmed.match(SECTION_LABEL_PATTERN);
    if (bracket?.[1]) {
      const label = bracket[1];
      const acting = parsePodcastActingCueLabel(label);
      if (acting) {
        // Cues apply to the *following* dialogue; close any prior turn first.
        if (dialogueLines.length > 0) {
          flush();
        }
        pendingCues.push(acting);
        continue;
      }
      // Speaker / pause / music / section labels close the current turn.
      flush();
      continue;
    }

    // Bare PART / INTRO-style lines are not dialogue.
    if (/^(#{1,6}\s*)?(PART\s+\d+|INTRO|LESSON|CLOSING|FINAL|COLD\s+OPEN)\b/i.test(trimmed)) {
      flush();
      continue;
    }

    dialogueLines.push(trimmed);
  }

  flush();
  return turns;
}

function findBestSceneForDialogue<
  T extends { sortOrder: number; scriptText: string },
>(
  dialogue: string,
  scenes: T[],
  used: Set<number>,
): T | null {
  const needle = normalizeSpeech(dialogue);
  if (needle.length < 4) {
    return null;
  }

  const candidates = scenes.filter((scene) => !used.has(scene.sortOrder));
  const exact = candidates.find(
    (scene) => normalizeSpeech(scene.scriptText) === needle,
  );
  if (exact) {
    return exact;
  }

  const prefix = needle.slice(0, Math.min(48, needle.length));
  const fuzzy = candidates.find((scene) => {
    const hay = normalizeSpeech(scene.scriptText);
    if (hay.length < 4) {
      return false;
    }
    return (
      hay.startsWith(prefix) ||
      needle.startsWith(hay.slice(0, Math.min(48, hay.length))) ||
      hay.includes(prefix)
    );
  });
  return fuzzy ?? null;
}

/**
 * Map script acting cues onto scene sortOrders (only turns that have cues).
 */
export function mapPodcastActingCuesToScenes(opts: {
  script: string;
  scenes: Array<{ sortOrder: number; scriptText: string }>;
}): Map<number, PodcastActingCue[]> {
  const turns = extractPodcastScriptTurnsWithActingCues(opts.script);
  const used = new Set<number>();
  const byOrder = new Map<number, PodcastActingCue[]>();

  for (const turn of turns) {
    if (turn.cues.length === 0) {
      // Still consume matching scene order so later fuzzy matches stay aligned.
      const scene = findBestSceneForDialogue(turn.dialogue, opts.scenes, used);
      if (scene) {
        used.add(scene.sortOrder);
      }
      continue;
    }

    const scene = findBestSceneForDialogue(turn.dialogue, opts.scenes, used);
    if (!scene) {
      continue;
    }
    used.add(scene.sortOrder);
    const existing = byOrder.get(scene.sortOrder) ?? [];
    byOrder.set(scene.sortOrder, [...existing, ...turn.cues]);
  }

  return byOrder;
}

export function listPodcastActingCueMatches(opts: {
  script: string;
  scenes: Array<{ sortOrder: number; scriptText: string }>;
}): PodcastActingCueSceneMatch[] {
  const map = mapPodcastActingCuesToScenes(opts);
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sortOrder, cues]) => {
      const scene = opts.scenes.find((item) => item.sortOrder === sortOrder);
      return {
        sortOrder,
        cues,
        dialoguePreview: (scene?.scriptText ?? "").slice(0, 80),
      };
    });
}

/** Prepend Eleven v3 audio tags to spoken text. */
export function buildExpressiveVoiceoverText(
  spokenText: string,
  cues: PodcastActingCue[],
) {
  const text = spokenText.trim();
  if (!text || cues.length === 0) {
    return text;
  }
  const uniqueTags = [...new Set(cues.map((cue) => cue.audioTag))];
  return `${uniqueTags.join(" ")} ${text}`.trim();
}

export function resolveVoiceoverModelForActingCues(
  cues: PodcastActingCue[] | undefined,
  fallbackModelId: string | null | undefined,
) {
  if (cues && cues.length > 0) {
    return ELEVENLABS_EXPRESSIVE_MODEL_ID;
  }
  const fallback = fallbackModelId?.trim();
  return fallback || ELEVENLABS_EFFICIENT_MODEL_ID;
}
