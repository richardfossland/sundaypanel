"use client";

import { useEffect } from "react";

/** Holder skjermen våken (projektor/TV) mens `enabled`. Låsen slippes av
 * nettleseren når fanen skjules, så den tas på nytt ved synlig fane. Feiler
 * stille der Wake Lock API ikke finnes. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) void s.release().catch(() => {});
        else sentinel = s;
      } catch {}
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
