// ============================================================================
// Broker Market Intelligence™ — MAI-6 engine (PURE, deterministic).
//
// Turns a broker's observed listing records into a cautious market-performance
// profile. EVIDENCE ONLY: never claims an official sale, never says "sold" /
// "closed" / "transaction" / "commission". "Likely Market Success" is the
// LIKELY_ACCEPTED *observation*, not a confirmed deal. No LLM, no randomness,
// no invented values — a metric is null when its evidence is missing.
// ============================================================================
import { priceBucket } from "@/lib/market-acceptance/aggregates";
import type { BrokerListingRecord, BrokerMarketEvidence, BrokerMarketProfile } from "./types";

const round = (v: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Most frequent non-null key; deterministic tie-break by count desc, then key asc. */
function dominant<T extends string | number>(keys: (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const k of keys) {
    if (k == null || k === "") continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) =>
    b[1] - a[1] || String(a[0]).localeCompare(String(b[0])),
  )[0][0];
}

const EMPTY_EVIDENCE = (): BrokerMarketEvidence[] => [
  { label: "אין כרגע נכסים נצפים המשויכים למתווך זה", metric: "total_observed_listings", value: 0 },
];

/**
 * Compute a broker's market-performance profile from observed listing records.
 * Pure + deterministic — identical input always yields identical output.
 */
