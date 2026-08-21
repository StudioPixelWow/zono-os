"use server";
// ============================================================================
// ZONO — Agent Manager Drawer data loader (server action). Lazily loads ONE
// office member's manager drill-down when the drawer opens (never eagerly for
// all agents). getOfficeAgentDetail is already manager/owner-gated + org-scoped
// (has_min_role + session org + .eq org_id), so a foreign or unknown member
// returns null — no cross-tenant exposure.
// ============================================================================
import { getOfficeAgentDetail, type OfficeAgentDetail } from "./agent-detail";

export async function loadOfficeAgentDetailAction(memberId: string): Promise<OfficeAgentDetail | null> {
  if (!memberId) return null;
  return getOfficeAgentDetail(memberId);
}
