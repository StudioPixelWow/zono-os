// ============================================================================
// ZONO — Competitor Intelligence engine (server-only). Composes the dashboard
// from PUBLIC Property Radar market data only, persists the daily snapshot, and
// enriches Property Radar cards. No scraping, no private CRM data, no fabricated
// share — every share figure is a labeled estimate with confidence.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createCompetitorRepository, toListingSignal, rowCoord, type MarketRow } from "./repository";
import { getCompetitorAccess, agentOperatingCities, type CompetitorAccess } from "./permissions";
import { classifyListing } from "./classifier";
import { computeCompetitorAnalytics } from "./analytics";
import { calculateCompetitorMarketShare, ourMarketShare, SHARE_LABEL } from "./market-share";
import { rankAreaTrends, type AreaTrendInput } from "./trends";
import { buildCompetitorAlertCandidates, dedupAlerts, type BuildAlertsInput } from "./alerts";
import type {
  CompetitorAnalytics, CompetitorDashboard, CompetitorKpis, CompetitorListingLink,
  CompetitorMapPoint, CompetitorPriceDropItem, CompetitorSnapshotResult, MarketShareEstimate,
  OfficeVsMarketRow,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const DAY7 = 7 * 24 * 60 * 60 * 1000;
const startOfUtcDayIso = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
const areaKey = (city: string | null, neighborhood: string | null) => `${(city ?? "").trim()}|${(neighborhood ?? "").trim()}`;

interface ClassifiedListing {
  row: MarketRow;
  normalizedName: string;
  competitorName: string;
  confidence: number;
}

interface CompetitorGroup {
  profileId: string;            // synthetic id (normalizedName) in live mode; real id after persist
  normalizedName: string;
  competitorName: string;
  confidence: number;
  rows: MarketRow[];
}

/** Resolve the city scope for the caller (managers: org cities; agents: own areas). */
async function resolveScope(access: CompetitorAccess): Promise<{ cities: string[]; scopeNote: string }> {
  const repo = createCompetitorRepository(access.db);
  const orgCities = await repo.orgCities(access.orgId);
  if (access.fullMarketView) return { cities: orgCities, scopeNote: "תצוגת שוק מלאה — כל אזורי הפעילות של המשרד." };
  const own = await agentOperatingCities(access.db, access.userId);
  const cities = own.length ? orgCities.filter((c) => own.includes(c)) : orgCities;
  return { cities, scopeNote: "תצוגה מוגבלת לאזורי הפעילות שלך." };
}

/** Classify + group public market listings into competitor offices. */
function classifyAndGroup(rows: MarketRow[]): { classified: ClassifiedListing[]; groups: Map<string, CompetitorGroup> } {
  const classified: ClassifiedListing[] = [];
  const groups = new Map<string, CompetitorGroup>();
  for (const row of rows) {
    const res = classifyListing(toListingSignal(row));
    if (!res.competitorName || !res.normalizedName) continue; // private / insufficient evidence → excluded
    classified.push({ row, normalizedName: res.normalizedName, competitorName: res.competitorName, confidence: res.confidence });
    const g = groups.get(res.normalizedName);
    if (g) {
      g.rows.push(row);
      g.confidence = Math.max(g.confidence, res.confidence);
    } else {
      groups.set(res.normalizedName, { profileId: res.normalizedName, normalizedName: res.normalizedName, competitorName: res.competitorName, confidence: res.confidence, rows: [row] });
    }
  }
  return { classified, groups };
}

function linkFromRow(profileId: string, row: MarketRow, confidence: number): CompetitorListingLink {
  return {
    id: `${profileId}:${row.id}`, competitorProfileId: profileId, marketPropertySourceId: row.id,
    provider: row.provider, city: row.city, neighborhood: row.neighborhood, propertyType: row.property_type,
    listingType: row.listing_type, price: row.price, rooms: row.rooms, sizeSqm: row.size_sqm,
    firstSeenAt: row.first_seen_at, lastSeenAt: row.first_seen_at, status: (row.source_status ?? "active") === "active" ? "active" : "inactive", confidence,
  };
}

interface BuiltIntel {
  scopeNote: string;
  cities: string[];
  groups: Map<string, CompetitorGroup>;
  competitors: CompetitorAnalytics[];
  areaTrends: ReturnType<typeof rankAreaTrends>;
  priceDrops: CompetitorPriceDropItem[];
  marketShare: MarketShareEstimate[];
  comparison: OfficeVsMarketRow[];
  mapPoints: CompetitorMapPoint[];
  kpis: CompetitorKpis;
  summary: string[];
  /** Per-competitor-per-area aggregates for the alert engine. */
  areaActivity: BuildAlertsInput["areaActivity"];
  monitoredActive: number;
}

/** Core deterministic build from PUBLIC market data + price-drop events. */
async function buildIntelligence(access: CompetitorAccess): Promise<BuiltIntel> {
  const repo = createCompetitorRepository(access.db);
  const now = Date.now();
  const todayIso = startOfUtcDayIso(new Date(now));
  const weekAgoIso = new Date(now - DAY7).toISOString();
  const { cities, scopeNote } = await resolveScope(access);

  const listings = await repo.marketListings(cities, { limit: 1500 });
  const events = await repo.events(cities, weekAgoIso);
  const ourByCity = await repo.ourActiveByCity(access.orgId);

  const priceDropSourceIds = new Set<string>();
  const removedSourceIds = new Set<string>();
  const backOnMarketSourceIds = new Set<string>();
  for (const e of events) {
    if (!e.market_property_source_id) continue;
    if (e.event_type === "price_drop") priceDropSourceIds.add(e.market_property_source_id);
    else if (e.event_type === "removed") removedSourceIds.add(e.market_property_source_id);
    else if (e.event_type === "back_on_market") backOnMarketSourceIds.add(e.market_property_source_id);
  }

  const { classified, groups } = classifyAndGroup(listings);
  const activeListings = listings.filter((l) => (l.source_status ?? "active") === "active");
  const monitoredActive = activeListings.length;

  // Area averages (from ALL monitored listings) for aggressive-pricing detection.
  const areaPrices = new Map<string, number[]>();
  for (const l of activeListings) {
    if (typeof l.price !== "number" || l.price <= 0) continue;
    const k = areaKey(l.city, l.neighborhood);
    (areaPrices.get(k) ?? areaPrices.set(k, []).get(k)!).push(l.price);
  }
  const areaAvg = new Map<string, number>();
  for (const [k, arr] of areaPrices) areaAvg.set(k, arr.reduce((a, b) => a + b, 0) / arr.length);

  // Per-competitor analytics.
  const competitors: CompetitorAnalytics[] = [];
  const areaActivity: BuildAlertsInput["areaActivity"] = [];
  for (const g of groups.values()) {
    const links = g.rows.map((r) => linkFromRow(g.profileId, r, g.confidence));
    const a = computeCompetitorAnalytics({
      competitorProfileId: g.profileId, competitorName: g.competitorName, confidence: g.confidence,
      links, priceDropSourceIds, removedSourceIds, backOnMarketSourceIds,
      todayIso, weekAgoIso, prevWeekActiveListings: null, monitoredActiveInScope: monitoredActive, now,
    });
    competitors.push(a);

    // Per-area aggregates for alerts.
    const byArea = new Map<string, MarketRow[]>();
    for (const r of g.rows) {
      const k = areaKey(r.city, r.neighborhood);
      (byArea.get(k) ?? byArea.set(k, []).get(k)!).push(r);
    }
    for (const [k, rows] of byArea) {
      const newListings = rows.filter((r) => (r.first_seen_at ?? "") >= weekAgoIso).length;
      const priceDrops = rows.filter((r) => priceDropSourceIds.has(r.id)).length;
      const avg = areaAvg.get(k) ?? null;
      const belowAreaAvgCount = avg == null ? 0 : rows.filter((r) => typeof r.price === "number" && r.price > 0 && r.price < avg).length;
      const isNewArea = rows.length > 0 && rows.every((r) => (r.first_seen_at ?? "") >= weekAgoIso);
      areaActivity.push({
        competitorProfileId: g.profileId, competitorName: g.competitorName,
        city: rows[0]!.city, neighborhood: rows[0]!.neighborhood,
        newListings, priceDrops, isNewArea, belowAreaAvgCount, areaListingCount: rows.length,
      });
    }
  }
  competitors.sort((a, b) => b.activeListings - a.activeListings || b.confidence - a.confidence);

  // Market share (org-level per competitor — labeled estimate).
  const marketShare = calculateCompetitorMarketShare(competitors.map((c) => ({
    competitorProfileId: c.competitorProfileId, competitorName: c.competitorName, city: null, neighborhood: null,
    competitorActiveListings: c.activeListings, totalMonitoredActiveListings: monitoredActive,
  }))).slice(0, 20);

  // Area trends.
  const areaAgg = new Map<string, { city: string | null; neighborhood: string | null; active: number; newL: number; drops: number; comps: Set<string> }>();
  for (const l of activeListings) {
    const k = areaKey(l.city, l.neighborhood);
    const e = areaAgg.get(k) ?? { city: l.city, neighborhood: l.neighborhood, active: 0, newL: 0, drops: 0, comps: new Set<string>() };
    e.active++;
    if ((l.first_seen_at ?? "") >= weekAgoIso) e.newL++;
    if (priceDropSourceIds.has(l.id)) e.drops++;
    areaAgg.set(k, e);
  }
  for (const c of classified) {
    const k = areaKey(c.row.city, c.row.neighborhood);
    areaAgg.get(k)?.comps.add(c.normalizedName);
  }
  const areaTrends = rankAreaTrends([...areaAgg.values()].map((e): AreaTrendInput => ({
    city: e.city, neighborhood: e.neighborhood, activeListings: e.active, newListings: e.newL,
    priceDrops: e.drops, competitorsActive: e.comps.size, prevWeekActiveListings: null,
  }))).slice(0, 30);

  // Price-drop board (competitor-attributed, with below-average flag).
  const classBySource = new Map(classified.map((c) => [c.row.id, c]));
  const priceDrops: CompetitorPriceDropItem[] = events
    .filter((e) => e.event_type === "price_drop" && e.market_property_source_id)
    .slice(0, 60)
    .map((e) => {
      const c = e.market_property_source_id ? classBySource.get(e.market_property_source_id) : undefined;
      const avg = areaAvg.get(areaKey(e.city, e.neighborhood));
      const price = c?.row.price ?? null;
      return {
        marketPropertySourceId: e.market_property_source_id, competitorName: c?.competitorName ?? null,
        competitorConfidence: c?.confidence ?? null, city: e.city, neighborhood: e.neighborhood,
        price, priceDelta: e.price_delta, priceDeltaPercent: e.price_delta_percent, at: e.detected_at,
        belowAreaAverage: avg != null && price != null && price < avg,
      };
    });

  // Comparison: our office vs market by city.
  const compActiveByCity = new Map<string, number>();
  const monitoredByCity = new Map<string, number>();
  const topCompByCity = new Map<string, { name: string; count: number }>();
  for (const l of activeListings) {
    const c = (l.city ?? "").trim();
    if (!c) continue;
    monitoredByCity.set(c, (monitoredByCity.get(c) ?? 0) + 1);
  }
  const cityCompCounts = new Map<string, Map<string, number>>();
  for (const cl of classified) {
    if ((cl.row.source_status ?? "active") !== "active") continue;
    const c = (cl.row.city ?? "").trim();
    if (!c) continue;
    compActiveByCity.set(c, (compActiveByCity.get(c) ?? 0) + 1);
    const m = cityCompCounts.get(c) ?? new Map<string, number>();
    m.set(cl.competitorName, (m.get(cl.competitorName) ?? 0) + 1);
    cityCompCounts.set(c, m);
  }
  for (const [c, m] of cityCompCounts) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) topCompByCity.set(c, { name: top[0], count: top[1] });
  }
  const comparisonCities = new Set<string>([...ourByCity.keys(), ...monitoredByCity.keys()]);
  const comparison: OfficeVsMarketRow[] = [...comparisonCities].map((city) => {
    const ourActive = ourByCity.get(city) ?? 0;
    const competitorActive = compActiveByCity.get(city) ?? 0;
    const monitored = monitoredByCity.get(city) ?? 0;
    const ourSharePercent = ourMarketShare(ourActive, monitored).sharePercent;
    const top = topCompByCity.get(city) ?? null;
    const topShare = top ? Math.min(100, Math.round((top.count / Math.max(1, monitored)) * 1000) / 10) : 0;
    const position: OfficeVsMarketRow["position"] = ourSharePercent >= topShare && ourActive > 0 ? "leading" : ourActive > 0 ? "competitive" : "trailing";
    return { area: city, ourActiveListings: ourActive, competitorActiveListings: competitorActive, monitoredActiveListings: monitored, ourSharePercent, topCompetitorName: top?.name ?? null, topCompetitorSharePercent: topShare, position };
  }).sort((a, b) => b.monitoredActiveListings - a.monitoredActiveListings);

  // Map points (real coords only; honest empty state otherwise).
  const mapPoints: CompetitorMapPoint[] = [];
  for (const l of activeListings) {
    const coord = rowCoord(l);
    if (!coord) continue;
    const cl = classBySource.get(l.id);
    const drop = priceDropSourceIds.has(l.id);
    const tone: CompetitorMapPoint["tone"] = drop ? "warning" : cl ? "danger" : "brand";
    mapPoints.push({
      id: l.id, lat: coord.lat, lng: coord.lng,
      title: cl?.competitorName ?? (l.neighborhood ?? l.city ?? "מודעה"),
      details: [l.address_text ?? [l.neighborhood, l.city].filter(Boolean).join(", "), l.price ? `₪${Math.round(l.price).toLocaleString("he-IL")}` : "", drop ? "ירידת מחיר" : ""].filter(Boolean) as string[],
      tone,
    });
    if (mapPoints.length >= 250) break;
  }

  // KPIs.
  const newCompToday = classified.filter((c) => (c.row.first_seen_at ?? "") >= todayIso && (c.row.source_status ?? "active") === "active").length;
  const compPriceDropsToday = events.filter((e) => e.event_type === "price_drop" && e.detected_at >= todayIso && e.market_property_source_id && classBySource.has(e.market_property_source_id)).length;
  const ourActiveTotal = [...ourByCity.values()].reduce((a, b) => a + b, 0);
  const our = ourMarketShare(ourActiveTotal, monitoredActive);
  const kpis: CompetitorKpis = {
    trackedCompetitors: groups.size,
    competitorActiveListings: classified.filter((c) => (c.row.source_status ?? "active") === "active").length,
    newCompetitorListingsToday: newCompToday,
    competitorPriceDropsToday: compPriceDropsToday,
    heatingAreas: areaTrends.filter((a) => a.trend === "up" && a.heatScore >= 50).length,
    ourEstimatedSharePercent: our.sharePercent,
    ourShareConfidence: our.confidence,
    monitoredActiveListings: monitoredActive,
  };

  const summary = buildSummary(kpis, competitors, areaTrends, scopeNote);

  return { scopeNote, cities, groups, competitors, areaTrends, priceDrops, marketShare, comparison, mapPoints, kpis, summary, areaActivity, monitoredActive };
}

