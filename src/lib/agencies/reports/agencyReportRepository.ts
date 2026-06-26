// ============================================================================
// ZONO — Agency Intelligence Reports repository (Phase 26.7, SERVER-ONLY).
// Idempotent upsert keyed by (org, agency, report_type, period_start, period_end)
// so regenerating a report for the same window overwrites in place. Org-scoped.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import type { AgencyReport, AgencyReportType } from "./agencyReportTypes";

const COLS =
  "id,organization_id,agency_id,report_type,period_start,period_end,executive_summary,strengths,weaknesses," +
  "opportunities,threats,recommendations,key_signals,key_scores,data_confidence,source_snapshot,generated_by,generated_at,created_at,updated_at";

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface StoredAgencyReport extends AgencyReport {
  id: string;
  sourceSnapshot: Record<string, unknown>;
  generatedAt: string;
}

export function toStoredReport(r: Obj): StoredAgencyReport {
  return {
    id: r.id as string, agencyId: r.agency_id as string, reportType: r.report_type as AgencyReportType,
    periodStart: (r.period_start as string) ?? "", periodEnd: (r.period_end as string) ?? "",
    executiveSummary: (r.executive_summary as string) ?? "",
    strengths: asArr(r.strengths) as AgencyReport["strengths"],
    weaknesses: asArr(r.weaknesses) as AgencyReport["weaknesses"],
    opportunities: asArr(r.opportunities) as AgencyReport["opportunities"],
    threats: asArr(r.threats) as AgencyReport["threats"],
    recommendations: asArr(r.recommendations) as AgencyReport["recommendations"],
    keySignals: asArr(r.key_signals) as AgencyReport["keySignals"],
    keyScores: asObj(r.key_scores) as unknown as AgencyReport["keyScores"],
    dataConfidence: r.data_confidence == null ? null : Number(r.data_confidence),
    sourceSnapshot: asObj(r.source_snapshot), generatedAt: r.generated_at as string,
  };
}

export interface UpsertReportInput {
  agencyId: string; reportType: AgencyReportType; report: AgencyReport;
  sourceSnapshot: Record<string, unknown>; generatedBy?: string;
}

export async function upsertReport(input: UpsertReportInput): Promise<StoredAgencyReport> {
  const org = await currentOrgId();
  const db = await createClient();
  const r = input.report;
  const now = new Date().toISOString();
  const { data, error } = await db.from("agency_intelligence_reports").upsert({
    organization_id: org, agency_id: input.agencyId, report_type: input.reportType,
    period_start: r.periodStart, period_end: r.periodEnd, executive_summary: r.executiveSummary,
    strengths: r.strengths, weaknesses: r.weaknesses, opportunities: r.opportunities, threats: r.threats,
    recommendations: r.recommendations, key_signals: r.keySignals, key_scores: r.keyScores,
    data_confidence: r.dataConfidence, source_snapshot: input.sourceSnapshot,
    generated_by: input.generatedBy ?? "agency-report-engine-v1", generated_at: now,
  } as never, { onConflict: "organization_id,agency_id,report_type,period_start,period_end" }).select(COLS).single();
  if (error) throw new Error(error.message);
  return toStoredReport(data as unknown as Obj);
}

export async function getLatestReport(agencyId: string, reportType: AgencyReportType): Promise<StoredAgencyReport | null> {
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_reports").select(COLS)
    .eq("agency_id", agencyId).eq("report_type", reportType)
    .order("generated_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toStoredReport(data as unknown as Obj) : null;
}

export async function listReports(agencyId: string, limit = 50): Promise<StoredAgencyReport[]> {
  const db = await createClient();
  const { data } = await db.from("agency_intelligence_reports").select(COLS)
    .eq("agency_id", agencyId).order("generated_at", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map(toStoredReport);
}
