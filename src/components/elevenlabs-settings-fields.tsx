"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { saveElevenLabsPreferencesAction } from "@/app/voice-catalog-actions";
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
  /**
   * `hero` = the only voice control for single-narrator videos (always visible).
   * `formOnly` = keep the generate form fields but hide the voice picker
   * (multi-speaker videos assign voices in the speaker panel instead).
   */
  variant?: "hero" | "formOnly";
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
      ...(existing?.fishConfig ? { fishConfig: existing.fishConfig } : {}),
      ...(existing?.speechifyConfig
        ? { speechifyConfig: existing.speechifyConfig }
        : {}),
    });
  }

  return Array.from(byId.values());
}

function providerSuffix(voice: NamedElevenLabsVoice) {
  if (voice.provider === "chatterbox") {
    return voice.chatterboxMode === "predefined"
      ? " · Chatterbox predefined"
      : " · Chatterbox clone";
  }
  if (voice.provider === "google") {
    return " · Google Cloud TTS";
  }
  if (voice.provider === "fish") {
    return " · Fish Audio";
  }
  if (voice.provider === "speechify") {
    return " · Speechify";
  }
  return " · ElevenLabs";
}

export function ElevenLabsSettingsFields({
  formId,
  initialSettings,
  voiceIdHistory,
  namedVoices = [],
  variant = "hero",
}: ElevenLabsSettingsFieldsProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [, startTransition] = useTransition();
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
  const selected = catalog.find((voice) => voice.voiceId === settings.voiceId);
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

  const formFields = (
    <form
      id={formId}
      ref={formRef}
      className="grid gap-4"
      onChange={persistSettings}
      onBlur={persistSettings}
      onKeyDown={(event) => {
        // This form has many external submit buttons (Generate all/selected,
        // stitch, pause…). Enter in a voice field must NEVER become an
        // implicit "Generate ALL 269 scenes" submit.
        if (event.key !== "Enter") {
          return;
        }
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON") {
          return;
        }
        event.preventDefault();
      }}
    >
      {variant === "hero" ? (
        <div className="grid gap-3">
          <Label
            htmlFor={`${formId}-voice-select`}
            className="text-base font-semibold text-sky-950 dark:text-sky-50"
          >
            Voice
          </Label>
          {catalog.length > 0 ? (
            <select
              id={`${formId}-voice-select`}
              key={`voice-select-${settings.voiceId}`}
              defaultValue={settings.voiceId}
              className="h-12 w-full rounded-lg border-2 border-sky-400/80 bg-white px-4 text-base font-medium shadow-sm dark:border-sky-500 dark:bg-sky-950"
              onChange={(event) => {
                const next = catalog.find(
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
                  voiceNameInput.value = next?.name ?? "";
                }
                persistSettings();
              }}
            >
              {catalog.map((voice) => (
                <option key={voice.voiceId} value={voice.voiceId}>
                  {voice.name}
                  {providerSuffix(voice)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-sky-900/80 dark:text-sky-100/80">
              Add a voice to the catalog below, then pick it here.
            </p>
          )}
          {selected ? (
            <p className="text-sm font-medium text-sky-900 dark:text-sky-100">
              Generate will use: {selected.name}
              {providerSuffix(selected)}
            </p>
          ) : null}
          <input
            type="hidden"
            id="voiceId"
            name="voiceId"
            key={`voice-id-${settings.voiceId}`}
            defaultValue={settings.voiceId}
          />
          <input
            type="hidden"
            id="voiceName"
            name="voiceName"
            key={`voice-name-${settings.voiceName ?? ""}-${settings.voiceId}`}
            defaultValue={settings.voiceName ?? ""}
          />
        </div>
      ) : (
        <>
          <input
            type="hidden"
            id="voiceId"
            name="voiceId"
            key={`voice-id-${settings.voiceId}`}
            defaultValue={settings.voiceId}
          />
          <input
            type="hidden"
            id="voiceName"
            name="voiceName"
            key={`voice-name-${settings.voiceName ?? ""}-${settings.voiceId}`}
            defaultValue={settings.voiceName ?? ""}
          />
        </>
      )}

      <details className="rounded-md border border-sky-200/60 bg-white/50 p-3 dark:border-sky-800 dark:bg-sky-950/40">
        <summary className="cursor-pointer text-sm font-medium text-sky-950 dark:text-sky-100">
          Optional: model / format / speed
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
          </div>
        </div>
        {history.length > 0 && variant === "hero" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Recent IDs:</span>
            {history.slice(0, 4).map((voiceId) => (
              <button
                key={voiceId}
                type="button"
                className="rounded-md border bg-background px-2 py-1 font-mono hover:bg-muted"
                onClick={() => {
                  const input =
                    formRef.current?.querySelector<HTMLInputElement>(
                      "#voiceId",
                    );
                  const select = formRef.current?.querySelector<HTMLSelectElement>(
                    `#${formId}-voice-select`,
                  );
                  const match = catalog.find((voice) => voice.voiceId === voiceId);
                  const nameInput =
                    formRef.current?.querySelector<HTMLInputElement>(
                      "#voiceName",
                    );
                  if (!input) {
                    return;
                  }
                  input.value = voiceId;
                  if (nameInput) {
                    nameInput.value = match?.name ?? "";
                  }
                  if (select && catalog.some((voice) => voice.voiceId === voiceId)) {
                    select.value = voiceId;
                  }
                  persistSettings();
                }}
              >
                {voiceId.length > 18 ? `${voiceId.slice(0, 18)}…` : voiceId}
              </button>
            ))}
          </div>
        ) : null}
      </details>

      <input type="hidden" name="stability" value={settings.stability} />
      <input
        type="hidden"
        name="similarityBoost"
        value={settings.similarityBoost}
      />
    </form>
  );

  if (variant === "formOnly") {
    return <div className="sr-only">{formFields}</div>;
  }

  return (
    <div className="rounded-xl border-2 border-sky-500/70 bg-sky-50 p-5 shadow-sm dark:border-sky-400/50 dark:bg-sky-950/50">
      <div className="mb-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
          Required · Voiceover voice
        </p>
        <h3 className="text-xl font-semibold tracking-tight text-sky-950 dark:text-sky-50">
          Choose the voice for this video
        </h3>
        <p className="text-sm text-sky-900/80 dark:text-sky-100/80">
          This is the only control that sets which TTS voice Generate uses.
          Pick a Google / ElevenLabs / Fish / Speechify voice from your catalog.
        </p>
      </div>
      {formFields}
    </div>
  );
}