export function computeBrokerMarketProfile(
  brokerId: string,
  records: BrokerListingRecord[],
): BrokerMarketProfile {
  const total = records.length;

  // Empty broker → a real, honest empty profile (never fabricated metrics).
  if (!total) {
    return {
      brokerId,
      activeListings: 0, likelyMarketExitCount: 0, likelyMarketSuccessCount: 0,
      likelyMarketRejectedCount: 0, returnedListingCount: 0, uncertainListingCount: 0,
      totalObservedListings: 0, eligibleListings: 0,
      marketSuccessRate: null, marketRejectionRate: null, marketExitRate: null,
      medianDaysOnMarket: null, averageDaysOnMarket: null,
      medianPriceReductionPct: null, averagePriceReductionPct: null, averageLastKnownPrice: null,
      dominantCity: null, dominantNeighborhood: null, dominantPropertyType: null,
      dominantRoomCount: null, dominantPriceBucket: null,
      marketActivityScore: null, marketPerformanceIndex: null, confidence: 0,
      evidence: EMPTY_EVIDENCE(),
    };
  }

  // ── Observed counts (mutually exclusive by classification) ────────────────
  let activeListings = 0, exit = 0, success = 0, rejected = 0, returned = 0, uncertain = 0;
  for (const r of records) {
    switch (r.classification) {
      case "LIKELY_ACCEPTED": success++; break;
      case "LIKELY_MARKET_EXIT": exit++; break;
      case "LIKELY_REJECTED": rejected++; break;
      case "RETURNED": returned++; break;
      case "ACTIVE": activeListings++; break;
      case "OFFICIAL_TRANSACTION_FOUND":
        // A real matched transaction is NOT produced by MAI-3; treat as success-leaning
        // evidence but keep it out of the "likely" buckets to avoid any sale claim here.
        success++; break;
      case "UNCERTAIN": default:
        // null or uncertain — fall back to lifecycle state for an active read.
        if (r.classification == null && r.currentState === "ACTIVE") activeListings++;
        else uncertain++;
        break;
    }
  }

  // Eligible = listings with an observable market judgment (the rate denominator).
  const eligible = success + exit + rejected;
  const rate = (n: number): number | null => (eligible > 0 ? round(n / eligible, 4) : null);
  const marketSuccessRate = rate(success);
  const marketRejectionRate = rate(rejected);
  const marketExitRate = rate(exit);

  // ── Time on market — measured on RESOLVED listings (success/exit) when we
  //    have them; otherwise across all listings with an observed DOM. ────────
  const resolvedDom = records
    .filter((r) => r.classification === "LIKELY_ACCEPTED" || r.classification === "LIKELY_MARKET_EXIT")
    .map((r) => r.daysOnMarket)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  const allDom = records
    .map((r) => r.daysOnMarket)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  const domSet = resolvedDom.length ? resolvedDom : allDom;
  const medianDaysOnMarket = median(domSet);
  const avgDom = mean(domSet);
  const averageDaysOnMarket = avgDom == null ? null : round(avgDom, 1);

  // ── Price reduction (fraction 0..1) over listings that reduced ────────────
  const reductions = records
    .map((r) => r.reductionPct)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
  const medRed = median(reductions);
  const avgRed = mean(reductions);
  const medianPriceReductionPct = medRed == null ? null : round(medRed, 4);
  const averagePriceReductionPct = avgRed == null ? null : round(avgRed, 4);

  const prices = records
    .map((r) => r.lastKnownPrice)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);
  const avgPrice = mean(prices);
  const averageLastKnownPrice = avgPrice == null ? null : Math.round(avgPrice);

  // ── Dominant observed segment ─────────────────────────────────────────────
  const dominantCity = dominant(records.map((r) => r.city));
  const dominantNeighborhood = dominant(records.map((r) => r.neighborhood));
  const dominantPropertyType = dominant(records.map((r) => r.propertyType));
  const dominantRoomCount = dominant(records.map((r) => r.rooms));
  const dominantPriceBucket = dominant(records.map((r) => priceBucket(r.lastKnownPrice)));

  // ── Market Activity Score (0..100): volume + observed movement ────────────
  const movements = success + exit + rejected + returned;
  const volumeScore = Math.min(50, total * 5);            // 10 listings ⇒ 50
  const movementScore = Math.min(50, movements * 5);      // 10 movements ⇒ 50
  const marketActivityScore = round(clamp(volumeScore + movementScore, 0, 100), 1);

  // ── Market Performance Index (0..100): only when resolved evidence exists ──
  let marketPerformanceIndex: number | null = null;
  if (eligible > 0) {
    let idx = 50;
    idx += 45 * (marketSuccessRate ?? 0);
    idx -= 25 * (marketRejectionRate ?? 0);
    if (medianDaysOnMarket != null) {
      // Faster than ~60 days helps, slower hurts (bounded ±10).
      idx += clamp(((60 - medianDaysOnMarket) / 60) * 10, -10, 10);
    }
    marketPerformanceIndex = round(clamp(idx, 0, 100), 1);
  }

  // ── Confidence (0..100): sample size + evidence quality + completeness ────
  const avgScoreConf = mean(records.map((r) => clamp(r.scoreConfidence, 0, 1))) ?? 0;
  const classified = records.filter((r) => r.classification != null).length;
  const completeness = classified / total;
  const sampleComponent = Math.min(60, total * 4);        // 15 listings ⇒ 60
  const evidenceComponent = avgScoreConf * 30;            // up to 30
  const completenessComponent = completeness * 10;        // up to 10
  const confidence = round(clamp(sampleComponent + evidenceComponent + completenessComponent, 0, 99), 1);

  // ── Explainable evidence ──────────────────────────────────────────────────
  const evidence: BrokerMarketEvidence[] = [
    { label: "נכסים נצפים", metric: "total_observed_listings", value: total },
    { label: "הצלחת שוק אפשרית (נצפתה)", metric: "likely_market_success_count", value: success, sampleSize: eligible },
    { label: "יציאת שוק אפשרית", metric: "likely_market_exit_count", value: exit },
    { label: "דחיית שוק אפשרית", metric: "likely_market_rejected_count", value: rejected },
    { label: "נכסים פעילים", metric: "active_listings", value: activeListings },
  ];
  if (marketSuccessRate != null) evidence.push({ label: "שיעור הצלחת שוק", metric: "market_success_rate", value: round(marketSuccessRate * 100, 1), sampleSize: eligible });
  if (medianDaysOnMarket != null) evidence.push({ label: "חציון ימים בשוק", metric: "median_days_on_market", value: round(medianDaysOnMarket, 1), sampleSize: domSet.length });
  if (averagePriceReductionPct != null) evidence.push({ label: "ממוצע הורדת מחיר", metric: "average_price_reduction_pct", value: round(averagePriceReductionPct * 100, 1), sampleSize: reductions.length });
  if (dominantNeighborhood) evidence.push({ label: "שכונה דומיננטית", metric: "dominant_neighborhood", value: dominantNeighborhood });
  else if (dominantCity) evidence.push({ label: "עיר דומיננטית", metric: "dominant_city", value: dominantCity });
  if (dominantPropertyType) evidence.push({ label: "סוג נכס דומיננטי", metric: "dominant_property_type", value: dominantPropertyType });
  evidence.push({ label: "רמת ביטחון", metric: "confidence", value: confidence });
  if (total < 5) evidence.push({ label: "מדגם קטן — הביטחון מוגבל בהתאם", metric: "low_sample", value: total });

  return {
    brokerId,
    activeListings, likelyMarketExitCount: exit, likelyMarketSuccessCount: success,
    likelyMarketRejectedCount: rejected, returnedListingCount: returned, uncertainListingCount: uncertain,
    totalObservedListings: total, eligibleListings: eligible,
    marketSuccessRate, marketRejectionRate, marketExitRate,
    medianDaysOnMarket: medianDaysOnMarket == null ? null : round(medianDaysOnMarket, 1),
    averageDaysOnMarket,
    medianPriceReductionPct, averagePriceReductionPct, averageLastKnownPrice,
    dominantCity, dominantNeighborhood, dominantPropertyType,
    dominantRoomCount: dominantRoomCount == null ? null : Number(dominantRoomCount),
    dominantPriceBucket,
    marketActivityScore, marketPerformanceIndex, confidence,
    evidence,
  };
}
