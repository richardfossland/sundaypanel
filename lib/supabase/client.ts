"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key) for the app's DATA project. Used ONLY for
 * Realtime broadcast + presence subscriptions. All authoritative reads/writes
 * go through the server API routes (RLS denies direct table access to anon —
 * see §8).
 *
 * SESSION-LESS on purpose: the Sunday Account AUTH client (issuer project,
 * `lib/supabase/auth-browser.ts`) owns the `sb-*` session cookie. This data
 * client must never write its own auth cookie, or the two would fight over
 * cookies and anonymous play could be disturbed. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        // No cookie storage: keep this client purely a Realtime transport.
        storageKey: "panel-data-realtime-no-session",
      },
    },
  );
}
