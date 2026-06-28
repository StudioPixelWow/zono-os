// ============================================================================
// ZONO Brokerage EVOLUTION INTELLIGENCE™ — service (server-only).
// Turns the current-state brokerage knowledge into a HISTORICAL intelligence
// engine. recomputeBrokerageEvolution() is the background job: it writes a new
// monthly snapshot per entity (the temporal backbone), recomputes DNA + agent
// career + neighborhood dominance + market DNA, detects evolution events vs the
// previous snapshot (append-only stream), and derives trend predictions from
// the accumulated history. getMarketAtDate() is the Time Machine; getEvolution
// Dashboard() composes the read model. Deterministic · additive · explainable ·
// predictions are NEVER presented as fact · public business data only.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getBrokerageAccess } from "../permissions";
import { sameCity } from "../normalize";
import {
  estimateDNA, computeCareer, computeNeighborhoodDominance, computeMarketDNA, hhi,
  predictTrend, detectGrowthEvents,
  type ListingProfile, type MarketDnaInput, type NeighborhoodInput,
} from "./index";
import { evolutionRepository } from "./repository";
import type { BrokerageAccess } from "../types";
import type { PredictionType } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numv = (v: unknown): number => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return Number.isFinite(n) ? (n as number) : 0; };
const nowISO = () => new Date().toISOString();
/** First day of the current month (UTC) as YYYY-MM-DD — the snapshot bucket. */
function monthBucket(d = new Date()): string { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function monthKey(iso: string | null): string | null { if (!iso) return null; const d = new Date(iso); if (Number.isNaN(d.getTime())) return null; return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }

export interface EvolutionRefreshResult {
  offices: number; agents: number; snapshots: number; dnaRows: number;
  neighborhoods: number; markets: number; predictions: number; events: number; ms: number;
}

interface OfficeRow { id: string; name: string; city: string | null; brand_network: string | null; confidence_score: number; status: string; first_seen_at: string | null; website_url: string | null }
interface AgentRow { id: string; full_name: string; office_id: string | null; city: string | null; confidence_score: number; status: string; first_seen_at: string | null; primary_phone: string | null }

/**
 * Background job — recompute the entire evolution layer. Each stage is
 * best-effort (one failure never aborts the run). Service-role; bounded caps;
 * batched upserts. Snapshots are append-only per (entity_key, month).
 */
export async function recomputeBrokerageEvolution(): Promise<EvolutionRefreshResult> {
  const t0 = Date.now();
  const db = createServiceRoleClient();
  const out: EvolutionRefreshResult = { offices: 0, agents: 0, snapshots: 0, dnaRows: 0, neighborhoods: 0, markets: 0, predictions: 0, events: 0, ms: 0 };
  const bucket = monthBucket();

  const { data: offData } = await db.from("brokerage_offices" as never)
    .select("id,name,city,brand_network,confidence_score,status,first_seen_at,website_url").limit(3000);
  const offices = (offData ?? []) as unknown as OfficeRow[];
  const { data: agData } = await db.from("brokerage_agents" as never)
    .select("id,full_name,office_id,city,confidence_score,status,first_seen_at,primary_phone").limit(8000);
  const agents = (agData ?? []) as unknown as AgentRow[];
  const { data: linkData } = await db.from("brokerage_external_listing_links" as never)
    .select("external_listing_id,agent_id,office_id,city,created_at").limit(20000);
  const links = (linkData ?? []) as Row[];
  out.offices = offices.length; out.agents = agents.length;

  // ── Resolve listing attributes for linked external listings (chunked in()) ──
  const listingIds = [...new Set(links.map((l) => str(l.external_listing_id)).filter((x): x is string => !!x))];
  const listingMeta = new Map<string, ListingProfile>();
  for (let i = 0; i < listingIds.length; i += 500) {
    const chunk = listingIds.slice(i, i + 500);
    const { data } = await db.from("external_listings" as never).select("id,property_type,deal_type,price,city,neighborhood").in("id", chunk as never);
    for (const r of (data ?? []) as Row[]) listingMeta.set(String(r.id), { propertyType: str(r.property_type), dealType: str(r.deal_type), price: r.price == null ? null : numv(r.price), city: str(r.city), neighborhood: str(r.neighborhood) });
  }

  // ── Aggregate per office / agent / neighborhood / city ──────────────────────
  const since30 = Date.now() - 30 * 86_400_000;
  const officeListings = new Map<string, ListingProfile[]>();
  const officeRecent = new Map<string, number>();
  const agentListings = new Map<string, ListingProfile[]>();
  const agentMonths = new Map<string, Map<string, number>>();          // agent → month → count (career series)
  const cityListings = new Map<string, ListingProfile[]>();
  const cityOfficeCounts = new Map<string, Map<string, number>>();     // city → office → listings (shares)
  const nbhd = new Map<string, { city: string; neighborhood: string; offices: Map<string, number>; agents: Map<string, number>; prices: number[]; total: number }>();

  for (const l of links) {
    const lid = str(l.external_listing_id); const meta = lid ? listingMeta.get(lid) : undefined;
    const profile: ListingProfile = meta ?? { propertyType: null, dealType: null, price: null, city: str(l.city), neighborhood: null };
    const oid = str(l.office_id), aid = str(l.agent_id);
    const city = profile.city ?? str(l.city);
    const recent = typeof l.created_at === "string" && new Date(l.created_at).getTime() >= since30;
    if (oid) {
      (officeListings.get(oid) ?? officeListings.set(oid, []).get(oid)!).push(profile);
      if (recent) officeRecent.set(oid, (officeRecent.get(oid) ?? 0) + 1);
      if (city) { const cm = cityOfficeCounts.get(city) ?? cityOfficeCounts.set(city, new Map()).get(city)!; cm.set(oid, (cm.get(oid) ?? 0) + 1); }
    }
    if (aid) {
      (agentListings.get(aid) ?? agentListings.set(aid, []).get(aid)!).push(profile);
      const mk = monthKey(typeof l.created_at === "string" ? l.created_at : null);
      if (mk) { const am = agentMonths.get(aid) ?? agentMonths.set(aid, new Map()).get(aid)!; am.set(mk, (am.get(mk) ?? 0) + 1); }
    }
    if (city) (cityListings.get(city) ?? cityListings.set(city, []).get(city)!).push(profile);
    if (city && profile.neighborhood) {
      const key = `${city}|${profile.neighborhood}`;
      const e = nbhd.get(key) ?? nbhd.set(key, { city, neighborhood: profile.neighborhood, offices: new Map(), agents: new Map(), prices: [], total: 0 }).get(key)!;
      e.total++; if (typeof profile.price === "number") e.prices.push(profile.price);
      if (oid) e.offices.set(oid, (e.offices.get(oid) ?? 0) + 1);
      if (aid) e.agents.set(aid, (e.agents.get(aid) ?? 0) + 1);
    }
  }
  const agentsByOffice = new Map<string, number>();
  for (const a of agents) if (a.office_id) agentsByOffice.set(a.office_id, (agentsByOffice.get(a.office_id) ?? 0) + 1);
  const officeById = new Map(offices.map((o) => [o.id, o]));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  // ── Snapshots (monthly backbone) ────────────────────────────────────────────
  const snapRows: Row[] = [];
  const cityTotals = new Map<string, number>();
  for (const [city, list] of cityListings) cityTotals.set(city, list.length);
  for (const o of offices) {
    const list = officeListings.get(o.id) ?? [];
    const share = o.city && cityTotals.get(o.city) ? Math.round((list.length / cityTotals.get(o.city)!) * 1000) / 10 : 0;
    snapRows.push({ entity_type: "office", entity_id: o.id, entity_key: `office:${o.id}`, city: o.city, period: "month", period_date: bucket, listings: list.length, agents: agentsByOffice.get(o.id) ?? 0, market_share: share, activity: officeRecent.get(o.id) ?? 0, data_quality: numv(o.confidence_score), metrics: { label: o.name, network: o.brand_network } as never });
  }
  for (const a of agents) {
    const list = agentListings.get(a.id) ?? [];
    snapRows.push({ entity_type: "agent", entity_id: a.id, entity_key: `agent:${a.id}`, city: a.city, period: "month", period_date: bucket, listings: list.length, agents: 0, market_share: 0, activity: list.length, data_quality: numv(a.confidence_score), metrics: { label: a.full_name, officeId: a.office_id } as never });
  }
  for (const [city, list] of cityListings) {
    const offCount = offices.filter((o) => sameCity(o.city, city)).length;
    const agCount = agents.filter((ag) => sameCity(ag.city, city)).length;
    snapRows.push({ entity_type: "city", entity_id: null, entity_key: `city:${city}`, city, period: "month", period_date: bucket, listings: list.length, agents: agCount, market_share: 0, activity: list.length, data_quality: 0, cities_count: 1, metrics: { label: city, offices: offCount } as never });
  }
  try {
    for (let i = 0; i < snapRows.length; i += 500) await db.from("brokerage_entity_snapshots" as never).upsert(snapRows.slice(i, i + 500) as never, { onConflict: "entity_key,period,period_date" });
    out.snapshots = snapRows.length;
  } catch (e) { console.error("[evolution] snapshots failed:", e); }

  // ── DNA (office) + DNA + career (agent) ─────────────────────────────────────
  try {
    const dnaRows: Row[] = [];
    for (const o of offices) {
      const list = officeListings.get(o.id); if (!list || !list.length) continue;
      const dna = estimateDNA(list, { digitalPresence: o.website_url ? 60 : 20 });
      dnaRows.push({ entity_type: "office", entity_id: o.id, city: o.city, dna: dna as never, career: {} as never, confidence: dna.confidence, evidence: dna.evidence as never, computed_at: nowISO() });
    }
    for (const a of agents) {
      const list = agentListings.get(a.id); if (!list || !list.length) continue;
      const dna = estimateDNA(list, { digitalPresence: a.primary_phone ? 40 : 15 });
      const months = agentMonths.get(a.id) ?? new Map();
      const series = [...months.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([date, listings]) => ({ date, listings }));
      const career = computeCareer({ firstSeen: a.first_seen_at, lastSeen: null, activitySeries: series, officeChanges: 0, inactiveGaps: 0, specialization: dna.primarySpecialization });
      dnaRows.push({ entity_type: "agent", entity_id: a.id, city: a.city, dna: dna as never, career: career as never, confidence: dna.confidence, evidence: dna.evidence as never, computed_at: nowISO() });
    }
    for (let i = 0; i < dnaRows.length; i += 500) await db.from("brokerage_entity_dna" as never).upsert(dnaRows.slice(i, i + 500) as never, { onConflict: "entity_type,entity_id" });
    out.dnaRows = dnaRows.length;
  } catch (e) { console.error("[evolution] dna failed:", e); }

  // ── Neighborhood dominance ──────────────────────────────────────────────────
  try {
    const rows: Row[] = [];
    for (const e of nbhd.values()) {
      if (e.total < 2) continue;
      const input: NeighborhoodInput = {
        city: e.city, neighborhood: e.neighborhood,
        offices: [...e.offices.entries()].map(([id, listings]) => ({ id, label: officeById.get(id)?.name ?? id, listings })),
        agents: [...e.agents.entries()].map(([id, listings]) => ({ id, label: agentById.get(id)?.full_name ?? id, listings })),
        totalListings: e.total, avgPrice: e.prices.length ? Math.round(e.prices.reduce((a, b) => a + b, 0) / e.prices.length) : null,
        priceTrend: 0, activityTrend: 0,
      };
      const d = computeNeighborhoodDominance(input);
      rows.push({ city: e.city, neighborhood: e.neighborhood, leading_office_id: d.leadingOfficeId, leading_agent_id: d.leadingAgentId, listing_volume: d.listingVolume, avg_price: d.avgPrice, price_trend: 0, activity_trend: 0, competition_level: d.competitionLevel, concentration: d.concentration, market_share: d.marketShare, coverage_pct: d.coveragePct, growth: d.growth, confidence: d.confidence, computed_at: nowISO() });
    }
    for (let i = 0; i < rows.length; i += 500) await db.from("brokerage_neighborhood_stats" as never).upsert(rows.slice(i, i + 500) as never, { onConflict: "city,neighborhood" });
    out.neighborhoods = rows.length;
  } catch (e) { console.error("[evolution] neighborhoods failed:", e); }

  // ── Market DNA (per city) ───────────────────────────────────────────────────
  try {
    const rows: Row[] = [];
    for (const [city, list] of cityListings) {
      if (list.length < 3) continue;
      const cats: Record<string, number> = {}; let luxury = 0, projects = 0;
      for (const l of list) {
        const t = String(l.propertyType ?? "").toLowerCase();
        const cat = /מסחר|משרד|חנות|commercial|office|shop/.test(t) ? "commercial" : /מגרש|קרקע|land/.test(t) ? "land" : /פרויקט|project|מהקבלן/.test(t) ? "project" : "residential";
        cats[cat] = (cats[cat] ?? 0) + 1;
        if (cat === "project") projects++;
        const rent = String(l.dealType ?? "").toLowerCase() === "rent";
        if (typeof l.price === "number" && ((rent && l.price >= 12_000) || (!rent && l.price >= 4_000_000))) luxury++;
      }
      const officeShares = [...(cityOfficeCounts.get(city)?.values() ?? [])];
      const total = list.length;
      const input: MarketDnaInput = {
        city, offices: offices.filter((o) => sameCity(o.city, city)).length, agents: agents.filter((a) => sameCity(a.city, city)).length, listings: total,
        luxuryPct: Math.round((luxury / total) * 100), developerPct: Math.round((projects / total) * 100),
        categoryShares: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round((v / total) * 100)])),
        officeShares, volatility: 0, avgConfidence: 0, growthTrend: 0,
      };
      const d = computeMarketDNA(input);
      rows.push({ city, dominant_office_category: d.dominantOfficeCategory, dominant_property_category: d.dominantPropertyCategory, competition_intensity: d.competitionIntensity, growth_trend: 0, luxury_concentration: d.luxuryConcentration, developer_concentration: d.developerConcentration, office_density: d.officeDensity, agent_density: d.agentDensity, volatility: 0, avg_confidence: 0, metrics: { listings: total, hhi: hhi(officeShares) } as never, computed_at: nowISO() });
    }
    for (let i = 0; i < rows.length; i += 500) await db.from("brokerage_market_dna" as never).upsert(rows.slice(i, i + 500) as never, { onConflict: "city" });
    out.markets = rows.length;
  } catch (e) { console.error("[evolution] market dna failed:", e); }

  // ── Evolution events (vs previous month) + predictions (from full history) ──
  try {
    // Pull historical snapshots for office/agent entities (current run excluded by date filter for prev).
    const { data: histData } = await db.from("brokerage_entity_snapshots" as never)
      .select("entity_key,entity_type,entity_id,city,period_date,listings,agents,metrics")
      .in("entity_type", ["office", "agent"] as never).eq("period", "month")
      .order("period_date", { ascending: true }).limit(40000);
    const hist = (histData ?? []) as Row[];
    const seriesByKey = new Map<string, Row[]>();
    for (const r of hist) (seriesByKey.get(String(r.entity_key)) ?? seriesByKey.set(String(r.entity_key), []).get(String(r.entity_key))!).push(r);

    // Events: compare the two most recent snapshots per entity.
    const events: Row[] = [];
    for (const series of seriesByKey.values()) {
      if (series.length < 2) continue;
      const curr = series[series.length - 1], prev = series[series.length - 2];
      if (String(curr.period_date) !== bucket) continue; // only emit for this run's bucket
      const evs = detectGrowthEvents(
        { listings: numv(prev.listings), agents: numv(prev.agents) },
        { listings: numv(curr.listings), agents: numv(curr.agents) },
      );
      for (const ev of evs) events.push({ entity_type: curr.entity_type, entity_id: curr.entity_id, city: curr.city, event_type: ev.eventType, title: ev.title, detail: ev.detail, metadata: { field: ev.field, old: ev.oldValue, new: ev.newValue, source: "evolution" } as never });
    }
    for (let i = 0; i < events.length; i += 500) await db.from("brokerage_timeline_events" as never).insert(events.slice(i, i + 500) as never);
    out.events = events.length;

    // Predictions: only where ≥3 history points (honest); refresh the open set.
    await db.from("brokerage_predictions" as never).delete().eq("status", "open");
    const preds: Row[] = [];
    for (const [key, series] of seriesByKey) {
      if (series.length < 3) continue;
      const values = series.map((r) => numv(r.listings));
      const p = predictTrend(values, "מלאי מודעות");
      if (p.confidence < 35) continue; // skip low-confidence noise
      const last = series[series.length - 1];
      const type: PredictionType = p.slope > 0 ? "office_growth" : "office_decline";
      const entityType = String(last.entity_type);
      preds.push({ entity_type: entityType, entity_id: last.entity_id, entity_key: key, city: last.city, prediction_type: entityType === "agent" ? "agent_movement" : type, likelihood: p.likelihood, confidence: p.confidence, evidence: p.evidence as never, explanation: p.explanation, horizon_days: 90, status: "open" });
    }
    for (let i = 0; i < preds.length; i += 500) await db.from("brokerage_predictions" as never).insert(preds.slice(i, i + 500) as never);
    out.predictions = preds.length;
  } catch (e) { console.error("[evolution] events/predictions failed:", e); }

  // Audit: record the evolution recompute as a refresh run.
  try {
    await db.from("brokerage_refresh_runs" as never).insert({ run_type: "source", status: "completed", parameters: { mode: "evolution_recompute", bucket } as never, started_at: new Date(t0).toISOString(), finished_at: nowISO(), updated_records: out.snapshots } as never);
  } catch { /* best-effort */ }

  out.ms = Date.now() - t0;
  return out;
}

