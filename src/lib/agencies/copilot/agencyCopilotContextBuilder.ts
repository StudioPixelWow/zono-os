// ============================================================================
// ZONO — PHASE 26.10: AI Copilot context builder (SERVER-ONLY).
// Loads ONLY the stored ZONO records relevant to the detected intent (reusing
// the Competition Radar read layer + a couple of direct grounded queries), then
// assembles a compact, confidence-aware context. Never fabricates data: absent
// records surface as empty slices + explicit missing_data notes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { getMyOperatingAreas } from "@/lib/operating-areas/service";
import {
  getCompetitionRadarAgencies, getCompetitionRadarTerritories,
  getCompetitionRadarSignals, getCompetitionRadarTimeline, getCompetitionRadarAgencyDetails,
} from "../ui/competitionRadarQueries";
import type {
  AgencyCopilotContext, AgencyCopilotIntent, ParsedAgencyQuery, CopilotOpportunity, CopilotAgencyDetail,
} from "./agencyCopilotTypes";
import type { RadarAgencySummary, RadarTerritoryRow, RadarSignalRow, RadarTimelineRow } from "../ui/competitionRadarFormat";

type Obj = Record<string, unknown>;
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

async function resolveUserArea(): Promise<{ city: string | null; neighborhood: string | null } | null> {
  try {
    const { areas } = await getMyOperatingAreas();
    if (areas.length === 0) return null;
    const primary = areas.find((a) => a.isPrimary && a.isActive) ?? areas.find((a) => a.isActive) ?? areas[0];
    return { city: primary.cityName || null, neighborhood: primary.neighborhoods[0] ?? null };
  } catch { return null; }
}

async function resolveAgencyDetail(name: string | null): Promise<CopilotAgencyDetail | null> {
  if (!name) return null;
  const org = await currentOrgId();
  const db = await createClient();
  const safe = name.replace(/[%,]/g, " ").trim();
  if (!safe) return null;
  const { data } = await db.from("agencies").select("id,name,display_name")
    .eq("organization_id", org).or(`name.ilike.%${safe}%,display_name.ilike.%${safe}%`).limit(1);
  const row = ((data as Obj[] | null) ?? [])[0];
  if (!row) return null;
  const d = await getCompetitionRadarAgencyDetails(row.id as string);
  if (!d) return null;
  return {
    agencyId: d.agencyId, agencyName: d.agencyName, city: d.city,
    overall: d.overall, threat: d.threat, momentum: d.momentum, dataConfidence: d.dataConfidence,
    executiveSummary: d.executiveSummary,
    topTerritories: d.territories.slice(0, 3), topSignals: d.signals.slice(0, 3),
  };
}

/** Low-competition neighborhoods within a city (grounded in territory stats). */
async function computeOpportunities(city: string | null): Promise<CopilotOpportunity[]> {
  if (!city) return [];
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agency_territory_stats")
    .select("territory_key,neighborhood,city,agency_id,dominance_score,inventory_share")
    .eq("organization_id", org).eq("territory_type", "neighborhood").eq("city", city).limit(2000);
  const rows = (data as Obj[] | null) ?? [];
  const byKey = new Map<string, { neighborhood: string | null; agencies: Set<string>; topDom: number | null }>();
  for (const r of rows) {
    const key = r.territory_key as string;
    const cur = byKey.get(key) ?? { neighborhood: (r.neighborhood as string) ?? null, agencies: new Set<string>(), topDom: null };
    cur.agencies.add(r.agency_id as string);
    const dom = r.dominance_score == null ? null : Number(r.dominance_score);
    if (dom != null && (cur.topDom == null || dom > cur.topDom)) cur.topDom = dom;
    byKey.set(key, cur);
  }
  const opps: CopilotOpportunity[] = [];
  for (const [, v] of byKey) {
    if (v.neighborhood && v.agencies.size <= 1) {
      opps.push({
        label: v.neighborhood, city, neighborhood: v.neighborhood,
        agencyCount: v.agencies.size,
        topDominance: v.topDom,
        reason: v.agencies.size === 0 ? "אין עדיין משרד דומיננטי" : "תחרות נמוכה — משרד יחיד פעיל",
      });
    }
  }
  return opps.sort((a, b) => a.agencyCount - b.agencyCount || (a.topDominance ?? 0) - (b.topDominance ?? 0)).slice(0, 5);
}

const EMPTY = {
  agencies: [] as RadarAgencySummary[], territories: [] as RadarTerritoryRow[],
  signals: [] as RadarSignalRow[], timeline: [] as RadarTimelineRow[], opportunities: [] as CopilotOpportunity[],
};

