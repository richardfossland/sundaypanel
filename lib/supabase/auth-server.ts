import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { sharedCookieOptions } from "./cookies";
import { SUNDAY_AUTH_ANON_KEY, SUNDAY_AUTH_URL } from "./auth-env";

/**
 * Server-side Sunday Account AUTH client, bound to the request cookies. Points
 * at the ISSUER project (NEXT_PUBLIC_SUNDAY_AUTH_*), NOT the app's data project.
 * Used ONLY to resolve the signed-in host via `auth.getUser()` — authorization
 * (admin allow-list) happens in `lib/server/auth.ts`, never from the request
 * body. The app's data reads/writes still go through the service client.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(SUNDAY_AUTH_URL, SUNDAY_AUTH_ANON_KEY, {
    cookieOptions: sharedCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In Server Components cookie writes throw; the middleware refreshes the
        // session, so swallowing here is safe.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // no-op in RSC render context
        }
      },
    },
  });
}
