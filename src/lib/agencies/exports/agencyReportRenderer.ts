// ============================================================================
// ZONO — PHASE 26.15: Report renderer (SERVER-ONLY). Builds the ReportModel from
// the Phase 26.13 Agency Intelligence API ONLY (no direct DB), applies Phase
// 26.14 governance wording, and always includes generated date, confidence,
// missing data, source summary and the mandated disclaimer. Real data only.
// ============================================================================
import "server-only";
import {
  getAgencyIntelligenceAgency, getAgencyIntelligenceOverview, getTopCompetitors,
  getTerritoryIntelligence, getAgencyOpportunityFeed,
} from "../api/agencyIntelligenceApi";
import { sanitizeWording } from "../governance/agencyVisibilityGuard";
import { REPORT_DISCLAIMER, type ReportModel, type ReportExportType } from "./agencyExportTypes";
import type { AgencyIntelligenceFilters } from "../api/agencyIntelligenceApiTypes";

const fmt = (n: number | null | undefined): string => (typeof n === "number" ? String(Math.round(n)) : "—");
const pct = (n: number | null | undefined): string => (typeof n === "number" ? `${Math.round(n * 100)}%` : "—");
const conf01 = (n: number | null | undefined): string => (typeof n === "number" ? `${Math.round(n * 100)}%` : "—");
const s = (t: string | null | undefined): string => sanitizeWording(t ?? "");

const TABLE_HE: Record<string, string> = {
  agency_scores: "ציוני משרדים", agency_signals: "אותות שוק", agency_intelligence_reports: "דוחות מודיעין",
  agency_territory_stats: "שליטה אזורית", rain_nodes: "גרף קשרים", agencies: "משרדים",
  agency_agents: "מתווכים", agency_resolution_candidates: "מועמדי זיהוי",
};
const sourceLabels = (cats: string[]): string[] => [...new Set(cats.map((c) => TABLE_HE[c] ?? c))];

function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const base = (reportType: ReportExportType, title: string, subtitle: string | null): Pick<ReportModel, "reportType" | "title" | "subtitle" | "generatedAt" | "disclaimer" | "dataConfidence" | "missingData" | "sourceSummary"> => ({
  reportType, title, subtitle, generatedAt: nowStamp(), disclaimer: REPORT_DISCLAIMER,
  dataConfidence: null, missingData: [], sourceSummary: [],
});

/** Single-agency report from the unified API composite. */
export async function buildSingleAgencyModel(organizationId: string, agencyId: string): Promise<ReportModel | null> {
  const a = await getAgencyIntelligenceAgency(organizationId, agencyId);
  if (!a) return null;
  const missing = [...new Set([...a.competitive.sourceSummary.missingData, ...a.territory.sourceSummary.missingData, ...a.signals.sourceSummary.missingData, ...a.reports.sourceSummary.missingData])];
  const cats = [...a.competitive.sourceSummary.categories, ...a.territory.sourceSummary.categories, ...a.signals.sourceSummary.categories, ...a.reports.sourceSummary.categories];
  return {
    ...base("single_agency_report", `דוח משרד · ${s(a.card.name)}`, a.card.city ? s(a.card.city) : null),
    dataConfidence: a.competitive.dataConfidence, missingData: missing, sourceSummary: sourceLabels(cats),
    agency: {
      name: s(a.card.name), city: a.card.city ? s(a.card.city) : null,
      scores: [
        { label: "כללי", value: fmt(a.competitive.scores.overall) }, { label: "איום", value: fmt(a.competitive.scores.threat) },
        { label: "מומנטום", value: fmt(a.competitive.scores.momentum) }, { label: "עוצמת שוק", value: fmt(a.competitive.scores.marketStrength) },
      ],
      territories: a.territory.territories.map((t) => ({ label: s(t.label), dominance: fmt(t.dominance), share: pct(t.inventoryShare), momentum: fmt(t.momentum), confidence: conf01(t.confidence) })),
      signals: a.signals.signals.map((x) => ({ title: s(x.title), severity: x.severity ?? "—", territory: s(x.territoryLabel ?? "—"), detectedAt: (x.detectedAt ?? "").slice(0, 10) })),
      swot: {
        strengths: (a.reports.latest?.strengths ?? []).map((i) => ({ label: s(i.label), detail: s(i.detail) })),
        weaknesses: (a.reports.latest?.weaknesses ?? []).map((i) => ({ label: s(i.label), detail: s(i.detail) })),
        opportunities: (a.reports.latest?.opportunities ?? []).map((i) => ({ label: s(i.label), detail: s(i.detail) })),
        threats: (a.reports.latest?.threats ?? []).map((i) => ({ label: s(i.label), detail: s(i.detail) })),
      },
      recommendations: (a.reports.latest?.recommendations ?? []).map((r) => ({ title: s(r.title), reason: s(r.reason), priority: r.priority === "high" ? "עדיפות גבוהה" : r.priority === "medium" ? "עדיפות בינונית" : "עדיפות נמוכה" })),
      executiveSummary: a.reports.latest?.executiveSummary ? s(a.reports.latest.executiveSummary) : null,
    },
  };
}

