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

export type StageStatus = "healthy" | "degraded" | "critical";
export interface PipelineStage { key: string; label: string; status: StageStatus; detail: string }

export interface OfficeIntelHealth {
  agentsTotal: number;
  agentsWithOffice: number;
  agentsWithoutOffice: number;
  officeAssignmentPct: number;         // agentsWithOffice / agentsTotal
  officesTotal: number;
  officesActive: number;
  officesReferencedByAgents: number;   // offices that actually have ≥1 agent
  officesWithoutAgents: number;        // orphan offices
  officesWithListings: number;         // offices with ≥1 observed listing link
  listingLinks: number;                // total office↔listing links
  verdict: "healthy" | "warning" | "critical";
  reasons: string[];
  pipeline: PipelineStage[];           // per-stage breakdown (ingestion vs assignment)
  alert: string | null;                // headline alert, e.g. "ingestion healthy / assignment degraded"
  generatedAt: string;
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

  // Listing-link coverage (the third pipeline stage: office ↔ observed listings).
  let listingLinks = 0, officesWithListings = 0;
  try {
    const { count: lc } = await (db.from("brokerage_external_listing_links" as never).select("*", { count: "exact", head: true }).not("office_id", "is", null) as any); listingLinks = lc ?? 0;
    const { data: lrefs } = await (db.from("brokerage_external_listing_links" as never).select("office_id").not("office_id", "is", null).limit(50000) as any);
    officesWithListings = new Set((lrefs ?? []).map((r: { office_id: string }) => r.office_id)).size;
  } catch { /* best-effort */ }

  const reasons: string[] = [];
  let verdict: OfficeIntelHealth["verdict"] = "healthy";
  // Brokers scanned but office relations near-empty → the exact failure to catch.
  if (agentsTotal > 0 && officeAssignmentPct < 25) { verdict = "critical"; reasons.push(`רק ${officeAssignmentPct}% מהמתווכים משויכים למשרד — יחסי משרד-מתווך כמעט ריקים`); }
  else if (agentsTotal > 0 && officeAssignmentPct < 60) { verdict = "warning"; reasons.push(`שיוך משרדים חלקי (${officeAssignmentPct}%)`); }
  if (officesTotal > 0 && officesReferenced > 0 && officesWithoutAgents / officesTotal > 0.7) {
    if (verdict === "healthy") verdict = "warning";
    reasons.push(`${officesWithoutAgents} מתוך ${officesTotal} משרדים ללא אף מתווך משויך`);
  }

  // ── Pipeline stages: separate INGESTION health from ASSIGNMENT health, so the
  // "brokers scanned fine but office relations empty" failure reads at a glance.
  const stageStatus = (pct: number, warn: number, crit: number): StageStatus => (pct < crit ? "critical" : pct < warn ? "degraded" : "healthy");
  const ingestion: PipelineStage = {
    key: "ingestion", label: "קליטת מתווכים",
    status: agentsTotal > 0 ? "healthy" : "critical",
    detail: agentsTotal > 0 ? `${agentsTotal} מתווכים נקלטו` : "לא נקלטו מתווכים",
  };
  const assignment: PipelineStage = {
    key: "assignment", label: "שיוך משרדים",
    status: agentsTotal === 0 ? "critical" : stageStatus(officeAssignmentPct, 60, 25),
    detail: `${officeAssignmentPct}% מהמתווכים משויכים למשרד (${agentsWithOffice}/${agentsTotal})`,
  };
  const linkPct = officesTotal > 0 ? Math.round((officesWithListings / officesTotal) * 100) : 0;
  const linking: PipelineStage = {
    key: "linking", label: "קישור מודעות למשרד",
    status: listingLinks === 0 ? "critical" : stageStatus(linkPct, 40, 15),
    detail: `${listingLinks.toLocaleString("he-IL")} קישורי מודעה-משרד · ${officesWithListings} משרדים עם מלאי נצפה`,
  };
  const pipeline = [ingestion, assignment, linking];

  // Headline alert: name the healthy stage AND the degraded one explicitly.
  let alert: string | null = null;
  if (ingestion.status === "healthy" && assignment.status !== "healthy") {
    alert = `קליטת המתווכים תקינה · שיוך המשרדים ${assignment.status === "critical" ? "כשל" : "מוחלש"} (${officeAssignmentPct}%)`;
  } else if (assignment.status !== "healthy" || linking.status !== "healthy") {
    alert = `שלב בצנרת המודיעין דורש תשומת לב`;
  }

  return {
    agentsTotal, agentsWithOffice, agentsWithoutOffice, officeAssignmentPct,
    officesTotal, officesActive, officesReferencedByAgents: officesReferenced, officesWithoutAgents,
    officesWithListings, listingLinks,
    verdict, reasons, pipeline, alert, generatedAt: new Date().toISOString(),
  };
}
