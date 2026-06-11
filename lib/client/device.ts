"use client";

// Anonymous per-device identity, used ONLY for vote dedupe + rate limiting.
// Random UUID in localStorage; never linked to question content server-side.

const TOKEN_KEY = "panel:device";
const MINE_KEY = "panel:mine"; // ids of questions submitted from this device
const VOTED_KEY = "panel:voted"; // ids this device has upvoted

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
