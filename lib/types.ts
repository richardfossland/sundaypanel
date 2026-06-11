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
  questions: Question[]; // hidden questions excluded
}

export interface ModeratorState {
  session: PublicSession;
  questions: Question[]; // includes hidden
}
