import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { db, getSessionByCode } from "@/lib/server/store";
import { getHost } from "@/lib/server/auth";
import { generateWordCode, normalizeWordCode } from "@/lib/codes";
import { toPublicSession } from "@/lib/dto";
import type { Session } from "@/lib/types";

// POST /api/session — create a panel session.
//   body: { title }
//   → { session (public), organiserCode }  — organiser code shown ONCE here.
//
// OWNER WIRING: if a signed-in Sunday Account host is making the request, the
// new panel is stamped with their user id (owner_id) so it shows up in their
// "Mine paneler" dashboard. ANONYMOUS CREATE STILL WORKS: with no/invalid
// session cookie, getHost() returns null and owner_id stays null — the flow is
// byte-for-byte the same as before for the anonymous case.
export async function POST(req: Request) {
  if (!rateLimit(`create:${clientIp(req)}`, 5, 60_000))
    return fail(429, "for_mange_foresporsler");

  const body = await readJson<{ title?: string }>(req);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 120) return fail(400, "ugyldig_tittel");

  // Best-effort owner stamp — never blocks anonymous create.
  const host = await getHost();
  const ownerId = host?.id ?? null;

  // Word-code collisions are astronomically unlikely (23^6 ≈ 148M) but retry a
  // few times anyway; the unique constraint is the real guard.
  for (let i = 0; i < 5; i++) {
    const code = generateWordCode();
    const organiserCode = generateWordCode();
    const { data, error } = await db()
      .from("sessions")
      .insert({ code, title, organiser_code: organiserCode, owner_id: ownerId })
      .select("*")
      .single();
    if (!error && data) {
      const s = data as Session;
      return ok({ session: toPublicSession(s), organiserCode: s.organiser_code });
    }
    if (error && !error.message.includes("duplicate")) {
      console.error("[session:create]", error.message);
      return fail(500, "kunne_ikke_opprette");
    }
  }
  return fail(500, "kunne_ikke_opprette");
}

// GET /api/session?code=XXXX-XX — resolve a public session code (join flow).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = normalizeWordCode(searchParams.get("code") ?? "");
  if (!code) return fail(400, "mangler_kode");
  const s = await getSessionByCode(code);
  if (!s) return fail(404, "finnes_ikke");
  return ok({ session: toPublicSession(s) });
}
