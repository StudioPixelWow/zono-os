// ============================================================================
// Market Acceptance Intelligence™ — MAI-4 aggregates (PURE, deterministic).
//
// Rolls listing-level records up into market-segment metrics across time
// windows. EVIDENCE-based and cautious: small samples are flagged and never
// produce an absorption score; confidence is capped by sample size. NEVER
// treats LIKELY_ACCEPTED as an official sale. No LLM, no randomness, no fakes.
// ============================================================================
import type { ListingLifecycleState, MarketAcceptanceClassification } from "./types";

export const ACCEPTANCE_WINDOWS = [7, 14, 30, 60, 90] as const;
const DAY_MS = 86_400_000;
const SMALL_SAMPLE = 5;   // below this: counts only, low confidence, no absorption
const MODERATE_SAMPLE = 15;

/** One joined per-listing record fed into aggregation. */
export interface AggregateListingRecord {
  provider: string;
  externalId: string;
  classification: MarketAcceptanceClassification | null;
  scoreConfidence: number;            // 0..1 (max of the three MAI-3 confidences / 100)
  currentState: ListingLifecycleState | null;
  daysOnMarket: number | null;
  lastKnownPrice: number | null;
  reductionPct: number | null;        // 0..1 fraction off original (null if unknown)
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  lastScanAt: string | null;          // ISO; recency anchor for window inclusion
}

export interface AggregateEvidence { label: string; metric: string; value: number | null; sampleSize?: number }