// ── Time Machine ────────────────────────────────────────────────────────────
export interface TimeMachineSnapshot {
  date: string;
  market: Awaited<ReturnType<typeof evolutionRepository.marketAtDate>>;
}
/** Replay the market as it looked at (or before) a given date. RLS-scoped. */
export async function getMarketAtDate(date: string): Promise<TimeMachineSnapshot | null> {
  const access = await getBrokerageAccess();
  if (!access) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : monthBucket(new Date(date));
  const market = await evolutionRepository.marketAtDate(d);
  return { date: d, market };
}

// ── Dashboard read model (single source of truth for the Evolution UI) ───────
export interface EvolutionDashboard {
  access: BrokerageAccess;
  officeLeaders: Awaited<ReturnType<typeof evolutionRepository.growthLeaders>>;
  agentLeaders: Awaited<ReturnType<typeof evolutionRepository.growthLeaders>>;
  neighborhoodLeaders: Awaited<ReturnType<typeof evolutionRepository.neighborhoodLeaders>>;
  marketDna: Awaited<ReturnType<typeof evolutionRepository.marketDna>>;
  predictions: Awaited<ReturnType<typeof evolutionRepository.predictions>>;
}
export async function getEvolutionDashboard(): Promise<EvolutionDashboard | null> {
  const access = await getBrokerageAccess();
  if (!access) return null;
  const [officeLeaders, agentLeaders, neighborhoodLeaders, marketDna, predictions] = await Promise.all([
    evolutionRepository.growthLeaders("office"),
    evolutionRepository.growthLeaders("agent"),
    evolutionRepository.neighborhoodLeaders(40),
    evolutionRepository.marketDna(40),
    evolutionRepository.predictions(60),
  ]);
  return { access, officeLeaders, agentLeaders, neighborhoodLeaders, marketDna, predictions };
}

export { evolutionRepository };
