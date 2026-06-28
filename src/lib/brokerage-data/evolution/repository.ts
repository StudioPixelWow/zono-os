// ============================================================================
// ZONO Brokerage Evolution — repository (server-only). RLS-scoped reads for the
// historical BI dashboard + Time Machine. Service-role writes live in the job.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildLeaders } from "./growth";
import type { GrowthRow } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const n = (v: unknown): number => { const x = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(x) ? (x as number) : 0; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export interface NeighborhoodLeaderRow { city: string; neighborhood: string; listingVolume: number; marketShare: number; competitionLevel: string | null; concentration: number; avgPrice: number | null; confidence: number }
export interface MarketDnaRow { city: string; dominantOfficeCategory: string | null; dominantPropertyCategory: string | null; competitionIntensity: number; growthTrend: number; luxuryConcentration: number; officeDensity: number; agentDensity: number; volatility: number }
export interface PredictionRow { id: string; entityType: string | null; city: string | null; predictionType: string; likelihood: number; confidence: number; evidence: string[]; explanation: string | null; horizonDays: number }
export interface DnaRow { entityType: string; entityId: string; city: string | null; dna: Record<string, unknown>; career: Record<string, unknown>; confidence: number; evidence: string[] }
export interface SnapshotRow { entityKey: string; entityType: string; city: string | null; periodDate: string; listings: number; agents: number; marketShare: number; activity: number; dataQuality: number }

export const evolutionRepository = {
  /** The two most recent monthly snapshots → growth leaders (rising/declining). */
  async growthLeaders(entityType: "office" | "agent"): Promise<{ rising: GrowthRow[]; declining: GrowthRow[] }> {
    const db = await createClient();
    const { data } = await db.from("brokerage_entity_snapshots" as never)
      .select("entity_key,entity_type,city,period_date,listings,metrics")
      .eq("entity_type", entityType).eq("period", "month")
      .order("period_date", { ascending: false }).limit(4000);
    const rows = (data ?? []) as Row[];
    const dates = [...new Set(rows.map((r) => String(r.period_date)))].sort().reverse();
    if (dates.length < 2) return { rising: [], declining: [] };
    const [curr, prev] = dates;
    const currMap = new Map<string, Row>(), prevMap = new Map<string, Row>();
    for (const r of rows) { if (r.period_date === curr) currMap.set(String(r.entity_key), r); else if (r.period_date === prev) prevMap.set(String(r.entity_key), r); }
    const leaderRows: Omit<GrowthRow, "deltaPct">[] = [];
    for (const [key, c] of currMap) {
      const p = prevMap.get(key); if (!p) continue;
      const label = s((c.metrics as Row | undefined)?.label) ?? key;
      leaderRows.push({ key, label, entityType, city: s(c.city), prev: n(p.listings), curr: n(c.listings) });
    }
    return buildLeaders(leaderRows);
  },
  async neighborhoodLeaders(limit = 40): Promise<NeighborhoodLeaderRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_neighborhood_stats" as never).select("*").order("listing_volume", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map((r) => ({ city: String(r.city), neighborhood: String(r.neighborhood), listingVolume: n(r.listing_volume), marketShare: n(r.market_share), competitionLevel: s(r.competition_level), concentration: n(r.concentration), avgPrice: r.avg_price == null ? null : n(r.avg_price), confidence: n(r.confidence) }));
  },
  async marketDna(limit = 40): Promise<MarketDnaRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_market_dna" as never).select("*").order("competition_intensity", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map((r) => ({ city: String(r.city), dominantOfficeCategory: s(r.dominant_office_category), dominantPropertyCategory: s(r.dominant_property_category), competitionIntensity: n(r.competition_intensity), growthTrend: n(r.growth_trend), luxuryConcentration: n(r.luxury_concentration), officeDensity: n(r.office_density), agentDensity: n(r.agent_density), volatility: n(r.volatility) }));
  },
  async predictions(limit = 60): Promise<PredictionRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_predictions" as never).select("*").eq("status", "open").order("confidence", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), entityType: s(r.entity_type), city: s(r.city), predictionType: String(r.prediction_type), likelihood: n(r.likelihood), confidence: n(r.confidence), evidence: arr(r.evidence), explanation: s(r.explanation), horizonDays: n(r.horizon_days) }));
  },
  async dnaFor(entityType: "office" | "agent", entityId: string): Promise<DnaRow | null> {
    const db = await createClient();
    const { data } = await db.from("brokerage_entity_dna" as never).select("*").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
    if (!data) return null;
    const r = data as Row;
    return { entityType: String(r.entity_type), entityId: String(r.entity_id), city: s(r.city), dna: (r.dna && typeof r.dna === "object" ? r.dna : {}) as Record<string, unknown>, career: (r.career && typeof r.career === "object" ? r.career : {}) as Record<string, unknown>, confidence: n(r.confidence), evidence: arr(r.evidence) };
  },
  /** Career/office snapshot series for one entity (chronological). */
  async seriesForKey(entityKey: string): Promise<SnapshotRow[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_entity_snapshots" as never).select("*").eq("entity_key", entityKey).order("period_date", { ascending: true }).limit(120);
    return ((data ?? []) as Row[]).map((r) => ({ entityKey: String(r.entity_key), entityType: String(r.entity_type), city: s(r.city), periodDate: String(r.period_date), listings: n(r.listings), agents: n(r.agents), marketShare: n(r.market_share), activity: n(r.activity), dataQuality: n(r.data_quality) }));
  },
  /** Time Machine — latest snapshot per entity as of a date. */
  async marketAtDate(periodDate: string): Promise<{ offices: number; agents: number; topOffices: { label: string; listings: number; city: string | null }[] }> {
    const db = await createClient();
    const { data } = await db.from("brokerage_entity_snapshots" as never)
      .select("entity_key,entity_type,city,period_date,listings,metrics")
      .eq("period", "month").lte("period_date", periodDate)
      .order("period_date", { ascending: false }).limit(8000);
    const rows = (data ?? []) as Row[];
    const latest = new Map<string, Row>();
    for (const r of rows) { const k = String(r.entity_key); if (!latest.has(k)) latest.set(k, r); }
    const offices: Row[] = [], agents: Row[] = [];
    for (const r of latest.values()) { if (r.entity_type === "office") offices.push(r); else if (r.entity_type === "agent") agents.push(r); }
    const topOffices = offices.sort((a, b) => n(b.listings) - n(a.listings)).slice(0, 10)
      .map((r) => ({ label: s((r.metrics as Row | undefined)?.label) ?? String(r.entity_key), listings: n(r.listings), city: s(r.city) }));
    return { offices: offices.length, agents: agents.length, topOffices };
  },
};
