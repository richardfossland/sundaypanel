import { redirect } from "next/navigation";

import { getHost } from "@/lib/server/auth";
import { listPanelsForOwner } from "@/lib/server/panels";
import HostDashboard from "./HostDashboard";

// The host/arrangør dashboard. Server-side gate: getHost() returns the verified
// Sunday Account host (signed in AND on the PANEL_ADMIN_EMAILS allow-list), or
// null. Middleware already bounces signed-out visitors to /host/login; this
// also covers the signed-in-but-not-an-arrangør (403) case the same way.
export const dynamic = "force-dynamic";

export default async function HostPage() {
  const host = await getHost();
  if (!host) redirect("/host/login");

  const panels = await listPanelsForOwner(host.id);

  return <HostDashboard email={host.email} initialPanels={panels} />;
}