function buildSummary(kpis: CompetitorKpis, competitors: CompetitorAnalytics[], areaTrends: BuiltIntel["areaTrends"], scopeNote: string): string[] {
  const lines: string[] = [scopeNote];
  if (kpis.monitoredActiveListings === 0) { lines.push("אין עדיין נתוני שוק ציבוריים באזורי הפעילות — הפעל סריקת Property Radar."); return lines; }
  lines.push(`עוקבים אחר ${kpis.trackedCompetitors} מתחרים על בסיס ${kpis.monitoredActiveListings} מודעות פעילות שנאספו.`);
  const top = competitors[0];
  if (top) lines.push(`המתחרה הפעיל ביותר: ${top.competitorName} — ${top.activeListings} מודעות (נתח מוערך ${top.estimatedSharePercent}%).`);
  const hot = areaTrends.find((a) => a.trend === "up" && a.heatScore >= 50);
  if (hot) lines.push(`אזור מתחמם: ${hot.neighborhood ?? hot.city ?? "—"} (${hot.newListings} מודעות חדשות השבוע).`);
  lines.push(`נתח השוק המוערך שלך: ${kpis.ourEstimatedSharePercent}% (${SHARE_LABEL}, ודאות ${kpis.ourShareConfidence}).`);
  return lines;
}

