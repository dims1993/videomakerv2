"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";

import {
  getChirp3HdUsageSummaryAction,
  listGoogleTtsVoicesAction,
  saveNamedElevenLabsVoicesAction,
  saveVoiceoverSectionVoicesAction,
} from "@/app/voice-catalog-actions";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  NamedElevenLabsVoice,
  TtsVoiceProvider,
} from "@/lib/tts-voices";
import { normalizeGoogleTtsCatalogConfig } from "@/lib/tts-voices";
import {
  googleTtsVoiceFamily,
  googleTtsVoiceOptionLabel,
  isChirp3HdVoice,
  languageCodeFromVoiceName,
  type GoogleTtsVoice,
} from "@/lib/google-tts-shared";
import {
  applyManualSectionRanges,
  detectVoiceoverGroupingMode,
  filterVoiceoverGroupsForMode,
  INTERLEAVED_SPEAKER_KINDS,
  summarizeSceneSections,
  type SceneSectionAssignment,
  type ScriptSectionKind,
} from "@/lib/script-sections";
import {
  extractVoiceoverSectionRanges,
  sanitizeVoiceoverSectionSpeed,
  VOICEOVER_SECTION_SPEED_MAX,
  VOICEOVER_SECTION_SPEED_MIN,
  type VoiceoverSectionVoices,
} from "@/lib/voiceover-section-voices";

type VoiceoverSectionVoicesPanelProps = {
  videoId: string;
  formId: string;
  defaultVoiceId: string;
  defaultVoiceName?: string;
  namedVoices: NamedElevenLabsVoice[];
  sectionVoices: VoiceoverSectionVoices;
  sceneAssignments: SceneSectionAssignment[];
  maxSortOrder: number;
};

function voiceOptions(
  namedVoices: NamedElevenLabsVoice[],
  fallbackVoiceId: string,
  fallbackVoiceName?: string,
  sectionVoices: VoiceoverSectionVoices = {},
) {
  const byId = new Map<string, NamedElevenLabsVoice>();

  for (const voice of namedVoices) {
    if (voice.voiceId) {
      byId.set(voice.voiceId, {
        ...voice,
        provider: voice.provider ?? "elevenlabs",
      });
    }
  }

  if (fallbackVoiceId && !byId.has(fallbackVoiceId)) {
    byId.set(fallbackVoiceId, {
      voiceId: fallbackVoiceId,
      name: fallbackVoiceName || "Default voice",
      provider: "elevenlabs",
    });
  }

  for (const entry of Object.values(sectionVoices)) {
    if (!entry?.voiceId || byId.has(entry.voiceId)) {
      continue;
    }
    byId.set(entry.voiceId, {
      voiceId: entry.voiceId,
      name: entry.voiceName || entry.voiceId,
      provider: entry.provider ?? "elevenlabs",
    });
  }

  return Array.from(byId.values());
}

function voiceOptionLabel(voice: NamedElevenLabsVoice) {
  const provider =
    voice.provider === "chatterbox"
      ? voice.chatterboxMode === "predefined"
        ? "Chatterbox predefined"
        : "Chatterbox clone"
      : voice.provider === "google"
        ? "Google Cloud TTS"
        : "ElevenLabs";
  return `${voice.name} · ${provider}`;
}

const GOOGLE_VOICE_FAMILY_ORDER = [
  "Standard",
  "Neural2",
  "WaveNet",
  "Chirp 3 HD",
  "Chirp HD",
  "News",
  "Studio",
  "Polyglot",
  "Other",
];

