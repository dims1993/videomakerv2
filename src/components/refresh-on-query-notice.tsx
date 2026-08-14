"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * After long server actions (e.g. scene voiceovers), the redirect often paints
 * the notice while the RSC body is still a stale snapshot — players show empty
 * until a manual reload. Refresh when the success/error notice appears.
 *
 * - Latches the notice so ClearQueryParams (history.replaceState) cannot cancel
 *   the refresh when it strips the query string.
 * - Strict Mode safe: no ref gate that survives cleanup and skips the reschedule.
 */
export function RefreshOnQueryNotice({
  param = "voiceoverNotice",
  delayMs = 350,
  secondPassMs = 1200,
}: {
  param?: string;
  delayMs?: number;
  /** Extra refresh in case the first pass still races the DB write. */
  secondPassMs?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const liveNotice = searchParams.get(param);
  const [latchedNotice] = useState(() => liveNotice);
  const notice = liveNotice ?? latchedNotice;

  useEffect(() => {
    if (!notice) {
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    function schedule(delay: number) {
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) {
            router.refresh();
          }
        }, delay),
      );
    }

    // Always (re)schedule while this notice is active; Strict Mode cleanup only
    // cancels in-flight timers, then this effect runs again and reschedules.
    schedule(delayMs);
    if (secondPassMs > delayMs) {
      schedule(secondPassMs);
    }

    return () => {
      cancelled = true;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [notice, delayMs, secondPassMs, router]);

  return null;
}
