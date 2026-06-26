// ============================================================================
// Market Acceptance Intelligence™ — Signal QA (PURE, client-safe).
//
// Validates a computed signal-set: structural completeness, confidence bounds,
// and the "no fabricated values" rule (a value may be null, but it may not be
// NaN or an out-of-range confidence). No DB, no side effects.
// ============================================================================
import { SIGNAL_NAMES, type Signal, type SignalSet, type MarketAcceptanceClassification } from "./types";
import { scoreMarketAcceptance } from "./scoring";
import { computeMarketAcceptanceAggregates, priceBucket, type AggregateListingRecord } from "./aggregates";

export interface SignalQaResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  signalCount: number;
  fullyObserved: number; // signals with confidence === 1
  nullValues: number;    // honest nulls (missing data)
}

function validateOne(name: string, s: Signal | undefined, errors: string[]): { isNull: boolean; full: boolean } {
  if (!s) { errors.push(`missing signal: ${name}`); return { isNull: true, full: false }; }
  if (typeof s.name !== "string" || s.name !== name) errors.push(`${name}: name mismatch`);
  if (typeof s.source !== "string" || !s.source) errors.push(`${name}: missing source`);
  if (typeof s.lastUpdated !== "string" || !s.lastUpdated) errors.push(`${name}: missing lastUpdated`);
  if (typeof s.confidence !== "number" || s.confidence < 0 || s.confidence > 1 || Number.isNaN(s.confidence)) {
    errors.push(`${name}: confidence out of range`);
  }
  const isNull = s.value === null;
  if (typeof s.value === "number" && Number.isNaN(s.value)) errors.push(`${name}: NaN value (fabrication guard)`);
  return { isNull, full: s.confidence === 1 };
}

/** Validate one listing's signal-set against the MAI-2 contract. */
export function validateSignalSet(set: SignalSet): SignalQaResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let fullyObserved = 0;
  let nullValues = 0;

  for (const name of SIGNAL_NAMES) {
    const { isNull, full } = validateOne(name, set[name], errors);
    if (isNull) nullValues++;
    if (full) fullyObserved++;
  }
  // A null value with confidence > 0 is contradictory (claims certainty about nothing).
  for (const name of SIGNAL_NAMES) {
    const s = set[name];
    if (s && s.value === null && s.confidence > 0) warnings.push(`${name}: null value but confidence ${s.confidence}`);
  }

  return {
    ok: errors.length === 0,
    errors, warnings,
    signalCount: SIGNAL_NAMES.length,
    fullyObserved, nullValues,
  };
}

// ── MAI-3 — deterministic acceptance-scoring QA cases ───────────────────────

/** Build a synthetic, fully-observed signal-set from a small set of facts. */
function makeSignals(facts: Partial<Record<string, number | boolean | string | null>>): SignalSet {
  const now = new Date().toISOString();
  const set: SignalSet = {};
  for (const name of SIGNAL_NAMES) {
    const v = name in facts ? facts[name]! : null;
    set[name] = { name, value: v as Signal["value"], source: "qa", lastUpdated: now, confidence: v === null ? 0 : 1 };
  }
  return set;
}

export interface AcceptanceQaCase {
  name: string;
  expected: MarketAcceptanceClassification[]; // any of these is acceptable
  classification: MarketAcceptanceClassification;
  ok: boolean;
  exit: number; acceptance: number; rejection: number;
}

/**
 * Run the 7 acceptance scenarios from the MAI-3 spec against the deterministic
 * scorer. Pure — no DB. Returns each case + whether it matched expectations.
 */
