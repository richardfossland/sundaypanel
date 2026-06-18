import "server-only";

import { listSessionsByOwner } from "@/lib/server/store";

/** One row in the host "Mine paneler" dashboard. The host legitimately owns
 * these panels, so the organiser_code is included — the dashboard stashes it in
 * localStorage when opening the control panel, exactly like the create flow
 * already reveals it once. Never exposed to the audience. */
export interface HostPanel {
  id: string;
  title: string;
  code: string;
  organiserCode: string;
  mode: string;
  status: string;
  createdAt: string;
}

/** The panels a Sunday Account host created while logged in, newest first. */
export async function listPanelsForOwner(ownerId: string): Promise<HostPanel[]> {
  const sessions = await listSessionsByOwner(ownerId);
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    code: s.code,
    organiserCode: s.organiser_code,
    mode: s.mode,
    status: s.status,
    createdAt: s.created_at,
  }));
}
