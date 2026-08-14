import { isSilentSubtitleVoiceoverText } from "@/lib/subtitles";

export type PreservedSubtitleSegmentSnapshot = {
  sceneStartOrder: number;
  sceneEndOrder: number;
  spokenText: string;
  provider: string | null;
  rawAlignmentJson: unknown;
  localCuesJson: unknown;
  localSrt: string | null;
  localVtt: string | null;
  status: string;
};

export function subtitleSegmentPreserveKey(
  sceneStartOrder: number,
  sceneEndOrder: number,
) {
  return `${sceneStartOrder}:${sceneEndOrder}`;
}

export function normalizeSpokenTextForSubtitlePreserve(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function spokenTextForSubtitlePreserve(
  text: string | null | undefined,
  pacedTextUsed: string | null | undefined,
) {
  return (pacedTextUsed?.trim() || text?.trim() || "").trim();
}

/**
 * Restore local caption cues after voiceover sync when the spoken text for
 * that scene is unchanged. Silent bumpers are handled separately.
 *
 * Status is intentionally ignored: soft invalidation may mark segments
 * `needs_update` while the cue JSON is still valid and should survive stitch.
 */
export function shouldRestorePreservedSubtitleCues(opts: {
  previousSpokenText: string;
  nextSpokenText: string;
  cueCount: number;
  previousStatus?: string;
}) {
  if (isSilentSubtitleVoiceoverText(opts.nextSpokenText)) {
    return false;
  }
  if (opts.cueCount <= 0) {
    return false;
  }
  return (
    normalizeSpokenTextForSubtitlePreserve(opts.previousSpokenText) ===
    normalizeSpokenTextForSubtitlePreserve(opts.nextSpokenText)
  );
}

export function restoredSubtitleSegmentStatus(previousStatus: string) {
  return previousStatus === "ready" ? "ready" : "formatted";
}
