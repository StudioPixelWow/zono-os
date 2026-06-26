"use server";
// ============================================================================
// ZONO — PHASE 26.15: Report export server actions. Validate org via session,
// build from the API + governance, generate + store the export, return the
// file_url/status. Errors are handled safely (a failed row is recorded).
// ============================================================================
import {
  exportSingleAgencyReport, exportCompetitorOverview, exportTerritoryReport, exportOpportunityReport,
} from "./agencyReportExportService";
import type { ExportResult } from "./agencyExportTypes";
import type { AgencyIntelligenceFilters } from "../api/agencyIntelligenceApiTypes";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function exportSingleAgencyReportAction(agencyId: string): Promise<Result<ExportResult>> {
  try { if (!agencyId) return { ok: false, error: "לא נבחר משרד." }; return { ok: true, data: await exportSingleAgencyReport(agencyId) }; } catch (e) { return fail(e); }
}
export async function exportCompetitorOverviewAction(filters: AgencyIntelligenceFilters = {}): Promise<Result<ExportResult>> {
  try { return { ok: true, data: await exportCompetitorOverview(filters) }; } catch (e) { return fail(e); }
}
export async function exportTerritoryReportAction(city: string, neighborhood?: string | null): Promise<Result<ExportResult>> {
  try { if (!city) return { ok: false, error: "נדרש אזור (עיר) להפקת הדוח." }; return { ok: true, data: await exportTerritoryReport(city, neighborhood) }; } catch (e) { return fail(e); }
}
export async function exportOpportunityReportAction(filters: AgencyIntelligenceFilters = {}): Promise<Result<ExportResult>> {
  try { return { ok: true, data: await exportOpportunityReport(filters) }; } catch (e) { return fail(e); }
}
