"use client";

import { createBrowserClient } from "@supabase/ssr";

import { sharedCookieOptions } from "./cookies";
import { SUNDAY_AUTH_ANON_KEY, SUNDAY_AUTH_URL } from "./auth-env";

/**
 * Browser Sunday Account AUTH client. Points at the ISSUER project
 * (NEXT_PUBLIC_SUNDAY_AUTH_*) and owns the `sb-*` session cookie scoped to the
 * shared `.sundaysuite.app` domain (when configured). Used ONLY by the host
 * login page (magic link / Google). The host session, not any data access.
 *
 * The DATA/anon client (`lib/supabase/client.ts`) is a DIFFERENT project and
 * stays SESSION-LESS so the two never fight over cookies.
 */
export function createAuthBrowserClient() {
  return createBrowserClient(SUNDAY_AUTH_URL, SUNDAY_AUTH_ANON_KEY, {
    cookieOptions: sharedCookieOptions(),
  });
}