// ── Public API ────────────────────────────────────────────────────────────--
export async function composeCompetitorDashboard(): Promise<CompetitorDashboard> {
  const access = await getCompetitorAccess();
  const repo = createCompetitorRepository(access.db);
  const intel = await buildIntelligence(access);
  const alerts = await repo.unreadAlerts(access.orgId, 50);
  return {
    role: access.role, scopeNote: intel.scopeNote, kpis: intel.kpis, summary: intel.summary,
    competitors: intel.competitors, areaTrends: intel.areaTrends, priceDrops: intel.priceDrops,
    marketShare: intel.marketShare, comparison: intel.comparison, alerts, mapPoints: intel.mapPoints,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Daily snapshot: classify latest public listings, upsert competitor profiles +
 * listing links, persist area metrics, and create de-duplicated alerts.
 */
export async function runCompetitorIntelligenceSnapshotJob(): Promise<CompetitorSnapshotResult> {
  const access = await getCompetitorAccess();
  const repo = createCompetitorRepository(access.db);
  const intel = await buildIntelligence(access);
  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);

  // Persist profiles → real ids, then links + area metrics.
  const idByNormalized = new Map<string, string>();
  let links = 0;
  let areaMetrics = 0;
  for (const g of intel.groups.values()) {
    const id = await repo.upsertProfile(access.orgId, { competitorName: g.competitorName, normalizedName: g.normalizedName, confidence: g.confidence, source: "market_listing" });
    if (!id) continue;
    idByNormalized.set(g.normalizedName, id);
    for (const r of g.rows) {
      await repo.upsertLink(access.orgId, {
        competitorProfileId: id, marketPropertySourceId: r.id, provider: r.provider, city: r.city, neighborhood: r.neighborhood,
        propertyType: r.property_type, listingType: r.listing_type, price: r.price, rooms: r.rooms, sizeSqm: r.size_sqm,
        confidence: g.confidence, evidence: { source: "market_listing", confidence: g.confidence },
      });
      links++;
    }
  }
  for (const c of intel.competitors) {
    const id = idByNormalized.get(c.competitorProfileId);
    if (!id) continue;
    await repo.insertAreaMetric(access.orgId, {
      competitor_profile_id: id, city: null, neighborhood: null, period: "daily", period_start: todayDate, period_end: todayDate,
      active_listings: c.activeListings, new_listings: c.newListingsThisWeek, price_drops: c.priceDrops,
      removed_listings: c.removedListings, back_on_market: c.backOnMarket, avg_price: c.avgPrice, avg_days_on_market: c.avgDaysOnMarket,
      estimated_share_percent: c.estimatedSharePercent, trend: c.trendVsLastWeek, confidence: c.confidence,
      metadata: { shareConfidence: c.shareConfidence, label: SHARE_LABEL },
    });
    areaMetrics++;
  }

  // Share changes vs previous metrics.
  const prev = await repo.previousAreaMetrics(access.orgId, startOfUtcDayIso(now));
  const prevShareById = new Map<string, number>();
  for (const p of prev) if (!prevShareById.has(p.competitor_profile_id)) prevShareById.set(p.competitor_profile_id, p.estimated_share_percent ?? 0);
  const shareChanges = intel.competitors.flatMap((c) => {
    const id = idByNormalized.get(c.competitorProfileId);
    if (!id) return [];
    const before = prevShareById.get(id);
    if (before == null) return [];
    return [{ competitorProfileId: id, competitorName: c.competitorName, deltaPercent: Math.round((c.estimatedSharePercent - before) * 10) / 10 }];
  });

  // Alerts (rewrite candidate competitor ids to real profile ids), then dedup.
  const areaActivity = intel.areaActivity.map((a) => ({ ...a, competitorProfileId: idByNormalized.get(a.competitorProfileId) ?? a.competitorProfileId }));
  const candidates = buildCompetitorAlertCandidates({ competitors: intel.competitors, areaActivity, shareChanges });
  const existing = await repo.recentAlertKeys(access.orgId, new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  const toInsert = dedupAlerts(candidates, existing, now.getTime());
  const alertsInserted = await repo.insertAlerts(access.orgId, toInsert.map((c) => ({ competitorProfileId: c.competitorProfileId, alertType: c.alertType, severity: c.severity, title: c.title, message: c.message, city: c.city, neighborhood: c.neighborhood })));

  return { ok: true, classifiedListings: intel.areaActivity.reduce((a, b) => a + b.areaListingCount, 0), competitors: intel.groups.size, links, areaMetrics, alerts: alertsInserted };
}

// ── Property Radar enrichment ─────────────────────────────────────────────--
export interface CompetitorEnrichment { competitorName: string; confidence: number; sourceLabel: string }

/**
 * Classify the given market sources into competitor offices (PUBLIC data only),
 * for Property Radar cards. Returns only confident-enough inferences.
 */
export async function getCompetitorEnrichmentForSources(sourceIds: string[]): Promise<Record<string, CompetitorEnrichment>> {
  if (sourceIds.length === 0) return {};
  const db: Db = createServiceRoleClient();
  const repo = createCompetitorRepository(db);
  const rows = await repo.marketListingsByIds(sourceIds);
  const out: Record<string, CompetitorEnrichment> = {};
  for (const r of rows) {
    const res = classifyListing(toListingSignal(r));
    if (!res.competitorName) continue;
    out[r.id] = { competitorName: res.competitorName, confidence: res.confidence, sourceLabel: "מבוסס על נתוני מודעה ציבוריים" };
  }
  return out;
}

/** Compact competitor digest for the Office Intelligence widget. */
export async function getCompetitorOfficeWidget(): Promise<{
  topCompetitors: { name: string; activeListings: number; estimatedSharePercent: number; confidence: number }[];
  gainingAreas: { area: string; newListings: number; competitorsActive: number }[];
  priceDropWaves: { competitorName: string | null; area: string; count: number }[];
  shareNote: string;
} | null> {
  try {
    const access = await getCompetitorAccess();
    const intel = await buildIntelligence(access);
    const topCompetitors = intel.competitors.slice(0, 5).map((c) => ({ name: c.competitorName, activeListings: c.activeListings, estimatedSharePercent: c.estimatedSharePercent, confidence: c.confidence }));
    const gainingAreas = intel.areaTrends.filter((a) => a.trend === "up").slice(0, 4).map((a) => ({ area: a.neighborhood ?? a.city ?? "—", newListings: a.newListings, competitorsActive: a.competitorsActive }));
    const waveMap = new Map<string, { competitorName: string | null; area: string; count: number }>();
    for (const a of intel.areaActivity) {
      if (a.priceDrops < 3) continue;
      const area = a.neighborhood ?? a.city ?? "—";
      waveMap.set(`${a.competitorName}|${area}`, { competitorName: a.competitorName, area, count: a.priceDrops });
    }
    const priceDropWaves = [...waveMap.values()].sort((x, y) => y.count - x.count).slice(0, 4);
    return { topCompetitors, gainingAreas, priceDropWaves, shareNote: SHARE_LABEL };
  } catch {
    return null;
  }
}
