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
import { getScore, getTopByScore } from "../scoring/agencyScoringRepository";
import { listByAgency as listTerr, listByTerritory } from "../territory/agencyTerritoryRepository";
import { territoryKey, DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import { listActiveSignals, listTimelineIntelligence } from "../intelligence/agencySignalRepository";
import { getLatestReport } from "../reports/agencyReportRepository";
import { OPPORTUNITY_SIGNALS } from "../reports/agencyReportTypes";
import type {
  RadarOverview, RadarAgencySummary, RadarAgencyDetails, RadarTerritoryRow,
  RadarSignalRow, RadarTimelineRow, RadarSwot, RadarRecommendation, RadarSeverity,
} from "./competitionRadarFormat";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const territoryLabelOf = (city: string | null, neighborhood: string | null, street: string | null) =>
  street || neighborhood || city || "—";

async function count(table: string, build: (q: ReturnType<Awaited<ReturnType<typeof createClient>>["from"]>) => unknown): Promise<number> {
  const org = await currentOrgId();
  const db = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.from(table as never).select("id", { count: "exact", head: true }).eq("organization_id", org);
  q = build(q) ?? q;
  const { count: c } = await q;
  return c ?? 0;
}

// ── Overview KPIs (real counts only) ─────────────────────────────────────────
export async function getCompetitionRadarOverview(): Promise<RadarOverview> {
  const org = await currentOrgId();
  const db = await createClient();

  const [agencies, agentsLinked, activeSignals, highThreat, opportunities, terrKeys] = await Promise.all([
    count("agencies", (q) => (q as { eq: (a: string, b: unknown) => unknown }).eq("active", true)),
    count("agency_agents", () => undefined),
    count("agency_signals", (q) => (q as { eq: (a: string, b: unknown) => unknown }).eq("status", "active")),
    (async () => {
      const { count: c } = await db.from("agency_scores").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("competition_threat", 70);
      return c ?? 0;
    })(),
    (async () => {
      const { count: c } = await db.from("agency_signals").select("id", { count: "exact", head: true })
        .eq("organization_id", org).eq("status", "active").in("signal_type", [...OPPORTUNITY_SIGNALS]);
      return c ?? 0;
    })(),
    (async () => {
      const { data } = await db.from("agency_territory_stats").select("territory_key").eq("organization_id", org).limit(5000);
      return new Set(((data as Obj[] | null) ?? []).map((r) => r.territory_key as string)).size;
    })(),
  ]);

  return { agencies, agentsLinked, territories: terrKeys, activeSignals, highThreat, opportunities };
}

// ── Agency threat list (scored agencies, enriched from real tables) ──────────
export interface RadarAgencyFilters { limit?: number }
export async function getCompetitionRadarAgencies(filters: RadarAgencyFilters = {}): Promise<RadarAgencySummary[]> {
  const org = await currentOrgId();
  const db = await createClient();
  const scores = await getTopByScore("competitionThreat", filters.limit ?? 60);
  if (scores.length === 0) return [];
  const ids = scores.map((s) => s.agencyId);

  const [agencyRows, cityRows, signalRows, reportRows] = await Promise.all([
    db.from("agencies").select("id,name,headquarters_city").in("id", ids),
    db.from("agency_territory_stats").select("agency_id,city,dominance_score").eq("organization_id", org).eq("territory_type", "city").in("agency_id", ids),
    db.from("agency_signals").select("agency_id,title,importance").eq("organization_id", org).eq("status", "active").in("agency_id", ids).order("importance", { ascending: false, nullsFirst: false }),
    db.from("agency_intelligence_reports").select("agency_id,executive_summary,generated_at").eq("organization_id", org).in("agency_id", ids).order("generated_at", { ascending: false }),
  ]);

  const agencyById = new Map(((agencyRows.data as Obj[] | null) ?? []).map((r) => [r.id as string, r]));
  const topCity = new Map<string, { city: string | null; dom: number }>();
  for (const r of (cityRows.data as Obj[] | null) ?? []) {
    const id = r.agency_id as string; const dom = num(r.dominance_score) ?? -1;
    const cur = topCity.get(id);
    if (!cur || dom > cur.dom) topCity.set(id, { city: str(r.city), dom });
  }
  const topSignal = new Map<string, string>();
  for (const r of (signalRows.data as Obj[] | null) ?? []) { const id = r.agency_id as string; if (!topSignal.has(id)) topSignal.set(id, r.title as string); }
  const snippet = new Map<string, string>();
  for (const r of (reportRows.data as Obj[] | null) ?? []) { const id = r.agency_id as string; if (!snippet.has(id) && str(r.executive_summary)) snippet.set(id, (r.executive_summary as string).slice(0, 220)); }

  return scores.map((s) => {
    const a = agencyById.get(s.agencyId);
    return {
      id: s.agencyId, name: (a?.name as string) ?? "משרד",
      city: topCity.get(s.agencyId)?.city ?? str(a?.headquarters_city),
      overall: s.overall, threat: s.competitionThreat ?? null, momentum: s.momentum,
      dataConfidence: s.dataConfidence ?? null,
      topSignalTitle: topSignal.get(s.agencyId) ?? null,
      summarySnippet: snippet.get(s.agencyId) ?? null,
    };
  });
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