export function runAcceptanceScoringQa(): { ok: boolean; cases: AcceptanceQaCase[] } {
  const scenarios: { name: string; facts: Parameters<typeof makeSignals>[0]; expected: MarketAcceptanceClassification[]; matched?: boolean }[] = [
    { name: "active new listing", expected: ["ACTIVE", "UNCERTAIN"],
      facts: { StillActive: true, CurrentlyMissing: false, ReturnedAfterDisappear: false, DaysOnMarket: 3, ListingAge: 3, LastSeenDaysAgo: 0, PriceChangesCount: 0 } },
    { name: "missing for 1 day", expected: ["UNCERTAIN"],
      facts: { StillActive: false, CurrentlyMissing: true, ReturnedAfterDisappear: false, LastSeenDaysAgo: 1, DaysOnMarket: 20, ListingAge: 20, TimesDisappeared: 1 } },
    { name: "missing 14d with price drops", expected: ["LIKELY_MARKET_EXIT", "LIKELY_ACCEPTED"],
      facts: { StillActive: false, CurrentlyMissing: true, ReturnedAfterDisappear: false, LastSeenDaysAgo: 14, DaysOnMarket: 45, ListingAge: 45, TimesDisappeared: 1, PriceChangesCount: 2, AveragePriceReduction: 50000, ProviderCount: 1 } },
    { name: "active 120d multiple drops", expected: ["LIKELY_REJECTED"],
      facts: { StillActive: true, CurrentlyMissing: false, ReturnedAfterDisappear: false, DaysOnMarket: 120, ListingAge: 120, PriceChangesCount: 3, PriceMomentum: -90000, TimesDisappeared: 0 } },
    { name: "returned after disappear", expected: ["RETURNED"],
      facts: { StillActive: true, CurrentlyMissing: false, ReturnedAfterDisappear: true, DaysOnMarket: 40, ListingAge: 40, TimesReturned: 1, PriceChangesCount: 0 } },
    { name: "missing but duplicate confidence high", expected: ["UNCERTAIN"],
      facts: { StillActive: false, CurrentlyMissing: true, ReturnedAfterDisappear: false, LastSeenDaysAgo: 10, DaysOnMarket: 30, ListingAge: 30, DuplicateConfidence: 85, ProviderCount: 2 } },
    { name: "official deals nearby (no match → no sale claim)", expected: ["LIKELY_MARKET_EXIT", "LIKELY_ACCEPTED"],
      facts: { StillActive: false, CurrentlyMissing: true, ReturnedAfterDisappear: false, LastSeenDaysAgo: 16, DaysOnMarket: 60, ListingAge: 60, PriceChangesCount: 1, AveragePriceReduction: 40000, RecentOfficialDealsNearby: 7 } },
  ];

  const cases: AcceptanceQaCase[] = scenarios.map((sc) => {
    const signals = makeSignals(sc.facts);
    // case 7 sets RecentOfficialDealsNearby with confidence 1 (transactionsAvailable).
    const score = scoreMarketAcceptance({ signals, officialTransactionMatched: false });
    return {
      name: sc.name, expected: sc.expected, classification: score.classification,
      ok: sc.expected.includes(score.classification),
      exit: score.marketExitConfidence, acceptance: score.marketAcceptanceConfidence, rejection: score.marketRejectionConfidence,
    };
  });

  return { ok: cases.every((c) => c.ok), cases };
}

// ── MAI-4 — deterministic aggregate QA cases ────────────────────────────────

function makeRecord(p: Partial<AggregateListingRecord>): AggregateListingRecord {
  const recentScan = new Date(Date.now() - 1 * 86_400_000).toISOString(); // 1 day ago
  return {
    provider: "yad2", externalId: Math.random().toString(36).slice(2),
    classification: "ACTIVE", scoreConfidence: 1, currentState: "ACTIVE",
    daysOnMarket: 30, lastKnownPrice: 1_800_000, reductionPct: 0.03,
    city: "קריית ביאליק", neighborhood: "צמרות", propertyType: "apartment", rooms: 4,
    lastScanAt: recentScan, ...p,
  };
}
const rep = (n: number, p: Partial<AggregateListingRecord>) => Array.from({ length: n }, () => makeRecord(p));

export interface AggregateQaCase { name: string; ok: boolean; detail: string }

