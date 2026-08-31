"use client";

import { useMemo, useState } from "react";

import {
  saveChannelPipelineDefaultsAction,
  saveVideoPipelineSettingsAction,
} from "@/app/pipeline-actions";
import { SubtitleAlignmentProviderPicker } from "@/components/subtitle-alignment-provider-picker";
import { VoiceSoundBarsStylePicker } from "@/components/voice-sound-bars-style-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAPTION_STYLE_PRESETS } from "@/lib/caption-styles";
import {
  defaultPodcastPipelineSectionVoices,
  isPodcastPipelineChannel,
  primaryPipelineTtsProvider,
} from "@/lib/pipeline-podcast-voices";
import type { PipelineSettings } from "@/lib/pipeline-settings";
import {
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  type VoiceSoundBarsStyleId,
} from "@/lib/render/voice-sound-bars-shared";
import type { ChatterboxVoiceMode, TtsVoiceProvider } from "@/lib/tts-voices";
import {
  sanitizeVoiceoverSectionSpeed,
  type VoiceoverSectionVoice,
  type VoiceoverSectionVoices,
} from "@/lib/voiceover-section-voices";

export type PipelineSettingsReferenceOption = {
  id: string;
  title: string;
  sourceName: string | null;
};

export type PipelineSettingsVoiceOption = {
  voiceId: string;
  voiceName: string | null;
  defaultPauseAfterMs: number;
  /** ElevenLabs catalog vs Chatterbox. Defaults to elevenlabs. */
  provider?: TtsVoiceProvider;
  /** Chatterbox predefined pack vs clone sample. */
  chatterboxMode?: ChatterboxVoiceMode;
};

type PipelineSettingsPanelProps = {
  videoId: string;
  channelKey: string;
  channelName: string;
  supportsLibrary: boolean;
  settings: PipelineSettings;
  references: PipelineSettingsReferenceOption[];
  voices: PipelineSettingsVoiceOption[];
  /** When true, per-scene pause defaults are computed at VO time — hide flat pause field. */
  narrationBlocksEnabled?: boolean;
};

const CAPTION_STYLE_OPTIONS = Object.values(CAPTION_STYLE_PRESETS).map(
  (preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
  }),
);

const TTS_PROVIDER_OPTIONS: Array<{
  id: TtsVoiceProvider;
  label: string;
  hint: string;
}> = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "Uses the ElevenLabs API with the selected voice / env defaults.",
  },
  {
    id: "google",
    label: "Google Cloud TTS",
    hint: "Uses Google Cloud Text-to-Speech (GOOGLE_TTS_API_KEY or GOOGLE_TTS_ACCESS_TOKEN).",
  },
  {
    id: "fish",
    label: "Fish Audio",
    hint: "Uses Fish Audio TTS (FISH_AUDIO_API_KEY). Catalog voiceId = Fish reference_id.",
  },
  {
    id: "speechify",
    label: "Speechify",
    hint: "Uses Speechify Build TTS (SPEECHIFY_API_KEY). Catalog voiceId = Speechify voice_id.",
  },
  {
    id: "chatterbox",
    label: "Chatterbox (local)",
    hint: "Pipeline starts Chatterbox before VO, then stops it after stitch.",
  },
];

const PODCAST_SPEAKER_SLOTS: Array<{
  kind: "teacher" | "student";
  label: string;
  hint: string;
}> = [
  {
    kind: "teacher",
    label: "Emma (teacher)",
    hint: "Teacher / model lines — also used for Max in conversation episodes.",
  },
  {
    kind: "student",
    label: "Leo (student)",
    hint: "Student / learner lines — also used for Sara in conversation episodes.",
  },
];

function voiceProviderOf(voice: PipelineSettingsVoiceOption): TtsVoiceProvider {
  if (voice.provider === "chatterbox") {
    return "chatterbox";
  }
  if (voice.provider === "google") {
    return "google";
  }
  if (voice.provider === "fish") {
    return "fish";
  }
  if (voice.provider === "speechify") {
    return "speechify";
  }
  return "elevenlabs";
}

