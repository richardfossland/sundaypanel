import type { CookieOptions } from "@supabase/ssr";

/**
 * Shared cookie options for every Sunday Account AUTH client (browser, server,
 * middleware) so the session cookie is written identically everywhere.
 *
 * Cross-subdomain SSO (Sunday Account): when `NEXT_PUBLIC_COOKIE_DOMAIN` is set
 * (`.sundaysuite.app` in production), the `sb-*` session cookie is scoped to the
 * parent domain so every Sunday web app shares one host login. Left unset in
 * local dev so cookies keep working on `localhost`.
 *
 * IMPORTANT: only the AUTH (issuer) clients use these. The DATA/anon client
 * (`lib/supabase/client.ts`) and the service client stay SESSION-LESS so they
 * never write a competing `sb-*` cookie for the data project.
 */
export function sharedCookieOptions(): CookieOptions {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (!domain) return {};
  return {
    domain,
    path: "/",
    sameSite: "lax",
    secure: true,
  };
}
