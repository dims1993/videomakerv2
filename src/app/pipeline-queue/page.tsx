import Link from "next/link";

import {
  removePipelineQueueItem,
  restartPipelineQueueItemFromStepAction,
  resumePipelineQueueItem,
  setPipelineQueueItemEnabled,
} from "@/app/pipeline-actions";
import { PipelineSettingsPanel } from "@/components/pipeline-settings-panel";
import { isChirp3HdVoice } from "@/lib/google-tts-shared";
import { PipelineWorkerControls } from "@/components/pipeline-worker-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getChannelProfile } from "@/lib/channels-server";
import { isNarrationBlocksEnabled } from "@/lib/voiceover-blocks";
import {
  readElevenLabsPreferences,
  type NamedElevenLabsVoice,
} from "@/lib/elevenlabs-preferences";
import { formatDate } from "@/lib/format";
import { isPipelineWorkerRunning } from "@/lib/pipeline-cancel";
import {
  PIPELINE_STEPS,
  listPipelineQueueItems,
  pipelineStepLabel,
} from "@/lib/pipeline-queue";
import {
  channelSupportsImageLibrary,
  getChannelVoiceProfiles,
  resolvePipelineSettings,
  seedVideoPipelineSettingsIfMissing,
} from "@/lib/pipeline-settings";
import { listActiveReferenceDocuments } from "@/lib/reference-documents";

export const dynamic = "force-dynamic";

type PipelineQueuePageProps = {
  searchParams?: Promise<{
    notice?: string;
    highlight?: string;
  }>;
};

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "muted" {
  switch (status) {
    case "succeeded":
      return "default";
    case "running":
      return "secondary";
    case "paused":
    case "failed":
      return "muted";
    default:
      return "outline";
  }
}