/** Assemble the grounded context for a parsed question + detected intent. */
export async function buildAgencyIntelContext(organizationId: string, parsed: ParsedAgencyQuery, intent: AgencyCopilotIntent): Promise<AgencyCopilotContext> {
  const userArea = await resolveUserArea();
  const resolvedArea = parsed.city || parsed.neighborhood
    ? { city: parsed.city, neighborhood: parsed.neighborhood }
    : userArea;

  const sources: { table: string; records: number }[] = [];
  const missingData: string[] = [];
  let agencies = EMPTY.agencies, territories = EMPTY.territories, signals = EMPTY.signals, timeline = EMPTY.timeline, opportunities = EMPTY.opportunities;
  let agencyDetail: CopilotAgencyDetail | null = null;
  let comparison: { a: CopilotAgencyDetail; b: CopilotAgencyDetail } | null = null;
  let confidence = 0;

  const loadAgencies = async () => { agencies = await getCompetitionRadarAgencies({ limit: 30 }); if (agencies.length) sources.push({ table: "agency_scores", records: agencies.length }); };
  const loadTerritories = async () => {
    if (!resolvedArea?.city) { missingData.push("לא זוהה אזור בשאלה — ציין עיר או שכונה."); return; }
    territories = await getCompetitionRadarTerritories({ city: resolvedArea.city, neighborhood: resolvedArea.neighborhood ?? null });
    if (territories.length) sources.push({ table: "agency_territory_stats", records: territories.length });
    else missingData.push(`אין עדיין נתוני שליטה אזורית עבור ${resolvedArea.neighborhood || resolvedArea.city}.`);
  };

  switch (intent) {
    case "top_agencies_in_area":
    case "dominance_by_area":
      await loadTerritories();
      confidence = avg(territories.map((t) => t.confidence).filter((x): x is number => x != null)) ?? (territories.length ? 0.5 : 0);
      break;
    case "strongest_competitor":
    case "high_threat_competitors":
      await loadAgencies();
      confidence = (avg(agencies.map((a) => a.dataConfidence).filter((x): x is number => x != null)) ?? (agencies.length ? 50 : 0)) / 100;
      if (agencies.length === 0) missingData.push("אין עדיין ציוני משרדים — הרץ חישוב ציוני מתחרים.");
      break;
    case "recent_growth":
      await loadAgencies();
      if (!agencies.some((a) => a.momentum != null)) missingData.push("אין עדיין נתוני מומנטום — נדרשת היסטוריית פעילות.");
      confidence = (avg(agencies.map((a) => a.dataConfidence).filter((x): x is number => x != null)) ?? (agencies.length ? 50 : 0)) / 100;
      break;
    case "territory_opportunity":
    case "weak_user_area":
      opportunities = await computeOpportunities(resolvedArea?.city ?? null);
      if (opportunities.length) sources.push({ table: "agency_territory_stats", records: opportunities.length });
      else if (!resolvedArea?.city) missingData.push("לא זוהה אזור — ציין עיר/שכונה או הגדר אזור התמחות.");
      else missingData.push("אין עדיין מספיק נתוני שליטה אזורית לזיהוי הזדמנויות.");
      confidence = opportunities.length ? 0.55 : 0;
      break;
    case "agency_summary":
      agencyDetail = await resolveAgencyDetail(parsed.agencyName);
      if (agencyDetail) { sources.push({ table: "agency_intelligence_reports", records: 1 }); confidence = (agencyDetail.dataConfidence ?? 50) / 100; }
      else missingData.push(`לא נמצא משרד בשם "${parsed.agencyName ?? ""}" בנתונים השמורים.`);
      break;
    case "agency_comparison": {
      const [n1, n2] = parsed.agencyNames.length >= 2 ? parsed.agencyNames : [parsed.agencyName, null];
      const [a, b] = await Promise.all([resolveAgencyDetail(n1 ?? null), resolveAgencyDetail(n2 ?? null)]);
      if (a && b) { comparison = { a, b }; sources.push({ table: "agency_scores", records: 2 }); confidence = clamp01((((a.dataConfidence ?? 50) + (b.dataConfidence ?? 50)) / 2) / 100); }
      else missingData.push("נדרשים שני שמות משרדים מדויקים להשוואה.");
      break;
    }
    case "signals_summary":
      [signals, timeline] = await Promise.all([getCompetitionRadarSignals({ limit: 20 }), getCompetitionRadarTimeline(20)]);
      if (signals.length) sources.push({ table: "agency_signals", records: signals.length });
      if (timeline.length) sources.push({ table: "agency_timeline", records: timeline.length });
      if (signals.length === 0 && timeline.length === 0) missingData.push("אין אותות שוק פעילים — נדרש זיהוי אותות.");
      confidence = avg(signals.map((s) => s.confidence).filter((x): x is number => x != null)) ?? (signals.length ? 0.5 : 0);
      break;
    default:
      confidence = 0;
  }

  const hasData = agencies.length > 0 || territories.length > 0 || signals.length > 0 || timeline.length > 0 || opportunities.length > 0 || agencyDetail != null || comparison != null;
  return {
    intent, parsed, organizationId, hasData, confidence: clamp01(confidence),
    missingData, sources, resolvedArea, userArea,
    agencies, territories, signals, timeline, opportunities, agencyDetail, comparison,
  };
}
