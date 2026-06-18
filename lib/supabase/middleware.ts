import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { sharedCookieOptions } from "./cookies";
import { SUNDAY_AUTH_ANON_KEY, SUNDAY_AUTH_URL } from "./auth-env";

/** The login surface itself — reachable without a session. */
const LOGIN_PATH = "/host/login";

/** Refresh the Sunday Account session cookie on the host surface and redirect
 * unauthenticated visitors of /host/* to the login page.
 *
 * SCOPE: this runs ONLY for /host/* and /auth/* (see the matcher in the root
 * middleware.ts). Anonymous join / play / board / projector and every API the
 * audience uses are NEVER touched — they stay completely login-free.
 *
 * Note: this only checks for the *presence* of a signed-in user (cookie
 * refresh). The admin allow-list (isAdminEmail) is enforced server-side in
 * requireHost() / the host pages — middleware must not read PANEL_ADMIN_EMAILS
 * (Edge runtime, and authz belongs in one place). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUNDAY_AUTH_URL, SUNDAY_AUTH_ANON_KEY, {
    cookieOptions: sharedCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // /auth/* (callback) must run before any session exists — let it through.
  if (path.startsWith("/auth/")) return response;

  // The login page itself is always reachable.
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) {
    // If already signed in, skip the form and go to the dashboard.
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = "/host";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Any other /host/* path requires a signed-in user.
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  return response;
}
