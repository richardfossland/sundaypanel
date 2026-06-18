import "server-only";

import { createAuthClient } from "@/lib/supabase/auth-server";
import { getSession } from "@/lib/server/store";
import { normalizeWordCode } from "@/lib/codes";
import type { Session } from "@/lib/types";

/** Verify the organiser code for a session. Gates every moderator action
 * (show/hide/answer/queue/mode/close/delete). The audience only ever holds the
 * public session code, never this one.
 *
 * UNCHANGED by the Sunday Account work: code-based host/player auth is intact.
 * A logged-in Sunday Account host is an ADDITIONAL path, never a replacement —
 * anonymous create/join/play keep working with no login. */
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

// ---------------------------------------------------------------- Sunday host
// Sunday Account (issuer-project) login for the arrangør/host ONLY. This is the
// SINGLE place authorization lives — keep authz logic here, not scattered.

export class AuthError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

/** A minimal view of the signed-in Sunday Account host. */
export interface HostUser {
  id: string;
  email: string;
}

/** Parse PANEL_ADMIN_EMAILS into a normalised (lowercased, trimmed) set. An
 * empty / unset list means NO ONE is authorized as a host admin (fail closed),
 * which never affects anonymous code-based play. */
function adminEmailSet(): Set<string> {
  const raw = process.env.PANEL_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Authorize a Sunday Account email against the admin allow-list. The ONE
 * authz decision for the host surface. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailSet().has(email.trim().toLowerCase());
}

/** Resolve the signed-in Sunday Account host from the `sb-*` session cookie
 * (issuer project) and authorize them against PANEL_ADMIN_EMAILS.
 *   - throws AuthError(401) when there is no signed-in user, or
 *   - throws AuthError(403) when the user is not on the admin allow-list.
 * Never reads identity from the request body. */
export async function requireHost(): Promise<HostUser> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError(401, "ikke_innlogget");
  const email = user.email ?? null;
  if (!isAdminEmail(email)) throw new AuthError(403, "ikke_arrangor");
  return { id: user.id, email: email as string };
}

/** Non-throwing variant for RSC pages (e.g. the host dashboard) that prefer to
 * redirect to /host/login rather than render an error. Returns null when there
 * is no authorized host. */
export async function getHost(): Promise<HostUser | null> {
  try {
    return await requireHost();
  } catch {
    return null;
  }
}

/** Uniform catch → Response for host-gated API routes. */
export function authFail(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
