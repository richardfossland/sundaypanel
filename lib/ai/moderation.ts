// AI-assisted moderation — PURE functions (no network, no env, no DB).
//
// This is where the real test coverage lives (test/ai-moderation.test.ts). The
// request builder and the response parser/sanitiser are deterministic given
// their inputs, so they're exercised with canned fixtures and no API key.
//
// Contract with the rest of the app:
//   - Only question BODIES are ever sent to the model (anonymity: device tokens
//     live in panel.votes and never enter this module).
//   - The model only SUGGESTS. buildModerationResult() validates/sanitises the
//     model output against a strict shape and clamps it to the questions that
//     actually exist before it touches app state. It NEVER produces a hide/show
//     decision — flags are soft ("foreslått skjult"), clusters are visual.

import type { Question } from "@/lib/types";

// ---- DB-column bounds (must match supabase/migrations/0002_ai_moderation.sql) ----
export const FLAG_REASON_MAX = 200;
export const BODY_MAX = 280;

/** What the model is asked to return, per question. */
export interface AiQuestionVerdict {
  /** Index into the questions array we sent (0-based). */
  i: number;
  /** Cluster label — questions sharing a non-null clusterKey are "the same".
   * A standalone question may omit it or use a unique key. */
  clusterKey?: string | null;
  /** Soft moderation flag. Norwegian, short. null/absent = clean. */
  flagReason?: string | null;
  /** Optional neutral rephrase. null/absent = keep original. */
  suggestedBody?: string | null;
}

/** The sanitised, app-ready suggestion for one question, keyed by question id. */
export interface QuestionSuggestion {
  id: string;
  /** Shared across a cluster; null for standalone questions. */
  clusterId: string | null;
  flagReason: string | null;
  suggestedBody: string | null;
}

/** What gets written back to panel.questions for one question. Always present
 * for every input question (cleared columns when the model said nothing), so a
 * re-run fully replaces a prior AI pass rather than leaving stale suggestions. */
export interface ModerationPatch {
  id: string;
  cluster_id: string | null;
  flag_reason: string | null;
  suggested_body: string | null;
}

// Questions in these statuses are already resolved by a human — don't re-surface
// them in an AI pass. We only consider the live inbox/queue.
const MODERATABLE: ReadonlySet<string> = new Set(["new", "queued", "live"]);

/** The questions an AI pass should consider. Pure filter, stable order. */
export function moderatableQuestions(questions: Question[]): Question[] {
  return questions.filter((q) => MODERATABLE.has(q.status));
}

// ---------------------------------------------------------------- prompt
export const SYSTEM_PROMPT = [
  "Du er en hjelpsom moderator-assistent for en anonym spørsmål-og-svar-vegg",
  "i en norsk kristen ungdomssammenheng (menighet/bedehus).",
  "Du får en nummerert liste med spørsmål fra publikum.",
  "Oppgaven din er KUN å foreslå — et menneske bestemmer alltid til slutt.",
  "",
  "For hvert spørsmål, vurder:",
  '1. Klynge: Hvis flere spørsmål egentlig spør om det samme, gi dem samme korte "clusterKey" (f.eks. "daap", "ondskap"). Ellers la den stå tom.',
  '2. Flagg: Hvis et spørsmål sannsynligvis er upassende, trolling, useriøst eller helt utenfor tema, sett en KORT norsk "flagReason" (maks 200 tegn). Ellers la den stå tom. Vær varsom — ekte, ærlige spørsmål skal ALDRI flagges.',
  '3. Omformulering: Hvis et spørsmål kan formuleres mer nøytralt/vennlig uten å endre meningen, foreslå "suggestedBody" (maks 280 tegn). Ellers la den stå tom.',
  "",
  "Svar KUN med gyldig JSON på formen:",
  '{"verdicts":[{"i":0,"clusterKey":"...","flagReason":"...","suggestedBody":"..."}]}',
  "Bruk null eller utelat felt der du ikke har noe forslag. Ikke skriv noe utenfor JSON-objektet.",
].join("\n");

/** Build the user message: a numbered list of question bodies. ONLY bodies. */
export function buildUserPrompt(questions: Question[]): string {
  const lines = questions.map((q, i) => `${i}. ${q.body}`);
  return [
    "Her er spørsmålene (indeks. tekst):",
    "",
    ...lines,
    "",
    `Returner JSON med ett verdict per spørsmål du har noe å si om (indeks 0–${questions.length - 1}).`,
  ].join("\n");
}