/** One computed aggregate (segment × window), camelCase; the service maps to DB. */
export interface MarketAcceptanceAggregate {
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  priceBucket: string | null;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  activeCount: number;
  disappearedCount: number;
  likelyExitCount: number;
  likelyAcceptedCount: number;
  likelyRejectedCount: number;
  uncertainCount: number;
  returnedCount: number;
  medianDaysOnMarket: number | null;
  avgDaysOnMarket: number | null;
  avgLastKnownPrice: number | null;
  medianLastKnownPrice: number | null;
  avgPriceReductionPct: number | null;
  medianPriceReductionPct: number | null;
  marketExitRate: number | null;
  marketAcceptanceRate: number | null;
  marketRejectionRate: number | null;
  absorptionSpeedScore: number | null;
  sampleSize: number;
  confidence: number;
  evidence: AggregateEvidence[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Map an ILS price to a coarse bucket. null → null (excluded from bucket level). */
export function priceBucket(price: number | null): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (price < 1_500_000) return "under_1_5m";
  if (price < 2_000_000) return "1_5m_2m";
  if (price < 2_500_000) return "2m_2_5m";
  if (price < 3_000_000) return "2_5m_3m";
  if (price < 4_000_000) return "3m_4m";
  return "4m_plus";
}

// ── Segment dimension tuple per level (1..5) ────────────────────────────────
interface Dims { city: string | null; neighborhood: string | null; propertyType: string | null; rooms: number | null; priceBucket: string | null }

function dimsForLevel(r: AggregateListingRecord, level: number): Dims | null {
  if (!r.city) return null; // city is required for every level
  const base: Dims = { city: r.city, neighborhood: null, propertyType: null, rooms: null, priceBucket: null };
  if (level >= 2) { if (!r.neighborhood) return null; base.neighborhood = r.neighborhood; }
  if (level >= 3) { if (!r.propertyType) return null; base.propertyType = r.propertyType; }
  if (level >= 4) { if (r.rooms == null) return null; base.rooms = r.rooms; }
  if (level >= 5) { const b = priceBucket(r.lastKnownPrice); if (!b) return null; base.priceBucket = b; }
  return base;
}

const dimsKey = (d: Dims) => `${d.city}|${d.neighborhood ?? ""}|${d.propertyType ?? ""}|${d.rooms ?? ""}|${d.priceBucket ?? ""}`;

function segmentMetrics(records: AggregateListingRecord[], dims: Dims, windowDays: number, windowStart: string, windowEnd: string): MarketAcceptanceAggregate {
  const sample = records.length;
  const count = (pred: (r: AggregateListingRecord) => boolean) => records.filter(pred).length;

  const activeCount = count((r) => r.currentState === "ACTIVE");
  const disappearedCount = count((r) => r.currentState === "DISAPPEARED");
  const likelyExitCount = count((r) => r.classification === "LIKELY_MARKET_EXIT");
  const likelyAcceptedCount = count((r) => r.classification === "LIKELY_ACCEPTED");
  const likelyRejectedCount = count((r) => r.classification === "LIKELY_REJECTED");
  const uncertainCount = count((r) => r.classification === "UNCERTAIN" || r.classification == null);
  const returnedCount = count((r) => r.classification === "RETURNED");

  const domVals = records.map((r) => r.daysOnMarket).filter((v): v is number => v != null);
  const priceVals = records.map((r) => r.lastKnownPrice).filter((v): v is number => v != null);
  const redVals = records.map((r) => r.reductionPct).filter((v): v is number => v != null);

  const medDom = median(domVals); const avgDom = mean(domVals);
  const exitRate = sample ? likelyExitCount / sample : null;
  const acceptanceRate = sample ? likelyAcceptedCount / sample : null;
  const rejectionRate = sample ? likelyRejectedCount / sample : null;

  // Absorption speed (0..100) — cautious, only with a real sample.
  let absorption: number | null = null;
  if (sample >= SMALL_SAMPLE) {
    const accPart = (acceptanceRate ?? 0) * 50;
    const domPart = medDom != null ? 30 * (1 - Math.min(medDom, 180) / 180) : 15;
    const rejPart = (1 - (rejectionRate ?? 0)) * 20;
    absorption = round(clamp(accPart + domPart + rejPart, 0, 100));
  }

  // Confidence (0..100) — sample + listing-score confidence + completeness, capped by sample.
  const sampleFactor = Math.min(1, sample / 20);
  const avgScoreConf = mean(records.map((r) => r.scoreConfidence)) ?? 0;
  const completeness = sample ? count((r) => r.lastKnownPrice != null && r.daysOnMarket != null) / sample : 0;
  let confidence = round(100 * (0.4 * sampleFactor + 0.3 * avgScoreConf + 0.3 * completeness));
  if (sample < SMALL_SAMPLE) confidence = Math.min(confidence, 25);
  else if (sample <= MODERATE_SAMPLE) confidence = Math.min(confidence, 65);

  // Evidence (Hebrew, explainable).
  const evidence: AggregateEvidence[] = [
    { label: `${likelyExitCount} מתוך ${sample} נכסים יצאו מהשוק ככל הנראה`, metric: "likely_exit_count", value: likelyExitCount, sampleSize: sample },
  ];
  if (medDom != null) evidence.push({ label: `זמן חציוני על המדף: ${round(medDom)} ימים`, metric: "median_days_on_market", value: round(medDom) });
  if (rejectionRate != null) evidence.push({ label: `שיעור דחיית שוק: ${round(rejectionRate * 100)}%`, metric: "market_rejection_rate", value: round(rejectionRate, 4) });
  if (likelyAcceptedCount > 0) evidence.push({ label: `${likelyAcceptedCount} נכסים התקבלו ככל הנראה על ידי השוק`, metric: "likely_accepted_count", value: likelyAcceptedCount, sampleSize: sample });
  if (sample < SMALL_SAMPLE) evidence.push({ label: "מדגם קטן מדי למסקנה יציבה", metric: "sample_size", value: sample });

  return {
    city: dims.city, neighborhood: dims.neighborhood, propertyType: dims.propertyType, rooms: dims.rooms, priceBucket: dims.priceBucket,
    windowDays, windowStart, windowEnd,
    activeCount, disappearedCount, likelyExitCount, likelyAcceptedCount, likelyRejectedCount, uncertainCount, returnedCount,
    medianDaysOnMarket: medDom != null ? round(medDom, 1) : null,
    avgDaysOnMarket: avgDom != null ? round(avgDom, 1) : null,
    avgLastKnownPrice: mean(priceVals) != null ? round(mean(priceVals)!) : null,
    medianLastKnownPrice: median(priceVals) != null ? round(median(priceVals)!) : null,
    avgPriceReductionPct: mean(redVals) != null ? round(mean(redVals)!, 4) : null,
    medianPriceReductionPct: median(redVals) != null ? round(median(redVals)!, 4) : null,
    marketExitRate: exitRate != null ? round(exitRate, 4) : null,
    marketAcceptanceRate: acceptanceRate != null ? round(acceptanceRate, 4) : null,
    marketRejectionRate: rejectionRate != null ? round(rejectionRate, 4) : null,
    absorptionSpeedScore: absorption,
    sampleSize: sample, confidence, evidence,
  };
}

/**
 * Compute every (segment × window) aggregate for a set of listing records.
 * Pure & deterministic. `nowMs` anchors the windows (window_end = today UTC).
 */
export function computeMarketAcceptanceAggregates(
  records: AggregateListingRecord[],
  nowMs: number = Date.now(),
): MarketAcceptanceAggregate[] {
  const out: MarketAcceptanceAggregate[] = [];
  if (!records.length) return out;

  const d = new Date(nowMs);
  const anchorEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const windowEndIso = anchorEnd.toISOString();

  for (const windowDays of ACCEPTANCE_WINDOWS) {
    const windowStartMs = anchorEnd.getTime() - windowDays * DAY_MS;
    const windowStartIso = new Date(windowStartMs).toISOString();
    const inWindow = records.filter((r) => r.lastScanAt != null && new Date(r.lastScanAt).getTime() >= windowStartMs);
    if (!inWindow.length) continue;

    for (let level = 1; level <= 5; level++) {
      const groups = new Map<string, { dims: Dims; rows: AggregateListingRecord[] }>();
      for (const r of inWindow) {
        const dims = dimsForLevel(r, level);
        if (!dims) continue;
        const k = dimsKey(dims);
        const g = groups.get(k) ?? { dims, rows: [] };
        g.rows.push(r);
        groups.set(k, g);
      }
      for (const g of groups.values()) {
        out.push(segmentMetrics(g.rows, g.dims, windowDays, windowStartIso, windowEndIso));
      }
    }
  }
  return out;
}