/** Run the 8 aggregate scenarios from the MAI-4 spec. Pure — no DB. */
export function runAggregateQa(): { ok: boolean; cases: AggregateQaCase[] } {
  const cases: AggregateQaCase[] = [];
  const cityAgg = (rows: ReturnType<typeof computeMarketAcceptanceAggregates>) =>
    rows.filter((r) => r.windowDays === 30 && r.neighborhood == null && r.priceBucket == null)[0];

  // 1) Empty org → no aggregates, no crash.
  {
    const rows = computeMarketAcceptanceAggregates([], Date.now());
    cases.push({ name: "empty organization", ok: rows.length === 0, detail: `rows=${rows.length}` });
  }
  // 2) Small sample (<5) → low confidence, no absorption score.
  {
    const rows = computeMarketAcceptanceAggregates(rep(3, { classification: "LIKELY_ACCEPTED" }), Date.now());
    const c = cityAgg(rows);
    const ok = !!c && c.absorptionSpeedScore === null && c.confidence <= 25;
    cases.push({ name: "small sample <5", ok, detail: c ? `conf=${c.confidence} absorption=${c.absorptionSpeedScore}` : "no city agg" });
  }
  // 3) Strong accepted segment → high acceptance rate + positive evidence.
  {
    const rows = computeMarketAcceptanceAggregates([...rep(18, { classification: "LIKELY_ACCEPTED", currentState: "DISAPPEARED", daysOnMarket: 20 })], Date.now());
    const c = cityAgg(rows);
    const ok = !!c && (c.marketAcceptanceRate ?? 0) >= 0.8 && c.evidence.some((e) => e.metric === "likely_accepted_count");
    cases.push({ name: "strong accepted segment", ok, detail: c ? `accRate=${c.marketAcceptanceRate} absorption=${c.absorptionSpeedScore}` : "no agg" });
  }
  // 4) Rejected segment → high rejection rate.
  {
    const rows = computeMarketAcceptanceAggregates(rep(20, { classification: "LIKELY_REJECTED", daysOnMarket: 130 }), Date.now());
    const c = cityAgg(rows);
    const ok = !!c && (c.marketRejectionRate ?? 0) >= 0.8;
    cases.push({ name: "rejected segment", ok, detail: c ? `rejRate=${c.marketRejectionRate}` : "no agg" });
  }
  // 5) Mixed segment → moderate confidence (sample 5–15 cap).
  {
    const recs = [...rep(4, { classification: "LIKELY_ACCEPTED" }), ...rep(4, { classification: "LIKELY_REJECTED" }), ...rep(4, { classification: "UNCERTAIN" })];
    const rows = computeMarketAcceptanceAggregates(recs, Date.now());
    const c = cityAgg(rows);
    const ok = !!c && c.confidence <= 65 && c.sampleSize === 12;
    cases.push({ name: "mixed segment", ok, detail: c ? `conf=${c.confidence} sample=${c.sampleSize}` : "no agg" });
  }
  // 6) Multiple windows → 7/14/30/60/90 present.
  {
    const rows = computeMarketAcceptanceAggregates(rep(20, {}), Date.now());
    const ws = new Set(rows.map((r) => r.windowDays));
    const ok = [7, 14, 30, 60, 90].every((w) => ws.has(w));
    cases.push({ name: "multiple windows", ok, detail: `windows=${[...ws].sort((a, b) => a - b).join(",")}` });
  }
  // 7) Price buckets → grouped correctly.
  {
    const ok = priceBucket(1_200_000) === "under_1_5m" && priceBucket(1_800_000) === "1_5m_2m" &&
      priceBucket(2_200_000) === "2m_2_5m" && priceBucket(2_700_000) === "2_5m_3m" &&
      priceBucket(3_500_000) === "3m_4m" && priceBucket(5_000_000) === "4m_plus" && priceBucket(null) === null;
    cases.push({ name: "price buckets", ok, detail: "bucket mapping" });
  }
  // 8) Null fields → null-safe, no fake values.
  {
    const rows = computeMarketAcceptanceAggregates(rep(6, { lastKnownPrice: null, daysOnMarket: null, reductionPct: null, neighborhood: null, propertyType: null, rooms: null }), Date.now());
    const c = cityAgg(rows);
    const ok = !!c && c.avgLastKnownPrice === null && c.medianDaysOnMarket === null && c.avgPriceReductionPct === null;
    cases.push({ name: "null fields", ok, detail: c ? `price=${c.avgLastKnownPrice} dom=${c.medianDaysOnMarket}` : "no agg" });
  }

  return { ok: cases.every((c) => c.ok), cases };
}