export function PipelineSettingsPanel({
  videoId,
  channelKey,
  channelName,
  supportsLibrary,
  settings,
  references,
  voices,
  narrationBlocksEnabled = false,
}: PipelineSettingsPanelProps) {
  const isPodcast = isPodcastPipelineChannel(channelKey);
  const [open, setOpen] = useState(false);
  const [includeRefs, setIncludeRefs] = useState(
    settings.script.includeReferenceTranscripts,
  );
  const [visualMode, setVisualMode] = useState<"hybrid" | "library">(
    settings.visualPlan.mode === "library" && supportsLibrary
      ? "library"
      : "hybrid",
  );
  const [ttsProvider, setTtsProvider] = useState<TtsVoiceProvider>(
    settings.voiceover.ttsProvider === "chatterbox" ||
      settings.voiceover.ttsProvider === "google" ||
      settings.voiceover.ttsProvider === "fish" ||
      settings.voiceover.ttsProvider === "speechify"
      ? settings.voiceover.ttsProvider
      : "elevenlabs",
  );
  const [voiceId, setVoiceId] = useState(settings.voiceover.voiceId ?? "");
  const [pauseAfterMs, setPauseAfterMs] = useState(
    settings.voiceover.pauseAfterMs != null
      ? String(settings.voiceover.pauseAfterMs)
      : "",
  );
  const [generateSubtitles, setGenerateSubtitles] = useState(
    settings.voiceover.generateSubtitles,
  );
  const [captionStylePreset, setCaptionStylePreset] = useState(
    settings.voiceover.captionStylePreset,
  );
  const formId = `pipeline-settings-${videoId}`;
  const [burnCaptions, setBurnCaptions] = useState(settings.render.burnCaptions);
  const [voiceSoundBars, setVoiceSoundBars] = useState(
    settings.render.voiceSoundBars,
  );
  const [voiceSoundBarsStyle, setVoiceSoundBarsStyle] =
    useState<VoiceSoundBarsStyleId>(
      settings.render.voiceSoundBarsStyle ?? DEFAULT_VOICE_SOUND_BARS_STYLE,
    );
  const [sectionVoices, setSectionVoices] = useState<VoiceoverSectionVoices>(
    () => {
      const saved = settings.voiceover.sectionVoices ?? {};
      const baseProvider =
        saved.teacher?.provider ??
        saved.student?.provider ??
        settings.voiceover.ttsProvider ??
        "google";
      const defaults = defaultPodcastPipelineSectionVoices(baseProvider);
      return {
        teacher: saved.teacher ?? defaults.teacher,
        student: saved.student ?? defaults.student,
      };
    },
  );

  const podcastPrimaryTtsProvider = useMemo(
    () => primaryPipelineTtsProvider(sectionVoices, ttsProvider),
    [sectionVoices, ttsProvider],
  );

  const voicesForProvider = useMemo(
    () => voices.filter((voice) => voiceProviderOf(voice) === ttsProvider),
    [voices, ttsProvider],
  );

  const selectedVoiceName = useMemo(() => {
    const match = voicesForProvider.find((voice) => voice.voiceId === voiceId);
    return match?.voiceName ?? settings.voiceover.voiceName ?? "";
  }, [voicesForProvider, voiceId, settings.voiceover.voiceName]);

  function speakerProvider(kind: "teacher" | "student"): TtsVoiceProvider {
    const fromSpeaker = sectionVoices[kind]?.provider;
    if (
      fromSpeaker === "chatterbox" ||
      fromSpeaker === "elevenlabs" ||
      fromSpeaker === "google" ||
      fromSpeaker === "fish" ||
      fromSpeaker === "speechify"
    ) {
      return fromSpeaker;
    }
    return "google";
  }

  function voicesForSpeakerProvider(
    provider: TtsVoiceProvider,
    current?: VoiceoverSectionVoice,
  ): PipelineSettingsVoiceOption[] {
    const filtered = voices.filter(
      (voice) => voiceProviderOf(voice) === provider,
    );
    if (!current?.voiceId) {
      return filtered;
    }
    if (filtered.some((voice) => voice.voiceId === current.voiceId)) {
      return filtered;
    }
    return [
      ...filtered,
      {
        voiceId: current.voiceId,
        voiceName: current.voiceName ?? current.voiceId,
        defaultPauseAfterMs: 0,
        provider,
      },
    ];
  }

  function voicesForSpeakerPicker(
    kind: "teacher" | "student",
    current?: VoiceoverSectionVoice,
  ): PipelineSettingsVoiceOption[] {
    return voicesForSpeakerProvider(speakerProvider(kind), current);
  }

  function pickSectionVoiceForProvider(
    kind: "teacher" | "student",
    current: VoiceoverSectionVoice | undefined,
    nextProvider: TtsVoiceProvider,
    nextVoices: PipelineSettingsVoiceOption[],
  ): VoiceoverSectionVoice | undefined {
    const defaults = defaultPodcastPipelineSectionVoices(nextProvider);
    if (
      current?.voiceId &&
      nextVoices.some((voice) => voice.voiceId === current.voiceId)
    ) {
      return { ...current, provider: nextProvider };
    }
    const preferred = defaults[kind];
    const preferredMatch = preferred?.voiceId
      ? nextVoices.find((voice) => voice.voiceId === preferred.voiceId)
      : undefined;
    const fallback = preferredMatch ?? nextVoices[0];
    if (fallback) {
      return {
        voiceId: fallback.voiceId,
        voiceName: fallback.voiceName ?? fallback.voiceId,
        provider: nextProvider,
        speed: current?.speed ?? preferred?.speed,
      };
    }
    return preferred
      ? { ...preferred, speed: current?.speed ?? preferred.speed }
      : current;
  }

  function onSectionVoiceChange(
    kind: "teacher" | "student",
    nextVoiceId: string,
  ) {
    const provider = speakerProvider(kind);
    const match = voicesForSpeakerProvider(provider).find(
      (voice) => voice.voiceId === nextVoiceId,
    );
    setSectionVoices((prev) => ({
      ...prev,
      [kind]: nextVoiceId
        ? {
            voiceId: nextVoiceId,
            voiceName: match?.voiceName ?? nextVoiceId,
            provider,
            speed: prev[kind]?.speed,
          }
        : undefined,
    }));
  }

  function onSectionProviderChange(
    kind: "teacher" | "student",
    nextProvider: TtsVoiceProvider,
  ) {
    setSectionVoices((prev) => {
      const current = prev[kind];
      const nextVoices = voices.filter(
        (voice) => voiceProviderOf(voice) === nextProvider,
      );
      return {
        ...prev,
        [kind]: pickSectionVoiceForProvider(
          kind,
          current,
          nextProvider,
          nextVoices,
        ),
      };
    });
  }

  function onSectionSpeedChange(kind: "teacher" | "student", value: string) {
    const speed = sanitizeVoiceoverSectionSpeed(value);
    setSectionVoices((prev) => {
      const current = prev[kind];
      if (!current?.voiceId) {
        return prev;
      }
      return {
        ...prev,
        [kind]: {
          ...current,
          ...(speed != null ? { speed } : { speed: undefined }),
        },
      };
    });
  }

  function onTtsProviderChange(next: TtsVoiceProvider) {
    setTtsProvider(next);
    if (isPodcast) {
      const nextVoices = voices.filter(
        (voice) => voiceProviderOf(voice) === next,
      );
      setSectionVoices((prev) => ({
        teacher: pickSectionVoiceForProvider(
          "teacher",
          prev.teacher,
          next,
          nextVoices,
        ),
        student: pickSectionVoiceForProvider(
          "student",
          prev.student,
          next,
          nextVoices,
        ),
      }));
      return;
    }
    const nextVoices = voices.filter((voice) => voiceProviderOf(voice) === next);
    const stillValid = nextVoices.some((voice) => voice.voiceId === voiceId);
    if (!stillValid) {
      const first = nextVoices[0];
      setVoiceId(first?.voiceId ?? "");
      if (first) {
        setPauseAfterMs(String(first.defaultPauseAfterMs));
      }
    }
  }

  function onVoiceChange(nextVoiceId: string) {
    setVoiceId(nextVoiceId);
    const match = voicesForProvider.find(
      (voice) => voice.voiceId === nextVoiceId,
    );
    if (match) {
      setPauseAfterMs(String(match.defaultPauseAfterMs));
    }
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close config" : "Configure"}
      </Button>

      {open ? (
        <form
          id={formId}
          className="mt-3 space-y-4 rounded-md border bg-muted/20 p-3 text-sm"
          action={saveVideoPipelineSettingsAction.bind(null, videoId)}
        >
          <input type="hidden" name="voiceName" value={selectedVoiceName} />
          {isPodcast ? (
            <input
              type="hidden"
              name="voiceoverSectionVoicesJson"
              value={JSON.stringify(sectionVoices)}
            />
          ) : null}
          {isPodcast ? (
            <input
              type="hidden"
              name="ttsProvider"
              value={podcastPrimaryTtsProvider}
            />
          ) : null}
          <input
            type="hidden"
            name="libraryId"
            value={supportsLibrary ? channelKey : ""}
          />

          <div>
            <p className="font-medium">Script</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                name="includeReferenceTranscripts"
                checked={includeRefs}
                onChange={(event) => setIncludeRefs(event.target.checked)}
              />
              Include reference transcripts
            </label>
            {includeRefs && references.length > 0 ? (
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border bg-background p-2">
                {references.map((reference) => (
                  <label
                    key={reference.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="referenceDocumentIds"
                      value={reference.id}
                      defaultChecked={settings.script.referenceDocumentIds.includes(
                        reference.id,
                      )}
                    />
                    <span>
                      {reference.title}
                      {reference.sourceName
                        ? ` (${reference.sourceName})`
                        : ""}
                    </span>
                  </label>
                ))}
              </div>
            ) : includeRefs ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No active reference documents for this channel.
              </p>
            ) : null}
          </div>

          <div>
            <p className="font-medium">Visual Plan</p>
            <div className="mt-2 flex flex-col gap-1">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visualPlanMode"
                  value="hybrid"
                  checked={visualMode === "hybrid"}
                  onChange={() => setVisualMode("hybrid")}
                />
                Hybrid checkpoint (FULL_VIDEO)
              </label>
              <label
                className={`flex items-center gap-2 ${
                  supportsLibrary ? "" : "opacity-50"
                }`}
              >
                <input
                  type="radio"
                  name="visualPlanMode"
                  value="library"
                  disabled={!supportsLibrary}
                  checked={visualMode === "library"}
                  onChange={() => setVisualMode("library")}
                />
                Image library
                {!supportsLibrary ? " (this channel has no library)" : ""}
              </label>
            </div>
            <div className="mt-3 space-y-1">
              <Label htmlFor={`imageOutputFolder-${videoId}`}>
                Image attach / output folder
              </Label>
              <Input
                id={`imageOutputFolder-${videoId}`}
                name="imageOutputFolder"
                defaultValue={settings.assets.imageOutputFolder ?? ""}
                placeholder="storage/generated-images/your-video-images"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for the default generated-images folder. Used by
                Flow, Assets, and rebuild-from-script.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Voiceover</p>
            {!isPodcast ? (
              <div className="space-y-1">
                <Label htmlFor={`ttsProvider-${videoId}`}>TTS engine</Label>
                <select
                  id={`ttsProvider-${videoId}`}
                  name="ttsProvider"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={ttsProvider}
                  onChange={(event) =>
                    onTtsProviderChange(
                      event.target.value as TtsVoiceProvider,
                    )
                  }
                >
                  {TTS_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {
                    TTS_PROVIDER_OPTIONS.find(
                      (option) => option.id === ttsProvider,
                    )?.hint
                  }
                </p>
              </div>
            ) : null}
            {isPodcast ? (
              <div className="space-y-3 rounded-md border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">
                  Podcast episodes use two speakers. Pick a TTS engine and voice
                  for each — Emma and Leo can use different providers (e.g.
                  Google + Fish).
                </p>
                {PODCAST_SPEAKER_SLOTS.map((slot) => {
                  const current = sectionVoices[slot.kind];
                  const provider = speakerProvider(slot.kind);
                  const options = voicesForSpeakerPicker(slot.kind, current);
                  return (
                    <div key={slot.kind} className="space-y-2 rounded border bg-background/80 p-2">
                      <Label htmlFor={`sectionVoice-${slot.kind}-${videoId}`}>
                        {slot.label}
                      </Label>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`sectionProvider-${slot.kind}-${videoId}`}
                          className="text-xs text-muted-foreground"
                        >
                          TTS engine
                        </Label>
                        <select
                          id={`sectionProvider-${slot.kind}-${videoId}`}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={provider}
                          onChange={(event) =>
                            onSectionProviderChange(
                              slot.kind,
                              event.target.value as TtsVoiceProvider,
                            )
                          }
                        >
                          {TTS_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`sectionVoice-${slot.kind}-${videoId}`}
                          className="text-xs text-muted-foreground"
                        >
                          Voice
                        </Label>
                        <select
                          id={`sectionVoice-${slot.kind}-${videoId}`}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={current?.voiceId ?? ""}
                          onChange={(event) =>
                            onSectionVoiceChange(slot.kind, event.target.value)
                          }
                        >
                          <option value="">Select a voice…</option>
                          {options.map((voice) => (
                            <option key={voice.voiceId} value={voice.voiceId}>
                              {voice.voiceName || voice.voiceId}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {slot.hint}
                      </p>
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`sectionSpeed-${slot.kind}-${videoId}`}
                          className="shrink-0 text-xs"
                        >
                          Speed
                        </Label>
                        <Input
                          id={`sectionSpeed-${slot.kind}-${videoId}`}
                          inputMode="decimal"
                          className="h-8 max-w-[7rem] text-sm"
                          value={
                            current?.speed != null ? String(current.speed) : ""
                          }
                          placeholder="default"
                          onChange={(event) =>
                            onSectionSpeedChange(slot.kind, event.target.value)
                          }
                        />
                      </div>
                      {options.length === 0 ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          No voices for{" "}
                          {
                            TTS_PROVIDER_OPTIONS.find(
                              (option) => option.id === provider,
                            )?.label
                          }{" "}
                          yet. Add voices on a video Voiceover tab, then reopen
                          Configure.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor={`voiceId-${videoId}`}>
                  {ttsProvider === "chatterbox"
                    ? "Chatterbox voice"
                    : ttsProvider === "google"
                      ? "Google TTS voice"
                      : ttsProvider === "fish"
                        ? "Fish Audio voice"
                        : ttsProvider === "speechify"
                          ? "Speechify voice"
                          : "Voice"}
                </Label>
                <select
                  id={`voiceId-${videoId}`}
                  name="voiceId"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={voiceId}
                  onChange={(event) => onVoiceChange(event.target.value)}
                >
                  <option value="">
                    {ttsProvider === "chatterbox"
                      ? "Select a Chatterbox voice…"
                      : ttsProvider === "google"
                        ? "Select a Google TTS voice…"
                        : ttsProvider === "fish"
                          ? "Select a Fish Audio voice…"
                          : ttsProvider === "speechify"
                            ? "Select a Speechify voice…"
                            : "Use ElevenLabs / env default"}
                  </option>
                  {voicesForProvider.map((voice) => (
                    <option key={voice.voiceId} value={voice.voiceId}>
                      {voice.voiceName || voice.voiceId}
                      {ttsProvider === "chatterbox"
                        ? voice.chatterboxMode === "predefined"
                          ? " (predefined)"
                          : " (clone)"
                        : ""}
                    </option>
                  ))}
                </select>
                {ttsProvider === "chatterbox" && voicesForProvider.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No Chatterbox voices yet. On a video Voiceover tab, add a
                    built-in predefined voice or clone a sample first.
                  </p>
                ) : null}
                {ttsProvider === "google" && voicesForProvider.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No Google voices yet. On the Voiceover tab, add a Cloud TTS
                    voice name (e.g. en-US-Neural2-A) to the catalog.
                  </p>
                ) : null}
                {ttsProvider === "fish" && voicesForProvider.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No Fish voices yet. On the Voiceover tab, add a Fish
                    reference_id to the catalog.
                  </p>
                ) : null}
                {ttsProvider === "speechify" && voicesForProvider.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No Speechify voices yet. On the Voiceover tab, add a Speechify
                    voice_id (e.g. geffen_32) to the catalog.
                  </p>
                ) : null}
              </div>
            )}
            {narrationBlocksEnabled ? (
              <p className="text-xs text-muted-foreground">
                Scene pauses are computed automatically at voiceover time
                (narration blocks). No flat pause setting needed.
              </p>
            ) : (
              <div className="space-y-1">
                <Label htmlFor={`pauseAfterMs-${videoId}`}>
                  Flat pause after scenes (ms)
                </Label>
                <Input
                  id={`pauseAfterMs-${videoId}`}
                  name="pauseAfterMs"
                  inputMode="numeric"
                  value={pauseAfterMs}
                  onChange={(event) => setPauseAfterMs(event.target.value)}
                  placeholder="empty = punctuation pauses"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to apply per-scene punctuation pauses (,/;/:/./¶) at
                  voiceover time. A number forces the same gap on every scene.
                </p>
              </div>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="generateSubtitles"
                checked={generateSubtitles}
                onChange={(event) => setGenerateSubtitles(event.target.checked)}
              />
              Generate scene subtitles
            </label>
            <SubtitleAlignmentProviderPicker
              formId={formId}
              defaultProvider={settings.voiceover.alignmentProvider}
              id={`alignmentProvider-${videoId}`}
              disabled={!generateSubtitles}
            />
            <p className="text-xs text-muted-foreground">
              If WhisperX is selected, the pipeline starts that server for
              subtitles and stops it when alignment finishes.
            </p>
            <div className="space-y-1">
              <Label htmlFor={`captionStylePreset-${videoId}`}>
                Subtitle style
              </Label>
              <select
                id={`captionStylePreset-${videoId}`}
                name="captionStylePreset"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={captionStylePreset}
                onChange={(event) =>
                  setCaptionStylePreset(
                    event.target.value as typeof captionStylePreset,
                  )
                }
                disabled={!generateSubtitles}
              >
                {CAPTION_STYLE_OPTIONS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {CAPTION_STYLE_OPTIONS.find(
                  (preset) => preset.id === captionStylePreset,
                )?.description ?? ""}
              </p>
            </div>
          </div>

          <div>
            <p className="font-medium">Render</p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                name="burnCaptions"
                checked={burnCaptions}
                onChange={(event) => setBurnCaptions(event.target.checked)}
              />
              Burn subtitles into render
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                name="voiceSoundBars"
                checked={voiceSoundBars}
                onChange={(event) => setVoiceSoundBars(event.target.checked)}
              />
              Voice sound bars on still images (podcast)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Centered bars react to spoken voiceover only — skipped on attached
              clips, music beds, and PART covers.
            </p>
            <div className="mt-3">
              <VoiceSoundBarsStylePicker
                value={voiceSoundBarsStyle}
                onChange={setVoiceSoundBarsStyle}
                enabled={voiceSoundBars}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" size="sm">
              Save for this video
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              formAction={saveChannelPipelineDefaultsAction.bind(null, videoId)}
            >
              Save as {channelName} default
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
