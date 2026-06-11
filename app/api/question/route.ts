import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { db, getSession } from "@/lib/server/store";
import { broadcast } from "@/lib/server/broadcast";
import { channels, events } from "@/lib/realtime";
import type { Question } from "@/lib/types";

// POST /api/question — anonymous submission from the audience page.
//   body: { sessionId, body, deviceToken }
// The device token is used ONLY for rate limiting (in-memory) and is never
// stored next to the question — `questions` has no identity columns at all.
export async function POST(req: Request) {
  const body = await readJson<{
    sessionId?: string;
    body?: string;
    deviceToken?: string;
  }>(req);

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  const token = typeof body?.deviceToken === "string" ? body.deviceToken : "";
  if (!sessionId) return fail(400, "mangler_sessionId");
  if (!text || text.length > 280) return fail(400, "ugyldig_sporsmal");
  if (token.length < 8 || token.length > 64) return fail(400, "ugyldig_enhet");

  // Per-device AND per-IP throttle (a device token is trivially regenerated).
  if (
    !rateLimit(`q:${token}`, 5, 60_000) ||
    !rateLimit(`qip:${clientIp(req)}`, 20, 60_000)
  )
    return fail(429, "ro_ned_litt");

  const s = await getSession(sessionId);
  if (!s) return fail(404, "finnes_ikke");
  if (s.status !== "open") return fail(409, "innsending_stengt");

  const { data, error } = await db()
    .from("questions")
    .insert({ session_id: s.id, body: text })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[question:create]", error?.message);
    return fail(500, "kunne_ikke_sende");
  }

  await broadcast(channels.session(s.id), events.questionAdded, {
    questionId: (data as Question).id,
  });
  return ok({ question: data as Question });
}
