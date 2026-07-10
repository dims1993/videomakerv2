"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Play, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";

export type VoiceoverQaStatus = "ok" | "warning" | "critical" | "failed" | "needs_review";

export type VoiceoverQaRow = {
  id: string;
  order: number;
  scriptText: string;
  sceneDuration: number | null;
  voiceoverDuration: number | null;
  pauseAfterMs: number | null;
  diffSec: number | null;
  wordsPerSecond: number | null;
  status: VoiceoverQaStatus;
  warnings: string[];
  silenceWarning: string | null;
  volumeWarning: string | null;
  deepQaChecked: boolean;
  audioUrl: string | null;
  audioExists: boolean;
  voiceoverLocalPath: string | null;
  masterStartSec: number;
  isHook: boolean;
};

export type VoiceoverQaSummary = {
  totalScenes: number;
  scenesWithAudio: number;
  missingAudio: number;
  ok: number;
  warnings: number;
  critical: number;
  failed: number;
  needsReview: number;
  estimatedFullDurationSec: number;
  suspiciousReviewDurationSec: number;
};

type VoiceoverQaPanelProps = {
  rows: VoiceoverQaRow[];
  summary: VoiceoverQaSummary;
  masterAudioUrl: string | null;
  elevenLabsSettingsFormId: string;
  regenerateAction: (formData: FormData) => void | Promise<void>;
  markOkAction: (formData: FormData) => void | Promise<void>;
  markNeedsReviewAction: (formData: FormData) => void | Promise<void>;
  useAudioDurationAction: (formData: FormData) => void | Promise<void>;
  updateAllDurationsAction: () => void | Promise<void>;
  deepQaUrl: string;
  deepQaEnabled: boolean;
};

type QaFilter =
  | "all"
  | "failed"
  | "warnings"
  | "critical"
  | "missing"
  | "needs_review"
  | "hook"
  | "body";

const filters: Array<{ id: QaFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "failed", label: "Failed" },
  { id: "warnings", label: "Warnings" },
  { id: "critical", label: "Critical" },
  { id: "missing", label: "Missing audio" },
  { id: "needs_review", label: "Needs review" },
  { id: "hook", label: "Hook only" },
  { id: "body", label: "Body only" },
];

function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not set";
  }

  return `${value.toFixed(1)}s`;
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function rowMatchesFilter(row: VoiceoverQaRow, filter: QaFilter) {
  switch (filter) {
    case "failed":
      return row.status === "failed";
    case "warnings":
      return row.status === "warning" || row.status === "critical";
    case "critical":
      return row.status === "critical";
    case "missing":
      return !row.audioUrl || !row.audioExists;
    case "needs_review":
      return row.status === "needs_review";
    case "hook":
      return row.isHook;
    case "body":
      return !row.isHook;
    case "all":
    default:
      return true;
  }
}

function clipEnd(row: VoiceoverQaRow, mode: "full" | "first2" | "last1") {
  const duration = row.voiceoverDuration ?? row.sceneDuration ?? 0;

  if (mode === "first2") {
    return 2;
  }

  if (mode === "last1") {
    return duration;
  }

  return duration;
}

function clipStart(row: VoiceoverQaRow, mode: "full" | "first2" | "last1") {
  const duration = row.voiceoverDuration ?? row.sceneDuration ?? 0;

  if (mode === "last1") {
    return Math.max(0, duration - 1);
  }

  return 0;
}

