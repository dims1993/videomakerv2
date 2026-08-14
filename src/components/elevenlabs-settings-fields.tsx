"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { saveElevenLabsPreferencesAction } from "@/app/voice-catalog-actions";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ElevenLabsPreferenceSettings,
  NamedElevenLabsVoice,
} from "@/lib/tts-voices";

const localStorageKey = "videomakerv2:elevenlabs-preferences";

type ElevenLabsSettingsFieldsProps = {
  formId: string;
  initialSettings: ElevenLabsPreferenceSettings;
  voiceIdHistory: string[];
  namedVoices?: NamedElevenLabsVoice[];
};

function readLocalSettings(): ElevenLabsPreferenceSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(localStorageKey);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as ElevenLabsPreferenceSettings;
  } catch {
    return null;
  }
}

function writeLocalSettings(settings: ElevenLabsPreferenceSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localStorageKey, JSON.stringify(settings));
}

function readFormSettings(form: HTMLFormElement): ElevenLabsPreferenceSettings {
  const formData = new FormData(form);

  return {
    voiceId: formData.get("voiceId")?.toString().trim() ?? "",
    voiceName: formData.get("voiceName")?.toString().trim() ?? "",
    modelId: formData.get("modelId")?.toString().trim() ?? "",
    outputFormat: formData.get("outputFormat")?.toString().trim() ?? "",
    speed: Number(formData.get("speed")),
    stability: Number(formData.get("stability")),
    similarityBoost: Number(formData.get("similarityBoost")),
  };
}

function buildCatalog(
  namedVoices: NamedElevenLabsVoice[],
  settings: ElevenLabsPreferenceSettings,
) {
  const byId = new Map<string, NamedElevenLabsVoice>();

  for (const voice of namedVoices) {
    byId.set(voice.voiceId, {
      ...voice,
      provider: voice.provider ?? "elevenlabs",
    });
  }

  if (settings.voiceId) {
    const existing = byId.get(settings.voiceId);
    const resolvedName =
      settings.voiceName?.trim() || existing?.name || "Current default";
    byId.set(settings.voiceId, {
      voiceId: settings.voiceId,
      name: resolvedName,
      provider: existing?.provider ?? "elevenlabs",
      ...(existing?.chatterboxMode
        ? { chatterboxMode: existing.chatterboxMode }
        : {}),
      ...(existing?.predefinedVoiceId
        ? { predefinedVoiceId: existing.predefinedVoiceId }
        : {}),
      ...(existing?.referenceFileName
        ? { referenceFileName: existing.referenceFileName }
        : {}),
      ...(existing?.localSamplePath
        ? { localSamplePath: existing.localSamplePath }
        : {}),
      ...(existing?.googleLanguageCode
        ? { googleLanguageCode: existing.googleLanguageCode }
        : {}),
      ...(existing?.googleConfig ? { googleConfig: existing.googleConfig } : {}),
    });
  }

  return Array.from(byId.values());
}

