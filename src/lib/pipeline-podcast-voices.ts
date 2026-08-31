import { PODCAST_ENGLISH_LESSONS_CHANNEL_KEY } from "@/lib/podcast-image-library-shared";
import {
  PODCAST_MAX_VOICE_ID,
  PODCAST_SARA_VOICE_ID,
} from "@/lib/podcast-voice-profiles";
import type { TtsVoiceProvider } from "@/lib/tts-voices";
import {
  normalizeVoiceoverSectionVoices,
  type VoiceoverSectionVoices,
} from "@/lib/voiceover-section-voices";

/** Default Google Chirp hosts for pipeline Emma/Leo (teacher/student slots). */
export function defaultPodcastPipelineSectionVoices(
  ttsProvider: TtsVoiceProvider = "google",
): VoiceoverSectionVoices {
  return {
    teacher: {
      voiceId: PODCAST_MAX_VOICE_ID,
      voiceName: "Fenrir — Emma (teacher)",
      provider: ttsProvider,
    },
    student: {
      voiceId: PODCAST_SARA_VOICE_ID,
      voiceName: "Erinome — Leo (student)",
      provider: ttsProvider,
      speed: 0.9,
    },
  };
}

export function isPodcastPipelineChannel(channelKey: string) {
  return channelKey === PODCAST_ENGLISH_LESSONS_CHANNEL_KEY;
}

/** Fallback pipeline ttsProvider when speakers use mixed engines. */
export function primaryPipelineTtsProvider(
  sectionVoices: VoiceoverSectionVoices | undefined,
  fallback: TtsVoiceProvider = "google",
): TtsVoiceProvider {
  return (
    sectionVoices?.teacher?.provider ??
    sectionVoices?.student?.provider ??
    fallback
  );
}

/**
 * Merge pipeline speaker voices onto a video.
 * Pipeline Configure wins over empty video slots; keeps existing video picks
 * when pipeline has no entry for that speaker.
 */
export function mergePipelineSectionVoicesForVideo(opts: {
  pipelineSectionVoices: VoiceoverSectionVoices | undefined;
  videoSectionVoices: unknown;
  ttsProvider: TtsVoiceProvider;
}): VoiceoverSectionVoices {
  const fromVideo = normalizeVoiceoverSectionVoices(opts.videoSectionVoices);
  const fromPipeline = normalizeVoiceoverSectionVoices(
    opts.pipelineSectionVoices ?? {},
  );
  const defaults = defaultPodcastPipelineSectionVoices(opts.ttsProvider);

  const teacher =
    fromPipeline.teacher ??
    fromVideo.teacher ??
    defaults.teacher;
  const student =
    fromPipeline.student ??
    fromVideo.student ??
    defaults.student;

  return normalizeVoiceoverSectionVoices({
    ...(teacher ? { teacher } : {}),
    ...(student ? { student } : {}),
  });
}
