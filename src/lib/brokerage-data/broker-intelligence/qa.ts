// ============================================================================
// ✅ Broker Intelligence self-tests (pure, offline). Phase 26.5.
// ============================================================================
import { classifyBrokerStatus, priceStats, specializationTags, rankBrokers, dataQuality } from "./logic";
import type { BrokerRankCard } from "./types";

export interface BICheck { name: string; pass: boolean; detail: string }
export interface BISelfCheck { ok: boolean; total: number; passed: number; checks: BICheck[] }

const card = (o: Partial<BrokerRankCard>): BrokerRankCard => ({ id: "x", name: "x", status: "UNKNOWN", activeListings: 0, totalListings: 0, recentListings: 0, neighborhoods: 0, priceVolume: 0, confidence: 0, cities: [], topAreas: [], ...o });

export function runSelfCheck(): BISelfCheck {
  const checks: BICheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Status.
  add("active by active listings", classifyBrokerStatus({ lastListingDays: 5, activeListings: 3, recentListings: 3, conflictingOffice: false, hasCurrentOffice: true, totalListings: 3 }).status === "ACTIVE", "");
  add("recently active", classifyBrokerStatus({ lastListingDays: 60, activeListings: 0, recentListings: 1, conflictingOffice: false, hasCurrentOffice: true, totalListings: 2 }).status === "RECENTLY_ACTIVE", "");
  add("low activity", classifyBrokerStatus({ lastListingDays: 200, activeListings: 0, recentListings: 0, conflictingOffice: false, hasCurrentOffice: true, totalListings: 1 }).status === "LOW_ACTIVITY", "");
  add("inactive", classifyBrokerStatus({ lastListingDays: 500, activeListings: 0, recentListings: 0, conflictingOffice: false, hasCurrentOffice: true, totalListings: 1 }).status === "INACTIVE", "");
  add("moved office on conflict", classifyBrokerStatus({ lastListingDays: 10, activeListings: 1, recentListings: 1, conflictingOffice: true, hasCurrentOffice: true, totalListings: 1 }).status === "MOVED_OFFICE", "");
  add("unknown w/o data", classifyBrokerStatus({ lastListingDays: null, activeListings: 0, recentListings: 0, conflictingOffice: false, hasCurrentOffice: false, totalListings: 0 }).status === "UNKNOWN", "");

  // Price stats (no fabrication).
  const ps = priceStats([1_000_000, 3_000_000], [50, 150], [20000, 20000]);
  add("avg price", ps.avgPrice === 2_000_000, `${ps.avgPrice}`);
  add("avg ppsqm", ps.avgPricePerSqm === 20000, `${ps.avgPricePerSqm}`);
  const empty = priceStats([], [], []);
  add("empty → null stats", empty.avgPrice === null && empty.count === 0, "");

  // Specialization tags.
  add("specialization tag", specializationTags(["דירה", "דירה", "דירה"], ["מרכז"], 2_000_000).some((t) => /מתמחה/.test(t)), "");
  add("luxury tag", specializationTags(["פנטהאוז"], ["ים"], 5_000_000).includes("סגמנט יוקרה"), "");

  // Data quality.
  add("dq full ≥ 80", dataQuality({ hasPhone: true, hasOffice: true, hasCity: true, listings: 5, hasTypes: true, hasPrices: true }) >= 80, "");
  add("dq empty low", dataQuality({ hasPhone: false, hasOffice: false, hasCity: false, listings: 0, hasTypes: false, hasPrices: false }) === 0, "");

  // Ranking: active listings first.
  const ranked = rankBrokers([card({ id: "a", name: "a", activeListings: 1, totalListings: 10 }), card({ id: "b", name: "b", activeListings: 5, totalListings: 5 })]);
  add("rank active first", ranked[0].id === "b", `${ranked[0].id}`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
