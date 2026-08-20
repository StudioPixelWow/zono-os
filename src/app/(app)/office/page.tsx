// ============================================================================
// ZONO — Office (/office). The manager/owner OFFICE MANAGEMENT screen:
// overview · agents · properties · leads · deals · attention (preserved command
// center) · intelligence teaser. Server-gated: getOfficeManagementBoard returns
// null for agents (and no-org), who are sent to their personal day. RTL.
// ============================================================================
import { redirect } from "next/navigation";
import { getOfficeManagementBoard } from "@/lib/office/management-board";
import { recordUsage } from "@/lib/launch/server/services";
import { OfficeManagementCenter } from "./OfficeManagementCenter";

export const dynamic = "force-dynamic";

export default async function OfficePage() {
  const board = await getOfficeManagementBoard();
  if (!board) redirect("/today/plan");   // agents / no active org → personal day

  await recordUsage({ category: "screen", name: "office_management_opened", props: { agents: board.summary.agents, needsAttention: board.center.summary.needsAttention } });
  return <OfficeManagementCenter board={board} />;
}
