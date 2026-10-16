"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Player,
  type CallbackListener,
  type PlayerRef,
} from "@remotion/player";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type TimelinePreviewScene = {
  order: number;
  start: number;
  end: number;
  imageUrl: string | null;
  clipUrl: string | null;
  clipMuted: boolean;
};

export type TimelinePreviewAudio = {
  start: number;
  url: string;
};

export type TimelinePreviewCue = {
  start: number;
  end: number;
  text: string;
};

type TimelinePreviewProps = {
  scenes: TimelinePreviewScene[];
  audio: TimelinePreviewAudio[];
  subtitles: TimelinePreviewCue[];
  fps?: number;
  width?: number;
  height?: number;
};

type PreviewCompositionProps = Pick<
  TimelinePreviewProps,
  "scenes" | "audio" | "subtitles"
>;

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function PreviewComposition({ scenes, audio, subtitles }: PreviewCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const activeSubtitle = subtitles.find(
    (cue) => currentTime >= cue.start && currentTime < cue.end,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {scenes.map((scene) => {
        const from = Math.round(scene.start * fps);
        const durationInFrames = Math.max(1, Math.ceil((scene.end - scene.start) * fps));

        return (
          <Sequence
            key={scene.order}
            from={from}
            durationInFrames={durationInFrames}
            layout="none"
          >
            {scene.clipUrl ? (
              <Video
                src={scene.clipUrl}
                muted={scene.clipMuted}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : scene.imageUrl ? (
              <Img
                src={scene.imageUrl}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <AbsoluteFill
                style={{
                  alignItems: "center",
                  backgroundColor: "#18181b",
                  color: "#fafafa",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 42,
                  justifyContent: "center",
                }}
              >
                Scene {scene.order}: missing visual
              </AbsoluteFill>
            )}
          </Sequence>
        );
      })}

      {audio.map((track, index) => (
        <Sequence key={`${track.url}-${index}`} from={Math.round(track.start * fps)}>
          <Audio src={track.url} />
        </Sequence>
      ))}

      {activeSubtitle ? (
        <div
          style={{
            bottom: 72,
            color: "white",
            fontFamily: "Arial, sans-serif",
            fontSize: 52,
            fontWeight: 800,
            left: "10%",
            lineHeight: 1.15,
            position: "absolute",
            right: "10%",
            textAlign: "center",
            textShadow: "0 3px 8px rgba(0, 0, 0, 0.95)",
            whiteSpace: "pre-line",
          }}
        >
          {activeSubtitle.text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

export function VideoTimelinePreview({
  scenes,
  audio,
  subtitles,
  fps = 30,
  width = 1920,
  height = 1080,
}: TimelinePreviewProps) {
  const playerRef = useRef<PlayerRef>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const duration = scenes.length > 0 ? Math.max(...scenes.map((scene) => scene.end)) : 0;
  const durationInFrames = Math.max(1, Math.ceil(duration * fps));
  const activeScene = useMemo(
    () =>
      scenes.find(
        (scene) => currentFrame / fps >= scene.start && currentFrame / fps < scene.end,
      ) ?? null,
    [currentFrame, fps, scenes],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onTimeUpdate: CallbackListener<"timeupdate"> = (event) => {
      setCurrentFrame(event.detail.frame);
    };
    const onSeeked: CallbackListener<"seeked"> = (event) => {
      setCurrentFrame(event.detail.frame);
    };

    player.addEventListener("timeupdate", onTimeUpdate);
    player.addEventListener("seeked", onSeeked);
    return () => {
      player.removeEventListener("timeupdate", onTimeUpdate);
      player.removeEventListener("seeked", onSeeked);
    };
  }, []);

  if (scenes.length === 0 || duration <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add active scenes with a duration before previewing the timeline.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Player
        ref={playerRef}
        component={PreviewComposition}
        inputProps={{ scenes, audio, subtitles }}
        durationInFrames={durationInFrames}
        compositionWidth={width}
        compositionHeight={height}
        fps={fps}
        controls
        acknowledgeRemotionLicense
        className="aspect-video w-full overflow-hidden rounded-md border bg-black"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {formatTime(currentFrame / fps)} / {formatTime(duration)}
        </span>
        <span>
          {activeScene ? `Scene ${activeScene.order}` : "Between scenes"}
          {audio.length === 0 ? " · no audio available" : ""}
          {subtitles.length === 0 ? " · no subtitles available" : ""}
        </span>
      </div>

      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
        {scenes.map((scene) => {
          const active = scene.order === activeScene?.order;
          return (
            <button
              key={scene.order}
              type="button"
              onClick={() => playerRef.current?.seekTo(Math.round(scene.start * fps))}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {scene.order} · {formatTime(scene.start)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
