import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { db, getPoll, getSession } from "@/lib/server/store";
import { broadcast } from "@/lib/server/broadcast";
import { channels, events } from "@/lib/realtime";

// POST /api/poll-vote — cast (or change) this device's answer to a live poll.
//   body: { pollId, deviceToken, choice }
// Backed by the atomic SECURITY DEFINER cast_poll_response RPC, which dedupes
// on (poll_id, device_token), validates choice ∈ options, and refuses closed
// polls — so all authority lives in the DB; this route is the gated front door.
// Anonymity is identical to /api/vote: the device token is used only for
// dedup, never linked to the device's choice in any way that leaves the DB.
export async function POST(req: Request) {
  const body = await readJson<{
    pollId?: string;
    deviceToken?: string;
    choice?: string;
  }>(req);

  const pollId = typeof body?.pollId === "string" ? body.pollId : "";
  const token = typeof body?.deviceToken === "string" ? body.deviceToken : "";
  const choice = typeof body?.choice === "string" ? body.choice : "";
  if (!pollId) return fail(400, "mangler_pollId");
  if (token.length < 8 || token.length > 64) return fail(400, "ugyldig_enhet");
  if (!choice || choice.length > 60) return fail(400, "ugyldig_valg");

  if (
    !rateLimit(`pv:${token}`, 30, 60_000) ||
    !rateLimit(`pvip:${clientIp(req)}`, 120, 60_000)
  )
    return fail(429, "ro_ned_litt");

  const poll = await getPoll(pollId);
  if (!poll) return fail(404, "finnes_ikke");
  const s = await getSession(poll.session_id);
  if (!s) return fail(404, "finnes_ikke");
  if (s.status !== "open") return fail(409, "innsending_stengt");

  const { data, error } = await db().rpc("cast_poll_response", {
    p_poll_id: pollId,
    p_device_token: token,
    p_choice: choice,
  });
  if (error) {
    console.error("[poll-vote]", error.message);
    return fail(500, "kunne_ikke_stemme");
  }
  // RPC returns null for a closed poll or an invalid choice (defence in depth).
  if (data == null) return fail(409, "stemme_avvist");

  await broadcast(channels.session(poll.session_id), events.pollChanged, {
    pollId,
  });
  return ok({ choice: data as string });
}