function groupGoogleVoicesByFamily(voices: GoogleTtsVoice[]) {
  const groups = new Map<string, GoogleTtsVoice[]>();
  for (const voice of voices) {
    const family = googleTtsVoiceFamily(voice.name);
    const list = groups.get(family) ?? [];
    list.push(voice);
    groups.set(family, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return GOOGLE_VOICE_FAMILY_ORDER.filter((family) => groups.has(family)).map(
    (family) => ({
      family,
      voices: groups.get(family)!,
    }),
  );
}

function withDefaultRanges(
  sectionVoices: VoiceoverSectionVoices,
  autoAssignments: SceneSectionAssignment[],
): VoiceoverSectionVoices {
  const mode = detectVoiceoverGroupingMode(autoAssignments);
  const autoSummary = summarizeSceneSections(autoAssignments);
  const next: VoiceoverSectionVoices = { ...sectionVoices };

  for (const section of autoSummary) {
    const existing = next[section.kind];
    if (!existing?.voiceId) {
      continue;
    }
    // Speaker roles are interleaved — never invent contiguous From–To ranges.
    if (
      mode === "speakers" &&
      INTERLEAVED_SPEAKER_KINDS.has(section.kind)
    ) {
      const { startSortOrder: _s, endSortOrder: _e, ...voiceOnly } = existing;
      next[section.kind] = voiceOnly;
      continue;
    }
    if (
      existing.startSortOrder != null &&
      existing.endSortOrder != null
    ) {
      continue;
    }
    if (section.startSortOrder == null || section.endSortOrder == null) {
      continue;
    }
    next[section.kind] = {
      ...existing,
      startSortOrder: section.startSortOrder,
      endSortOrder: section.endSortOrder,
    };
  }

  return next;
}

function formatSceneOrders(orders: number[]) {
  if (orders.length === 0) {
    return "none";
  }
  if (orders.length <= 12) {
    return orders.join(", ");
  }
  return `${orders.slice(0, 10).join(", ")}… (+${orders.length - 10} more)`;
}

export function VoiceoverSectionVoicesPanel({
  videoId,
  formId,
  defaultVoiceId,
  defaultVoiceName,
  namedVoices,
  sectionVoices,
  sceneAssignments,
  maxSortOrder,
}: VoiceoverSectionVoicesPanelProps) {
  const [catalog, setCatalog] = useState<NamedElevenLabsVoice[]>(namedVoices);
  const [newVoiceName, setNewVoiceName] = useState("");
  const [newVoiceId, setNewVoiceId] = useState("");
  const [newVoiceProvider, setNewVoiceProvider] = useState<
    "elevenlabs" | "google"
  >("elevenlabs");
  const [googleVoices, setGoogleVoices] = useState<GoogleTtsVoice[]>([]);
  const [googleLanguageCode, setGoogleLanguageCode] = useState("en-US");
  const [googleVoicesStatus, setGoogleVoicesStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [googleVoicesError, setGoogleVoicesError] = useState("");
  const [chirp3Blocked, setChirp3Blocked] = useState(false);
  const [advancedVoiceId, setAdvancedVoiceId] = useState("");
  const [advancedLanguageCode, setAdvancedLanguageCode] = useState("en-US");
  const [advancedSpeakingRate, setAdvancedSpeakingRate] = useState("1");
  const [advancedAudioEncoding, setAdvancedAudioEncoding] = useState<
    "MP3" | "LINEAR16" | "OGG_OPUS"
  >("MP3");
  const [sectionState, setSectionState] = useState<VoiceoverSectionVoices>(() =>
    withDefaultRanges(sectionVoices, sceneAssignments),
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCatalog(namedVoices);
  }, [namedVoices]);

  useEffect(() => {
    setSectionState(withDefaultRanges(sectionVoices, sceneAssignments));
  }, [sectionVoices, sceneAssignments]);

  useEffect(() => {
    if (newVoiceProvider !== "google") {
      return;
    }
    let cancelled = false;
    void getChirp3HdUsageSummaryAction()
      .then((summary) => {
        if (!cancelled) {
          setChirp3Blocked(summary.blocked);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChirp3Blocked(false);
        }
      });
    setGoogleVoicesStatus("loading");
    setGoogleVoicesError("");
    void listGoogleTtsVoicesAction({ languageCode: googleLanguageCode })
      .then((voices) => {
        if (cancelled) {
          return;
        }
        setGoogleVoices(voices);
        setGoogleVoicesStatus("ready");
        if (
          voices.length > 0 &&
          !voices.some((voice) => voice.name === newVoiceId)
        ) {
          const preferred =
            voices.find((voice) => !isChirp3HdVoice(voice.name)) ?? voices[0]!;
          setNewVoiceId(preferred.name);
          if (!newVoiceName.trim()) {
            setNewVoiceName(preferred.name);
          }
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setGoogleVoices([]);
        setGoogleVoicesStatus("error");
        setGoogleVoicesError(
          error instanceof Error
            ? error.message
            : "Failed to load Google TTS voices.",
        );
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omit newVoiceId/newVoiceName — only reload on provider/lang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newVoiceProvider, googleLanguageCode]);

  const googleVoiceGroups = useMemo(
    () => groupGoogleVoicesByFamily(googleVoices),
    [googleVoices],
  );

  const googleLanguageOptions = useMemo(() => {
    const codes = new Set<string>(["en-US", "en-GB", "es-ES", "es-US"]);
    for (const voice of googleVoices) {
      for (const code of voice.languageCodes) {
        codes.add(code);
      }
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b));
  }, [googleVoices]);

  const googleCatalogVoices = useMemo(
    () => catalog.filter((voice) => voice.provider === "google"),
    [catalog],
  );

  useEffect(() => {
    if (googleCatalogVoices.length === 0) {
      setAdvancedVoiceId("");
      return;
    }
    if (
      advancedVoiceId &&
      googleCatalogVoices.some((voice) => voice.voiceId === advancedVoiceId)
    ) {
      return;
    }
    setAdvancedVoiceId(googleCatalogVoices[0]!.voiceId);
  }, [googleCatalogVoices, advancedVoiceId]);

  useEffect(() => {
    const selected = catalog.find((voice) => voice.voiceId === advancedVoiceId);
    if (!selected || selected.provider !== "google") {
      return;
    }
    const config = selected.googleConfig;
    setAdvancedLanguageCode(
      config?.languageCode ||
        selected.googleLanguageCode ||
        languageCodeFromVoiceName(selected.voiceId) ||
        "en-US",
    );
    setAdvancedSpeakingRate(
      String(config?.speakingRate ?? 1),
    );
    setAdvancedAudioEncoding(config?.audioEncoding ?? "MP3");
  }, [advancedVoiceId, catalog]);

  const groupingMode = useMemo(
    () => detectVoiceoverGroupingMode(sceneAssignments),
    [sceneAssignments],
  );

  const autoSummary = useMemo(
    () =>
      filterVoiceoverGroupsForMode(
        summarizeSceneSections(sceneAssignments),
        detectVoiceoverGroupingMode(sceneAssignments),
      ),
    [sceneAssignments],
  );

  const effectiveAssignments = useMemo(
    () =>
      applyManualSectionRanges({
        autoAssignments: sceneAssignments,
        ranges: extractVoiceoverSectionRanges(sectionState),
      }),
    [sceneAssignments, sectionState],
  );

  const sectionSummary = useMemo(
    () =>
      filterVoiceoverGroupsForMode(
        summarizeSceneSections(effectiveAssignments),
        groupingMode,
      ),
    [effectiveAssignments, groupingMode],
  );

  const ordersByKind = useMemo(() => {
    const map = new Map<ScriptSectionKind, number[]>();
    for (const assignment of effectiveAssignments) {
      const orders = map.get(assignment.sectionKind) ?? [];
      orders.push(assignment.sortOrder);
      map.set(assignment.sectionKind, orders);
    }
    for (const [kind, orders] of map) {
      map.set(
        kind,
        [...orders].sort((left, right) => left - right),
      );
    }
    return map;
  }, [effectiveAssignments]);

  const options = voiceOptions(
    catalog,
    defaultVoiceId,
    defaultVoiceName,
    sectionState,
  );
  const autoByKind = useMemo(() => {
    const map = new Map<
      ScriptSectionKind,
      { startSortOrder: number | null; endSortOrder: number | null; sceneCount: number }
    >();
    for (const section of autoSummary) {
      map.set(section.kind, {
        startSortOrder: section.startSortOrder,
        endSortOrder: section.endSortOrder,
        sceneCount: section.sceneCount,
      });
    }
    return map;
  }, [autoSummary]);

  function addNamedVoice() {
    const name = newVoiceName.trim();
    const voiceId = newVoiceId.trim();
    if (!name || !voiceId) {
      return;
    }

    const provider: TtsVoiceProvider = newVoiceProvider;
    if (provider === "google" && isChirp3HdVoice(voiceId) && chirp3Blocked) {
      setMessage(
        "Chirp 3 HD soft limit reached for this month. Pick Standard/Neural2 instead.",
      );
      return;
    }
    const googleLanguageCodeResolved =
      provider === "google"
        ? languageCodeFromVoiceName(voiceId) ?? googleLanguageCode
        : undefined;

    setCatalog((current) => {
      const withoutDuplicate = current.filter((voice) => voice.voiceId !== voiceId);
      return [
        {
          name,
          voiceId,
          provider,
          ...(googleLanguageCodeResolved
            ? { googleLanguageCode: googleLanguageCodeResolved }
            : {}),
        },
        ...withoutDuplicate,
      ];
    });
    setNewVoiceName("");
    if (provider !== "google") {
      setNewVoiceId("");
    }
    setMessage("");
  }

  function onGoogleVoiceChange(voiceName: string) {
    setNewVoiceId(voiceName);
    const match = googleVoices.find((voice) => voice.name === voiceName);
    if (!newVoiceName.trim() && match) {
      setNewVoiceName(match.name);
    }
  }

  function removeNamedVoice(voiceId: string) {
    setCatalog((current) => current.filter((voice) => voice.voiceId !== voiceId));
    setMessage("Voice removed from catalog. Click Save voice catalog to persist.");
  }

  function saveCatalog() {
    startTransition(async () => {
      await saveNamedElevenLabsVoicesAction(catalog);
      setMessage("Saved named voices.");
    });
  }

  function saveAdvancedGoogleConfig() {
    if (!advancedVoiceId) {
      setMessage("Pick a Google catalog voice first.");
      return;
    }
    const config = normalizeGoogleTtsCatalogConfig({
      languageCode: advancedLanguageCode,
      speakingRate: Number(advancedSpeakingRate),
      audioEncoding: advancedAudioEncoding,
    });
    if (!config) {
      setMessage("Enter at least one Google advanced setting.");
      return;
    }

    const nextCatalog = catalog.map((voice) =>
      voice.voiceId === advancedVoiceId && voice.provider === "google"
        ? {
            ...voice,
            googleLanguageCode: config.languageCode || voice.googleLanguageCode,
            googleConfig: config,
          }
        : voice,
    );
    setCatalog(nextCatalog);
    startTransition(async () => {
      await saveNamedElevenLabsVoicesAction(nextCatalog);
      setMessage(
        `Saved Google advanced config for ${
          nextCatalog.find((voice) => voice.voiceId === advancedVoiceId)?.name ??
          advancedVoiceId
        }.`,
      );
    });
  }

  function saveSectionVoices() {
    startTransition(async () => {
      await saveVoiceoverSectionVoicesAction(videoId, sectionState);
      setMessage(
        groupingMode === "speakers"
          ? "Saved speaker voices for this video (Emma/Leo mapped from the script)."
          : "Saved section voices and scene ranges for this video.",
      );
    });
  }

  function resetSectionRange(kind: ScriptSectionKind) {
    const auto = autoByKind.get(kind);
    if (!auto?.startSortOrder || !auto.endSortOrder) {
      return;
    }
    setSectionState((current) => {
      const existing = current[kind];
      if (!existing?.voiceId) {
        return current;
      }
      return {
        ...current,
        [kind]: {
          ...existing,
          startSortOrder: auto.startSortOrder!,
          endSortOrder: auto.endSortOrder!,
        },
      };
    });
  }

  function setKindVoice(kind: ScriptSectionKind, voiceId: string) {
    const selected = options.find((voice) => voice.voiceId === voiceId);
    const voiceName = selected?.name ?? "";
    const provider = selected?.provider ?? "elevenlabs";
    setSectionState((currentState) => {
      const existing = currentState[kind];
      const keepRanges =
        groupingMode === "sections" ||
        !INTERLEAVED_SPEAKER_KINDS.has(kind);

      return {
        ...currentState,
        [kind]: voiceId
          ? {
              voiceId,
              voiceName: voiceName || undefined,
              provider,
              ...(existing?.speed != null ? { speed: existing.speed } : {}),
              ...(keepRanges && existing?.startSortOrder != null
                ? { startSortOrder: existing.startSortOrder }
                : {}),
              ...(keepRanges && existing?.endSortOrder != null
                ? { endSortOrder: existing.endSortOrder }
                : {}),
            }
          : undefined,
      };
    });
  }

  function setKindSpeed(kind: ScriptSectionKind, raw: string) {
    setSectionState((currentState) => {
      const existing = currentState[kind];
      const voiceId = existing?.voiceId || defaultVoiceId;
      if (!voiceId) {
        return currentState;
      }
      const speed = sanitizeVoiceoverSectionSpeed(raw);
      const catalogVoice = options.find((voice) => voice.voiceId === voiceId);
      const next = {
        voiceId,
        voiceName: existing?.voiceName || catalogVoice?.name || undefined,
        provider: existing?.provider ?? catalogVoice?.provider ?? "elevenlabs",
        ...(existing?.startSortOrder != null
          ? { startSortOrder: existing.startSortOrder }
          : {}),
        ...(existing?.endSortOrder != null
          ? { endSortOrder: existing.endSortOrder }
          : {}),
        ...(speed != null ? { speed } : {}),
      };
      return {
        ...currentState,
        [kind]: next,
      };
    });
  }

  return (
    <div className="space-y-5 rounded-md border bg-muted/20 p-4">
      <input
        type="hidden"
        form={formId}
        name="voiceoverSectionVoicesJson"
        value={JSON.stringify(sectionState)}
        readOnly
      />
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {groupingMode === "speakers"
            ? "Voice Catalog & Speaker Voices"
            : "Voice Catalog & Section Voices"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {groupingMode === "speakers" ? (
            <>
              This script uses interleaved speakers (Emma / Leo). Voices are
              assigned per orator from the script tags and scene{" "}
              <code className="text-[11px]">visualIdea</code> prefixes — not as
              contiguous section blocks. Optional Speed per speaker is sent to
              ElevenLabs as <code className="text-[11px]">voice_settings.speed</code>{" "}
              (not post-processed). Music-bed scenes stay without a speaker
              voice.
            </>
          ) : (
            <>
              Assign a different ElevenLabs voice per script section. Optional
              Speed overrides the global rate for that section when generating.
              Adjust the scene range manually when auto-detection splits a
              section too early or too late. Generate uses these mappings even if
              you have not clicked Save yet (and persists them on generate).
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(140px,160px)_minmax(160px,200px)_1fr_auto]">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={newVoiceProvider}
          onChange={(event) => {
            const next =
              event.target.value === "google" ? "google" : "elevenlabs";
            setNewVoiceProvider(next);
            setNewVoiceId("");
            setMessage("");
          }}
          aria-label="Catalog voice provider"
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="google">Google Cloud TTS</option>
        </select>
        <Input
          value={newVoiceName}
          onChange={(event) => setNewVoiceName(event.target.value)}
          placeholder="Friendly name"
        />
        {newVoiceProvider === "google" ? (
          <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={googleLanguageCode}
              onChange={(event) => setGoogleLanguageCode(event.target.value)}
              aria-label="Google TTS language"
              disabled={googleVoicesStatus === "loading"}
            >
              {googleLanguageOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={newVoiceId}
              onChange={(event) => onGoogleVoiceChange(event.target.value)}
              aria-label="Google TTS voice"
              disabled={
                googleVoicesStatus === "loading" || googleVoices.length === 0
              }
            >
              {googleVoicesStatus === "loading" ? (
                <option value="">Loading Google voices…</option>
              ) : googleVoices.length === 0 ? (
                <option value="">No voices for this language</option>
              ) : (
                googleVoiceGroups.map((group) => (
                  <optgroup key={group.family} label={group.family}>
                    {group.voices.map((voice) => {
                      const chirpBlocked =
                        chirp3Blocked && isChirp3HdVoice(voice.name);
                      return (
                        <option
                          key={voice.name}
                          value={voice.name}
                          disabled={chirpBlocked}
                        >
                          {googleTtsVoiceOptionLabel(voice)}
                          {chirpBlocked ? " — limit reached" : ""}
                        </option>
                      );
                    })}
                  </optgroup>
                ))
              )}
            </select>
          </div>
        ) : (
          <Input
            value={newVoiceId}
            onChange={(event) => setNewVoiceId(event.target.value)}
            placeholder="ElevenLabs voice ID"
          />
        )}
        <Button type="button" variant="outline" onClick={addNamedVoice}>
          Add voice
        </Button>
      </div>
      {newVoiceProvider === "google" && googleVoicesStatus === "error" ? (
        <p className="text-xs text-destructive">
          {googleVoicesError || "Could not load Google TTS voices."} Check
          GOOGLE_TTS_API_KEY and restart the dev server.
        </p>
      ) : null}
      {newVoiceProvider === "google" && googleVoicesStatus === "ready" ? (
        <p className="text-xs text-muted-foreground">
          {googleVoices.length} Google voice
          {googleVoices.length === 1 ? "" : "s"} for {googleLanguageCode}.
          Prefer <span className="font-medium">Standard</span> for the lowest
          character-priced tier.
        </p>
      ) : null}

      {catalog.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {catalog.map((voice) => (
            <span
              key={voice.voiceId}
              className="inline-flex items-center gap-1 rounded-full border bg-background py-1 pl-2 pr-1"
            >
              <span>
                {voice.name} ·{" "}
                {voice.provider === "chatterbox"
                  ? voice.chatterboxMode === "predefined"
                    ? "Chatterbox predefined"
                    : "Chatterbox clone"
                  : voice.provider === "google"
                    ? "Google Cloud TTS"
                    : "ElevenLabs"}{" "}
                · {voice.voiceId}
                {voice.provider === "google" && voice.googleConfig?.speakingRate != null
                  ? ` · rate ${voice.googleConfig.speakingRate}`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => removeNamedVoice(voice.voiceId)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${voice.name} from catalog`}
                title="Remove from catalog"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No saved voices yet. Add an ElevenLabs or Google Cloud TTS voice
          below, or clone a Chatterbox voice above, then save the catalog.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={saveCatalog} disabled={isPending}>
          Save voice catalog
        </Button>
      </div>

      <CollapsibleCard
        title="Catalog advanced config (Google TTS)"
        description="Per-catalog speaking_rate, audio_encoding, and language_code — saved on the selected Google voice."
        defaultOpen={googleCatalogVoices.length > 0}
      >
        {googleCatalogVoices.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add a Google Cloud TTS voice to the catalog first, then configure
            rhythm here.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-google-adv-voice`}>Catalog voice</Label>
                <select
                  id={`${formId}-google-adv-voice`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={advancedVoiceId}
                  onChange={(event) => setAdvancedVoiceId(event.target.value)}
                >
                  {googleCatalogVoices.map((voice) => (
                    <option key={voice.voiceId} value={voice.voiceId}>
                      {voice.name} · {voice.voiceId}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-google-adv-name`}>voice.name</Label>
                <Input
                  id={`${formId}-google-adv-name`}
                  value={advancedVoiceId}
                  readOnly
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-google-adv-lang`}>
                  voice.language_code
                </Label>
                <Input
                  id={`${formId}-google-adv-lang`}
                  value={advancedLanguageCode}
                  onChange={(event) =>
                    setAdvancedLanguageCode(event.target.value)
                  }
                  placeholder="en-US"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-google-adv-rate`}>
                  audio_config.speaking_rate
                </Label>
                <Input
                  id={`${formId}-google-adv-rate`}
                  type="number"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={advancedSpeakingRate}
                  onChange={(event) =>
                    setAdvancedSpeakingRate(event.target.value)
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Cloud TTS range 0.25–4.0 (e.g. 2.0 = double speed).
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-google-adv-enc`}>
                  audio_config.audio_encoding
                </Label>
                <select
                  id={`${formId}-google-adv-enc`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={advancedAudioEncoding}
                  onChange={(event) =>
                    setAdvancedAudioEncoding(
                      event.target.value === "LINEAR16"
                        ? "LINEAR16"
                        : event.target.value === "OGG_OPUS"
                          ? "OGG_OPUS"
                          : "MP3",
                    )
                  }
                >
                  <option value="MP3">MP3 (recommended)</option>
                  <option value="OGG_OPUS">OGG_OPUS</option>
                  <option value="LINEAR16">LINEAR16</option>
                </select>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-background p-3 text-[11px] text-muted-foreground">
{`{
  "audio_config": {
    "audio_encoding": "${advancedAudioEncoding}",
    "speaking_rate": ${Number(advancedSpeakingRate) || 1}
  },
  "voice": {
    "language_code": "${advancedLanguageCode || "en-US"}",
    "name": "${advancedVoiceId}"
  }
}`}
            </pre>
            <Button
              type="button"
              onClick={saveAdvancedGoogleConfig}
              disabled={isPending || !advancedVoiceId}
            >
              Save Google config to catalog voice
            </Button>
          </div>
        )}
      </CollapsibleCard>

      <div className="space-y-3">
        {sectionSummary.map((section) => {
          const current = sectionState[section.kind];
          const selectedVoiceId = current?.voiceId ?? defaultVoiceId;
          const auto = autoByKind.get(section.kind);
          const isSpeakerRole =
            groupingMode === "speakers" &&
            INTERLEAVED_SPEAKER_KINDS.has(section.kind);
          const sceneOrders = ordersByKind.get(section.kind) ?? [];
          const startValue =
            current?.startSortOrder ??
            section.startSortOrder ??
            auto?.startSortOrder ??
            1;
          const endValue =
            current?.endSortOrder ??
            section.endSortOrder ??
            auto?.endSortOrder ??
            maxSortOrder;

          return (
            <div
              key={section.kind}
              className="grid gap-3 rounded-md border bg-background p-3"
            >
              <div className="grid gap-2 lg:grid-cols-[220px_1fr]">
                <div>
                  <p className="text-sm font-medium">{section.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {section.description}
                  </p>
                  {isSpeakerRole ? (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {section.sceneCount} scene
                        {section.sceneCount === 1 ? "" : "s"} from script
                        speaker tags
                      </p>
                      <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">
                        Scenes: {formatSceneOrders(sceneOrders)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Effective: scenes {startValue}–{endValue} (
                        {section.sceneCount} scene
                        {section.sceneCount === 1 ? "" : "s"})
                      </p>
                      {auto?.startSortOrder != null && auto.endSortOrder != null ? (
                        <p className="text-xs text-muted-foreground">
                          Auto-detected: {auto.startSortOrder}–{auto.endSortOrder}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_140px] sm:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor={`${formId}-${section.kind}-voice`}>
                      Voice for {section.label}
                    </Label>
                    <select
                      id={`${formId}-${section.kind}-voice`}
                      value={selectedVoiceId}
                      onChange={(event) =>
                        setKindVoice(section.kind, event.target.value)
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      {options.map((voice) => (
                        <option key={voice.voiceId} value={voice.voiceId}>
                          {voiceOptionLabel(voice)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${formId}-${section.kind}-speed`}>
                      Speed
                    </Label>
                    <Input
                      id={`${formId}-${section.kind}-speed`}
                      type="number"
                      min={VOICEOVER_SECTION_SPEED_MIN}
                      max={VOICEOVER_SECTION_SPEED_MAX}
                      step={0.05}
                      placeholder="global"
                      value={current?.speed ?? ""}
                      onChange={(event) =>
                        setKindSpeed(section.kind, event.target.value)
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      ElevenLabs rate ({VOICEOVER_SECTION_SPEED_MIN}–
                      {VOICEOVER_SECTION_SPEED_MAX}). Lower = slower. Empty uses
                      global Speed.
                      {section.kind === "student"
                        ? " Tip for Leo: try 0.75–0.85."
                        : ""}
                    </p>
                  </div>
                </div>
              </div>

              {!isSpeakerRole ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="grid gap-1">
                    <Label htmlFor={`${formId}-${section.kind}-from`}>
                      From scene
                    </Label>
                    <Input
                      id={`${formId}-${section.kind}-from`}
                      type="number"
                      min={1}
                      max={maxSortOrder || undefined}
                      value={startValue}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }
                        setSectionState((currentState) => {
                          const existing = currentState[section.kind] ?? {
                            voiceId: selectedVoiceId,
                            voiceName:
                              options.find((voice) => voice.voiceId === selectedVoiceId)
                                ?.name || undefined,
                          };
                          return {
                            ...currentState,
                            [section.kind]: {
                              ...existing,
                              startSortOrder: Math.max(1, Math.floor(parsed)),
                              endSortOrder: endValue,
                            },
                          };
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${formId}-${section.kind}-to`}>
                      To scene
                    </Label>
                    <Input
                      id={`${formId}-${section.kind}-to`}
                      type="number"
                      min={1}
                      max={maxSortOrder || undefined}
                      value={endValue}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }
                        setSectionState((currentState) => {
                          const existing = currentState[section.kind] ?? {
                            voiceId: selectedVoiceId,
                            voiceName:
                              options.find((voice) => voice.voiceId === selectedVoiceId)
                                ?.name || undefined,
                          };
                          return {
                            ...currentState,
                            [section.kind]: {
                              ...existing,
                              startSortOrder: startValue,
                              endSortOrder: Math.max(1, Math.floor(parsed)),
                            },
                          };
                        });
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetSectionRange(section.kind)}
                    disabled={
                      auto?.startSortOrder == null || auto.endSortOrder == null
                    }
                  >
                    Reset to auto
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button type="button" onClick={saveSectionVoices} disabled={isPending}>
        {groupingMode === "speakers"
          ? "Save speaker voices for this video"
          : "Save section voices for this video"}
      </Button>

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
