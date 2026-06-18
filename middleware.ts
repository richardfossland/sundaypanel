import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // ONLY the host/arrangør surface + the auth callback are gated. Anonymous
  // join (/sporsmal/*), play, the big screen (/board/*), the moderator
  // control page (/kontroll/* — code-based), and every audience API are NOT
  // matched here, so anonymous play is completely untouched.
  matcher: ["/host/:path*", "/auth/:path*"],
};