export function ElevenLabsSettingsFields({
  formId,
  initialSettings,
  voiceIdHistory,
  namedVoices = [],
}: ElevenLabsSettingsFieldsProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [, startTransition] = useTransition();
  // Always start from server props so SSR and first client render match.
  const [settings, setSettings] =
    useState<ElevenLabsPreferenceSettings>(initialSettings);
  const [hasHydratedLocal, setHasHydratedLocal] = useState(false);

  useEffect(() => {
    const local = readLocalSettings();
    if (local) {
      setSettings(local);
    } else {
      writeLocalSettings(initialSettings);
    }
    setHasHydratedLocal(true);
  }, [initialSettings]);

  useEffect(() => {
    if (!hasHydratedLocal) {
      return;
    }
    writeLocalSettings(settings);
  }, [hasHydratedLocal, settings]);

  const catalog = buildCatalog(namedVoices, settings);
  const history = Array.from(
    new Set(
      [settings.voiceId, ...voiceIdHistory].filter(
        (voiceId) => voiceId.trim().length > 0,
      ),
    ),
  );

  function persistSettings() {
    const form = formRef.current;

    if (!form) {
      return;
    }

    const next = readFormSettings(form);
    setSettings(next);
    writeLocalSettings(next);

    startTransition(async () => {
      await saveElevenLabsPreferencesAction(next);
    });
  }

  return (
    <CollapsibleCard
      title="Advanced voice settings"
      description="Global generation defaults (voice id, model, format, speed). For Google Cloud TTS rhythm/encoding, use Catalog advanced config below."
      defaultOpen={false}
    >
      <form
        id={formId}
        ref={formRef}
        className="grid gap-4 lg:grid-cols-4"
        onChange={persistSettings}
        onBlur={persistSettings}
      >
        <div className="grid gap-2 lg:col-span-2">
          <Label htmlFor={`${formId}-voice-select`}>Voice</Label>
          {catalog.length > 0 ? (
            <select
              id={`${formId}-voice-select`}
              key={`voice-select-${settings.voiceId}`}
              defaultValue={settings.voiceId}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              onChange={(event) => {
                const selected = catalog.find(
                  (voice) => voice.voiceId === event.target.value,
                );
                const voiceIdInput =
                  formRef.current?.querySelector<HTMLInputElement>("#voiceId");
                const voiceNameInput =
                  formRef.current?.querySelector<HTMLInputElement>("#voiceName");

                if (voiceIdInput) {
                  voiceIdInput.value = event.target.value;
                }
                if (voiceNameInput) {
                  voiceNameInput.value = selected?.name ?? "";
                }
                persistSettings();
              }}
            >
              {catalog.map((voice) => (
                <option key={voice.voiceId} value={voice.voiceId}>
                  {voice.name}
                  {voice.provider === "chatterbox"
                    ? voice.chatterboxMode === "predefined"
                      ? " · Chatterbox predefined"
                      : " · Chatterbox clone"
                    : voice.provider === "google"
                      ? " · Google Cloud TTS"
                      : ""}
                </option>
              ))}
            </select>
          ) : null}
          <Label htmlFor="voiceId">Voice ID</Label>
          <Input
            id="voiceId"
            name="voiceId"
            list={`${formId}-voice-id-history`}
            key={`voice-id-${settings.voiceId}`}
            defaultValue={settings.voiceId}
            placeholder="ElevenLabs / Google / Chatterbox voice id"
          />
          <input
            type="hidden"
            id="voiceName"
            name="voiceName"
            key={`voice-name-${settings.voiceName ?? ""}-${settings.voiceId}`}
            defaultValue={settings.voiceName ?? ""}
          />
          <datalist id={`${formId}-voice-id-history`}>
            {history.map((voiceId) => (
              <option key={voiceId} value={voiceId} />
            ))}
          </datalist>
          {history.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Recent:</span>
              {history.slice(0, 6).map((voiceId) => (
                <button
                  key={voiceId}
                  type="button"
                  className="rounded-md border bg-background px-2 py-1 font-mono hover:bg-muted"
                  onClick={() => {
                    const input =
                      formRef.current?.querySelector<HTMLInputElement>(
                        "#voiceId",
                      );

                    if (!input) {
                      return;
                    }

                    input.value = voiceId;
                    persistSettings();
                  }}
                >
                  {voiceId.length > 18 ? `${voiceId.slice(0, 18)}…` : voiceId}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="modelId">Model ID</Label>
          <Input
            id="modelId"
            name="modelId"
            key={`model-${settings.modelId}`}
            defaultValue={settings.modelId}
            placeholder="eleven_multilingual_v2"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="outputFormat">Output format</Label>
          <Input
            id="outputFormat"
            name="outputFormat"
            key={`format-${settings.outputFormat}`}
            defaultValue={settings.outputFormat}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="speed">Speed</Label>
          <Input
            id="speed"
            name="speed"
            type="number"
            min="0.7"
            max="1.2"
            step="0.05"
            key={`speed-${settings.speed}`}
            defaultValue={settings.speed}
          />
          <p className="text-[11px] text-muted-foreground">
            ElevenLabs band (0.7–1.2). Google catalog voices use speakingRate in
            Catalog advanced config (0.25–4.0).
          </p>
        </div>
        <input type="hidden" name="stability" value={settings.stability} />
        <input
          type="hidden"
          name="similarityBoost"
          value={settings.similarityBoost}
        />
      </form>
    </CollapsibleCard>
  );
}
