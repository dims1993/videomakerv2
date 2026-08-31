/**
 * Max & Sara podcast voice delivery profiles.
 *
 * Google Chirp 3 HD accepts plain text + speakingRate only (no SSML / style prompts).
 * Emotional direction below documents intended performance and can be used by
 * future providers. In practice, animation comes from:
 * - section-based speakingRate
 * - short lively script turns + punctuation
 * - host chemistry in the Script Writer
 * - slightly longer scene gaps in [INTRO]
 */

export type PodcastDeliveryMode = "intro" | "main" | "wordTour" | "closing";

export type PodcastHostKey = "max" | "sara";

export type PodcastSectionDelivery = {
  speakingRate: number;
  /** Intended performance; not sent to Google Chirp today. */
  direction: string;
  energy: string;
  tone: string;
};

export type PodcastHostVoiceProfile = {
  voiceId: string;
  role: string;
  globalDirection: string;
  sections: Record<PodcastDeliveryMode, PodcastSectionDelivery>;
};

/** Channel Max host — Fenrir as animated / charismatic co-host. */
export const PODCAST_MAX_VOICE_ID = "en-US-Chirp3-HD-Fenrir";
export const PODCAST_SARA_VOICE_ID = "en-US-Chirp3-HD-Erinome";

export const PODCAST_MAX_SARA_VOICE_PROFILES: Record<
  PodcastHostKey,
  PodcastHostVoiceProfile
> = {
  max: {
    voiceId: PODCAST_MAX_VOICE_ID,
    role: "animated, charismatic, lightly funny, warm male podcast co-host",
    globalDirection:
      "Sound like a charismatic American podcast co-host. Warm, animated, conversational, and lightly funny — the guy who keeps the show moving. Use a natural smile and easy confidence in the voice. React to Sara with energy and charm. Do not sound like a teacher, narrator, announcer, or audiobook reader. Keep the English clear for learners, but make the delivery feel lively, human, and magnetic.",
    sections: {
      intro: {
        speakingRate: 1.12,
        direction:
          "Open with high podcast charisma. Sound playful, surprised, and warmly self-deprecating. Deliver short reactions quickly and naturally. Emphasize funny images without becoming cartoonish. Smile while speaking. On longer lines, keep punch, bounce, and momentum — do not flatten into a calm read. Make the listener feel that an animated host just kicked off the show.",
        energy: "high, charismatic, natural",
        tone: "playful, animated, charming, lightly amused",
      },
      main: {
        speakingRate: 1.07,
        direction:
          "Use a lively, charismatic podcast tone. Stay practical, curious, and lightly funny. Speak clearly and naturally with a smile and forward energy. Keep the pace comfortable for A2–B1 English learners, but do not sound flat on longer explanations — keep light energy, comic timing, and host magnetism.",
        energy: "medium-high charismatic",
        tone: "conversational, animated, lightly funny",
      },
      wordTour: {
        speakingRate: 1.02,
        direction:
          "Clear, helpful, still conversational and warm. Give examples without classroom stiffness. Stay a bit brighter and more engaging than a dictionary read — still the same animated host, just clearer.",
        energy: "medium-clear",
        tone: "helpful, relaxed, still animated",
      },
      closing: {
        speakingRate: 1.0,
        direction:
          "Sound warmer and a touch calmer, but keep a soft smile. Speak sincerely, with less comedy and more encouragement. Keep the ending human, grounded, and still hosted — not a narrator fade-out.",
        energy: "lower-medium warm",
        tone: "warm, sincere, still present",
      },
    },
  },
  sara: {
    voiceId: PODCAST_SARA_VOICE_ID,
    role: "warm, reflective, expressive, curious female podcast co-host",
    globalDirection:
      "Sound like a warm, expressive American podcast co-host. Friendly, curious, emotionally intelligent, and naturally conversational. React to Max with warmth and gentle humor. Do not sound like a teacher, narrator, announcer, or formal lesson reader. Keep the English clear and easy to follow while sounding alive and present.",
    sections: {
      intro: {
        speakingRate: 1.05,
        direction:
          "Use bright, warm podcast energy. React quickly to Max with curiosity, amusement, and gentle teasing. Sound welcoming and emotionally clear. Help turn the funny opening moment into the real episode topic. Keep the delivery lively but not exaggerated.",
        energy: "high-warm",
        tone: "bright, curious, playful, supportive",
      },
      main: {
        speakingRate: 1.0,
        direction:
          "Use a thoughtful, warm, conversational tone. Explain ideas simply when needed. Ask natural follow-up questions. Gently challenge or reframe Max sometimes. Keep the pacing clear and supportive for English learners.",
        energy: "medium-warm",
        tone: "reflective, clear, emotionally present",
      },
      wordTour: {
        speakingRate: 0.98,
        direction:
          "Warm, precise, easy to understand. Slightly slower for definitions and examples — still conversational, not a vocabulary lecture.",
        energy: "medium-clear",
        tone: "warm, precise, easy to understand",
      },
      closing: {
        speakingRate: 0.97,
        direction:
          "Sound calm, sincere, and encouraging. Use a softer emotional tone. Make the listener feel understood, not pressured.",
        energy: "lower-medium",
        tone: "warm, encouraging, emotionally soft",
      },
    },
  },
};

/** Slightly longer gap between intro turns so jokes can land (ms). */
export const PODCAST_INTRO_SCENE_PAUSE_AFTER_MS = 320;

