import type { Poll, PollResults } from "@/lib/types";

/** Pure tally aggregation: turn a poll + its raw response choices into a
 * results object. Every declared option is present in `counts` (zero if
 * nobody picked it, so the board renders a full bar set); responses whose
 * choice isn't a declared option are ignored defensively (the RPC already
 * blocks them, but a stale option edit shouldn't crash the board).
 *
 * Kept free of any device identity on purpose — callers pass only the choice
 * strings, never device tokens, preserving the anonymity model. */
export function tallyPoll(poll: Poll, choices: string[]): PollResults {
  const counts: Record<string, number> = {};
  for (const opt of poll.options) counts[opt] = 0;
  let total = 0;
  for (const choice of choices) {
    if (Object.prototype.hasOwnProperty.call(counts, choice)) {
      counts[choice] += 1;
      total += 1;
    }
  }
  return { poll, counts, total };
}

/** Validate a moderator-supplied option list: 2–8 trimmed, non-empty,
 * deduplicated, each ≤ 60 chars. Returns the cleaned list or null if invalid.
 * Used by the API route before persisting a poll. */
export function normalizePollOptions(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v || v.length > 60) return null;
    if (seen.has(v)) continue; // drop exact duplicates
    seen.add(v);
    out.push(v);
  }
  if (out.length < 2 || out.length > 8) return null;
  return out;
}
