import type {
  PublicQuestion,
  PublicSession,
  Question,
  Session,
} from "@/lib/types";

/** Strip server-only fields before a session leaves the API. The organiser
 * code must NEVER reach audience/board clients. */
export function toPublicSession(s: Session): PublicSession {
  return {
    id: s.id,
    code: s.code,
    title: s.title,
    mode: s.mode,
    status: s.status,
    live_question_id: s.live_question_id,
    active_poll_id: s.active_poll_id,
  };
}

/** Strip AI-moderation suggestions before a question leaves the API to a public
 * (audience/board) client. flag_reason / suggested_body / cluster_id are
 * moderator-only — the audience sees the original body unchanged and is never
 * told a question was flagged or that a rephrase was suggested. */
export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    session_id: q.session_id,
    body: q.body,
    status: q.status,
    vote_count: q.vote_count,
    created_at: q.created_at,
  };
}
