// Shared types between server (API routes) and client (pages).

export type SessionMode = "curated" | "open";
export type SessionStatus = "open" | "closed";
export type QuestionStatus = "new" | "queued" | "live" | "answered" | "hidden";

export interface Session {
  id: string;
  code: string;
  title: string;
  mode: SessionMode;
  status: SessionStatus;
  organiser_code: string; // never sent to public clients
  live_question_id: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  session_id: string;
  body: string;
  status: QuestionStatus;
  vote_count: number;
  created_at: string;
  // AI-assisted moderation suggestions (migration 0002). Populated only by an
  // organiser-triggered 'Rydd opp' pass; null until then. These are SUGGESTIONS
  // surfaced in the moderator UI — never acted on automatically, never sent to
  // public/board audiences (stripped by toPublicQuestion).
  cluster_id?: string | null;
  flag_reason?: string | null;
  suggested_body?: string | null;
}

/** What public clients (audience + board) see: the original body and vote count,
 * with all AI moderation suggestions stripped. The audience must never learn
 * that a question was flagged or rephrase-suggested. */
export interface PublicQuestion {
  id: string;
  session_id: string;
  body: string;
  status: QuestionStatus;
  vote_count: number;
  created_at: string;
}

/** What public clients (audience page + board) get: no organiser code. */
export interface PublicSession {
  id: string;
  code: string;
  title: string;
  mode: SessionMode;
  status: SessionStatus;
  live_question_id: string | null;
}

export interface PublicState {
  session: PublicSession;
  questions: PublicQuestion[]; // hidden questions excluded, AI fields stripped
}

export interface ModeratorState {
  session: PublicSession;
  questions: Question[]; // includes hidden
}
