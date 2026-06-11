import "server-only";

import { getSession } from "@/lib/server/store";
import { normalizeWordCode } from "@/lib/codes";
import type { Session } from "@/lib/types";

/** Verify the organiser code for a session. Gates every moderator action
 * (show/hide/answer/queue/mode/close/delete). The audience only ever holds the
 * public session code, never this one. */
export async function authModerator(
  sessionId: unknown,
  organiserCode: unknown,
): Promise<Session | null> {
  if (typeof sessionId !== "string" || typeof organiserCode !== "string")
    return null;
  const s = await getSession(sessionId);
  if (!s) return null;
  if (s.organiser_code !== normalizeWordCode(organiserCode)) return null;
  return s;
}
