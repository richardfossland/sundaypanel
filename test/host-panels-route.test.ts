import { describe, it, expect, vi, beforeEach } from "vitest";

import { AuthError } from "@/lib/server/auth";

// Mock the two server modules the route depends on so we exercise the route's
// own control flow (auth gate → owner-gated delete) without a database.
const requireHost = vi.fn();
const deleteSessionForOwner = vi.fn();
const listPanelsForOwner = vi.fn();

vi.mock("@/lib/server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/auth")>();
  return {
    ...actual, // keep AuthError + authFail real
    requireHost: () => requireHost(),
  };
});

vi.mock("@/lib/server/store", () => ({
  deleteSessionForOwner: (id: string, owner: string) =>
    deleteSessionForOwner(id, owner),
}));

vi.mock("@/lib/server/panels", () => ({
  listPanelsForOwner: (owner: string) => listPanelsForOwner(owner),
}));

// Import AFTER the mocks are registered.
const { DELETE, GET } = await import("@/app/api/host/panels/route");

function delReq(body: unknown) {
  return new Request("http://localhost/api/host/panels", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireHost.mockReset();
  deleteSessionForOwner.mockReset();
  listPanelsForOwner.mockReset();
});

describe("DELETE /api/host/panels — auth + owner gating", () => {
  it("401 when not signed in", async () => {
    requireHost.mockRejectedValue(new AuthError(401, "ikke_innlogget"));
    const res = await DELETE(delReq({ sessionId: "s1" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "ikke_innlogget" });
    expect(deleteSessionForOwner).not.toHaveBeenCalled();
  });

  it("403 when signed in but not an arrangør", async () => {
    requireHost.mockRejectedValue(new AuthError(403, "ikke_arrangor"));
    const res = await DELETE(delReq({ sessionId: "s1" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "ikke_arrangor" });
    expect(deleteSessionForOwner).not.toHaveBeenCalled();
  });

  it("400 when sessionId is missing", async () => {
    requireHost.mockResolvedValue({ id: "host-1", email: "a@b.no" });
    const res = await DELETE(delReq({}));
    expect(res.status).toBe(400);
    expect(deleteSessionForOwner).not.toHaveBeenCalled();
  });

  it("404 when the panel is not owned by this host (gated delete returns false)", async () => {
    requireHost.mockResolvedValue({ id: "host-1", email: "a@b.no" });
    deleteSessionForOwner.mockResolvedValue(false);
    const res = await DELETE(delReq({ sessionId: "not-mine" }));
    expect(res.status).toBe(404);
    expect(deleteSessionForOwner).toHaveBeenCalledWith("not-mine", "host-1");
  });

  it("200 when the host owns the panel — delete scoped to host.id", async () => {
    requireHost.mockResolvedValue({ id: "host-1", email: "a@b.no" });
    deleteSessionForOwner.mockResolvedValue(true);
    const res = await DELETE(delReq({ sessionId: "s1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    // The owner id is taken from the verified session, never the body.
    expect(deleteSessionForOwner).toHaveBeenCalledWith("s1", "host-1");
  });
});

describe("GET /api/host/panels — by-owner list", () => {
  it("401 when not signed in", async () => {
    requireHost.mockRejectedValue(new AuthError(401, "ikke_innlogget"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listPanelsForOwner).not.toHaveBeenCalled();
  });

  it("returns only this host's panels (query scoped to host.id)", async () => {
    requireHost.mockResolvedValue({ id: "host-1", email: "a@b.no" });
    listPanelsForOwner.mockResolvedValue([
      { id: "s1", title: "Spør presten", code: "KOLE-FR", organiserCode: "MNPQ-RS", mode: "curated", status: "open", createdAt: "2026-06-18T00:00:00Z" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      panels: [
        { id: "s1", title: "Spør presten", code: "KOLE-FR", organiserCode: "MNPQ-RS", mode: "curated", status: "open", createdAt: "2026-06-18T00:00:00Z" },
      ],
    });
    expect(listPanelsForOwner).toHaveBeenCalledWith("host-1");
  });
});