export default async function PipelineQueuePage({
  searchParams,
}: PipelineQueuePageProps) {
  const query = searchParams ? await searchParams : undefined;
  const items = await listPipelineQueueItems();
  const narrationBlocksEnabled = isNarrationBlocksEnabled();
  const workerRunning = isPipelineWorkerRunning();
  const elevenPrefs = (await readElevenLabsPreferences()) ?? {
    lastUsed: {
      voiceId: "",
      modelId: "",
      outputFormat: "",
      speed: 1,
      stability: 0.5,
      similarityBoost: 0.75,
    },
    voiceIdHistory: [] as string[],
    namedVoices: [] as NamedElevenLabsVoice[],
    updatedAt: "",
  };

  const settingsByVideoId = new Map<
    string,
    Awaited<ReturnType<typeof resolvePipelineSettings>>
  >();
  const refsByChannel = new Map<
    string,
    Awaited<ReturnType<typeof listActiveReferenceDocuments>>
  >();

  for (const item of items) {
    await seedVideoPipelineSettingsIfMissing(item.videoId);
    settingsByVideoId.set(
      item.videoId,
      await resolvePipelineSettings(item.videoId),
    );
    if (!refsByChannel.has(item.channelKey)) {
      refsByChannel.set(
        item.channelKey,
        await listActiveReferenceDocuments(item.channelKey),
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Pipeline queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run Script → Visual Plan → Assets → Voiceover → Subtitles → Render
            one video at a time.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <PipelineWorkerControls
            initiallyRunning={workerRunning}
            hasQueuedWork={items.some(
              (item) => item.enabled && item.status === "queued",
            )}
          />
          <Button asChild variant="outline">
            <Link href="/videos/new">Daily Topic Queue</Link>
          </Button>
        </div>
      </div>

      {query?.notice ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {query.notice}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Worker</CardTitle>
          <CardDescription>
            {workerRunning
              ? "Running — processing enabled queued items sequentially. Keep-alive auto-restarts after Next.js memory/network drops."
              : "Idle — click Start to process enabled queued items (enables keep-alive for overnight runs)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={workerRunning ? "secondary" : "outline"}>
            {workerRunning ? "running" : "idle"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>
            Disable items to skip them. Resume puts paused/failed items back to
            queued at their current step. Restart from jumps back to an earlier
            step (Script / Visual Plan also clears scenes). Configure sets
            per-video pipeline defaults (optional save as channel default).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items yet. Use Add to queue on a Daily Topic Queue row.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[1160px]">
                <div className="grid grid-cols-[90px_1fr_120px_100px_110px_1fr_340px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <span>Enabled</span>
                  <span>Title</span>
                  <span>Channel</span>
                  <span>Status</span>
                  <span>Step</span>
                  <span>Error</span>
                  <span>Actions</span>
                </div>
                {items.map((item) => {
                  const channel = getChannelProfile(item.channelKey);
                  const channelName = channel.name ?? item.channelKey;
                  const highlighted = query?.highlight === item.id;
                  const settings = settingsByVideoId.get(item.videoId)!;
                  const references = (refsByChannel.get(item.channelKey) ?? []).map(
                    (reference) => ({
                      id: reference.id,
                      title: reference.title,
                      sourceName: reference.sourceName,
                    }),
                  );
                  const voiceProfiles = getChannelVoiceProfiles(item.channelKey);
                  const named = elevenPrefs.namedVoices ?? [];
                  const voiceMap = new Map<
                    string,
                    {
                      voiceId: string;
                      voiceName: string | null;
                      defaultPauseAfterMs: number;
                      provider: "elevenlabs" | "chatterbox" | "google" | "fish" | "speechify";
                      chatterboxMode?: "predefined" | "clone";
                    }
                  >();
                  for (const profile of voiceProfiles) {
                    const provider = isChirp3HdVoice(profile.voiceId)
                      ? "google"
                      : "elevenlabs";
                    voiceMap.set(profile.voiceId, {
                      voiceId: profile.voiceId,
                      voiceName: profile.voiceName ?? null,
                      defaultPauseAfterMs: profile.defaultPauseAfterMs,
                      provider,
                    });
                  }
                  for (const voice of named) {
                    const provider =
                      voice.provider === "chatterbox"
                        ? "chatterbox"
                        : voice.provider === "google"
                          ? "google"
                          : voice.provider === "fish"
                            ? "fish"
                            : voice.provider === "speechify"
                              ? "speechify"
                              : "elevenlabs";
                    const chatterboxMode =
                      provider === "chatterbox"
                        ? voice.chatterboxMode === "predefined"
                          ? "predefined"
                          : "clone"
                        : undefined;
                    if (!voiceMap.has(voice.voiceId)) {
                      voiceMap.set(voice.voiceId, {
                        voiceId: voice.voiceId,
                        voiceName: voice.name,
                        defaultPauseAfterMs: 0,
                        provider,
                        ...(chatterboxMode ? { chatterboxMode } : {}),
                      });
                    } else {
                      const existing = voiceMap.get(voice.voiceId)!;
                      voiceMap.set(voice.voiceId, {
                        ...existing,
                        voiceName: existing.voiceName || voice.name,
                        provider:
                          provider === "chatterbox" ||
                          provider === "google" ||
                          provider === "fish" ||
                          provider === "speechify"
                            ? provider
                            : existing.provider,
                        ...(chatterboxMode
                          ? { chatterboxMode }
                          : existing.chatterboxMode
                            ? { chatterboxMode: existing.chatterboxMode }
                            : {}),
                      });
                    }
                  }
                  for (const historyId of elevenPrefs.voiceIdHistory ?? []) {
                    if (!voiceMap.has(historyId)) {
                      voiceMap.set(historyId, {
                        voiceId: historyId,
                        voiceName: null,
                        defaultPauseAfterMs: 0,
                        provider: "elevenlabs",
                      });
                    }
                  }

                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[90px_1fr_120px_100px_110px_1fr_340px] gap-3 border-b px-3 py-3 text-sm last:border-b-0 ${
                        highlighted ? "bg-muted/40" : ""
                      }`}
                    >
                      <span>
                        <form
                          action={setPipelineQueueItemEnabled.bind(
                            null,
                            item.id,
                            !item.enabled,
                          )}
                        >
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            className={
                              item.enabled
                                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                                : "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white"
                            }
                          >
                            {item.enabled ? "On" : "Off"}
                          </Button>
                        </form>
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/videos/${item.videoId}`}
                          className="font-medium hover:underline"
                        >
                          {item.video.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(item.createdAt)}
                        </div>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {channelName}
                      </span>
                      <span>
                        <Badge variant={statusVariant(item.status)}>
                          {item.status}
                        </Badge>
                      </span>
                      <span className="text-xs">
                        {pipelineStepLabel(item.currentStep)}
                      </span>
                      <span className="text-xs text-destructive">
                        {item.errorMessage ?? ""}
                      </span>
                      <span className="flex flex-col gap-2">
                        <span className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/videos/${item.videoId}`}>Open</Link>
                          </Button>
                          {["paused", "failed", "cancelled"].includes(
                            item.status,
                          ) ? (
                            <form
                              action={resumePipelineQueueItem.bind(
                                null,
                                item.id,
                              )}
                            >
                              <Button type="submit" size="sm">
                                Resume
                              </Button>
                            </form>
                          ) : null}
                          {item.status !== "running" ? (
                            <form
                              action={removePipelineQueueItem.bind(
                                null,
                                item.id,
                              )}
                            >
                              <Button type="submit" size="sm" variant="outline">
                                Remove
                              </Button>
                            </form>
                          ) : null}
                        </span>
                        {item.status !== "running" ? (
                          <form
                            action={restartPipelineQueueItemFromStepAction.bind(
                              null,
                              item.id,
                            )}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <select
                              name="step"
                              defaultValue="visual_plan"
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              aria-label="Restart from step"
                            >
                              {PIPELINE_STEPS.map((step) => (
                                <option key={step} value={step}>
                                  {pipelineStepLabel(step)}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" size="sm" variant="secondary">
                              Restart from
                            </Button>
                          </form>
                        ) : null}
                        <PipelineSettingsPanel
                          videoId={item.videoId}
                          channelKey={item.channelKey}
                          channelName={channelName}
                          supportsLibrary={channelSupportsImageLibrary(
                            item.channelKey,
                          )}
                          settings={settings}
                          references={references}
                          voices={[...voiceMap.values()]}
                          narrationBlocksEnabled={narrationBlocksEnabled}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
