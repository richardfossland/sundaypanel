import { ok, fail, readJson, rateLimit } from "@/lib/server/http";
import { authModerator } from "@/lib/server/auth";
import { db, listQuestions } from "@/lib/server/store";
import { broadcast } from "@/lib/server/broadcast";
import { channels, events } from "@/lib/realtime";
import { getLlmClient } from "@/lib/server/llm";
import {
  moderatableQuestions,
  buildUserPrompt,
  SYSTEM_PROMPT,
  parseVerdicts,
  buildModerationResult,
  summarise,
} from "@/lib/ai/moderation";

// POST /api/moderator/ai — the 'Rydd opp' action. Organiser-code gated.
//   body: { sessionId, organiserCode }
//
// Runs ONE LLM pass over the live inbox/queue and writes back SUGGESTIONS
// (cluster_id / flag_reason / suggested_body). It NEVER changes question status
// — clustering is visual, flags are soft ("foreslått skjult"), rephrases are
// proposals a human accepts. Only question BODIES go to the model; device
// tokens live in panel.votes and never enter this path.
//
// Keyless fallback: no ANTHROPIC_API_KEY → getLlmClient() returns null → we
// reply 503 "ai_ikke_konfigurert". Manual moderation is entirely unaffected.
export async function POST(req: Request) {
  const body = await readJson<{ sessionId?: string; organiserCode?: string }>(
    req,
  );
  const s = await authModerator(body?.sessionId, body?.organiserCode);
  if (!s) return fail(403, "feil_arrangorkode");

  const llm = getLlmClient();
  if (!llm) return fail(503, "ai_ikke_konfigurert");

  // An LLM pass is comparatively expensive; cap it per session.
  if (!rateLimit(`ai:${s.id}`, 5, 60_000)) return fail(429, "ro_ned_litt");

  const all = await listQuestions(s.id);
  const candidates = moderatableQuestions(all);
  if (candidates.length === 0) {
    return ok({ flagged: 0, clustered: 0, rephrased: 0, considered: 0 });
  }

  // Call the model. On any transport/parse failure we degrade gracefully: the
  // existing suggestions are left untouched and we report a soft error so the
  // moderator can retry — manual moderation never blocks on the AI.
  let raw: string;
  try {
    raw = await llm.complete({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(candidates),
      maxTokens: 2048,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    console.error("[moderator:ai] llm error", (err as Error)?.message);
    return fail(502, "ai_feilet");
  }

  const verdicts = parseVerdicts(raw, candidates.length);
  const patches = buildModerationResult(s.id, candidates, verdicts);

  // Write each patch. Every candidate gets a full patch (cleared columns when
  // the model said nothing), so a re-run fully replaces the prior AI pass
  // rather than leaving stale suggestions behind. The model only suggests —
  // status is never touched here.
  await Promise.all(
    patches.map((p) =>
      db()
        .from("questions")
        .update({
          cluster_id: p.cluster_id,
          flag_reason: p.flag_reason,
          suggested_body: p.suggested_body,
        })
        .eq("id", p.id)
        .eq("session_id", s.id),
    ),
  );

  await broadcast(channels.session(s.id), events.stateChanged, {});

  return ok({ ...summarise(patches), considered: candidates.length });
}
