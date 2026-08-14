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
import type { PipelineSettings } from "@/lib/pipeline-settings";
import {
  DEFAULT_VOICE_SOUND_BARS_STYLE,
  type VoiceSoundBarsStyleId,
} from "@/lib/render/voice-sound-bars-shared";
import type { ChatterboxVoiceMode, TtsVoiceProvider } from "@/lib/tts-voices";

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
};

const CAPTION_STYLE_OPTIONS = Object.values(CAPTION_STYLE_PRESETS).map(
  (preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
  }),
);

function voiceProviderOf(voice: PipelineSettingsVoiceOption): TtsVoiceProvider {
  if (voice.provider === "chatterbox") {
    return "chatterbox";
  }
  if (voice.provider === "google") {
    return "google";
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
}: PipelineSettingsPanelProps) {
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
    settings.voiceover.ttsProvider === "chatterbox"
      ? "chatterbox"
      : settings.voiceover.ttsProvider === "google"
        ? "google"
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

  const voicesForProvider = useMemo(
    () => voices.filter((voice) => voiceProviderOf(voice) === ttsProvider),
    [voices, ttsProvider],
  );

  const selectedVoiceName = useMemo(() => {
    const match = voicesForProvider.find((voice) => voice.voiceId === voiceId);
    return match?.voiceName ?? settings.voiceover.voiceName ?? "";
  }, [voicesForProvider, voiceId, settings.voiceover.voiceName]);

  function onTtsProviderChange(next: TtsVoiceProvider) {
    setTtsProvider(next);
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
            <div className="space-y-1">
              <Label htmlFor={`ttsProvider-${videoId}`}>TTS engine</Label>
              <select
                id={`ttsProvider-${videoId}`}
                name="ttsProvider"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={ttsProvider}
                onChange={(event) =>
                  onTtsProviderChange(event.target.value as TtsVoiceProvider)
                }
              >
                <option value="elevenlabs">ElevenLabs</option>
                <option value="google">Google Cloud TTS</option>
                <option value="chatterbox">Chatterbox (local)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {ttsProvider === "chatterbox"
                  ? "Pipeline starts Chatterbox before VO, then stops it after stitch."
                  : ttsProvider === "google"
                    ? "Uses Google Cloud Text-to-Speech (GOOGLE_TTS_API_KEY or GOOGLE_TTS_ACCESS_TOKEN)."
                    : "Uses the ElevenLabs API with the selected voice / env defaults."}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`voiceId-${videoId}`}>
                {ttsProvider === "chatterbox"
                  ? "Chatterbox voice"
                  : ttsProvider === "google"
                    ? "Google TTS voice"
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
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pauseAfterMs-${videoId}`}>
                Pause after scenes (ms, linked to voice)
              </Label>
              <Input
                id={`pauseAfterMs-${videoId}`}
                name="pauseAfterMs"
                inputMode="numeric"
                value={pauseAfterMs}
                onChange={(event) => setPauseAfterMs(event.target.value)}
                placeholder="e.g. 400"
              />
            </div>
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
