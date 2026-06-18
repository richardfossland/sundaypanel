import { ok, fail, readJson } from "@/lib/server/http";
import { requireHost, authFail } from "@/lib/server/auth";
import { listPanelsForOwner } from "@/lib/server/panels";
import { deleteSessionForOwner } from "@/lib/server/store";

// GET /api/host/panels — list the signed-in host's panels ("Mine paneler").
//   401 if not signed in, 403 if not an arrangør (allow-list).
export async function GET() {
  try {
    const host = await requireHost();
    const panels = await listPanelsForOwner(host.id);
    return ok({ panels });
  } catch (err) {
    return authFail(err) ?? fail(500, "kunne_ikke_laste");
  }
}

// DELETE /api/host/panels — delete a panel the host owns.
//   body: { sessionId }
//   401 not signed in · 403 not an arrangør · 404 not yours / missing · 200 ok.
//
// Owner-gating is enforced in deleteSessionForOwner (WHERE owner_id = host.id),
// so a host can never delete a panel they don't own — even with a valid id.
// Children are removed via ON DELETE CASCADE (see migration 0004 notes).
export async function DELETE(req: Request) {
  try {
    const host = await requireHost();
    const body = await readJson<{ sessionId?: string }>(req);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) return fail(400, "mangler_panel");

    const deleted = await deleteSessionForOwner(sessionId, host.id);
    if (!deleted) return fail(404, "finnes_ikke");
    return ok({ deleted: true });
  } catch (err) {
    return authFail(err) ?? fail(500, "kunne_ikke_slette");
  }
}
