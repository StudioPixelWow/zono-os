// ============================================================================
// ZONO — PHASE 26.13: Agency Intelligence API Layer™ (SERVER-ONLY).
// One unified, org-isolated, typed source of truth for all agency-intelligence
// data. Composes the low-level repositories (scoring/territory/signals/reports/
// rain/resolution) — no duplicated queries, no duplicated business logic. Every
// function guards the organization and returns empty/null (never cross-org data
// or fabricated numbers) when access is denied or data is missing.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { assertOrgAccess } from "./agencyIntelligenceApiPermissions";
import { applyAgencyFilters, applySignalFilters, normalizeFilters } from "./agencyIntelligenceApiFilters";
import {
  toCardDTO, toCompetitiveDTO, toTerritoryRowDTO, toSignalDTO, toReportDTO, threatBand,
  threatDrivers, competitionLevel, buildSourceSummary, latestDate, type ScoreInput,
} from "./agencyIntelligenceApiMappers";
import { getAgencyById } from "../agencyRepository";
import { getScore, getTopByScore } from "../scoring/agencyScoringRepository";
import { listByAgency, listByTerritory } from "../territory/agencyTerritoryRepository";
import { territoryKey, DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import { listActiveSignals } from "../intelligence/agencySignalRepository";
import { getLatestReport, listReports } from "../reports/agencyReportRepository";
import { OPPORTUNITY_SIGNALS } from "../reports/agencyReportTypes";
import { getRainAgencyNetwork } from "@/lib/rain/rainGraphService";
import type {
  AgencyIntelligenceOverviewDTO, AgencyIntelligenceCardDTO, AgencyCompetitiveProfileDTO,
  AgencyTerritoryProfileDTO, AgencyThreatProfileDTO, AgencySignalsProfileDTO, AgencyReportsProfileDTO,
  AgencyGraphDTO, AgencyResolutionDTO, TerritoryIntelligenceDTO, AgencyComparisonDTO,
  AgencyIntelligenceAgencyDTO, AgencyOpportunityFeedDTO, AgencyIntelligenceFilters,
} from "./agencyIntelligenceApiTypes";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const scoreInput = (s: Awaited<ReturnType<typeof getScore>>): ScoreInput | null => (s ? (s as unknown as ScoreInput) : null);

const EMPTY_SOURCE = buildSourceSummary([], null, null, ["אין גישה או אין נתונים בארגון זה"]);

// ── Overview (single source of truth; /competition-radar delegates here) ─────
export async function getAgencyIntelligenceOverview(organizationId: string): Promise<AgencyIntelligenceOverviewDTO> {
  const guard = await assertOrgAccess(organizationId);
  const empty: AgencyIntelligenceOverviewDTO = {
    agencies: 0, agentsLinked: 0, scoredAgencies: 0, territories: 0, activeSignals: 0,
    highThreatCompetitors: 0, opportunities: 0, reportsGenerated: 0, pendingResolutions: 0,
    sourceSummary: EMPTY_SOURCE,
  };
  if (!guard.allowed || !guard.orgId) return empty;
  const org = guard.orgId;
  const db = await createClient();
  const cnt = async (table: string, build?: (q: ReturnType<typeof db.from>) => unknown): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from(table as never).select("id", { count: "exact", head: true }).eq("organization_id", org);
    if (build) q = build(q) ?? q;
    const { count } = await q; return count ?? 0;
  };
  const [agencies, agentsLinked, scoredAgencies, activeSignals, highThreat, opportunities, reportsGenerated, pendingResolutions, terrKeys] = await Promise.all([
    cnt("agencies", (q) => (q as { eq: (a: string, b: unknown) => unknown }).eq("active", true)),
    cnt("agency_agents"),
    cnt("agency_scores"),
    cnt("agency_signals", (q) => (q as { eq: (a: string, b: unknown) => unknown }).eq("status", "active")),
    (async () => { const { count } = await db.from("agency_scores").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("competition_threat", 70); return count ?? 0; })(),
    (async () => { const { count } = await db.from("agency_signals").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active").in("signal_type", [...OPPORTUNITY_SIGNALS]); return count ?? 0; })(),
    cnt("agency_intelligence_reports"),
    cnt("agency_resolution_candidates", (q) => (q as { eq: (a: string, b: unknown) => unknown }).eq("status", "pending")),
    (async () => { const { data } = await db.from("agency_territory_stats").select("territory_key").eq("organization_id", org).limit(5000); return new Set(((data as Obj[] | null) ?? []).map((r) => r.territory_key as string)).size; })(),
  ]);
  return {
    agencies, agentsLinked, scoredAgencies, territories: terrKeys, activeSignals,
    highThreatCompetitors: highThreat, opportunities, reportsGenerated, pendingResolutions,
    sourceSummary: buildSourceSummary(
      ["agencies", "agency_agents", "agency_scores", "agency_signals", "agency_territory_stats", "agency_intelligence_reports", "agency_resolution_candidates"],
      null, null, scoredAgencies === 0 ? ["אין עדיין ציונים למשרדים"] : [],
    ),
  };
}

// ── Top competitors (enriched cards) ─────────────────────────────────────────
export async function getTopCompetitors(organizationId: string, filters: AgencyIntelligenceFilters = {}): Promise<AgencyIntelligenceCardDTO[]> {
  const guard = await assertOrgAccess(organizationId);
  if (!guard.allowed || !guard.orgId) return [];
  const org = guard.orgId;
  const db = await createClient();
  const f = normalizeFilters(filters);
  const scores = await getTopByScore(filters.sortBy === "overall" ? "overall" : "competitionThreat", Math.min(f.limit + f.offset + 20, 200));
  if (scores.length === 0) return [];
  const ids = scores.map((s) => s.agencyId);
  const [agencyRows, cityRows, signalRows, reportRows] = await Promise.all([
    db.from("agencies").select("id,name,display_name,headquarters_city").in("id", ids),
    db.from("agency_territory_stats").select("agency_id,city,dominance_score").eq("organization_id", org).eq("territory_type", "city").in("agency_id", ids),
    db.from("agency_signals").select("agency_id,title,importance").eq("organization_id", org).eq("status", "active").in("agency_id", ids).order("importance", { ascending: false, nullsFirst: false }),
    db.from("agency_intelligence_reports").select("agency_id,executive_summary,generated_at").eq("organization_id", org).in("agency_id", ids).order("generated_at", { ascending: false }),
  ]);
  const agencyById = new Map(((agencyRows.data as Obj[] | null) ?? []).map((r) => [r.id as string, r]));
  const topCity = new Map<string, { city: string | null; dom: number }>();
  for (const r of (cityRows.data as Obj[] | null) ?? []) { const id = r.agency_id as string; const dom = num(r.dominance_score) ?? -1; const cur = topCity.get(id); if (!cur || dom > cur.dom) topCity.set(id, { city: str(r.city), dom }); }
  const topSignal = new Map<string, string>();
  for (const r of (signalRows.data as Obj[] | null) ?? []) { const id = r.agency_id as string; if (!topSignal.has(id)) topSignal.set(id, r.title as string); }
  const snippet = new Map<string, string>();
  for (const r of (reportRows.data as Obj[] | null) ?? []) { const id = r.agency_id as string; if (!snippet.has(id) && str(r.executive_summary)) snippet.set(id, (r.executive_summary as string).slice(0, 220)); }

  const cards = scores.map((s) => {
    const a = agencyById.get(s.agencyId);
    return toCardDTO({
      agencyId: s.agencyId, name: (a?.name as string) ?? "משרד", displayName: str(a?.display_name),
      city: topCity.get(s.agencyId)?.city ?? str(a?.headquarters_city), score: s as unknown as ScoreInput,
      topSignalTitle: topSignal.get(s.agencyId) ?? null, summarySnippet: snippet.get(s.agencyId) ?? null,
    });
  });
  return applyAgencyFilters(cards, filters);
}

export async function searchAgencyIntelligence(organizationId: string, filters: AgencyIntelligenceFilters = {}): Promise<AgencyIntelligenceCardDTO[]> {
  return getTopCompetitors(organizationId, filters);
}

// ── Per-agency profiles ──────────────────────────────────────────────────────
async function agencyHeader(organizationId: string): Promise<{ allowed: boolean; orgId: string | null }> {
  return assertOrgAccess(organizationId);
}

export async function getAgencyCompetitiveProfile(organizationId: string, agencyId: string): Promise<AgencyCompetitiveProfileDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const score = await getScore(agencyId);
  return toCompetitiveDTO(agencyId, agency.name, scoreInput(score));
}

export async function getAgencyTerritoryProfile(organizationId: string, agencyId: string): Promise<AgencyTerritoryProfileDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const rows = await listByAgency(agencyId, DEFAULT_TERRITORY_PERIOD);
  const territories = rows.map((t) => toTerritoryRowDTO(t as unknown as Parameters<typeof toTerritoryRowDTO>[0])).sort((a, b) => (b.dominance ?? -1) - (a.dominance ?? -1));
  return {
    agencyId, territories,
    sourceSummary: buildSourceSummary(["agency_territory_stats"], latestDate(...rows.map((r) => r.calculatedAt)), null, territories.length === 0 ? ["אין נתוני שליטה אזורית למשרד זה"] : []),
  };
}

