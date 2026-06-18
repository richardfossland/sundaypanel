import { NextResponse } from "next/server";

import { createAuthClient } from "@/lib/supabase/auth-server";

// OAuth / magic-link landing: exchange the code for a Sunday Account session
// cookie (issuer project), then send the host to their dashboard. Whitelisted
// in middleware (no session yet here).
//
// Hardened:
//   * Only same-origin relative `next` paths are honoured (no open redirect).
//   * Bails to /host/login on a failed exchange instead of leaking the error.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only allow a same-origin, absolute-path redirect target; default /host.
  const rawNext = searchParams.get("next") ?? "/host";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/host";

  if (!code) {
    return NextResponse.redirect(`${origin}/host/login`);
  }

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/host/login`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
