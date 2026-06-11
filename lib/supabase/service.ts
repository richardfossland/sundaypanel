import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Service-role Supabase client — SERVER ONLY. Bypasses RLS, so it must never
 * be imported into client code (the `server-only` guard enforces this at build
 * time). Every API route uses this; anon clients only do Realtime. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  // Default every table query + RPC to the dedicated `panel` schema (this
  // project is shared with SundayChess, which owns `public`).
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "panel" },
  });
}
