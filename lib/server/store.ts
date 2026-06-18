import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Poll, PollResults, Question, Session } from "@/lib/types";
import { tallyPoll } from "@/lib/poll";

let client: ReturnType<typeof createServiceClient> | null = null;

/** Lazy singleton service client (per worker isolate). */
export function db() {
  if (!client) client = createServiceClient();
  return client;
}

export async function getSession(id: string): Promise<Session | null> {
  const { data } = await db().from("sessions").select("*").eq("id", id).maybeSingle();
  return (data as Session | null) ?? null;
}

export async function getSessionByCode(code: string): Promise<Session | null> {
  const { data } = await db()
    .from("sessions")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  return (data as Session | null) ?? null;
}

/** All questions for a session, oldest first (clients sort as they wish). */
export async function listQuestions(sessionId: string): Promise<Question[]> {
  const { data, error } = await db()
    .from("questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listQuestions: ${error.message}`);
  return (data as Question[]) ?? [];
}

export async function getQuestion(id: string): Promise<Question | null> {
  const { data } = await db().from("questions").select("*").eq("id", id).maybeSingle();
  return (data as Question | null) ?? null;
}

// ---------------------------------------------------------- Sunday host owner
// Panels created by a logged-in Sunday Account host (owner_id stamped on
// create). Powers the "Mine paneler" dashboard + the owner-gated DELETE route.

/** All sessions owned by a given Sunday Account host, newest first. */
export async function listSessionsByOwner(ownerId: string): Promise<Session[]> {
  const { data, error } = await db()
    .from("sessions")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listSessionsByOwner: ${error.message}`);
  return (data as Session[]) ?? [];
}

/** Delete a session the host owns. Returns true if a row was deleted, false if
 * the session does not exist or is owned by someone else (owner-gated: the
 * .eq("owner_id", ownerId) is the authorization check, so a host can never
 * delete a panel they don't own). Children (questions/votes/polls/poll_responses)
 * are removed automatically by ON DELETE CASCADE. */
export async function deleteSessionForOwner(
  sessionId: string,
  ownerId: string,
): Promise<boolean> {
  const { data, error } = await db()
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(`deleteSessionForOwner: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** All polls for a session, newest first. */
export async function listPolls(sessionId: string): Promise<Poll[]> {
  const { data, error } = await db()
    .from("polls")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPolls: ${error.message}`);
  return (data as Poll[]) ?? [];
}

export async function getPoll(id: string): Promise<Poll | null> {
  const { data } = await db().from("polls").select("*").eq("id", id).maybeSingle();
  return (data as Poll | null) ?? null;
}

/** A poll plus its live tally. Reads only the `choice` column — device tokens
 * never leave the server — and aggregates with the pure tallyPoll helper. */
export async function getPollResults(pollId: string): Promise<PollResults | null> {
  const poll = await getPoll(pollId);
  if (!poll) return null;
  const { data, error } = await db()
    .from("poll_responses")
    .select("choice")
    .eq("poll_id", pollId);
  if (error) throw new Error(`getPollResults: ${error.message}`);
  const choices = ((data as { choice: string }[]) ?? []).map((r) => r.choice);
  return tallyPoll(poll, choices);
}
