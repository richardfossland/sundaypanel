"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChannel } from "@/lib/client/useChannel";
import { channels } from "@/lib/realtime";
import { getJson } from "@/lib/client/api";
import type { ModeratorState } from "@/lib/types";

/** State shape returned by /api/state. We type it as the moderator superset:
 * questions carry the optional AI-moderation fields (cluster_id/flag_reason/
 * suggested_body) on the moderator path; the public path strips them
 * server-side (toPublicQuestion), so they're simply undefined there. Polls and
 * the active poll (with tallies) are present on both paths. */
type SessionState = ModeratorState;

/** Poll + realtime-hint state for a session. Broadcast events trigger an
 * immediate refetch; a slow poll (15 s) is the safety net if realtime drops.
 * Pass organiserCode to get the moderator view (includes hidden). */
export function useSessionState(
  sessionId: string | null,
  organiserCode?: string | null,
) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refetch = useCallback(async () => {
    if (!sessionId || inflight.current) return;
    inflight.current = true;
    try {
      const qs = new URLSearchParams({ sessionId });
      if (organiserCode) qs.set("organiserCode", organiserCode);
      const data = await getJson<SessionState>(`/api/state?${qs}`);
      setState(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukjent_feil");
    } finally {
      inflight.current = false;
    }
  }, [sessionId, organiserCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch + poll loop
    refetch();
    const t = setInterval(refetch, 15_000);
    return () => clearInterval(t);
  }, [refetch]);

  useChannel(sessionId ? channels.session(sessionId) : null, () => {
    refetch();
  });

  return { state, error, refetch };
}
