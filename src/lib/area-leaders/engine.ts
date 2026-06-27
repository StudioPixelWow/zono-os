// ============================================================================
// Area Leader & Market Dominance Engine™ — MAI-7 engine (PURE, deterministic).
//
// For each market segment (city → neighborhood → property_type → rooms →
// price_bucket) and time window, computes every broker's observed market share,
// picks the dominant broker, the runner-up, the separation gap, and momentum
// (recent vs long-run dominance). EVIDENCE ONLY — never an official sale.
// Small samples (<5) never crown a leader; statistical ties produce no leader.
// No LLM, no randomness, no invented values.
// ============================================================================
import { priceBucket } from "@/lib/market-acceptance/aggregates";
import {
  AREA_LEADER_WINDOWS, AREA_SMALL_SAMPLE, AREA_TIE_EPSILON, DOMINANCE_WEIGHTS,
  type AreaLeaderRecord, type AreaLeaderResult, type AreaLeaderEvidence,
} from "./types";

const DAY_MS = 86_400_000;
const LONGEST = Math.max(...AREA_LEADER_WINDOWS);
const round = (v: number, dp = 2): number => { const f = 10 ** dp; return Math.round(v * f) / f; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Dims { city: string | null; neighborhood: string | null; propertyType: string | null; rooms: number | null; priceBucket: string | null }

/** Segment dimensions a record contributes to (levels 1..5), skipping levels with a missing dim. */
function segmentDimsFor(r: AreaLeaderRecord): { key: string; dims: Dims }[] {
  if (!r.city) return []; // city is the coarsest required dimension
  const out: { key: string; dims: Dims }[] = [];
  const dims: Dims = { city: r.city, neighborhood: null, propertyType: null, rooms: null, priceBucket: null };
  const push = () => out.push({ key: keyOf(dims), dims: { ...dims } });
  push();                                                       // L1 city
  if (!r.neighborhood) return out; dims.neighborhood = r.neighborhood; push();        // L2 +neighborhood
  if (!r.propertyType) return out; dims.propertyType = r.propertyType; push();        // L3 +type
  if (r.rooms == null) return out; dims.rooms = r.rooms; push();                       // L4 +rooms
  const b = priceBucket(r.lastKnownPrice); if (!b) return out; dims.priceBucket = b; push(); // L5 +bucket
  return out;
}
const keyOf = (d: Dims) => `${d.city}|${d.neighborhood ?? ""}|${d.propertyType ?? ""}|${d.rooms ?? ""}|${d.priceBucket ?? ""}`;

/** Per-broker accumulator within one (segment, window) bucket. */
interface Acc {
  active: number; success: number; exit: number; rejected: number; returned: number; total: number;
  dom: number[]; resolvedDom: number[]; confSum: number; confN: number;
}
const newAcc = (): Acc => ({ active: 0, success: 0, exit: 0, rejected: 0, returned: 0, total: 0, dom: [], resolvedDom: [], confSum: 0, confN: 0 });

/** Per-broker computed metrics within a segment+window. */
interface BrokerStats {
  brokerId: string;
  activeListingShare: number; marketSuccessShare: number; marketActivityShare: number;
  exitSpeed: number; presence: number; performance: number | null; dominance: number;
  medianDom: number | null; avgScoreConf: number; total: number; success: number; eligible: number;
}

interface Bucket { dims: Dims; window: number; brokers: Map<string, Acc> }

function accumulate(acc: Acc, r: AreaLeaderRecord): void {
  acc.total++;
  acc.confN++; acc.confSum += clamp(r.scoreConfidence, 0, 1);
  if (typeof r.daysOnMarket === "number" && Number.isFinite(r.daysOnMarket)) acc.dom.push(r.daysOnMarket);
  switch (r.classification) {
    case "LIKELY_ACCEPTED":
    case "OFFICIAL_TRANSACTION_FOUND":
      acc.success++; if (r.daysOnMarket != null) acc.resolvedDom.push(r.daysOnMarket); break;
    case "LIKELY_MARKET_EXIT":
      acc.exit++; if (r.daysOnMarket != null) acc.resolvedDom.push(r.daysOnMarket); break;
    case "LIKELY_REJECTED": acc.rejected++; break;
    case "RETURNED": acc.returned++; break;
    case "ACTIVE": acc.active++; break;
    default:
      if (r.classification == null && r.currentState === "ACTIVE") acc.active++;
      break;
  }
}

function brokerStats(brokerId: string, acc: Acc, area: { active: number; success: number; activity: number; medianDom: number | null }): BrokerStats {
  const movements = acc.success + acc.exit + acc.rejected + acc.returned;
  const eligible = acc.success + acc.exit + acc.rejected;
  const activeListingShare = area.active > 0 ? acc.active / area.active : 0;
  const marketSuccessShare = area.success > 0 ? acc.success / area.success : 0;
  const marketActivityShare = area.activity > 0 ? movements / area.activity : 0;

  const domSet = acc.resolvedDom.length ? acc.resolvedDom : acc.dom;
  const medDom = median(domSet);

  // Exit speed: faster than the area median ⇒ higher (0..100; 50 = at area median).
  let exitSpeed = 50;
  if (medDom != null && area.medianDom != null && area.medianDom > 0) {
    exitSpeed = clamp(50 + ((area.medianDom - medDom) / area.medianDom) * 50, 0, 100);
  }

  // Performance index (0..100) — only meaningful with resolved listings.
  let performance: number | null = null;
  if (eligible > 0) {
    const successRate = acc.success / eligible;
    const rejectionRate = acc.rejected / eligible;
    let idx = 50 + 45 * successRate - 25 * rejectionRate;
    if (medDom != null) idx += clamp(((60 - medDom) / 60) * 10, -10, 10);
    performance = clamp(idx, 0, 100);
  }
  const perfFactor = performance != null ? performance / 100 : 0.5;

  // Presence: how much of the area's footprint this broker holds.
  const presence = clamp(100 * (0.6 * activeListingShare + 0.4 * (acc.total / Math.max(1, area.active + area.success))), 0, 100);

  // Dominance composite (0..100).
  const dominance = round(100 * (
    DOMINANCE_WEIGHTS.activeListingShare * activeListingShare +
    DOMINANCE_WEIGHTS.marketSuccessShare * marketSuccessShare +
    DOMINANCE_WEIGHTS.marketActivityShare * marketActivityShare +
    DOMINANCE_WEIGHTS.performance * perfFactor
  ), 2);

  return {
    brokerId, activeListingShare: round(activeListingShare, 4), marketSuccessShare: round(marketSuccessShare, 4),
    marketActivityShare: round(marketActivityShare, 4), exitSpeed: round(exitSpeed, 1),
    presence: round(presence, 1), performance: performance == null ? null : round(performance, 1),
    dominance, medianDom: medDom == null ? null : round(medDom, 1),
    avgScoreConf: acc.confN ? acc.confSum / acc.confN : 0, total: acc.total, success: acc.success, eligible,
  };
}

/**
 * Compute area-leader rows for every (segment × window) with enough evidence.
 * Pure + deterministic — identical input always yields identical output.
 */
export function computeAreaLeaders(records: AreaLeaderRecord[], nowMs: number): AreaLeaderResult[] {
  // 1) Bucket records into (segment, window).
  const buckets = new Map<string, Bucket>();
  for (const r of records) {
    if (!r.brokerId) continue; // unattributed listings are ignored safely
    const lastScanMs = r.lastScanAt ? new Date(r.lastScanAt).getTime() : NaN;
    const segs = segmentDimsFor(r);
    if (!segs.length) continue;
    for (const w of AREA_LEADER_WINDOWS) {
      const inWindow = !Number.isFinite(lastScanMs) || lastScanMs >= nowMs - w * DAY_MS;
      if (!inWindow) continue;
      for (const seg of segs) {
        const bk = `${seg.key}#${w}`;
        let b = buckets.get(bk);
        if (!b) { b = { dims: seg.dims, window: w, brokers: new Map() }; buckets.set(bk, b); }
        let acc = b.brokers.get(r.brokerId);
        if (!acc) { acc = newAcc(); b.brokers.set(r.brokerId, acc); }
        accumulate(acc, r);
      }
    }
  }

  // 2) For each bucket, compute per-broker stats + dominance.
  interface Computed { dims: Dims; window: number; sampleSize: number; stats: BrokerStats[]; dominanceByBroker: Map<string, number>; areaScoreConf: number }
  const computedByKey = new Map<string, Computed>();   // segKey -> window -> Computed (stored flat keyed `${segKey}#${w}`)
  for (const [bk, b] of buckets) {
    let active = 0, success = 0, activity = 0; const areaDom: number[] = []; let confSum = 0, confN = 0;
    for (const acc of b.brokers.values()) {
      active += acc.active; success += acc.success;
      activity += acc.success + acc.exit + acc.rejected + acc.returned;
      areaDom.push(...(acc.resolvedDom.length ? acc.resolvedDom : acc.dom));
      confSum += acc.confSum; confN += acc.confN;
    }
    const areaMedianDom = median(areaDom);
    const area = { active, success, activity, medianDom: areaMedianDom };
    const stats: BrokerStats[] = [];
    const dominanceByBroker = new Map<string, number>();
    let sampleSize = 0;
    for (const [brokerId, acc] of b.brokers) {
      sampleSize += acc.total;
      const s = brokerStats(brokerId, acc, area);
      stats.push(s);
      dominanceByBroker.set(brokerId, s.dominance);
    }
    // Deterministic order: dominance desc, then brokerId asc.
    stats.sort((x, y) => y.dominance - x.dominance || x.brokerId.localeCompare(y.brokerId));
    computedByKey.set(bk, { dims: b.dims, window: b.window, sampleSize, stats, dominanceByBroker, areaScoreConf: confN ? confSum / confN : 0 });
  }

  // 3) Build results (leader / runner-up / gap / confidence) + momentum.
  const results: AreaLeaderResult[] = [];
  for (const [bk, c] of computedByKey) {
    const brokers = c.stats.length;
    // Emit only meaningful, competitive segments (≥2 brokers OR a real sample).
    if (brokers < 2 && c.sampleSize < AREA_SMALL_SAMPLE) continue;

    const leader = c.stats[0] ?? null;
    const runnerUp = c.stats[1] ?? null;
    const gap = leader ? round(leader.dominance - (runnerUp?.dominance ?? 0), 2) : null;
    const smallSample = c.sampleSize < AREA_SMALL_SAMPLE;
    const tie = !smallSample && !!runnerUp && (leader!.dominance - runnerUp.dominance) < AREA_TIE_EPSILON;
    const crowned = !smallSample && !tie ? leader : null;

    // Momentum: leader's dominance in this window vs the longest window (recent
    // vs long-run). 0 for the longest window itself or when no leader.
    let momentum = 0;
    if (crowned && c.window !== LONGEST) {
      const segKey = bk.slice(0, bk.lastIndexOf("#"));
      const longC = computedByKey.get(`${segKey}#${LONGEST}`);
      const domLong = longC?.dominanceByBroker.get(crowned.brokerId) ?? 0;
      momentum = round(clamp(crowned.dominance - domLong, -100, 100), 1);
    }

    const confidence = round(clamp(Math.min(80, c.sampleSize * 5) + c.areaScoreConf * 15, 0, 99), 1);
    const leaderConfidence = crowned
      ? round(clamp(40 + Math.min(25, (gap ?? 0)) + Math.min(20, c.sampleSize * 2) + crowned.avgScoreConf * 15, 0, 99), 1)
      : null;

    const evidence = buildEvidence({ crowned, runnerUp, smallSample, tie, sampleSize: c.sampleSize, gap, momentum, window: c.window });

    results.push({
      city: c.dims.city, neighborhood: c.dims.neighborhood, propertyType: c.dims.propertyType,
      rooms: c.dims.rooms, priceBucket: c.dims.priceBucket, windowDays: c.window,
      leaderBrokerId: crowned?.brokerId ?? null,
      leaderConfidence,
      activeListingShare: crowned?.activeListingShare ?? null,
      marketSuccessShare: crowned?.marketSuccessShare ?? null,
      marketActivityShare: crowned?.marketActivityShare ?? null,
      marketExitSpeed: crowned?.exitSpeed ?? null,
      marketPresenceScore: crowned?.presence ?? null,
      marketPerformanceIndex: crowned?.performance ?? null,
      marketDominanceIndex: crowned?.dominance ?? null,
      marketMomentumIndex: crowned ? momentum : null,
      sampleSize: c.sampleSize,
      confidence,
      runnerUpBrokerId: crowned ? (runnerUp?.brokerId ?? null) : null,
      runnerUpGap: crowned ? gap : null,
      evidence,
      metadata: tie
        ? { tie: true, tiedBrokers: [c.stats[0]?.brokerId, c.stats[1]?.brokerId].filter(Boolean) }
        : smallSample ? { smallSample: true } : {},
    });
  }
  // Stable output ordering (independent of Map iteration) for deterministic diffs.
  results.sort((a, b) =>
    (a.city ?? "").localeCompare(b.city ?? "") ||
    (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "") ||
    (a.propertyType ?? "").localeCompare(b.propertyType ?? "") ||
    (a.rooms ?? 0) - (b.rooms ?? 0) ||
    (a.priceBucket ?? "").localeCompare(b.priceBucket ?? "") ||
    a.windowDays - b.windowDays,
  );
  return results;
}

function buildEvidence(args: {
  crowned: BrokerStats | null; runnerUp: BrokerStats | null; smallSample: boolean; tie: boolean;
  sampleSize: number; gap: number | null; momentum: number; window: number;
}): AreaLeaderEvidence[] {
  const { crowned, runnerUp, smallSample, tie, sampleSize, gap, momentum, window } = args;
  const ev: AreaLeaderEvidence[] = [
    { label: "חלון מדידה (ימים)", metric: "window_days", value: window },
    { label: "גודל מדגם", metric: "sample_size", value: sampleSize },
  ];
  if (smallSample) { ev.push({ label: "מדגם קטן מדי — לא נקבע מוביל", metric: "small_sample", value: sampleSize }); return ev; }
  if (tie) { ev.push({ label: "תיקו — אין מוביל יציב באזור זה", metric: "tie", value: gap }); return ev; }
  if (!crowned) return ev;
  ev.push({ label: "נתח נכסים פעילים", metric: "active_listing_share", value: round((crowned.activeListingShare) * 100, 1) });
  ev.push({ label: "נתח הצלחת שוק אפשרית", metric: "market_success_share", value: round((crowned.marketSuccessShare) * 100, 1) });
  if (crowned.medianDom != null) ev.push({ label: "חציון ימים בשוק", metric: "median_days_on_market", value: crowned.medianDom });
  ev.push({ label: "מדד דומיננטיות", metric: "market_dominance_index", value: crowned.dominance });
  if (gap != null) ev.push({ label: "פער מהמתחרה הבא", metric: "runner_up_gap", value: gap });
  if (window !== LONGEST) ev.push({ label: "מומנטום (אחרון מול טווח ארוך)", metric: "market_momentum_index", value: momentum });
  if (runnerUp) ev.push({ label: "מתחרה קרוב", metric: "runner_up", value: runnerUp.brokerId });
  return ev;
}
