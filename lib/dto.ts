import type { PublicSession, Session } from "@/lib/types";

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
