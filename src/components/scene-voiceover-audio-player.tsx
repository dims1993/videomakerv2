"use client";

import { useEffect, useRef } from "react";

/**
 * Scene VO preview player. Remounts/reloads when the URL changes after a
 * router.refresh() so the browser does not keep a stale empty media element.
 */
export function SceneVoiceoverAudioPlayer({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.load();
  }, [src]);

  return (
    <audio
      ref={ref}
      key={src}
      controls
      preload="metadata"
      src={src}
      className={className}
    />
  );
}
