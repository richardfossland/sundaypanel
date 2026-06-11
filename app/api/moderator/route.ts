import { ok, fail, readJson } from "@/lib/server/http";
import { authModerator } from "@/lib/server/auth";
import { db, getQuestion } from "@/lib/server/store";
import { broadcast } from "@/lib/server/broadcast";
import { channels, events } from "@/lib/realtime";
import type { Question, SessionMode, SessionStatus } from "@/lib/types";

// POST /api/moderator — every moderator action, organiser-code gated.
//   body: { sessionId, organiserCode, action, ... }
//   action: 'show'    { questionId | null }  put a question on the big screen
//           'queue'   { questionId, on }     toggle queued
//           'answer'  { questionId }         mark answered (clears live if live)
//           'hide'    { questionId, on }     toggle hidden (clears live if live)
//           'restore' { questionId }         back to status 'new'
//           'mode'    { mode }               curated | open
//           'status'  { status }             open | closed (submission gate)
type Body = {
  sessionId?: string;
  organiserCode?: string;
  action?: string;
  questionId?: string | null;
  on?: boolean;
  mode?: SessionMode;
  status?: SessionStatus;
};

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const s = await authModerator(body?.sessionId, body?.organiserCode);
  if (!s) return fail(403, "feil_arrangorkode");

  const action = body?.action;

  // Session-level actions ------------------------------------------------
  if (action === "mode") {
    if (body?.mode !== "curated" && body?.mode !== "open")
      return fail(400, "ugyldig_modus");
    await db().from("sessions").update({ mode: body.mode }).eq("id", s.id);
    await broadcast(channels.session(s.id), events.stateChanged, {});
    return ok({ mode: body.mode });
  }
  if (action === "status") {
    if (body?.status !== "open" && body?.status !== "closed")
      return fail(400, "ugyldig_status");
    await db().from("sessions").update({ status: body.status }).eq("id", s.id);
    await broadcast(channels.session(s.id), events.stateChanged, {});
    return ok({ status: body.status });
  }

  // Question-level actions -----------------------------------------------
  if (action === "show") {
    // show(null) clears the big screen.
    let q: Question | null = null;
    if (body?.questionId != null) {
      if (typeof body.questionId !== "string") return fail(400, "ugyldig_questionId");
      q = await getQuestion(body.questionId);
      if (!q || q.session_id !== s.id) return fail(404, "finnes_ikke");
      if (q.status === "hidden") return fail(409, "sporsmal_skjult");
    }
    // Previous live question goes back to 'new' (the moderator marks it
    // 'answered' explicitly via the Besvart button when that's what happened).
    if (s.live_question_id && s.live_question_id !== q?.id) {
      await db()
        .from("questions")
        .update({ status: "new" })
        .eq("id", s.live_question_id)
        .eq("status", "live");
    }
    if (q) await db().from("questions").update({ status: "live" }).eq("id", q.id);
    await db()
      .from("sessions")
      .update({ live_question_id: q?.id ?? null })
      .eq("id", s.id);
    await broadcast(channels.session(s.id), events.stateChanged, {});
    return ok({ liveQuestionId: q?.id ?? null });
  }

  const questionId = body?.questionId;
  if (typeof questionId !== "string") return fail(400, "mangler_questionId");
  const q = await getQuestion(questionId);
  if (!q || q.session_id !== s.id) return fail(404, "finnes_ikke");

  const clearLiveIfNeeded = async () => {
    if (s.live_question_id === q.id) {
      await db().from("sessions").update({ live_question_id: null }).eq("id", s.id);
    }
  };

  switch (action) {
    case "queue": {
      const status = body?.on === false ? "new" : "queued";
      if (q.status === "live" && status === "queued")
        return fail(409, "sporsmal_er_live");
      await db().from("questions").update({ status }).eq("id", q.id);
      break;
    }
    case "answer": {
      await db().from("questions").update({ status: "answered" }).eq("id", q.id);
      await clearLiveIfNeeded();
      break;
    }
    case "hide": {
      const status = body?.on === false ? "new" : "hidden";
      await db().from("questions").update({ status }).eq("id", q.id);
      if (status === "hidden") await clearLiveIfNeeded();
      break;
    }
    case "restore": {
      await db().from("questions").update({ status: "new" }).eq("id", q.id);
      await clearLiveIfNeeded();
      break;
    }
    default:
      return fail(400, "ugyldig_action");
  }

  await broadcast(channels.session(s.id), events.stateChanged, {});
  return ok({});
}