export async function getAgencySignalsProfile(organizationId: string, agencyId: string, filters: AgencyIntelligenceFilters = {}): Promise<AgencySignalsProfileDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const rows = await listActiveSignals(agencyId, 60);
  const signals = applySignalFilters(rows.map(toSignalDTO), filters);
  return {
    agencyId, signals,
    sourceSummary: buildSourceSummary(["agency_signals"], latestDate(...rows.map((r) => r.detectedAt)), null, rows.length === 0 ? ["אין אותות פעילים למשרד זה"] : []),
  };
}

export async function getAgencyThreatProfile(organizationId: string, agencyId: string): Promise<AgencyThreatProfileDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const [score, signals] = await Promise.all([getScore(agencyId), listActiveSignals(agencyId, 5)]);
  const s = scoreInput(score);
  const threat = s?.competitionThreat ?? null;
  return {
    agencyId, threat, threatBand: threatBand(threat), momentum: s?.momentum ?? null,
    drivers: threatDrivers(s), topSignals: signals.map(toSignalDTO),
    sourceSummary: buildSourceSummary(["agency_scores", "agency_signals"], score?.calculatedAt ?? null, score?.dataConfidence ?? null, threat == null ? ["ציון איום עדיין לא חושב"] : []),
  };
}

export async function getAgencyReportsProfile(organizationId: string, agencyId: string): Promise<AgencyReportsProfileDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const [latest, history] = await Promise.all([getLatestReport(agencyId, "full_report"), listReports(agencyId, 12)]);
  return {
    agencyId, latest: toReportDTO(latest as unknown as Parameters<typeof toReportDTO>[0]),
    history: history.map((r) => ({ reportType: r.reportType, periodEnd: r.periodEnd || null, dataConfidence: r.dataConfidence })),
    sourceSummary: buildSourceSummary(["agency_intelligence_reports"], latest?.generatedAt ?? null, latest?.dataConfidence ?? null, latest ? [] : ["עדיין לא הופק דוח מודיעין למשרד זה"]),
  };
}

