import { ok, fail } from "@/lib/server/http";
import { authModerator } from "@/lib/server/auth";
import { getSession, listQuestions } from "@/lib/server/store";
import { toPublicSession } from "@/lib/dto";

// GET /api/state?sessionId=…[&organiserCode=…]
// Public (audience/board): hidden questions are stripped server-side.
// With a valid organiser code: full list including hidden.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") ?? "";
  if (!sessionId) return fail(400, "mangler_sessionId");

  const organiserCode = searchParams.get("organiserCode");
  if (organiserCode !== null) {
    const s = await authModerator(sessionId, organiserCode);
    if (!s) return fail(403, "feil_arrangorkode");
    const questions = await listQuestions(s.id);
    return ok({ session: toPublicSession(s), questions });
  }

  const s = await getSession(sessionId);
  if (!s) return fail(404, "finnes_ikke");
  const questions = (await listQuestions(s.id)).filter(
    (q) => q.status !== "hidden",
  );
  return ok({ session: toPublicSession(s), questions });
}