// ---------------------------------------------------------------- parsing
/** Extract the first balanced top-level JSON object from a model reply. Tolerates
 * leading/trailing prose or ```json fences. Returns null if none parses. */
export function extractJson(raw: string): unknown {
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  if (start < 0) return null;
  // Scan for the matching closing brace, respecting strings/escapes.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = raw.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Parse the model reply into validated per-question verdicts, dropping anything
 * malformed or out of range. Pure: no IDs assigned yet (that needs the questions
 * array). `count` is how many questions we sent. */
export function parseVerdicts(raw: string, count: number): AiQuestionVerdict[] {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== "object") return [];
  const verdicts = (obj as { verdicts?: unknown }).verdicts;
  if (!Array.isArray(verdicts)) return [];

  const seen = new Set<number>();
  const out: AiQuestionVerdict[] = [];
  for (const v of verdicts) {
    if (!v || typeof v !== "object") continue;
    const i = (v as { i?: unknown }).i;
    if (typeof i !== "number" || !Number.isInteger(i)) continue;
    if (i < 0 || i >= count) continue; // hallucinated index
    if (seen.has(i)) continue; // first verdict per index wins
    seen.add(i);

    const clusterKeyRaw = (v as { clusterKey?: unknown }).clusterKey;
    const clusterKey = clampText(clusterKeyRaw, 64);
    out.push({
      i,
      clusterKey,
      flagReason: clampText((v as { flagReason?: unknown }).flagReason, FLAG_REASON_MAX),
      suggestedBody: clampText((v as { suggestedBody?: unknown }).suggestedBody, BODY_MAX),
    });
  }
  return out;
}

// ---------------------------------------------------------------- assembly
/** Deterministic UUID v4-shaped id from a seed (so cluster ids are stable per
 * run and testable without a RNG). Not cryptographic — these ids only group
 * rows visually. */
export function clusterIdFromKey(sessionId: string, key: string): string {
  // FNV-1a over the seed → 128 bits → format as a v4-shaped uuid.
  const seed = `${sessionId}:${key}`;
  const bytes = new Uint8Array(16);
  let h = 0x811c9dc5;
  for (let b = 0; b < 16; b++) {
    for (let j = b; j < seed.length; j += 16) {
      h ^= seed.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
    bytes[b] = h & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Turn validated verdicts + the questions we sent into write-back patches.
 *
 * Rules enforced here (the model cannot bypass them):
 *   - Every input question gets exactly one patch. Questions with no verdict get
 *     all-null columns, so a re-run clears stale AI output.
 *   - A clusterKey only becomes a real cluster_id if at least TWO questions share
 *     it — a "cluster of one" is meaningless, so it's dropped to null.
 *   - A suggestedBody identical to the original body is dropped (no-op rephrase).
 *   - flag_reason / suggested_body are length-clamped to the DB constraints.
 */
export function buildModerationResult(
  sessionId: string,
  questions: Question[],
  verdicts: AiQuestionVerdict[],
): ModerationPatch[] {
  const byIndex = new Map<number, AiQuestionVerdict>();
  for (const v of verdicts) byIndex.set(v.i, v);

  // Count how many questions carry each clusterKey to drop singletons.
  const keyCounts = new Map<string, number>();
  for (const v of verdicts) {
    if (v.clusterKey) keyCounts.set(v.clusterKey, (keyCounts.get(v.clusterKey) ?? 0) + 1);
  }

  return questions.map((q, idx) => {
    const v = byIndex.get(idx);
    const key = v?.clusterKey ?? null;
    const isRealCluster = key !== null && (keyCounts.get(key) ?? 0) >= 2;
    const suggested =
      v?.suggestedBody && v.suggestedBody !== q.body ? v.suggestedBody : null;
    return {
      id: q.id,
      cluster_id: isRealCluster ? clusterIdFromKey(sessionId, key as string) : null,
      flag_reason: v?.flagReason ?? null,
      suggested_body: suggested,
    };
  });
}

/** Summary counts for the API response / UI toast. Pure. */
export function summarise(patches: ModerationPatch[]): {
  flagged: number;
  clustered: number;
  rephrased: number;
} {
  const clusters = new Set<string>();
  let flagged = 0;
  let rephrased = 0;
  for (const p of patches) {
    if (p.flag_reason) flagged++;
    if (p.suggested_body) rephrased++;
    if (p.cluster_id) clusters.add(p.cluster_id);
  }
  return { flagged, clustered: clusters.size, rephrased };
}