/** Competitor overview report (org KPIs + top competitors). */
export async function buildCompetitorOverviewModel(organizationId: string, filters: AgencyIntelligenceFilters = {}): Promise<ReportModel> {
  const [overview, top] = await Promise.all([getAgencyIntelligenceOverview(organizationId), getTopCompetitors(organizationId, { ...filters, limit: 15 })]);
  return {
    ...base("competitor_overview", "סקירת מתחרים", null),
    dataConfidence: null, missingData: overview.sourceSummary.missingData, sourceSummary: sourceLabels(overview.sourceSummary.categories),
    overview: {
      kpis: [
        { label: "משרדים מזוהים", value: String(overview.agencies) }, { label: "מתווכים", value: String(overview.agentsLinked) },
        { label: "אזורים", value: String(overview.territories) }, { label: "אותות פעילים", value: String(overview.activeSignals) },
        { label: "איום גבוה", value: String(overview.highThreatCompetitors) }, { label: "הזדמנויות", value: String(overview.opportunities) },
      ],
      topAgencies: top.map((c) => ({ name: s(c.name), threat: fmt(c.threat), overall: fmt(c.overall) })),
    },
  };
}

/** Territory report. */
export async function buildTerritoryModel(organizationId: string, city: string, neighborhood?: string | null): Promise<ReportModel> {
  const t = await getTerritoryIntelligence(organizationId, { city, neighborhood: neighborhood ?? null });
  const label = neighborhood || city;
  const levelHe: Record<string, string> = { none: "אין תחרות", low: "נמוכה", moderate: "בינונית", high: "גבוהה" };
  return {
    ...base("territory_report", `דוח אזור · ${s(label)}`, city !== label ? s(city) : null),
    dataConfidence: null, missingData: t.sourceSummary.missingData, sourceSummary: sourceLabels(t.sourceSummary.categories),
    territory: {
      label: s(label), competitionLevel: t.competitionLevel ? (levelHe[t.competitionLevel] ?? t.competitionLevel) : "—",
      agencies: t.agencies.map((a) => ({ name: s(a.agencyName), dominance: fmt(a.dominance), share: pct(a.inventoryShare) })),
    },
  };
}

/** Opportunity report. */
export async function buildOpportunityModel(organizationId: string, filters: AgencyIntelligenceFilters = {}): Promise<ReportModel> {
  const feed = await getAgencyOpportunityFeed(organizationId, filters);
  return {
    ...base("opportunity_report", "דוח הזדמנויות אזוריות", null),
    dataConfidence: null, missingData: feed.sourceSummary.missingData, sourceSummary: sourceLabels(feed.sourceSummary.categories),
    opportunities: { items: feed.opportunities.map((o) => ({ label: s(o.label), area: s(o.neighborhood || o.city || "—"), reason: s(o.reason) })) },
  };
}