export async function getAgencyGraphProfile(organizationId: string, agencyId: string): Promise<AgencyGraphDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed || !g.orgId) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const graph = await getRainAgencyNetwork(g.orgId, agencyId, 2);
  return {
    agencyId,
    nodes: graph.nodes.map((n) => ({ id: n.id, nodeType: n.nodeType, label: n.label, importance: n.importanceScore })),
    edges: graph.edges.map((e) => ({ source: e.sourceNodeId, target: e.targetNodeId, edgeType: e.edgeType, strength: e.strength })),
    stats: { totalNodes: graph.stats.totalNodes, totalEdges: graph.stats.totalEdges },
    sourceSummary: buildSourceSummary(["rain_nodes", "rain_edges"], null, null, graph.nodes.length === 0 ? ["גרף RAIN לא נבנה עדיין — הרץ את בניית הגרף"] : []),
  };
}

export async function getAgencyResolutionProfile(organizationId: string, agencyId: string): Promise<AgencyResolutionDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed || !g.orgId) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const db = await createClient();
  const [cands, fb] = await Promise.all([
    db.from("agency_resolution_candidates").select("id,raw_text,status,confidence,created_at").eq("organization_id", g.orgId).eq("matched_agency_id", agencyId).order("created_at", { ascending: false }).limit(50),
    db.from("agency_ai_feedback").select("action,reviewed_at,feedback_reason").eq("organization_id", g.orgId).eq("agency_id", agencyId).order("reviewed_at", { ascending: false }).limit(50),
  ]);
  const candidates = ((cands.data as Obj[] | null) ?? []).map((c) => ({ candidateId: c.id as string, detectedName: (c.raw_text as string) ?? "", status: (c.status as string) ?? "pending", confidence: num(c.confidence), createdAt: (c.created_at as string) ?? "" }));
  const feedback = ((fb.data as Obj[] | null) ?? []).map((r) => ({ action: r.action as string, reviewedAt: (r.reviewed_at as string) ?? "", reason: str(r.feedback_reason) }));
  return {
    agencyId, candidates, feedback,
    sourceSummary: buildSourceSummary(["agency_resolution_candidates", "agency_ai_feedback"], feedback[0]?.reviewedAt ?? null, null, candidates.length === 0 ? ["אין מועמדי זיהוי מקושרים למשרד זה"] : []),
  };
}