const WORD_TOUR_TITLE_RE =
  /\bWORD\s*TOUR\b|\bWORDS\s+FROM\s+TODAY(?:['’]?S)?\s+CONVERSATION\b/i;

export function isPodcastWordTourPartTitle(title: string): boolean {
  return WORD_TOUR_TITLE_RE.test(title.trim());
}

export function resolvePodcastHostFromVoiceId(
  voiceId: string | null | undefined,
): PodcastHostKey | null {
  const id = voiceId?.trim() ?? "";
  if (!id) {
    return null;
  }
  // Fenrir = channel Animated Hoster; Puck / Iapetus still resolve as Max.
  if (
    id === PODCAST_MAX_VOICE_ID ||
    /fenrir|puck|iapetus/i.test(id)
  ) {
    return "max";
  }
  if (id === PODCAST_SARA_VOICE_ID || /erinome/i.test(id)) {
    return "sara";
  }
  return null;
}

/**
 * Map Max→teacher / Sara→student pipeline slots to host keys.
 * Only use when the episode format is Max & Sara.
 */
export function resolvePodcastHostFromSpeakerKind(
  sectionKind: string | null | undefined,
): PodcastHostKey | null {
  if (sectionKind === "teacher") {
    return "max";
  }
  if (sectionKind === "student") {
    return "sara";
  }
  return null;
}

export function resolvePodcastHostKey({
  voiceId,
  sectionKind,
}: {
  voiceId?: string | null;
  sectionKind?: string | null;
}): PodcastHostKey | null {
  return (
    resolvePodcastHostFromVoiceId(voiceId) ??
    resolvePodcastHostFromSpeakerKind(sectionKind)
  );
}

function partTitleFromVisualIdea(visualIdea: string): string {
  const match = visualIdea.match(
    /^PART_COVER\s*\|\s*(?:COMP_PART_COVER:\s*)?(.+)$/i,
  );
  return match?.[1]?.trim() ?? visualIdea;
}

/**
 * Walk scenes in timeline order and assign a delivery mode from structural
 * SECTION_CLIP / PART_COVER markers produced by the podcast visual skeleton.
 */
export function mapScenesToPodcastDeliveryModes(
  scenes: Array<{
    sortOrder: number;
    visualIdea?: string | null;
    scriptText?: string | null;
  }>,
): Map<number, PodcastDeliveryMode> {
  let mode: PodcastDeliveryMode = "main";
  const out = new Map<number, PodcastDeliveryMode>();

  for (const scene of scenes) {
    const idea = (scene.visualIdea ?? "").trim();
    const clipMatch = idea.match(
      /^SECTION_CLIP\s*\|\s*(INTRO|LESSON|CLOSING|FINAL)\b/i,
    );

    if (clipMatch?.[1]) {
      const tag = clipMatch[1].toUpperCase();
      if (tag === "INTRO") {
        mode = "intro";
      } else if (tag === "LESSON") {
        mode = "main";
      } else {
        mode = "closing";
      }
    } else if (/^PART_COVER\b/i.test(idea)) {
      const title = partTitleFromVisualIdea(idea);
      if (isPodcastWordTourPartTitle(title)) {
        mode = "wordTour";
      } else if (mode !== "closing") {
        mode = "main";
      }
    }

    out.set(scene.sortOrder, mode);
  }

  return out;
}

export function getPodcastSectionDelivery(
  host: PodcastHostKey,
  mode: PodcastDeliveryMode,
): PodcastSectionDelivery {
  return PODCAST_MAX_SARA_VOICE_PROFILES[host].sections[mode];
}

/**
 * Resolve speaking rate for a Max/Sara podcast turn.
 * Explicit UI/section-voice speed wins; otherwise use the profile section rate.
 *
 * Chirp flattens long Max monologues — apply a small vivacity boost on longer
 * intro/main lines so Fenrir stays animated without racing Word Tour/closing.
 */
export function resolvePodcastSectionSpeakingRate({
  host,
  mode,
  explicitSpeed,
  spokenText,
}: {
  host: PodcastHostKey;
  mode: PodcastDeliveryMode;
  explicitSpeed?: number | null;
  spokenText?: string | null;
}): number {
  if (
    typeof explicitSpeed === "number" &&
    Number.isFinite(explicitSpeed) &&
    explicitSpeed > 0
  ) {
    return explicitSpeed;
  }

  let rate = getPodcastSectionDelivery(host, mode).speakingRate;
  rate += maxLongLineVivacityBoost({ host, mode, spokenText });
  return clampPodcastSpeakingRate(rate);
}

/** Soft caps used by ElevenLabs/Google UI bands. */
export function clampPodcastSpeakingRate(rate: number): number {
  return Math.min(1.2, Math.max(0.7, Number(rate.toFixed(3))));
}

/**
 * Extra energy for Max on longer turns. Sara stays steadier.
 * Boost scales with length; never applied in closing.
 */
export function maxLongLineVivacityBoost({
  host,
  mode,
  spokenText,
}: {
  host: PodcastHostKey;
  mode: PodcastDeliveryMode;
  spokenText?: string | null;
}): number {
  if (host !== "max") {
    return 0;
  }
  if (mode === "closing" || mode === "wordTour") {
    return 0;
  }

  const chars = (spokenText ?? "").trim().length;
  if (chars < 140) {
    return 0;
  }

  // Intro needs the most lift; main gets a milder bump.
  if (mode === "intro") {
    if (chars >= 320) {
      return 0.04;
    }
    if (chars >= 220) {
      return 0.03;
    }
    return 0.02;
  }

  // main
  if (chars >= 320) {
    return 0.03;
  }
  if (chars >= 220) {
    return 0.02;
  }
  return 0.01;
}

export function getPodcastSectionDirection(
  host: PodcastHostKey,
  mode: PodcastDeliveryMode,
): string {
  const profile = PODCAST_MAX_SARA_VOICE_PROFILES[host];
  const section = profile.sections[mode];
  return `${profile.globalDirection} ${section.direction}`;
}
