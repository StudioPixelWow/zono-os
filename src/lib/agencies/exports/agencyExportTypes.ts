// ============================================================================
// ZONO — PHASE 26.15: Report Export™ — CLIENT-SAFE DTOs. The report data model
// (built from the Phase 26.13 API + governance-sanitized) and the export result
// contract. No server-only deps, no IO. Real data only: confidence is null when
// unknown, missing data is disclosed — never fabricated.
// ============================================================================

export type ReportExportType = "single_agency_report" | "competitor_overview" | "territory_report" | "opportunity_report";
export type ReportExportStatus = "pending" | "generating" | "completed" | "failed";

export const REPORT_DISCLAIMER =
  "הדוח מבוסס על נתונים ציבוריים/מיובאים/שמורים במערכת ועל חישובים פנימיים של ZONO.";

export interface ReportKpi { label: string; value: string }
export interface ReportScore { label: string; value: string }
export interface ReportTerritoryRow { label: string; dominance: string; share: string; momentum: string; confidence: string }
export interface ReportSignalRow { title: string; severity: string; territory: string; detectedAt: string }
export interface ReportSwotItem { label: string; detail: string }
export interface ReportRecommendation { title: string; reason: string; priority: string }

export interface ReportAgencySection {
  name: string;
  city: string | null;
  scores: ReportScore[];
  territories: ReportTerritoryRow[];
  signals: ReportSignalRow[];
  swot: { strengths: ReportSwotItem[]; weaknesses: ReportSwotItem[]; opportunities: ReportSwotItem[]; threats: ReportSwotItem[] };
  recommendations: ReportRecommendation[];
  executiveSummary: string | null;
}
export interface ReportOverviewSection { kpis: ReportKpi[]; topAgencies: { name: string; threat: string; overall: string }[] }
export interface ReportTerritorySection { label: string; competitionLevel: string; agencies: { name: string; dominance: string; share: string }[] }
export interface ReportOpportunitySection { items: { label: string; area: string; reason: string }[] }

/** The full report data model rendered to HTML/print. */
export interface ReportModel {
  reportType: ReportExportType;
  title: string;
  subtitle: string | null;
  generatedAt: string;
  dataConfidence: number | null;     // 0..100
  missingData: string[];
  sourceSummary: string[];
  disclaimer: string;
  overview?: ReportOverviewSection;
  agency?: ReportAgencySection;
  territory?: ReportTerritorySection;
  opportunities?: ReportOpportunitySection;
}

export interface ExportResult {
  id: string | null;
  status: ReportExportStatus;
  fileUrl: string | null;
  error: string | null;
}

export interface ReportExportRecord {
  id: string;
  agencyId: string | null;
  exportType: ReportExportType;
  status: ReportExportStatus;
  fileUrl: string | null;
  requestedAt: string;
  generatedAt: string | null;
  errorMessage: string | null;
}