/** Full per-agency composite. */
export async function getAgencyIntelligenceAgency(organizationId: string, agencyId: string): Promise<AgencyIntelligenceAgencyDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const agency = await getAgencyById(agencyId); if (!agency) return null;
  const [competitive, territory, threat, signals, reports, graph, resolution] = await Promise.all([
    getAgencyCompetitiveProfile(organizationId, agencyId), getAgencyTerritoryProfile(organizationId, agencyId),
    getAgencyThreatProfile(organizationId, agencyId), getAgencySignalsProfile(organizationId, agencyId),
    getAgencyReportsProfile(organizationId, agencyId), getAgencyGraphProfile(organizationId, agencyId),
    getAgencyResolutionProfile(organizationId, agencyId),
  ]);
  const score = await getScore(agencyId);
  const card = toCardDTO({
    agencyId, name: agency.name, displayName: agency.legalName ?? null, city: agency.headquartersCity ?? null,
    score: scoreInput(score), topSignalTitle: signals?.signals[0]?.title ?? null, summarySnippet: reports?.latest?.executiveSummary ?? null,
  });
  return {
    agencyId, card,
    competitive: competitive!, territory: territory!, threat: threat!, signals: signals!, reports: reports!, graph: graph!, resolution: resolution!,
    sourceSummary: buildSourceSummary(["agency_scores", "agency_territory_stats", "agency_signals", "agency_intelligence_reports", "rain_nodes"], score?.calculatedAt ?? null, score?.dataConfidence ?? null, []),
  };
}

// ── Comparison ───────────────────────────────────────────────────────────────
export async function compareAgencies(organizationId: string, agencyAId: string, agencyBId: string): Promise<AgencyComparisonDTO | null> {
  const g = await agencyHeader(organizationId); if (!g.allowed) return null;
  const [a, b] = await Promise.all([getAgencyCompetitiveProfile(organizationId, agencyAId), getAgencyCompetitiveProfile(organizationId, agencyBId)]);
  if (!a || !b) return null;
  const metrics: { metric: string; key: keyof AgencyCompetitiveProfileDTO["scores"] }[] = [
    { metric: "כללי", key: "overall" }, { metric: "איום", key: "threat" }, { metric: "מומנטום", key: "momentum" },
    { metric: "צמיחה", key: "growth" }, { metric: "עוצמת שוק", key: "marketStrength" },
  ];
  const deltas = metrics.map(({ metric, key }) => {
    const av = a.scores[key], bv = b.scores[key];
    return { metric, a: av, b: bv, delta: av != null && bv != null ? av - bv : null };
  });
  const winnerByOverall = a.scores.overall != null && b.scores.overall != null ? (a.scores.overall >= b.scores.overall ? a.agencyId : b.agencyId) : null;
  return { a, b, winnerByOverall, deltas, sourceSummary: buildSourceSummary(["agency_scores"], null, null, winnerByOverall == null ? ["חסר ציון כללי לאחד המשרדים — השוואה חלקית"] : []) };
}

