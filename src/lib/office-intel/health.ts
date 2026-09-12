// ============================================================================
// ZONO — OFFICE-INTELLIGENCE HEALTH (server-only, READ-ONLY). Surfaces, in one
// call, whether the Office→Agents hierarchy is actually populated — so a repeat of
// the "brokers scanned fine but office relations are empty" failure is caught
// immediately instead of silently. Also emits a HEALTH VERDICT: brokers healthy +
// office relations unhealthy → warn. No writes; safe for an admin panel or a cron.
// ============================================================================
import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- brokerage_* tables are the shared observed-market graph, not in the generated Database types; loose query shape matches the other brokerage selectors. */
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface OfficeIntelHealth {
  agentsTotal: number;
  agentsWithOffice: number;
  agentsWithoutOffice: number;
  officeAssignmentPct: number;         // agentsWithOffice / agentsTotal
  officesTotal: number;
  officesActive: number;
  officesReferencedByAgents: number;   // offices that actually have ≥1 agent
  officesWithoutAgents: number;        // orphan offices
  verdict: "healthy" | "warning" | "critical";
  reasons: string[];
}

export async function getOfficeIntelligenceHealth(): Promise<OfficeIntelHealth> {
  const db = createServiceRoleClient();
  const count = async (build: (q: any) => any): Promise<number> => {
    try { const { count: c } = await build(db.from("brokerage_agents" as never).select("*", { count: "exact", head: true })); return c ?? 0; }
    catch { return 0; }
  };
  const agentsTotal = await count((q) => q);
  const agentsWithOffice = await count((q) => q.not("office_id", "is", null));
  const agentsWithoutOffice = Math.max(0, agentsTotal - agentsWithOffice);

  let officesTotal = 0, officesActive = 0, officesReferenced = 0;
  try {
    const { count: ot } = await (db.from("brokerage_offices" as never).select("*", { count: "exact", head: true }) as any); officesTotal = ot ?? 0;
    const { count: oa } = await (db.from("brokerage_offices" as never).select("*", { count: "exact", head: true }).eq("status", "active") as any); officesActive = oa ?? 0;
    const { data: refs } = await (db.from("brokerage_agents" as never).select("office_id").not("office_id", "is", null).limit(20000) as any);
    officesReferenced = new Set((refs ?? []).map((r: { office_id: string }) => r.office_id)).size;
  } catch { /* best-effort */ }

  const officeAssignmentPct = agentsTotal ? Math.round((agentsWithOffice / agentsTotal) * 100) : 0;
  const officesWithoutAgents = Math.max(0, officesTotal - officesReferenced);

  const reasons: string[] = [];
  let verdict: OfficeIntelHealth["verdict"] = "healthy";
  // Brokers scanned but office relations near-empty → the exact failure to catch.
  if (agentsTotal > 0 && officeAssignmentPct < 25) { verdict = "critical"; reasons.push(`רק ${officeAssignmentPct}% מהמתווכים משויכים למשרד — יחסי משרד-מתווך כמעט ריקים`); }
  else if (agentsTotal > 0 && officeAssignmentPct < 60) { verdict = "warning"; reasons.push(`שיוך משרדים חלקי (${officeAssignmentPct}%)`); }
  if (officesTotal > 0 && officesReferenced > 0 && officesWithoutAgents / officesTotal > 0.7) {
    if (verdict === "healthy") verdict = "warning";
    reasons.push(`${officesWithoutAgents} מתוך ${officesTotal} משרדים ללא אף מתווך משויך`);
  }
  return {
    agentsTotal, agentsWithOffice, agentsWithoutOffice, officeAssignmentPct,
    officesTotal, officesActive, officesReferencedByAgents: officesReferenced, officesWithoutAgents,
    verdict, reasons,
  };
}
