// ============================================================================
// 🗺️ Territory Intelligence — aggregation (pure). Phase 26.6.
// Territory stats, market share, dominance score/band and evidence-only
// insights. Deterministic. No DB, no AI, no valuation.
// ============================================================================
import type {
  AttributedListing, TerritoryStats, OwnerShare, OfficeDominance, DominanceBand, CountBy,
} from "./types";

export const LUXURY_PRICE = 4_000_000;

export function median(nums: number[]): number | null {
  const a = nums.filter((x) => x > 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
const avg = (nums: number[]): number | null => { const a = nums.filter((x) => x > 0); return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null; };
const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);
function tally(xs: (string | null)[]): CountBy[] { const m = new Map<string, number>(); for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count); }

// ── Listing classification helpers (used by the service) ────────────────────
export function isLuxury(price: number | null): boolean { return price != null && price >= LUXURY_PRICE; }
export function isRental(propertyType: string | null, dealType: string | null): boolean {
  return /rent|שכיר|להשכרה/i.test(`${propertyType ?? ""} ${dealType ?? ""}`);
}
export function isCommercial(propertyType: string | null): boolean {
  return /commercial|מסחר|משרד|חנות|office|store|מבנה מסחרי/i.test(propertyType ?? "");
}

/** Full territory stats + top offices/brokers by share. */
export function territoryStats(listings: AttributedListing[]): TerritoryStats {
  const total = listings.length;
  const activeL = listings.filter((l) => l.active);
  const activeTotal = activeL.length;
  const prices = listings.map((l) => l.price ?? 0);
  const ppsqm = listings.filter((l) => l.price && l.sqm && l.sqm > 0).map((l) => Math.round((l.price as number) / (l.sqm as number)));

  const groupShare = (getId: (l: AttributedListing) => string | null, getName: (l: AttributedListing) => string | null, getBrand?: (l: AttributedListing) => string | null): OwnerShare[] => {
    const active = new Map<string, number>(), all = new Map<string, number>(), name = new Map<string, string>(), brand = new Map<string, string | null>();
    for (const l of listings) { const id = getId(l); if (!id) continue; all.set(id, (all.get(id) ?? 0) + 1); if (l.active) active.set(id, (active.get(id) ?? 0) + 1); name.set(id, getName(l) ?? id); if (getBrand) brand.set(id, getBrand(l)); }
    return [...all.keys()].map((id) => ({ id, name: name.get(id) ?? id, brand: getBrand ? brand.get(id) ?? null : undefined, active: active.get(id) ?? 0, total: all.get(id) ?? 0, sharePct: pct(active.get(id) ?? 0, activeTotal) }))
      .sort((a, b) => b.active - a.active || b.total - a.total).slice(0, 10);
  };

  return {
    activeListings: activeTotal, historicalListings: total - activeTotal, totalListings: total,
    avgPrice: avg(prices), medianPrice: median(prices), avgPricePerSqm: avg(ppsqm),
    propertyTypes: tally(listings.map((l) => l.propertyType)),
    luxuryPct: pct(listings.filter((l) => l.luxury).length, total),
    rentalPct: pct(listings.filter((l) => l.rental).length, total),
    commercialPct: pct(listings.filter((l) => l.commercial).length, total),
    topOffices: groupShare((l) => l.officeId, (l) => l.officeName, (l) => l.brand),
    topBrokers: groupShare((l) => l.brokerId, (l) => l.brokerName),
  };
}

export function bandFor(score: number, growing: boolean): DominanceBand {
  if (score >= 55) return "Leader";
  if (score >= 35) return "Strong";
  if (growing) return "Growing";
  if (score >= 18) return "Average";
  return "Weak";
}

/** Per-office dominance within a territory. */
export function officeDominance(listings: AttributedListing[]): OfficeDominance[] {
  const activeL = listings.filter((l) => l.active);
  const activeTotal = activeL.length;
  const brokersTotal = new Set(activeL.map((l) => l.brokerId).filter(Boolean)).size;
  const recentTotal = listings.filter((l) => l.recent).length;

  const officeIds = [...new Set(listings.map((l) => l.officeId).filter((x): x is string => !!x))];
  const out: OfficeDominance[] = officeIds.map((id) => {
    const own = listings.filter((l) => l.officeId === id);
    const ownActive = own.filter((l) => l.active).length;
    const ownBrokers = new Set(own.filter((l) => l.active).map((l) => l.brokerId).filter(Boolean)).size;
    const ownRecent = own.filter((l) => l.recent).length;
    const listingShare = activeTotal ? ownActive / activeTotal : 0;
    const brokerShare = brokersTotal ? ownBrokers / brokersTotal : 0;
    const historicalShare = listings.length ? own.length / listings.length : 0;
    const activityPct = ownActive ? Math.min(1, ownRecent / Math.max(1, ownActive)) : 0;
    const recencyBonus = ownRecent > 0 ? 5 : 0;
    const score = Math.max(0, Math.min(100, Math.round(40 * listingShare + 20 * brokerShare + 15 * historicalShare + 15 * activityPct + recencyBonus)));
    const recentShare = recentTotal ? ownRecent / recentTotal : 0;
    const trend: OfficeDominance["trend"] = recentShare > listingShare + 0.05 ? "growing" : recentShare < listingShare - 0.05 ? "declining" : "stable";
    return {
      officeId: id, officeName: own.find((l) => l.officeName)?.officeName ?? id, brand: own.find((l) => l.brand)?.brand ?? null,
      dominanceScore: score, band: bandFor(score, trend === "growing"), trend,
      listingSharePct: Math.round(listingShare * 100), brokerSharePct: Math.round(brokerShare * 100),
      activeListings: ownActive, brokers: ownBrokers,
    };
  }).sort((a, b) => b.dominanceScore - a.dominanceScore);
  return out;
}

/** Evidence-only insights for a territory (Part 10). */
export function territoryInsights(territoryName: string, stats: TerritoryStats, dominance: OfficeDominance[]): string[] {
  const out: string[] = [];
  const leader = dominance[0];
  if (leader && leader.listingSharePct >= 25) out.push(`${leader.officeName} שולט ב${territoryName} עם ${leader.listingSharePct}% מהמודעות הפעילות.`);
  const growing = dominance.find((d) => d.trend === "growing" && d.dominanceScore >= 18);
  if (growing) out.push(`${growing.officeName} בצמיחה מהירה ב${territoryName}.`);
  if (stats.luxuryPct >= 30) out.push(`${territoryName} — אזור יוקרה (${stats.luxuryPct}% מהמודעות מעל ₪${(LUXURY_PRICE / 1_000_000)}M).`);
  if (stats.commercialPct >= 30) out.push(`${territoryName} — אופי מסחרי (${stats.commercialPct}% מסחרי).`);
  return out.slice(0, 5);
}
