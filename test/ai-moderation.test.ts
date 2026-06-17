import { describe, it, expect } from "vitest";
import {
  moderatableQuestions,
  buildUserPrompt,
  SYSTEM_PROMPT,
  extractJson,
  parseVerdicts,
  buildModerationResult,
  summarise,
  clusterIdFromKey,
  FLAG_REASON_MAX,
  BODY_MAX,
} from "@/lib/ai/moderation";
import type { Question } from "@/lib/types";

// Minimal Question factory — only the fields the pure functions read.
function q(partial: Partial<Question> & { id: string; body: string }): Question {
  return {
    session_id: "s1",
    status: "new",
    vote_count: 0,
    created_at: "2026-06-13T00:00:00Z",
    ...partial,
  };
}

describe("moderatableQuestions", () => {
  it("keeps new/queued/live, drops answered/hidden", () => {
    const list = [
      q({ id: "a", body: "x", status: "new" }),
      q({ id: "b", body: "x", status: "queued" }),
      q({ id: "c", body: "x", status: "live" }),
      q({ id: "d", body: "x", status: "answered" }),
      q({ id: "e", body: "x", status: "hidden" }),
    ];
    expect(moderatableQuestions(list).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("preserves order", () => {
    const list = [q({ id: "2", body: "b" }), q({ id: "1", body: "a" })];
    expect(moderatableQuestions(list).map((x) => x.id)).toEqual(["2", "1"]);
  });
});

describe("buildUserPrompt — anonymity + shape", () => {
  it("contains ONLY the bodies, numbered, never ids/tokens", () => {
    const list = [
      q({ id: "secret-id-1", body: "Hvorfor finnes ondskap?" }),
      q({ id: "secret-id-2", body: "Hva er nåde?" }),
    ];
    const prompt = buildUserPrompt(list);
    expect(prompt).toContain("0. Hvorfor finnes ondskap?");
    expect(prompt).toContain("1. Hva er nåde?");
    // The DB ids must never leak into the model prompt.
    expect(prompt).not.toContain("secret-id-1");
    expect(prompt).not.toContain("secret-id-2");
  });
  it("system prompt is Norwegian and forbids prose-outside-JSON", () => {
    expect(SYSTEM_PROMPT).toContain("moderator");
    expect(SYSTEM_PROMPT).toContain("KUN");
  });
});

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("tolerates prose before/after", () => {
    expect(extractJson('Her er svaret: {"a":1} ferdig.')).toEqual({ a: 1 });
  });
  it("tolerates ```json fences and nested braces", () => {
    const raw = '```json\n{"verdicts":[{"i":0,"clusterKey":"x"}]}\n```';
    expect(extractJson(raw)).toEqual({ verdicts: [{ i: 0, clusterKey: "x" }] });
  });
  it("respects braces inside strings", () => {
    expect(extractJson('{"t":"a } b"}')).toEqual({ t: "a } b" });
  });
  it("returns null on garbage / no json", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{ not valid")).toBeNull();
  });
});

describe("parseVerdicts — validation + sanitisation", () => {
  it("parses a clean response", () => {
    const raw = JSON.stringify({
      verdicts: [
        { i: 0, clusterKey: "daap", flagReason: null, suggestedBody: null },
        { i: 1, flagReason: "useriøst" },
      ],
    });
    const v = parseVerdicts(raw, 2);
    expect(v).toEqual([
      { i: 0, clusterKey: "daap", flagReason: null, suggestedBody: null },
      { i: 1, clusterKey: null, flagReason: "useriøst", suggestedBody: null },
    ]);
  });
  it("drops hallucinated / out-of-range indices", () => {
    const raw = JSON.stringify({
      verdicts: [{ i: 0 }, { i: 5 }, { i: -1 }, { i: 1.5 }],
    });
    expect(parseVerdicts(raw, 2).map((x) => x.i)).toEqual([0]);
  });
  it("keeps only the first verdict per index", () => {
    const raw = JSON.stringify({
      verdicts: [
        { i: 0, flagReason: "først" },
        { i: 0, flagReason: "andre" },
      ],
    });
    const v = parseVerdicts(raw, 1);
    expect(v).toHaveLength(1);
    expect(v[0].flagReason).toBe("først");
  });
  it("clamps over-long flag/body to DB bounds and trims blanks to null", () => {
    const raw = JSON.stringify({
      verdicts: [
        {
          i: 0,
          flagReason: "x".repeat(FLAG_REASON_MAX + 50),
          suggestedBody: "y".repeat(BODY_MAX + 50),
        },
        { i: 1, flagReason: "   ", suggestedBody: "" },
      ],
    });
    const v = parseVerdicts(raw, 2);
    expect(v[0].flagReason).toHaveLength(FLAG_REASON_MAX);
    expect(v[0].suggestedBody).toHaveLength(BODY_MAX);
    expect(v[1].flagReason).toBeNull();
    expect(v[1].suggestedBody).toBeNull();
  });
  it("returns [] on malformed model output (graceful)", () => {
    expect(parseVerdicts("totally not json", 3)).toEqual([]);
    expect(parseVerdicts(JSON.stringify({ verdicts: "nope" }), 3)).toEqual([]);
    expect(parseVerdicts(JSON.stringify({}), 3)).toEqual([]);
  });
});

describe("clusterIdFromKey — deterministic, uuid-v4-shaped", () => {
  it("is stable for a given seed", () => {
    expect(clusterIdFromKey("s1", "daap")).toBe(clusterIdFromKey("s1", "daap"));
  });
  it("differs by session and by key", () => {
    expect(clusterIdFromKey("s1", "daap")).not.toBe(clusterIdFromKey("s2", "daap"));
    expect(clusterIdFromKey("s1", "daap")).not.toBe(clusterIdFromKey("s1", "naade"));
  });
  it("looks like a v4 uuid", () => {
    expect(clusterIdFromKey("s1", "daap")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("buildModerationResult — the model only suggests", () => {
  const questions = [
    q({ id: "A", body: "Blir man frelst ved dåpen?" }),
    q({ id: "B", body: "Hva betyr dåp egentlig?" }),
    q({ id: "C", body: "Liker du pizza, pastor?" }),
  ];

  it("emits exactly one patch per input question (clears stale on re-run)", () => {
    const patches = buildModerationResult("s1", questions, []);
    expect(patches.map((p) => p.id)).toEqual(["A", "B", "C"]);
    expect(patches.every((p) => p.cluster_id === null)).toBe(true);
    expect(patches.every((p) => p.flag_reason === null)).toBe(true);
    expect(patches.every((p) => p.suggested_body === null)).toBe(true);
  });

  it("promotes a shared clusterKey only when >= 2 questions share it", () => {
    const verdicts = [
      { i: 0, clusterKey: "daap" },
      { i: 1, clusterKey: "daap" },
      { i: 2, clusterKey: "mat" }, // singleton — dropped to null
    ];
    const patches = buildModerationResult("s1", questions, verdicts);
    expect(patches[0].cluster_id).not.toBeNull();
    expect(patches[0].cluster_id).toBe(patches[1].cluster_id); // same cluster
    expect(patches[2].cluster_id).toBeNull(); // cluster-of-one dropped
  });

  it("carries the flag reason through", () => {
    const verdicts = [{ i: 2, flagReason: "useriøst, utenfor tema" }];
    const patches = buildModerationResult("s1", questions, verdicts);
    expect(patches[2].flag_reason).toBe("useriøst, utenfor tema");
  });

  it("drops a rephrase identical to the original body", () => {
    const verdicts = [
      { i: 0, suggestedBody: questions[0].body }, // no-op
      { i: 1, suggestedBody: "Hva betyr dåp?" }, // real change
    ];
    const patches = buildModerationResult("s1", questions, verdicts);
    expect(patches[0].suggested_body).toBeNull();
    expect(patches[1].suggested_body).toBe("Hva betyr dåp?");
  });

  it("never produces a status / hide decision (shape check)", () => {
    const verdicts = [{ i: 2, flagReason: "trolling" }];
    const patches = buildModerationResult("s1", questions, verdicts);
    for (const p of patches) {
      expect(Object.keys(p).sort()).toEqual([
        "cluster_id",
        "flag_reason",
        "id",
        "suggested_body",
      ]);
    }
  });
});

describe("summarise", () => {
  it("counts flagged, distinct clusters, rephrased", () => {
    const cid = clusterIdFromKey("s1", "daap");
    const patches = [
      { id: "A", cluster_id: cid, flag_reason: null, suggested_body: null },
      { id: "B", cluster_id: cid, flag_reason: null, suggested_body: "ny" },
      { id: "C", cluster_id: null, flag_reason: "trolling", suggested_body: null },
    ];
    expect(summarise(patches)).toEqual({ flagged: 1, clustered: 1, rephrased: 1 });
  });
});

describe("end-to-end pure pipeline with a canned model reply", () => {
  it("clusters duplicates, flags the troll, suggests a rephrase", () => {
    const questions = [
      q({ id: "A", body: "Blir man frelst ved dåpen?" }),
      q({ id: "B", body: "Må man døpes for å bli frelst??" }),
      q({ id: "C", body: "pastor er du singel lol" }),
    ];
    // What a well-behaved model returns (fixture — no network).
    const cannedReply = [
      "Her er vurderingen:",
      "```json",
      JSON.stringify({
        verdicts: [
          { i: 0, clusterKey: "frelse-daap" },
          { i: 1, clusterKey: "frelse-daap", suggestedBody: "Må man døpes for å bli frelst?" },
          { i: 2, flagReason: "useriøst, ikke et reelt spørsmål" },
        ],
      }),
      "```",
    ].join("\n");

    const verdicts = parseVerdicts(cannedReply, questions.length);
    const patches = buildModerationResult("s1", questions, verdicts);
    const summary = summarise(patches);

    expect(patches[0].cluster_id).toBe(patches[1].cluster_id);
    expect(patches[0].cluster_id).not.toBeNull();
    expect(patches[1].suggested_body).toBe("Må man døpes for å bli frelst?");
    expect(patches[2].flag_reason).toContain("useriøst");
    expect(patches[2].cluster_id).toBeNull();
    expect(summary).toEqual({ flagged: 1, clustered: 1, rephrased: 1 });
  });
});
