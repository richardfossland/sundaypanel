import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { isAdminEmail } from "@/lib/server/auth";

describe("isAdminEmail — the single authz decision for the host surface", () => {
  const prev = process.env.PANEL_ADMIN_EMAILS;
  afterEach(() => {
    process.env.PANEL_ADMIN_EMAILS = prev;
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    process.env.PANEL_ADMIN_EMAILS = "  Arrangor@Menigheten.NO , annen@x.no ";
    expect(isAdminEmail("arrangor@menigheten.no")).toBe(true);
    expect(isAdminEmail("ARRANGOR@MENIGHETEN.NO")).toBe(true);
    expect(isAdminEmail("annen@x.no")).toBe(true);
  });

  it("rejects anyone not on the list", () => {
    process.env.PANEL_ADMIN_EMAILS = "arrangor@menigheten.no";
    expect(isAdminEmail("random@evil.no")).toBe(false);
  });

  it("fails closed when the allow-list is empty or unset (null/empty email too)", () => {
    process.env.PANEL_ADMIN_EMAILS = "";
    expect(isAdminEmail("arrangor@menigheten.no")).toBe(false);
    delete process.env.PANEL_ADMIN_EMAILS;
    expect(isAdminEmail("arrangor@menigheten.no")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("accepts comma- and whitespace-separated lists", () => {
    process.env.PANEL_ADMIN_EMAILS = "a@x.no b@x.no,c@x.no";
    expect(isAdminEmail("a@x.no")).toBe(true);
    expect(isAdminEmail("b@x.no")).toBe(true);
    expect(isAdminEmail("c@x.no")).toBe(true);
  });
});

// --- by-owner store queries: assert they filter on owner_id (the gate) ---

// A tiny chainable fake of the supabase-js query builder that records the
// filters applied and returns a canned result.
function fakeBuilder(result: { data?: unknown; error?: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  for (const m of ["from", "select", "eq", "delete", "order"]) {
    builder[m] = chain(m);
  }
  // Make the builder thenable so `await db().from()...` resolves to `result`.
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
  ) => resolve(result);
  return { builder, calls };
}

describe("by-owner store queries filter on owner_id", () => {
  let calls: Array<[string, unknown[]]>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  async function loadStoreWith(result: { data?: unknown; error?: unknown }) {
    const fb = fakeBuilder(result);
    calls = fb.calls;
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => fb.builder,
    }));
    return import("@/lib/server/store");
  }

  it("listSessionsByOwner filters eq owner_id and orders newest-first", async () => {
    const store = await loadStoreWith({
      data: [{ id: "s1", owner_id: "host-1" }],
      error: null,
    });
    const rows = await store.listSessionsByOwner("host-1");
    expect(rows).toEqual([{ id: "s1", owner_id: "host-1" }]);
    expect(calls).toContainEqual(["eq", ["owner_id", "host-1"]]);
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
  });

  it("deleteSessionForOwner gates on BOTH id and owner_id, returns true when a row was removed", async () => {
    const store = await loadStoreWith({ data: [{ id: "s1" }], error: null });
    const ok = await store.deleteSessionForOwner("s1", "host-1");
    expect(ok).toBe(true);
    expect(calls).toContainEqual(["eq", ["id", "s1"]]);
    expect(calls).toContainEqual(["eq", ["owner_id", "host-1"]]);
  });

  it("deleteSessionForOwner returns false when nothing matched (not owned / missing)", async () => {
    const store = await loadStoreWith({ data: [], error: null });
    const ok = await store.deleteSessionForOwner("s1", "other-host");
    expect(ok).toBe(false);
  });
});
