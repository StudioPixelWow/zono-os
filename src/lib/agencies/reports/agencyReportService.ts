// ============================================================================
// ZONO — Agency Intelligence Report service (Phase 26.7, SERVER-ONLY).
// Builds the source snapshot, composes the report with the pure generators
// (executive summary, SWOT, recommendations) from REAL data only, persists
// idempotently, and exposes the report API. No UI, no scraping, no mock data.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { buildAgencyReportSnapshot } from "./agencyReportSnapshotBuilder";
import { generateAgencySwot } from "./agencySwotGenerator";
import { generateAgencyExecutiveSummary } from "./agencyExecutiveSummaryGenerator";
import { generateAgencyRecommendations } from "./agencyRecommendationEngine";
import { upsertReport, getLatestReport, listReports, type StoredAgencyReport } from "./agencyReportRepository";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import type { AgencyReport, AgencyReportType, AgencyReportSnapshot } from "./agencyReportTypes";

/** Compose a report object (pure) from a snapshot for a given type. */
export function composeReport(snapshot: AgencyReportSnapshot, reportType: AgencyReportType): AgencyReport {
  const swot = generateAgencySwot(snapshot);
  const wantSwot = reportType === "swot" || reportType === "competitive_position" || reportType === "full_report";
  const wantSummary = reportType === "executive_summary" || reportType === "full_report" || reportType === "competitive_position";
  const wantRecs = reportType === "full_report" || reportType === "competitive_position";
  const keySignals = [...snapshot.signals].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)).slice(0, 8);
  return {
    agencyId: snapshot.agencyId, reportType,
    periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd,
    executiveSummary: wantSummary ? generateAgencyExecutiveSummary(snapshot) : "",
    strengths: wantSwot ? swot.strengths : [],
    weaknesses: wantSwot ? swot.weaknesses : [],
    opportunities: wantSwot ? swot.opportunities : [],
    threats: wantSwot ? swot.threats : [],
    recommendations: wantRecs ? generateAgencyRecommendations(snapshot) : [],
    keySignals,
    keyScores: snapshot.scores,
    dataConfidence: snapshot.scores.dataConfidence,
  };
}

async function generate(agencyId: string, reportType: AgencyReportType, periodDays: number): Promise<StoredAgencyReport | null> {
  const snapshot = await buildAgencyReportSnapshot(agencyId, periodDays);
  if (!snapshot) return null;
  const report = composeReport(snapshot, reportType);
  return upsertReport({ agencyId, reportType, report, sourceSnapshot: snapshot as unknown as Record<string, unknown> });
}

export function generateAgencyExecutiveSummaryReport(agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<StoredAgencyReport | null> {
  return generate(agencyId, "executive_summary", periodDays);
}
export function generateAgencySwotReport(agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<StoredAgencyReport | null> {
  return generate(agencyId, "swot", periodDays);
}
export function generateFullAgencyReport(agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<StoredAgencyReport | null> {
  return generate(agencyId, "full_report", periodDays);
}
export function getLatestAgencyReport(agencyId: string, reportType: AgencyReportType): Promise<StoredAgencyReport | null> {
  return getLatestReport(agencyId, reportType);
}
export function getAgencyReports(agencyId: string): Promise<StoredAgencyReport[]> {
  return listReports(agencyId);
}

export interface OrgReportsResult { agencies: number; created: number; lowConfidence: number }
export async function generateOrganizationAgencyReports(periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<OrgReportsResult> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agencies").select("id").eq("organization_id", org).eq("active", true).limit(2000);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  let created = 0, lowConfidence = 0;
  for (const id of ids) {
    try {
      const rep = await generateFullAgencyReport(id, periodDays);
      if (rep) { created++; if ((rep.dataConfidence ?? 100) < 40) lowConfidence++; }
    } catch { /* isolate per-agency failure */ }
  }
  return { agencies: ids.length, created, lowConfidence };
}
