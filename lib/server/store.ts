import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Question, Session } from "@/lib/types";

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
