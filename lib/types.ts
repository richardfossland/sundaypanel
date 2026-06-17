// Shared types between server (API routes) and client (pages).

export type SessionMode = "curated" | "open" | "poll";
export type SessionStatus = "open" | "closed";
export type QuestionStatus = "new" | "queued" | "live" | "answered" | "hidden";
export type PollStatus = "open" | "closed";

export interface Session {
  id: string;
  code: string;
  title: string;
  mode: SessionMode;
  status: SessionStatus;
  organiser_code: string; // never sent to public clients
  live_question_id: string | null;
  active_poll_id: string | null;
  created_at: string;
}

export interface Poll {
  id: string;
  session_id: string;
  question: string;
  options: string[];
  status: PollStatus;
  created_at: string;
}

/** A poll plus its live tally. `counts[option]` is how many devices picked
 * that option; `total` is the sum. Aggregated server-side from
 * poll_responses so raw responses (device tokens) never leave the server. */
export interface PollResults {
  poll: Poll;
  counts: Record<string, number>;
  total: number;
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
  active_poll_id: string | null;
}

export interface PublicState {
  session: PublicSession;
  questions: Question[]; // hidden questions excluded
  polls: Poll[]; // newest first
  activePoll: PollResults | null; // the poll on the big screen, with tallies
}

export interface ModeratorState {
  session: PublicSession;
  questions: Question[]; // includes hidden
  polls: Poll[];
  activePoll: PollResults | null;
}
