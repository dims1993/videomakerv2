/**
 * Compare by-scene master audio duration to the subtitle/image offset clock
 * (sum of VoiceoverSegment.durationSec).
 *
 * After pause changes, subtitles are recombined immediately but the master is
 * only updated on Stitch — that mismatch is what this check catches.
 *
 * Trailing video-library / silent bumpers (empty scriptText, e.g. SECTION_CLIP
 * FINAL) keep audio on the master but intentionally have no captions — those
 * seconds are subtracted before judging “last caption vs master end”.
 */

export const TIMELINE_ALIGNMENT_TOLERANCE_SEC = 0.5;

export type TimelineAlignmentStatus = "aligned" | "misaligned" | "unknown";

export type TimelineAlignmentReport = {
  status: TimelineAlignmentStatus;
  masterSec: number | null;
  subtitleTimelineSec: number | null;
  /** subtitleTimelineSec - masterSec (positive = captions/images longer than audio). */
  deltaSec: number | null;
  toleranceSec: number;
  lastCueEndSec: number | null;
  /** Sum of consecutive empty-text segment durations at the end (FINAL bumper, etc.). */
  uncaptionedTailSec: number;
  message: string;
};

function finiteOrNull(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function sumSegmentDurationSecs(
  segmentDurationSecs: Array<number | null | undefined>,
): number | null {
  if (segmentDurationSecs.length === 0) {
    return null;
  }

  let sum = 0;
  let counted = 0;
  for (const value of segmentDurationSecs) {
    const sec = finiteOrNull(value);
    if (sec == null) {
      continue;
    }
    sum += sec;
    counted += 1;
  }

  return counted === 0 ? null : sum;
}

export function lastCueEndFromCues(
  cues: Array<{ end?: number | null }> | null | undefined,
): number | null {
  if (!cues || cues.length === 0) {
    return null;
  }

  let maxEnd = 0;
  let found = false;
  for (const cue of cues) {
    const end = finiteOrNull(cue.end ?? null);
    if (end == null) {
      continue;
    }
    maxEnd = Math.max(maxEnd, end);
    found = true;
  }

  return found ? maxEnd : null;
}

/**
 * Sum durations of consecutive empty-text segments at the end of the timeline
 * (SECTION_CLIP FINAL / music beds / silent_skip tails).
 */
export function sumTrailingUncaptionedDurationSecs(
  segments: Array<{
    durationSec?: number | null;
    text?: string | null;
    pacedTextUsed?: string | null;
  }>,
): number {
  let sum = 0;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment) {
      break;
    }
    const spoken = (segment.pacedTextUsed ?? segment.text ?? "").trim();
    if (spoken) {
      break;
    }
    const sec = finiteOrNull(segment.durationSec);
    if (sec == null) {
      break;
    }
    sum += sec;
  }
  return sum;
}

export function assessVoiceoverSubtitleTimelineAlignment(input: {
  masterDurationSec: number | null | undefined;
  segmentDurationSecs: Array<number | null | undefined>;
  lastCueEndSec?: number | null;
  /** Seconds of intentional no-caption audio at the end (FINAL bumper, etc.). */
  uncaptionedTailSec?: number | null;
  toleranceSec?: number;
}): TimelineAlignmentReport {
  const toleranceSec =
    typeof input.toleranceSec === "number" &&
    Number.isFinite(input.toleranceSec) &&
    input.toleranceSec >= 0
      ? input.toleranceSec
      : TIMELINE_ALIGNMENT_TOLERANCE_SEC;

  const masterSec = finiteOrNull(input.masterDurationSec);
  const subtitleTimelineSec = sumSegmentDurationSecs(input.segmentDurationSecs);
  const lastCueEndSec = finiteOrNull(input.lastCueEndSec ?? null);
  const uncaptionedTailSec = Math.max(
    0,
    finiteOrNull(input.uncaptionedTailSec) ?? 0,
  );

  if (masterSec == null || subtitleTimelineSec == null) {
    return {
      status: "unknown",
      masterSec,
      subtitleTimelineSec,
      deltaSec: null,
      toleranceSec,
      lastCueEndSec,
      uncaptionedTailSec,
      message:
        masterSec == null && subtitleTimelineSec == null
          ? "Cannot check alignment: stitch a master voiceover and build subtitle segments first."
          : masterSec == null
            ? "Cannot check alignment: stitch the master voiceover first."
            : "Cannot check alignment: voiceover segments with durations are missing.",
    };
  }

  const deltaSec = subtitleTimelineSec - masterSec;
  const absDelta = Math.abs(deltaSec);
  // Captions should end near the start of the uncaptioned tail (not master end).
  const expectedCueEndSec = Math.max(0, masterSec - uncaptionedTailSec);
  const cueDelta =
    lastCueEndSec == null ? null : lastCueEndSec - expectedCueEndSec;
  const cueMisaligned =
    cueDelta != null && Math.abs(cueDelta) > Math.max(toleranceSec, 1.5);

  if (absDelta <= toleranceSec && !cueMisaligned) {
    const tailNote =
      uncaptionedTailSec > 0.05
        ? ` Trailing ${uncaptionedTailSec.toFixed(2)}s uncaptioned bumper excluded from caption-end check.`
        : "";
    return {
      status: "aligned",
      masterSec,
      subtitleTimelineSec,
      deltaSec,
      toleranceSec,
      lastCueEndSec,
      uncaptionedTailSec,
      message: `Master audio and subtitle timeline are aligned (Δ ${formatDelta(deltaSec)}).${tailNote}`,
    };
  }

  let pauseHint = "";
  if (absDelta > toleranceSec) {
    pauseHint =
      deltaSec > 0
        ? " Subtitle/image timeline is longer than the master — usually pauses were updated without re-stitching. Run Stitch master voiceover, then re-render."
        : " Master is longer than the subtitle timeline — recombine subtitles after stitch, or re-stitch.";
  }

  const cueHint =
    cueMisaligned && cueDelta != null
      ? uncaptionedTailSec > 0.05
        ? ` Last caption ends ${formatDelta(cueDelta)} from expected end (master minus ${uncaptionedTailSec.toFixed(2)}s uncaptioned tail).`
        : ` Last caption ends ${formatDelta(cueDelta)} from master end.`
      : "";

  return {
    status: "misaligned",
    masterSec,
    subtitleTimelineSec,
    deltaSec,
    toleranceSec,
    lastCueEndSec,
    uncaptionedTailSec,
    message: `Timeline mismatch: subtitles/images ${formatDurationShort(subtitleTimelineSec)}, master audio ${formatDurationShort(masterSec)} (Δ ${formatDelta(deltaSec)}).${pauseHint}${cueHint}`,
  };
}

function formatDelta(sec: number) {
  const sign = sec > 0 ? "+" : sec < 0 ? "−" : "";
  return `${sign}${Math.abs(sec).toFixed(2)}s`;
}

function formatDurationShort(sec: number) {
  if (sec >= 60) {
    const minutes = Math.floor(sec / 60);
    const rem = sec - minutes * 60;
    return `${minutes}m ${rem.toFixed(1)}s`;
  }
  return `${sec.toFixed(2)}s`;
}
