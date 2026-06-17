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
