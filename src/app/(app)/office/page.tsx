// ============================================================================
// ZONO — Manager / Owner Command Center (/office). "המשרד" — one office exceptions
// + decision screen for managers/owners. Server-gated: getManagerCommandCenter
// returns null for agents (and no-org), who are sent to their personal day. Records
// manager_center_opened. Read-derived (replans each load). RTL.
// ============================================================================
import { redirect } from "next/navigation";
import { getManagerCommandCenter } from "@/lib/office/manager-command-center";
import { recordUsage } from "@/lib/launch/server/services";
import { OfficeCommandCenter } from "./OfficeCommandCenter";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const view = await getManagerCommandCenter();
  if (!view) redirect("/today/plan");   // agents / no active org → personal day

  await recordUsage({ category: "screen", name: "manager_center_opened", props: { needsAttention: view.center.summary.needsAttention } });
  return <OfficeCommandCenter center={view.center} agents={view.agents} />;
}