export function VoiceoverQaPanel({
  rows,
  summary,
  masterAudioUrl,
  elevenLabsSettingsFormId,
  regenerateAction,
  markOkAction,
  markNeedsReviewAction,
  useAudioDurationAction,
  updateAllDurationsAction,
  deepQaUrl,
  deepQaEnabled,
}: VoiceoverQaPanelProps) {
  const [filter, setFilter] = useState<QaFilter>("warnings");
  const [sampleSize, setSampleSize] = useState(10);
  const [isPending, startTransition] = useTransition();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, filter)),
    [filter, rows],
  );
  const playableRows = filteredRows.filter((row) => row.audioUrl && row.audioExists);

  async function playQueue(
    sourceRows: VoiceoverQaRow[],
    mode: "full" | "first2" | "last1" = "full",
  ) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    for (const row of sourceRows.filter((item) => item.audioUrl && item.audioExists)) {
      audio.src = row.audioUrl ?? "";
      audio.currentTime = clipStart(row, mode);
      await audio.play();

      const endAt = clipEnd(row, mode);
      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          if (audio.ended || audio.currentTime >= endAt) {
            window.clearInterval(timer);
            audio.pause();
            resolve();
          }
        }, 120);
      });

      await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
  }

  function playMasterFrom(row: VoiceoverQaRow) {
    const audio = audioRef.current;

    if (!audio || !masterAudioUrl) {
      return;
    }

    audio.src = masterAudioUrl;
    audio.currentTime = row.masterStartSec;
    void audio.play();
  }

  function playSuspicious() {
    const suspiciousRows = rows.filter(
      (row) =>
        ["warning", "critical", "failed", "needs_review"].includes(row.status) &&
        row.audioUrl &&
        row.audioExists,
    );

    startTransition(() => void playQueue(suspiciousRows));
  }

  function playHook() {
    startTransition(() => void playQueue(rows.filter((row) => row.isHook)));
  }

  function playRandomSample() {
    const hookRows = rows.filter((row) => row.isHook && row.audioUrl && row.audioExists);
    const bodyRows = rows.filter((row) => !row.isHook && row.audioUrl && row.audioExists);
    const shuffledBody = [...bodyRows].sort(() => Math.random() - 0.5);
    const selected = [
      ...hookRows.slice(0, Math.min(3, hookRows.length)),
      ...shuffledBody.slice(0, Math.max(0, sampleSize - Math.min(3, hookRows.length))),
    ].slice(0, sampleSize);

    startTransition(() => void playQueue(selected));
  }

  return (
    <div className="space-y-5">
      <audio ref={audioRef} controls className="w-full" />

      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <QaMetric label="Scenes" value={summary.totalScenes} />
        <QaMetric label="Audio ready" value={summary.scenesWithAudio} />
        <QaMetric label="Missing audio" value={summary.missingAudio} />
        <QaMetric label="OK" value={summary.ok} />
        <QaMetric label="Warnings" value={summary.warnings} />
        <QaMetric label="Critical" value={summary.critical} />
        <QaMetric label="Failed" value={summary.failed} />
        <QaMetric label="Needs review" value={summary.needsReview} />
        <QaMetric label="Full duration" value={formatTimestamp(summary.estimatedFullDurationSec)} />
        <QaMetric
          label="Suspicious review"
          value={formatTimestamp(summary.suspiciousReviewDurationSec)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={playSuspicious} disabled={isPending}>
          <Play />
          Play suspicious clips
        </Button>
        <Button type="button" variant="outline" onClick={playHook} disabled={isPending}>
          <Play />
          Play hook voiceover
        </Button>
        <div className="flex items-center gap-2">
          <input
            value={sampleSize}
            onChange={(event) => setSampleSize(Number(event.target.value))}
            className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm"
            type="number"
            min="1"
            max="50"
          />
          <Button type="button" variant="outline" onClick={playRandomSample} disabled={isPending}>
            <Shuffle />
            Play random sample
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => startTransition(() => void playQueue(playableRows, "first2"))}
          disabled={isPending || playableRows.length === 0}
        >
          Play first 2s
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => startTransition(() => void playQueue(playableRows, "last1"))}
          disabled={isPending || playableRows.length === 0}
        >
          Play last 1s
        </Button>
        <form action={updateAllDurationsAction}>
          <Button type="submit" variant="outline">
            Update all durations from audio
          </Button>
        </form>
        <Button asChild variant={deepQaEnabled ? "default" : "outline"}>
          <a href={deepQaUrl}>
            {deepQaEnabled ? "Deep Audio QA active" : "Run Deep Audio QA"}
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={filter === item.id ? "default" : "outline"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="max-h-[620px] overflow-auto rounded-md border">
        <table className="w-full min-w-[1260px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Scene</th>
              <th className="px-3 py-2">Script</th>
              <th className="px-3 py-2">Scene dur.</th>
              <th className="px-3 py-2">Audio dur.</th>
              <th className="px-3 py-2">Diff</th>
              <th className="px-3 py-2">WPS</th>
              <th className="px-3 py-2">Master</th>
              <th className="px-3 py-2">Silence</th>
              <th className="px-3 py-2">Volume</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Warnings</th>
              <th className="px-3 py-2">Audio</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="px-3 py-3 font-medium">{row.order}</td>
                <td className="max-w-xs px-3 py-3">
                  <div className="line-clamp-3 whitespace-pre-line">{row.scriptText}</div>
                </td>
                <td className="px-3 py-3">{formatSeconds(row.sceneDuration)}</td>
                <td className="px-3 py-3">{formatSeconds(row.voiceoverDuration)}</td>
                <td className="px-3 py-3">
                  {row.diffSec === null ? "Not set" : `${row.diffSec.toFixed(1)}s`}
                </td>
                <td className="px-3 py-3">
                  {row.wordsPerSecond === null ? "Not set" : row.wordsPerSecond.toFixed(2)}
                </td>
                <td className="px-3 py-3">
                  <div>{formatTimestamp(row.masterStartSec)}</div>
                  {masterAudioUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => playMasterFrom(row)}
                    >
                      Play master
                    </Button>
                  ) : null}
                </td>
                <td className="max-w-[180px] px-3 py-3">
                  {row.deepQaChecked
                    ? row.silenceWarning ?? "OK"
                    : "Not checked"}
                </td>
                <td className="max-w-[180px] px-3 py-3">
                  {row.deepQaChecked
                    ? row.volumeWarning ?? "OK"
                    : "Not checked"}
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(row.status)}`}>
                    {row.status.replace("_", " ")}
                  </span>
                </td>
                <td className="max-w-xs px-3 py-3">
                  {row.warnings.length > 0 ? row.warnings.join(" ") : "OK"}
                </td>
                <td className="px-3 py-3">
                  {row.audioUrl && row.audioExists ? (
                    <audio controls src={row.audioUrl} className="w-48 max-w-full" />
                  ) : (
                    <span className="text-muted-foreground">No playable audio</span>
                  )}
                  <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {row.voiceoverLocalPath ?? "No audio path"}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      form={elevenLabsSettingsFormId}
                      name="selectedSceneVoiceoverOrders"
                      value={row.order}
                      formAction={regenerateAction}
                    >
                      Regenerate
                    </Button>
                    <form action={markOkAction}>
                      <input type="hidden" name="sceneId" value={row.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Mark OK
                      </Button>
                    </form>
                    <form action={markNeedsReviewAction}>
                      <input type="hidden" name="sceneId" value={row.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Needs review
                      </Button>
                    </form>
                    <form action={useAudioDurationAction}>
                      <input type="hidden" name="sceneId" value={row.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={!row.voiceoverDuration}
                      >
                        Use audio duration
                      </Button>
                    </form>
                    <a className="text-sm underline" href={`#scene-${row.order}`}>
                      Open scene
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={13}>
                  No scenes match this QA filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QaMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-medium">{value}</p>
    </div>
  );
}

function statusClass(status: VoiceoverQaStatus) {
  switch (status) {
    case "critical":
      return "border-red-300 text-red-700";
    case "failed":
      return "border-destructive/50 text-destructive";
    case "warning":
      return "border-amber-300 text-amber-700";
    case "needs_review":
      return "border-sky-300 text-sky-700";
    case "ok":
    default:
      return "border-emerald-300 text-emerald-700";
  }
}