// ── Territory intelligence ───────────────────────────────────────────────────
export async function getTerritoryIntelligence(organizationId: string, territory: { city: string | null; neighborhood?: string | null; street?: string | null }): Promise<TerritoryIntelligenceDTO> {
  const g = await agencyHeader(organizationId);
  const empty: TerritoryIntelligenceDTO = { territory: { city: territory.city ?? null, neighborhood: territory.neighborhood ?? null, street: territory.street ?? null }, agencies: [], leaderAgencyId: null, competitionLevel: null, sourceSummary: EMPTY_SOURCE };
  if (!g.allowed || !g.orgId || !territory.city) return { ...empty, sourceSummary: buildSourceSummary(["agency_territory_stats"], null, null, ["נדרש אזור (עיר) לחישוב מודיעין אזורי"]) };
  const type = territory.street ? "street" : territory.neighborhood ? "neighborhood" : "city";
  const key = territoryKey(type, territory.city, territory.neighborhood ?? null, territory.street ?? null);
  const rows = await listByTerritory(type, key, DEFAULT_TERRITORY_PERIOD, 50);
  if (rows.length === 0) return { ...empty, sourceSummary: buildSourceSummary(["agency_territory_stats"], null, null, ["אין עדיין נתוני שליטה אזורית לאזור זה"]) };
  const db = await createClient();
  const { data: ag } = await db.from("agencies").select("id,name,display_name").eq("organization_id", g.orgId).in("id", rows.map((r) => r.agencyId));
  const nameById = new Map(((ag as Obj[] | null) ?? []).map((r) => [r.id as string, str(r.display_name) ?? (r.name as string)]));
  const agencies = rows.map((t) => ({ ...toTerritoryRowDTO(t as unknown as Parameters<typeof toTerritoryRowDTO>[0]), agencyId: t.agencyId, agencyName: nameById.get(t.agencyId) ?? "משרד" }))
    .sort((a, b) => (b.dominance ?? -1) - (a.dominance ?? -1));
  return {
    territory: { city: territory.city, neighborhood: territory.neighborhood ?? null, street: territory.street ?? null },
    agencies, leaderAgencyId: agencies[0]?.agencyId ?? null, competitionLevel: competitionLevel(new Set(rows.map((r) => r.agencyId)).size),
    sourceSummary: buildSourceSummary(["agency_territory_stats"], latestDate(...rows.map((r) => r.calculatedAt)), null, []),
  };
}

// ── Opportunity feed ─────────────────────────────────────────────────────────
export async function getAgencyOpportunityFeed(organizationId: string, filters: AgencyIntelligenceFilters = {}): Promise<AgencyOpportunityFeedDTO> {
  const g = await agencyHeader(organizationId);
  if (!g.allowed || !g.orgId) return { opportunities: [], sourceSummary: EMPTY_SOURCE };
  const db = await createClient();
  let q = db.from("agency_signals").select("title,description,city,neighborhood,signal_type,importance,detected_at")
    .eq("organization_id", g.orgId).eq("status", "active").in("signal_type", [...OPPORTUNITY_SIGNALS]);
  if (filters.city) q = q.eq("city", filters.city);
  const { data } = await q.order("importance", { ascending: false, nullsFirst: false }).limit(normalizeFilters(filters).limit);
  const rows = (data as Obj[] | null) ?? [];
  return {
    opportunities: rows.map((r) => ({ label: (r.title as string) ?? "הזדמנות", city: str(r.city), neighborhood: str(r.neighborhood), agencyCount: null, reason: str(r.description) ?? (r.signal_type as string) ?? "אות הזדמנות" })),
    sourceSummary: buildSourceSummary(["agency_signals"], latestDate(...rows.map((r) => r.detected_at as string)), null, rows.length === 0 ? ["אין כרגע אותות הזדמנות פעילים"] : []),
  };
}
