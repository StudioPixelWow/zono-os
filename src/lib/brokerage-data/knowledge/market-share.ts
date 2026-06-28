// ============================================================================
// ZONO Brokerage Knowledge — Market Share engine (pure).
// Estimates relative market share from public-signal volume (listings, activity,
// geographic spread, growth, visibility). Deterministic; never claims exact
// figures — it's an evidence-weighted estimate, refreshed continuously.
// ============================================================================
import type { MarketShareInput, MarketShareRow, MarketScope } from "./types";

const norm = (v: number, max: number) => (max > 0 ? Math.round((v / max) * 100) : 0);

/** Activity = listings volume + geographic spread + source corroboration. */
function activityScore(i: MarketShareInput): number {
  return i.listings * 1 + i.cities * 4 + i.neighborhoods * 1.5 + i.sources * 2;
}
/** Visibility = how broadly the office is seen (sources + spread). */
function visibilityScore(i: MarketShareInput): number {
  return i.sources * 5 + i.cities * 3 + Math.min(i.listings, 50);
}

function rankRows(rows: Omit<MarketShareRow, "rank">[]): MarketShareRow[] {
  return rows
    .sort((a, b) => b.sharePct - a.sharePct || b.listings - a.listings)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));
}

/**
 * Compute market-share rows across scopes (offices, networks, cities). Share is
 * a blended index normalized to the scope total, so it sums sensibly without
 * pretending to be a precise percentage of the real market.
 */
export function estimateMarketShare(offices: MarketShareInput[]): MarketShareRow[] {
  if (!offices.length) return [];
  const out: MarketShareRow[] = [];

  // ── Office scope ──
  const officeBlend = offices.map((o) => ({ o, blend: o.listings * 1 + activityScore(o) * 0.5 + o.recentListings * 1.5 }));
  const officeTotal = officeBlend.reduce((a, x) => a + x.blend, 0) || 1;
  const maxActivity = Math.max(...offices.map(activityScore), 1);
  const maxVis = Math.max(...offices.map(visibilityScore), 1);
  out.push(...rankRows(officeBlend.map(({ o, blend }) => ({
    scopeType: "office" as MarketScope, scopeKey: o.id, scopeLabel: o.label, city: o.city ?? null,
    listings: o.listings, activity: norm(activityScore(o), maxActivity), cities: o.cities, neighborhoods: o.neighborhoods,
    growth: o.recentListings, visibility: norm(visibilityScore(o), maxVis), sources: o.sources,
    sharePct: Math.round((blend / officeTotal) * 1000) / 10,
  }))));

  // ── Network scope (group by network) ──
  const byNet = new Map<string, MarketShareInput[]>();
  for (const o of offices) { const k = (o.network ?? "").trim(); if (!k) continue; (byNet.get(k) ?? byNet.set(k, []).get(k)!).push(o); }
  if (byNet.size) {
    const netAgg = [...byNet.entries()].map(([net, list]) => ({
      net, listings: list.reduce((a, x) => a + x.listings, 0),
      cities: new Set(list.map((x) => x.city).filter(Boolean)).size,
      sources: list.reduce((a, x) => a + x.sources, 0), recent: list.reduce((a, x) => a + x.recentListings, 0),
    }));
    const netTotal = netAgg.reduce((a, x) => a + x.listings, 0) || 1;
    out.push(...rankRows(netAgg.map((x) => ({
      scopeType: "network" as MarketScope, scopeKey: x.net, scopeLabel: x.net, city: null,
      listings: x.listings, activity: 0, cities: x.cities, neighborhoods: 0, growth: x.recent, visibility: 0,
      sources: x.sources, sharePct: Math.round((x.listings / netTotal) * 1000) / 10,
    }))));
  }

  // ── City scope (leaders per city via top office) ──
  const byCity = new Map<string, MarketShareInput[]>();
  for (const o of offices) { const k = (o.city ?? "").trim(); if (!k) continue; (byCity.get(k) ?? byCity.set(k, []).get(k)!).push(o); }
  for (const [city, list] of byCity) {
    const total = list.reduce((a, x) => a + x.listings, 0) || 1;
    const leader = list.slice().sort((a, b) => b.listings - a.listings)[0];
    out.push({
      scopeType: "city", scopeKey: city, scopeLabel: leader.label, city,
      listings: leader.listings, activity: 0, cities: 1, neighborhoods: leader.neighborhoods, growth: leader.recentListings,
      visibility: 0, sources: leader.sources, sharePct: Math.round((leader.listings / total) * 1000) / 10, rank: 1,
    });
  }

  return out;
}
