import { describe, it, expect } from "vitest";
import { tallyPoll, normalizePollOptions } from "@/lib/poll";
import type { Poll } from "@/lib/types";

function poll(options: string[]): Poll {
  return {
    id: "p1",
    session_id: "s1",
    question: "Q?",
    options,
    status: "open",
    created_at: "2026-06-13T00:00:00Z",
  };
}

describe("tallyPoll", () => {
  it("counts each choice and totals them", () => {
    const r = tallyPoll(poll(["Ja", "Nei", "Usikker"]), [
      "Ja",
      "Ja",
      "Nei",
    ]);
    expect(r.counts).toEqual({ Ja: 2, Nei: 1, Usikker: 0 });
    expect(r.total).toBe(3);
  });

  it("includes every declared option even with zero votes", () => {
    const r = tallyPoll(poll(["A", "B"]), []);
    expect(r.counts).toEqual({ A: 0, B: 0 });
    expect(r.total).toBe(0);
  });

  it("ignores choices that are not declared options (defensive)", () => {
    const r = tallyPoll(poll(["Ja", "Nei"]), ["Ja", "Kanskje", "Nei", "Nei"]);
    expect(r.counts).toEqual({ Ja: 1, Nei: 2 });
    expect(r.total).toBe(3); // the stray "Kanskje" is not counted
  });

  it("does not let a malicious option name reach prototype keys", () => {
    const r = tallyPoll(poll(["Ja"]), ["__proto__", "toString", "Ja"]);
    expect(r.counts).toEqual({ Ja: 1 });
    expect(r.total).toBe(1);
  });
});

describe("normalizePollOptions", () => {
  it("trims, keeps order, requires 2–8 options", () => {
    expect(normalizePollOptions([" Ja ", "Nei"])).toEqual(["Ja", "Nei"]);
  });

  it("rejects fewer than 2 or more than 8", () => {
    expect(normalizePollOptions(["Ja"])).toBeNull();
    expect(
      normalizePollOptions(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
    ).toBeNull();
  });

  it("drops exact duplicates (and rejects if too few remain)", () => {
    expect(normalizePollOptions(["Ja", "Ja", "Nei"])).toEqual(["Ja", "Nei"]);
    expect(normalizePollOptions(["Ja", "Ja"])).toBeNull();
  });

  it("rejects empty, over-long, or non-string entries", () => {
    expect(normalizePollOptions(["Ja", "  "])).toBeNull();
    expect(normalizePollOptions(["Ja", "x".repeat(61)])).toBeNull();
    expect(normalizePollOptions(["Ja", 5])).toBeNull();
    expect(normalizePollOptions("Ja,Nei")).toBeNull();
  });
});
