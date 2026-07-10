"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type DraftVideoPlayerProps = {
  src: string;
  sourceLabel: string;
};

type PlayerState = {
  muted: boolean;
  defaultMuted: boolean;
  volume: number;
  readyState: number;
  networkState: number;
  audioTracks: number | null;
  decodedAudioBytes: number | null;
  error: string | null;
};

function readPlayerState(video: HTMLVideoElement): PlayerState {
  const videoWithAudioStats = video as HTMLVideoElement & {
    audioTracks?: { length: number };
    webkitAudioDecodedByteCount?: number;
    mozHasAudio?: boolean;
  };
  const audioTracks =
    videoWithAudioStats.audioTracks?.length ??
    (videoWithAudioStats.mozHasAudio ? 1 : null);
  const decodedAudioBytes =
    typeof videoWithAudioStats.webkitAudioDecodedByteCount === "number"
      ? videoWithAudioStats.webkitAudioDecodedByteCount
      : null;

  return {
    muted: video.muted,
    defaultMuted: video.defaultMuted,
    volume: video.volume,
    readyState: video.readyState,
    networkState: video.networkState,
    audioTracks,
    decodedAudioBytes,
    error: video.error ? `${video.error.code}: ${video.error.message}` : null,
  };
}

export function DraftVideoPlayer({ src, sourceLabel }: DraftVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  function refreshState() {
    const video = videoRef.current;

    if (video) {
      setState(readPlayerState(video));
    }
  }

  async function enableAudio() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;

    try {
      await video.play();
      setLastAction("Audio enabled and playback started.");
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Playback was blocked.");
    }

    refreshState();
  }

  async function playFromStart() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.currentTime = 0;
    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;

    try {
      await video.play();
      setLastAction("Playing from start.");
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Playback was blocked.");
    }

    refreshState();
  }

  function reloadVideo() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.load();
    setLastAction("Reloaded video element.");
    refreshState();
  }

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const update = () => setState(readPlayerState(video));
    const events = [
      "abort",
      "canplay",
      "canplaythrough",
      "durationchange",
      "emptied",
      "error",
      "loadeddata",
      "loadedmetadata",
      "pause",
      "play",
      "playing",
      "progress",
      "ratechange",
      "stalled",
      "suspend",
      "volumechange",
      "waiting",
    ];

    events.forEach((eventName) => video.addEventListener(eventName, update));
    update();

    return () => {
      events.forEach((eventName) => video.removeEventListener(eventName, update));
    };
  }, [src]);

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        key={src}
        controls
        preload="auto"
        playsInline
        src={src}
        className="aspect-video w-full rounded-md border bg-black"
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={enableAudio}>
          <Volume2 />
          Enable audio
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={playFromStart}>
          <Play />
          Play from start
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={reloadVideo}>
          <RotateCcw />
          Reload
        </Button>
      </div>

      <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div>Muted: {state?.muted ? "yes" : "no"}</div>
        <div>Default muted: {state?.defaultMuted ? "yes" : "no"}</div>
        <div>Volume: {state ? state.volume.toFixed(2) : "unknown"}</div>
        <div>Audio tracks: {state?.audioTracks ?? "browser hidden"}</div>
        <div>Decoded audio: {state?.decodedAudioBytes ?? "unknown"}</div>
        <div>Ready: {state?.readyState ?? "unknown"}</div>
        <div>Network: {state?.networkState ?? "unknown"}</div>
        <div className="break-all">Source: {sourceLabel}</div>
        {state?.error ? <div className="break-all text-destructive">Error: {state.error}</div> : null}
        {lastAction ? <div className="break-all">Last action: {lastAction}</div> : null}
      </div>
    </div>
  );
}
