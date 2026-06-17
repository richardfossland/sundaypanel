import "server-only";

// Minimal Anthropic Messages API seam — SERVER ONLY. Mirrors the shape of
// `createServiceClient` (lib/supabase/service.ts): a factory that returns null
// when the relevant env var is absent, so callers degrade gracefully instead of
// crashing. The API key lives only in server env (Cloudflare Worker secret /
// `ANTHROPIC_API_KEY`) and never reaches the client bundle.
//
// We hit the REST endpoint directly with fetch (the repo has no SDK dependency
// and runs on the OpenNext/Cloudflare Workers runtime where fetch is native) —
// the same plain-fetch style as lib/server/broadcast.ts.

// Current Opus. Kept as a single constant so a model bump is one edit.
export const ANTHROPIC_MODEL = "claude-opus-4-8";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface LlmClient {
  /** Single-shot completion. Returns the concatenated text of the response, or
   * throws on a non-2xx / transport error (the caller decides how to degrade). */
  complete(args: {
    system: string;
    user: string;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<string>;
}

/** Returns an LlmClient, or null when ANTHROPIC_API_KEY is unset. A null client
 * is the keyless-fallback signal: the route reports "AI ikke konfigurert" and
 * manual moderation is unaffected. */
export function getLlmClient(): LlmClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return {
    async complete({ system, user, maxTokens, signal }) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`anthropic_${res.status}: ${detail.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      // Concatenate text blocks; ignore any thinking/tool blocks defensively.
      return (data.content ?? [])
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
    },
  };
}
