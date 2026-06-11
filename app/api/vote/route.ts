import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { db, getQuestion, getSession } from "@/lib/server/store";
import { broadcast } from "@/lib/server/broadcast";
import { channels, events } from "@/lib/realtime";

// POST /api/vote — toggle an upvote.
//   body: { questionId, deviceToken, on: boolean }
// Backed by the atomic SECURITY DEFINER RPCs; double votes are no-ops there.
export async function POST(req: Request) {
  const body = await readJson<{
    questionId?: string;
    deviceToken?: string;
    on?: boolean;
  }>(req);

  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  const token = typeof body?.deviceToken === "string" ? body.deviceToken : "";
  if (!questionId) return fail(400, "mangler_questionId");
  if (token.length < 8 || token.length > 64) return fail(400, "ugyldig_enhet");

  if (
    !rateLimit(`v:${token}`, 30, 60_000) ||
    !rateLimit(`vip:${clientIp(req)}`, 120, 60_000)
  )
    return fail(429, "ro_ned_litt");

  const q = await getQuestion(questionId);
  if (!q || q.status === "hidden") return fail(404, "finnes_ikke");
  const s = await getSession(q.session_id);
  if (!s) return fail(404, "finnes_ikke");
  if (s.status !== "open") return fail(409, "innsending_stengt");

  const fn = body?.on === false ? "remove_vote" : "add_vote";
  const { data, error } = await db().rpc(fn, {
    p_question_id: questionId,
    p_device_token: token,
  });
  if (error) {
    console.error("[vote]", error.message);
    return fail(500, "kunne_ikke_stemme");
  }

  await broadcast(channels.session(q.session_id), events.voteChanged, {
    questionId,
  });
  return ok({ voteCount: data as number });
}
