import { ok, fail } from "@/lib/server/http";
import { authModerator } from "@/lib/server/auth";
import {
  getSession,
  listQuestions,
  listPolls,
  getPollResults,
} from "@/lib/server/store";
import { toPublicSession, toPublicQuestion } from "@/lib/dto";
import type { Session } from "@/lib/types";

// The active poll (with live tallies) is only meaningful when one is shown.
async function activePollFor(s: Session) {
  return s.active_poll_id ? await getPollResults(s.active_poll_id) : null;
}

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
    const [questions, polls, activePoll] = await Promise.all([
      listQuestions(s.id),
      listPolls(s.id),
      activePollFor(s),
    ]);
    return ok({ session: toPublicSession(s), questions, polls, activePoll });
  }

  const s = await getSession(sessionId);
  if (!s) return fail(404, "finnes_ikke");
  const [allQuestions, polls, activePoll] = await Promise.all([
    listQuestions(s.id),
    listPolls(s.id),
    activePollFor(s),
  ]);
  const questions = allQuestions
    .filter((q) => q.status !== "hidden")
    .map(toPublicQuestion); // strip AI suggestions — audience never sees them
  return ok({ session: toPublicSession(s), questions, polls, activePoll });
}
