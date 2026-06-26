// ============================================================================
// ZONO — Competition Radar data layer (Phase 26.8, SERVER-ONLY). Reads ONLY real
// stored intelligence from Phases 26.0–26.7 (agencies, scores, territory stats,
// signals, timeline, reports). No mock data, no fabricated fallbacks — absent
// data surfaces as nulls/empty so the UI can show honest empty states.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { getAgencyById } from "../agencyRepository";
import { getScore } from "../scoring/agencyScoringRepository";
import { listByAgency as listTerr, listByTerritory } from "../territory/agencyTerritoryRepository";
import { territoryKey, DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import { listActiveSignals, listTimelineIntelligence } from "../intelligence/agencySignalRepository";
import { getLatestReport } from "../reports/agencyReportRepository";
import { getAgencyIntelligenceOverview, getTopCompetitors } from "../api/agencyIntelligenceApi";
import type {
  RadarOverview, RadarAgencySummary, RadarAgencyDetails, RadarTerritoryRow,
  RadarSignalRow, RadarTimelineRow, RadarSwot, RadarRecommendation, RadarSeverity,
} from "./competitionRadarFormat";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const territoryLabelOf = (city: string | null, neighborhood: string | null, street: string | null) =>
  street || neighborhood || city || "—";


// ── Overview KPIs (real counts only) ─────────────────────────────────────────
export async function getCompetitionRadarOverview(): Promise<RadarOverview> {
  // Delegates to the unified Agency Intelligence API (Phase 26.13) — single source of truth.
  const org = await currentOrgId();
  const o = await getAgencyIntelligenceOverview(org);
  return {
    agencies: o.agencies, agentsLinked: o.agentsLinked, territories: o.territories,
    activeSignals: o.activeSignals, highThreat: o.highThreatCompetitors, opportunities: o.opportunities,
  };
}

// ── Agency threat list (scored agencies, enriched from real tables) ──────────
export interface RadarAgencyFilters { limit?: number }
export async function getCompetitionRadarAgencies(filters: RadarAgencyFilters = {}): Promise<RadarAgencySummary[]> {
  // Delegates to the unified Agency Intelligence API (Phase 26.13).
  const org = await currentOrgId();
  const cards = await getTopCompetitors(org, { limit: filters.limit ?? 60, sortBy: "threat" });
  return cards.map((c) => ({
    id: c.agencyId, name: c.name, city: c.city, overall: c.overall, threat: c.threat,
    momentum: c.momentum, dataConfidence: c.dataConfidence,
    topSignalTitle: c.topSignalTitle, summarySnippet: c.summarySnippet,
  }));
}

// ── Agency details (territories, signals, timeline, SWOT, recommendations) ───
export async function getCompetitionRadarAgencyDetails(agencyId: string): Promise<RadarAgencyDetails | null> {
  const agency = await getAgencyById(agencyId);
  if (!agency) return null;
  const [score, terr, signals, timeline, report] = await Promise.all([
    getScore(agencyId),
    listTerr(agencyId, DEFAULT_TERRITORY_PERIOD),
    listActiveSignals(agencyId, 60),
    listTimelineIntelligence(agencyId, 40),
    getLatestReport(agencyId, "full_report"),
  ]);

  const territories: RadarTerritoryRow[] = terr.map((t) => ({
    agencyId, agencyName: agency.name, territoryType: t.territoryType,
    label: territoryLabelOf(t.city, t.neighborhood, t.street),
    dominance: t.dominanceScore, inventoryShare: t.inventoryShare, momentum: t.momentumScore,
    trend: t.trend, confidence: t.confidence,
  })).sort((a, b) => (b.dominance ?? -1) - (a.dominance ?? -1));

  const signalRows: RadarSignalRow[] = signals.map((s) => ({
    id: s.id, signalType: s.signalType, severity: s.severity, title: s.title, description: s.description,
    territoryLabel: s.street || s.neighborhood || s.city || null, importance: s.importance, confidence: s.confidence,
    detectedAt: s.detectedAt,
  }));

  const timelineRows: RadarTimelineRow[] = timeline.map((e) => ({
    id: e.id, eventType: e.eventType, title: e.title, importance: e.importance,
    territoryLabel: e.street || e.neighborhood || e.city || null, eventDate: e.eventDate,
  }));

  const swot: RadarSwot = {
    strengths: (report?.strengths ?? []).map((x) => ({ label: x.label, detail: x.detail })),
    weaknesses: (report?.weaknesses ?? []).map((x) => ({ label: x.label, detail: x.detail })),
    opportunities: (report?.opportunities ?? []).map((x) => ({ label: x.label, detail: x.detail })),
    threats: (report?.threats ?? []).map((x) => ({ label: x.label, detail: x.detail })),
  };
  const recommendations: RadarRecommendation[] = (report?.recommendations ?? []).map((r) => ({
    title: r.title, reason: r.reason, priority: r.priority, relatedTerritory: r.relatedTerritory ?? null, confidence: r.confidence,
  }));

  return {
    agencyId, agencyName: agency.name, city: agency.headquartersCity ?? territories[0]?.label ?? null,
    overall: score?.overall ?? null, threat: score?.competitionThreat ?? null, momentum: score?.momentum ?? null,
    dataConfidence: score?.dataConfidence ?? null,
    executiveSummary: report?.executiveSummary || null,
    territories, signals: signalRows, timeline: timelineRows, swot, recommendations,
  };
}

// ── Territory ranking for a city/neighborhood (across agencies) ──────────────
export interface RadarTerritoryFilters { city?: string | null; neighborhood?: string | null }
export async function getCompetitionRadarTerritories(filters: RadarTerritoryFilters): Promise<RadarTerritoryRow[]> {
  const org = await currentOrgId();
  const db = await createClient();
  if (!filters.city) return [];
  const type = filters.neighborhood ? "neighborhood" : "city";
  const key = territoryKey(type, filters.city, filters.neighborhood ?? null);
  const rows = await listByTerritory(type, key, DEFAULT_TERRITORY_PERIOD, 50);
  if (rows.length === 0) return [];

  const { data: agencyRows } = await db.from("agencies").select("id,name").eq("organization_id", org).in("id", rows.map((r) => r.agencyId));
  const nameById = new Map(((agencyRows as Obj[] | null) ?? []).map((r) => [r.id as string, r.name as string]));
  return rows.map((t) => ({
    agencyId: t.agencyId, agencyName: nameById.get(t.agencyId) ?? "משרד", territoryType: t.territoryType,
    label: territoryLabelOf(t.city, t.neighborhood, t.street),
    dominance: t.dominanceScore, inventoryShare: t.inventoryShare, momentum: t.momentumScore,
    trend: t.trend, confidence: t.confidence,
  }));
}

// ── Org-wide active signals (filterable) ─────────────────────────────────────
export interface RadarSignalFilters { severity?: RadarSeverity; limit?: number }
export async function getCompetitionRadarSignals(filters: RadarSignalFilters = {}): Promise<RadarSignalRow[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let q = db.from("agency_signals")
    .select("id,signal_type,severity,title,description,city,neighborhood,street,importance,confidence,detected_at")
    .eq("organization_id", org).eq("status", "active");
  if (filters.severity && filters.severity !== "all") q = q.eq("severity", filters.severity);
  const { data } = await q.order("importance", { ascending: false, nullsFirst: false }).order("detected_at", { ascending: false }).limit(filters.limit ?? 60);
  return ((data as Obj[] | null) ?? []).map((s) => ({
    id: s.id as string, signalType: s.signal_type as string, severity: str(s.severity), title: s.title as string,
    description: str(s.description), territoryLabel: str(s.street) || str(s.neighborhood) || str(s.city),
    importance: num(s.importance), confidence: num(s.confidence), detectedAt: (s.detected_at as string) ?? "",
  }));
}

// ── Org-wide recent meaningful timeline events ───────────────────────────────
export async function getCompetitionRadarTimeline(limit = 60): Promise<RadarTimelineRow[]> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agency_timeline")
    .select("id,event_type,title,importance,city,neighborhood,street,event_date")
    .eq("organization_id", org).order("importance", { ascending: false, nullsFirst: false }).order("event_date", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map((e) => ({
    id: e.id as string, eventType: e.event_type as string, title: e.title as string, importance: num(e.importance),
    territoryLabel: str(e.street) || str(e.neighborhood) || str(e.city), eventDate: (e.event_date as string) ?? "",
  }));
}

/** Bundle used by the page for the first server render. */
export interface CompetitionRadarBundle {
  overview: RadarOverview;
  agencies: RadarAgencySummary[];
  scoredCount: number;
  selected: RadarAgencyDetails | null;
}
export async function getCompetitionRadarBundle(): Promise<CompetitionRadarBundle> {
  const [overview, agencies] = await Promise.all([getCompetitionRadarOverview(), getCompetitionRadarAgencies()]);
  const selected = agencies.length ? await getCompetitionRadarAgencyDetails(agencies[0].id) : null;
  return { overview, agencies, scoredCount: agencies.length, selected };
}
