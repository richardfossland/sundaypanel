import { ok, fail, readJson } from "@/lib/server/http";
import { authModerator } from "@/lib/server/auth";
import { db, getQuestion, getPoll } from "@/lib/server/store";
import { broadcast } from "@/lib/server/broadcast";
import { channels, events } from "@/lib/realtime";
import { normalizePollOptions } from "@/lib/poll";
import type { Poll, Question, SessionMode, SessionStatus } from "@/lib/types";

// POST /api/moderator — every moderator action, organiser-code gated.
//   body: { sessionId, organiserCode, action, ... }
//   action: 'show'    { questionId | null }  put a question on the big screen
//           'queue'   { questionId, on }     toggle queued
//           'answer'  { questionId }         mark answered (clears live if live)
//           'hide'    { questionId, on }     toggle hidden (clears live if live)
//           'restore' { questionId }         back to status 'new'
//           'rephrase'{ questionId }         accept the AI suggested_body as the
//                                            new body; clears the suggestion
//           'clearflag' { questionId }       dismiss the AI flag (keeps question)
//           'mode'    { mode }               curated | open | poll
//           'status'  { status }             open | closed (submission gate)
//           'poll'    { pollAction, ... }    live poll lifecycle (see below)
type PollAction =
  | { pollAction: "create"; question?: string; options?: unknown }
  | { pollAction: "open"; pollId?: string }
  | { pollAction: "close"; pollId?: string }
  | { pollAction: "show"; pollId?: string | null };

type Body = {
  sessionId?: string;
  organiserCode?: string;
  action?: string;
  questionId?: string | null;
  on?: boolean;
  mode?: SessionMode;
  status?: SessionStatus;
} & Partial<PollAction>;

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

  // Poll-level actions ---------------------------------------------------
  //   create { question, options }  → new poll (status 'open')
  //   open   { pollId }             → reopen a closed poll
  //   close  { pollId }             → stop accepting responses (keeps tally)
  //   show   { pollId | null }      → put a poll on the big screen / clear it
  if (action === "poll") {
    const pollAction = body?.pollAction;

    if (pollAction === "create") {
      const question =
        typeof body?.question === "string" ? body.question.trim() : "";
      if (!question || question.length > 200)
        return fail(400, "ugyldig_pollsporsmal");
      const options = normalizePollOptions(body?.options);
      if (!options) return fail(400, "ugyldig_alternativer");

      const { data, error } = await db()
        .from("polls")
        .insert({ session_id: s.id, question, options })
        .select("*")
        .single();
      if (error || !data) {
        console.error("[poll:create]", error?.message);
        return fail(500, "kunne_ikke_opprette");
      }
      await broadcast(channels.session(s.id), events.pollChanged, {});
      return ok({ poll: data as Poll });
    }

    // For open/close/show we need a poll that belongs to this session.
    const ensurePoll = async (id: unknown): Promise<Poll | null> => {
      if (typeof id !== "string") return null;
      const p = await getPoll(id);
      return p && p.session_id === s.id ? p : null;
    };

    if (pollAction === "open" || pollAction === "close") {
      const p = await ensurePoll(body?.pollId);
      if (!p) return fail(404, "finnes_ikke");
      const status = pollAction === "open" ? "open" : "closed";
      await db().from("polls").update({ status }).eq("id", p.id);
      await broadcast(channels.session(s.id), events.pollChanged, {});
      return ok({ pollId: p.id, status });
    }

    if (pollAction === "show") {
      // show(null) clears the big screen.
      let pollId: string | null = null;
      if (body?.pollId != null) {
        const p = await ensurePoll(body.pollId);
        if (!p) return fail(404, "finnes_ikke");
        pollId = p.id;
      }
      await db()
        .from("sessions")
        .update({ active_poll_id: pollId })
        .eq("id", s.id);
      await broadcast(channels.session(s.id), events.pollChanged, {});
      return ok({ activePollId: pollId });
    }

    return fail(400, "ugyldig_pollaction");
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
    case "rephrase": {
      // Accept the AI-suggested rephrase: the suggestion BECOMES the body, and
      // both AI columns clear (the suggestion is now applied, the flag stale).
      // A human chose this; the model only proposed it. No-op if there's none.
      const suggested =
        typeof q.suggested_body === "string" ? q.suggested_body.trim() : "";
      if (!suggested || suggested.length > 280)
        return fail(409, "ingen_omformulering");
      await db()
        .from("questions")
        .update({ body: suggested, suggested_body: null, flag_reason: null })
        .eq("id", q.id);
      break;
    }
    case "clearflag": {
      // Dismiss the soft AI flag / suggestion without touching status or body.
      await db()
        .from("questions")
        .update({ flag_reason: null, suggested_body: null })
        .eq("id", q.id);
      break;
    }
    default:
      return fail(400, "ugyldig_action");
  }

  await broadcast(channels.session(s.id), events.stateChanged, {});
  return ok({});
}
