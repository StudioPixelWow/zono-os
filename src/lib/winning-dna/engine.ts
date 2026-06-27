// ============================================================================
// Broker Winning DNA™ — MAI-9 engine (PURE, deterministic).
//
// For each market segment × window, selects the OBSERVED LEADERS (brokers whose
// dominance clears the leader floor) and aggregates their observed behaviour
// into a normalized "winning DNA": median DOM, price discipline, success/
// rejection/exit rates, activity level, momentum, dominant categories. EVIDENCE
// ONLY — never a recommendation, never advice, never a per-broker comparison.
// Fragmented segments yield a WEAK DNA; segments with no leader at all yield no
// DNA. No LLM, no randomness, no invented values.
// ============================================================================
import { priceBucket } from "@/lib/market-acceptance/aggregates";
import {
  WINNING_DNA_WINDOWS, WINNING_DNA_SMALL_SAMPLE, LEADER_FLOOR, WEAK_DNA_FLOOR, MAX_LEADERS,
  type WinningDNARecord, type WinningDNAResult, type DNAPattern, type ActivityLevel, type MomentumTrend, type PriceDiscipline,
} from "./types";

const DAY_MS = 86_400_000;
const LONGEST = Math.max(...WINNING_DNA_WINDOWS);
const round = (v: number, dp = 2): number => { const f = 10 ** dp; return Math.round(v * f) / f; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function modeOf<T extends string | number>(counts: Map<T, number>): T | null {
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
}
function mergeCounts<T extends string | number>(target: Map<T, number>, src: Map<T, number>): void {
  for (const [k, v] of src) target.set(k, (target.get(k) ?? 0) + v);
}

interface Dims { city: string | null; neighborhood: string | null; propertyType: string | null; rooms: number | null; priceBucket: string | null }
const keyOf = (d: Dims) => `${d.city}|${d.neighborhood ?? ""}|${d.propertyType ?? ""}|${d.rooms ?? ""}|${d.priceBucket ?? ""}`;

function segmentDimsFor(r: WinningDNARecord): { key: string; dims: Dims }[] {
  if (!r.city) return [];
  const out: { key: string; dims: Dims }[] = [];
  const dims: Dims = { city: r.city, neighborhood: null, propertyType: null, rooms: null, priceBucket: null };
  const push = () => out.push({ key: keyOf(dims), dims: { ...dims } });
  push();
  if (!r.neighborhood) return out; dims.neighborhood = r.neighborhood; push();
  if (!r.propertyType) return out; dims.propertyType = r.propertyType; push();
  if (r.rooms == null) return out; dims.rooms = r.rooms; push();
  const b = priceBucket(r.lastKnownPrice); if (!b) return out; dims.priceBucket = b; push();
  return out;
}

interface Acc {
  active: number; success: number; exit: number; rejected: number; returned: number; total: number;
  dom: number[]; resolvedDom: number[]; reductions: number[]; confSum: number; confN: number;
  propertyTypes: Map<string, number>; rooms: Map<number, number>; neighborhoods: Map<string, number>; priceBuckets: Map<string, number>;
}
const newAcc = (): Acc => ({ active: 0, success: 0, exit: 0, rejected: 0, returned: 0, total: 0, dom: [], resolvedDom: [], reductions: [], confSum: 0, confN: 0, propertyTypes: new Map(), rooms: new Map(), neighborhoods: new Map(), priceBuckets: new Map() });

function accumulate(a: Acc, r: WinningDNARecord): void {
  a.total++; a.confN++; a.confSum += clamp(r.scoreConfidence, 0, 1);
  if (typeof r.daysOnMarket === "number" && Number.isFinite(r.daysOnMarket)) a.dom.push(r.daysOnMarket);
  if (typeof r.reductionPct === "number" && Number.isFinite(r.reductionPct) && r.reductionPct > 0) a.reductions.push(r.reductionPct);
  if (r.propertyType) a.propertyTypes.set(r.propertyType, (a.propertyTypes.get(r.propertyType) ?? 0) + 1);
  if (r.rooms != null) a.rooms.set(r.rooms, (a.rooms.get(r.rooms) ?? 0) + 1);
  if (r.neighborhood) a.neighborhoods.set(r.neighborhood, (a.neighborhoods.get(r.neighborhood) ?? 0) + 1);
  const b = priceBucket(r.lastKnownPrice); if (b) a.priceBuckets.set(b, (a.priceBuckets.get(b) ?? 0) + 1);
  switch (r.classification) {
    case "LIKELY_ACCEPTED": case "OFFICIAL_TRANSACTION_FOUND":
      a.success++; if (r.daysOnMarket != null) a.resolvedDom.push(r.daysOnMarket); break;
    case "LIKELY_MARKET_EXIT": a.exit++; if (r.daysOnMarket != null) a.resolvedDom.push(r.daysOnMarket); break;
    case "LIKELY_REJECTED": a.rejected++; break;
    case "RETURNED": a.returned++; break;
    case "ACTIVE": a.active++; break;
    default: if (r.classification == null && r.currentState === "ACTIVE") a.active++; break;
  }
}

interface BrokerStat { brokerId: string; dominance: number; active: number }
function dominanceOf(a: Acc, area: { active: number; success: number; activity: number; medianDom: number | null }): number {
  const movements = a.success + a.exit + a.rejected + a.returned;
  const eligible = a.success + a.exit + a.rejected;
  const activeShare = area.active > 0 ? a.active / area.active : 0;
  const successShare = area.success > 0 ? a.success / area.success : 0;
  const activityShare = area.activity > 0 ? movements / area.activity : 0;
  const domSet = a.resolvedDom.length ? a.resolvedDom : a.dom;
  const medDom = median(domSet);
  let performance: number | null = null;
  if (eligible > 0) {
    let idx = 50 + 45 * (a.success / eligible) - 25 * (a.rejected / eligible);
    if (medDom != null) idx += clamp(((60 - medDom) / 60) * 10, -10, 10);
    performance = clamp(idx, 0, 100);
  }
  const perfFactor = performance != null ? performance / 100 : 0.5;
  return round(100 * (0.35 * activeShare + 0.30 * successShare + 0.20 * activityShare + 0.15 * perfFactor), 2);
}

/**
 * Extract winning DNA for every (segment × window) that has at least one
 * observed leader (or a fragmented top broker). Pure + deterministic.
 */
export function computeBrokerWinningDNA(records: WinningDNARecord[], nowMs: number): WinningDNAResult[] {
  // 1) Bucket records into (segment, window).
  const buckets = new Map<string, { dims: Dims; window: number; brokers: Map<string, Acc> }>();
  for (const r of records) {
    if (!r.brokerId) continue;
    const lastScanMs = r.lastScanAt ? new Date(r.lastScanAt).getTime() : NaN;
    const segs = segmentDimsFor(r);
    if (!segs.length) continue;
    for (const w of WINNING_DNA_WINDOWS) {
      if (Number.isFinite(lastScanMs) && lastScanMs < nowMs - w * DAY_MS) continue;
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

  // 2) Per-bucket area stats + per-broker dominance.
  interface Computed { dims: Dims; window: number; area: { active: number; success: number; activity: number; medianDom: number | null }; accs: Map<string, Acc>; stats: BrokerStat[]; sampleSize: number; areaActive: number }
  const computed = new Map<string, Computed>();
  for (const [bk, b] of buckets) {
    let active = 0, success = 0, activity = 0, sampleSize = 0; const areaDom: number[] = [];
    for (const acc of b.brokers.values()) {
      active += acc.active; success += acc.success;
      activity += acc.success + acc.exit + acc.rejected + acc.returned;
      sampleSize += acc.total; areaDom.push(...(acc.resolvedDom.length ? acc.resolvedDom : acc.dom));
    }
    const area = { active, success, activity, medianDom: median(areaDom) };
    const stats: BrokerStat[] = [];
    for (const [id, acc] of b.brokers) stats.push({ brokerId: id, dominance: dominanceOf(acc, area), active: acc.active });
    stats.sort((x, y) => y.dominance - x.dominance || x.brokerId.localeCompare(y.brokerId));
    computed.set(bk, { dims: b.dims, window: b.window, area, accs: b.brokers, stats, sampleSize, areaActive: active });
  }

  const domIn = (segKey: string, window: number, brokerId: string): number | null =>
    computed.get(`${segKey}#${window}`)?.stats.find((s) => s.brokerId === brokerId)?.dominance ?? null;

  // 3) Build DNA per bucket from its observed leaders.
  const results: WinningDNAResult[] = [];
  for (const [bk, c] of computed) {
    const segKey = bk.slice(0, bk.lastIndexOf("#"));
    const topDom = c.stats[0]?.dominance ?? 0;

    // Observed leaders = brokers clearing the leader floor (max MAX_LEADERS).
    let leaders = c.stats.filter((s) => s.dominance >= LEADER_FLOOR).slice(0, MAX_LEADERS);
    let weak = false;
    if (!leaders.length) {
      if (topDom >= WEAK_DNA_FLOOR) { leaders = c.stats.slice(0, 1); weak = true; } // fragmented → weak DNA
      else continue; // no leaders → no DNA
    }

    const leaderIds = leaders.map((l) => l.brokerId);
    const leaderAccs = leaderIds.map((id) => c.accs.get(id)!).filter(Boolean);

    // Aggregate the leaders' observed behaviour.
    const dom: number[] = []; const resolvedDom: number[] = []; const reductions: number[] = [];
    let lActive = 0, lSuccess = 0, lExit = 0, lRejected = 0, lEligible = 0, lTotal = 0, confSum = 0, confN = 0;
    const pt = new Map<string, number>(); const rm = new Map<number, number>(); const nb = new Map<string, number>(); const pb = new Map<string, number>();
    for (const a of leaderAccs) {
      dom.push(...a.dom); resolvedDom.push(...a.resolvedDom); reductions.push(...a.reductions);
      lActive += a.active; lSuccess += a.success; lExit += a.exit; lRejected += a.rejected;
      lEligible += a.success + a.exit + a.rejected; lTotal += a.total; confSum += a.confSum; confN += a.confN;
      mergeCounts(pt, a.propertyTypes); mergeCounts(rm, a.rooms); mergeCounts(nb, a.neighborhoods); mergeCounts(pb, a.priceBuckets);
    }
    const domSet = resolvedDom.length ? resolvedDom : dom;
    const medianDom = median(domSet);
    const medianReduction = median(reductions);
    const avgReduction = mean(reductions);
    const successRate = lEligible > 0 ? lSuccess / lEligible : null;
    const rejectionRate = lEligible > 0 ? lRejected / lEligible : null;
    const exitRate = lEligible > 0 ? lExit / lEligible : null;
    const avgDominance = mean(leaders.map((l) => l.dominance));
    const marketShare = c.areaActive > 0 ? lActive / c.areaActive : null;
    const listingsPerLeader = leaders.length ? lTotal / leaders.length : 0;
    const avgScoreConf = confN ? confSum / confN : 0;
    const avgMomentum = mean(leaders.map((l) => l.dominance - (domIn(segKey, LONGEST, l.brokerId) ?? l.dominance))) ?? 0;

    const activityLevel: ActivityLevel = listingsPerLeader >= 8 ? "HIGH" : listingsPerLeader >= 4 ? "MEDIUM" : "LOW";
    const momentum: MomentumTrend = c.window === LONGEST ? "STABLE" : avgMomentum > 5 ? "POSITIVE" : avgMomentum < -5 ? "NEGATIVE" : "STABLE";
    const priceDiscipline: PriceDiscipline = medianReduction == null ? "HIGH" : medianReduction <= 0.03 ? "HIGH" : medianReduction <= 0.07 ? "MEDIUM" : "LOW";

    const dominantPropertyType = c.dims.propertyType ?? modeOf(pt);
    const dominantRoomCount = c.dims.rooms ?? modeOf(rm);
    const dominantNeighborhood = c.dims.neighborhood ?? modeOf(nb);
    const dominantPriceBucket = c.dims.priceBucket ?? modeOf(pb);

    // Behaviour patterns (observed facts only, fired when supported).
    const behaviour: DNAPattern[] = [];
    if (medianDom != null && medianDom <= 30) behaviour.push({ label: "יציאות שוק מהירות", metric: "median_days_on_market", value: round(medianDom, 1) });
    if (medianDom != null && medianDom > 30 && c.area.medianDom != null && medianDom < c.area.medianDom) behaviour.push({ label: "זמן שיווק קצר מהממוצע", metric: "median_days_on_market", value: round(medianDom, 1) });
    if (successRate != null && successRate >= 0.6) behaviour.push({ label: "שיעור הצלחת שוק גבוה", metric: "market_success_rate", value: round(successRate * 100, 1) });
    if (rejectionRate != null && rejectionRate <= 0.2) behaviour.push({ label: "שיעור דחייה נמוך", metric: "rejection_rate", value: round(rejectionRate * 100, 1) });
    if (priceDiscipline === "HIGH") behaviour.push({ label: "משמעת מחיר גבוהה (הורדות נמוכות)", metric: "price_discipline", value: "HIGH" });
    if (activityLevel === "HIGH") behaviour.push({ label: "נפח פעילות גבוה", metric: "activity_level", value: "HIGH" });
    if (momentum === "POSITIVE") behaviour.push({ label: "מומנטום חיובי", metric: "momentum", value: round(avgMomentum, 1) });
    if (avgDominance != null && avgDominance >= 60) behaviour.push({ label: "דומיננטיות שוק גבוהה", metric: "market_dominance", value: round(avgDominance, 1) });

    // Confidence: sample + leader strength + evidence + stability.
    const domSpread = leaders.length > 1 ? Math.max(...leaders.map((l) => l.dominance)) - Math.min(...leaders.map((l) => l.dominance)) : 0;
    const stability = leaders.length > 1 ? clamp(10 - domSpread / 5, 0, 10) : 7;
    let confidence = round(clamp(
      Math.min(50, c.sampleSize * 4) + Math.min(25, (avgDominance ?? 0) * 0.3) + avgScoreConf * 15 + stability, 0, 99,
    ), 1);
    if (weak || c.sampleSize < WINNING_DNA_SMALL_SAMPLE) confidence = round(Math.min(confidence, 35), 1);

    results.push({
      city: c.dims.city, neighborhood: c.dims.neighborhood, propertyType: c.dims.propertyType,
      rooms: c.dims.rooms, priceBucket: c.dims.priceBucket, windowDays: c.window,
      sampleSize: c.sampleSize, confidence,
      winningProfile: {
        leaderCount: leaders.length,
        medianDaysOnMarket: medianDom == null ? null : round(medianDom, 1),
        medianPriceReductionPct: medianReduction == null ? null : round(medianReduction, 4),
        marketSuccessRate: successRate == null ? null : round(successRate, 4),
        rejectionRate: rejectionRate == null ? null : round(rejectionRate, 4),
        acceptanceRate: successRate == null ? null : round(successRate, 4),
        exitRate: exitRate == null ? null : round(exitRate, 4),
        marketDominance: avgDominance == null ? null : round(avgDominance, 1),
        marketShare: marketShare == null ? null : round(marketShare, 4),
        activityLevel, momentum, weak,
      },
      behaviourPatterns: behaviour,
      pricingPatterns: { medianReductionPct: medianReduction == null ? null : round(medianReduction, 4), avgReductionPct: avgReduction == null ? null : round(avgReduction, 4), priceDiscipline, dominantPriceBucket },
      activityPatterns: { activityLevel, momentum, avgMomentum: round(avgMomentum, 1), medianListingsPerLeader: round(listingsPerLeader, 1) },
      listingPatterns: { dominantPropertyType, dominantRoomCount: dominantRoomCount == null ? null : Number(dominantRoomCount), medianListingsPerLeader: round(listingsPerLeader, 1), coverageShare: marketShare == null ? null : round(marketShare, 4) },
      marketPatterns: { acceptanceRate: successRate == null ? null : round(successRate, 4), rejectionRate: rejectionRate == null ? null : round(rejectionRate, 4), exitRate: exitRate == null ? null : round(exitRate, 4), dominantNeighborhood, leaderShare: marketShare == null ? null : round(marketShare, 4) },
      medianDaysOnMarket: medianDom == null ? null : round(medianDom, 1),
      medianPriceReductionPct: medianReduction == null ? null : round(medianReduction, 4),
      marketSuccessRate: successRate == null ? null : round(successRate, 4),
      marketDominance: avgDominance == null ? null : round(avgDominance, 1),
      marketShare: marketShare == null ? null : round(marketShare, 4),
      evidence: [
        { label: "מספר מובילים נצפים", metric: "leader_count", value: leaders.length },
        { label: "גודל מדגם", metric: "sample_size", value: c.sampleSize },
        { label: "דומיננטיות ממוצעת של מובילים", metric: "market_dominance", value: avgDominance == null ? null : round(avgDominance, 1) },
        ...(medianDom != null ? [{ label: "חציון ימים בשוק", metric: "median_days_on_market", value: round(medianDom, 1) }] : []),
        ...(weak ? [{ label: "DNA חלש — שוק מפוצל", metric: "weak_dna", value: round(topDom, 1) }] : []),
        ...(c.sampleSize < WINNING_DNA_SMALL_SAMPLE ? [{ label: "מדגם קטן מדי", metric: "small_sample", value: c.sampleSize }] : []),
      ],
      metadata: { leaderBrokerIds: leaderIds, weak, topDominance: round(topDom, 1) },
    });
  }

  // Deterministic output ordering.
  results.sort((a, b) =>
    (a.city ?? "").localeCompare(b.city ?? "") || (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "") ||
    (a.propertyType ?? "").localeCompare(b.propertyType ?? "") || (a.rooms ?? 0) - (b.rooms ?? 0) ||
    (a.priceBucket ?? "").localeCompare(b.priceBucket ?? "") || a.windowDays - b.windowDays,
  );
  return results;
}
