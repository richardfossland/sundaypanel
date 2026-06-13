"use client";

// Anonymous per-device identity, used ONLY for vote dedupe + rate limiting.
// Random UUID in localStorage; never linked to question content server-side.

const TOKEN_KEY = "panel:device";
const MINE_KEY = "panel:mine"; // ids of questions submitted from this device
const VOTED_KEY = "panel:voted"; // ids this device has upvoted
const POLL_KEY = "panel:pollChoices"; // pollId → choice this device picked

export function deviceToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  // Cap so localStorage can't grow unbounded across many events.
  localStorage.setItem(key, JSON.stringify(ids.slice(-500)));
}

export function myQuestionIds(): Set<string> {
  return new Set(readIds(MINE_KEY));
}

export function rememberMyQuestion(id: string) {
  writeIds(MINE_KEY, [...readIds(MINE_KEY), id]);
}

export function votedIds(): Set<string> {
  return new Set(readIds(VOTED_KEY));
}

export function setVoted(id: string, on: boolean) {
  const cur = new Set(readIds(VOTED_KEY));
  if (on) cur.add(id);
  else cur.delete(id);
  writeIds(VOTED_KEY, [...cur]);
}

// ---- poll choices (which option this device picked, per poll) ----
// Mirrors the dedup model: this is purely UI memory of the device's own
// answer, never linked to identity. The server's PK(poll_id, device_token)
// is the real one-vote guard.
function readMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj))
      if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function pollChoices(): Record<string, string> {
  return readMap(POLL_KEY);
}

export function setPollChoice(pollId: string, choice: string) {
  const cur = readMap(POLL_KEY);
  cur[pollId] = choice;
  // Cap entries so it can't grow unbounded across many polls.
  const entries = Object.entries(cur).slice(-200);
  localStorage.setItem(POLL_KEY, JSON.stringify(Object.fromEntries(entries)));
}
