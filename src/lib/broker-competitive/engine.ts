// ============================================================================
// Broker Competitive Intelligence™ — MAI-8 engine (PURE, deterministic).
//
// For every broker × market segment × window, compares the broker's observed
// behaviour against the area leader, area average, and runner-up, and derives:
// market position, leader gap, behavioural deltas, momentum (growth/decline),
// and evidence-based strengths / weaknesses / opportunities / risks, plus
// best/worst segment discovery. EVIDENCE ONLY — never a ranking, never advice,
// never an official-sale claim. No LLM, no randomness, no invented values.
// ============================================================================
import { priceBucket } from "@/lib/market-acceptance/aggregates";
import {
  COMPETITIVE_WINDOWS, COMPETITIVE_SMALL_SAMPLE,
  type CompetitiveRecord, type CompetitiveProfile, type CompetitiveItem, type MarketPosition,
} from "./types";

const DAY_MS = 86_400_000;
const LONGEST = Math.max(...COMPETITIVE_WINDOWS);
const round = (v: number, dp = 2): number => { const f = 10 ** dp; return Math.round(v * f) / f; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface Dims { city: string | null; neighborhood: string | null; propertyType: string | null; rooms: number | null; priceBucket: string | null }
const keyOf = (d: Dims) => `${d.city}|${d.neighborhood ?? ""}|${d.propertyType ?? ""}|${d.rooms ?? ""}|${d.priceBucket ?? ""}`;
const segLabel = (d: Dims) => [d.city, d.neighborhood, d.propertyType, d.rooms != null ? `${d.rooms} חד׳` : null, d.priceBucket].filter(Boolean).join(" / ") || "כל האזור";

function segmentDimsFor(r: CompetitiveRecord): { key: string; dims: Dims }[] {
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
}
const newAcc = (): Acc => ({ active: 0, success: 0, exit: 0, rejected: 0, returned: 0, total: 0, dom: [], resolvedDom: [], reductions: [], confSum: 0, confN: 0 });

function accumulate(a: Acc, r: CompetitiveRecord): void {
  a.total++; a.confN++; a.confSum += clamp(r.scoreConfidence, 0, 1);
  if (typeof r.daysOnMarket === "number" && Number.isFinite(r.daysOnMarket)) a.dom.push(r.daysOnMarket);
  if (typeof r.reductionPct === "number" && Number.isFinite(r.reductionPct) && r.reductionPct > 0) a.reductions.push(r.reductionPct);
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

interface BrokerSeg {
  brokerId: string; total: number;
  activeShare: number; successShare: number; activityShare: number;
  exitSpeed: number; performance: number | null; dominance: number;
  medianDom: number | null; successRate: number | null; rejectionRate: number | null;
  eligible: number; avgReduction: number | null; avgScoreConf: number;
}
interface Area {
  active: number; success: number; activity: number; eligible: number;
  medianDom: number | null; avgReduction: number | null; brokerCount: number; sampleSize: number;
  avgPerformance: number | null; avgSuccessRate: number | null; avgActivityShare: number;
}
interface BucketComputed { dims: Dims; window: number; area: Area; brokers: Map<string, BrokerSeg>; order: string[] }

function brokerSeg(brokerId: string, a: Acc, area: { active: number; success: number; activity: number; medianDom: number | null }): BrokerSeg {
  const movements = a.success + a.exit + a.rejected + a.returned;
  const eligible = a.success + a.exit + a.rejected;
  const activeShare = area.active > 0 ? a.active / area.active : 0;
  const successShare = area.success > 0 ? a.success / area.success : 0;
  const activityShare = area.activity > 0 ? movements / area.activity : 0;
  const domSet = a.resolvedDom.length ? a.resolvedDom : a.dom;
  const medDom = median(domSet);
  let exitSpeed = 50;
  if (medDom != null && area.medianDom != null && area.medianDom > 0) exitSpeed = clamp(50 + ((area.medianDom - medDom) / area.medianDom) * 50, 0, 100);
  const successRate = eligible > 0 ? a.success / eligible : null;
  const rejectionRate = eligible > 0 ? a.rejected / eligible : null;
  let performance: number | null = null;
  if (eligible > 0) {
    let idx = 50 + 45 * (successRate ?? 0) - 25 * (rejectionRate ?? 0);
    if (medDom != null) idx += clamp(((60 - medDom) / 60) * 10, -10, 10);
    performance = clamp(idx, 0, 100);
  }
  const perfFactor = performance != null ? performance / 100 : 0.5;
  const dominance = round(100 * (0.35 * activeShare + 0.30 * successShare + 0.20 * activityShare + 0.15 * perfFactor), 2);
  return {
    brokerId, total: a.total,
    activeShare: round(activeShare, 4), successShare: round(successShare, 4), activityShare: round(activityShare, 4),
    exitSpeed: round(exitSpeed, 1), performance: performance == null ? null : round(performance, 1), dominance,
    medianDom: medDom == null ? null : round(medDom, 1),
    successRate: successRate == null ? null : round(successRate, 4),
    rejectionRate: rejectionRate == null ? null : round(rejectionRate, 4),
    eligible, avgReduction: mean(a.reductions) == null ? null : round(mean(a.reductions)!, 4),
    avgScoreConf: a.confN ? a.confSum / a.confN : 0,
  };
}

/**
 * Compute competitive profiles for every (broker × segment × window) with
 * enough evidence. Pure + deterministic.
 */
export function computeBrokerCompetitive(records: CompetitiveRecord[], nowMs: number): CompetitiveProfile[] {
  // 1) Bucket into (segment, window).
  const buckets = new Map<string, { dims: Dims; window: number; brokers: Map<string, Acc> }>();
  for (const r of records) {
    if (!r.brokerId) continue;
    const lastScanMs = r.lastScanAt ? new Date(r.lastScanAt).getTime() : NaN;
    const segs = segmentDimsFor(r);
    if (!segs.length) continue;
    for (const w of COMPETITIVE_WINDOWS) {
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

  // 2) Compute per-bucket area + per-broker stats.
  const computed = new Map<string, BucketComputed>();
  for (const [bk, b] of buckets) {
    let active = 0, success = 0, activity = 0, eligible = 0, sampleSize = 0;
    const areaDom: number[] = []; const areaRed: number[] = [];
    for (const acc of b.brokers.values()) {
      active += acc.active; success += acc.success;
      activity += acc.success + acc.exit + acc.rejected + acc.returned;
      eligible += acc.success + acc.exit + acc.rejected; sampleSize += acc.total;
      areaDom.push(...(acc.resolvedDom.length ? acc.resolvedDom : acc.dom));
      areaRed.push(...acc.reductions);
    }
    const area0 = { active, success, activity, medianDom: median(areaDom) };
    const brokers = new Map<string, BrokerSeg>();
    for (const [id, acc] of b.brokers) brokers.set(id, brokerSeg(id, acc, area0));
    const perfs = [...brokers.values()].map((s) => s.performance).filter((x): x is number => x != null);
    const srs = [...brokers.values()].map((s) => s.successRate).filter((x): x is number => x != null);
    const order = [...brokers.values()].sort((x, y) => y.dominance - x.dominance || x.brokerId.localeCompare(y.brokerId)).map((s) => s.brokerId);
    const area: Area = {
      active, success, activity, eligible, medianDom: area0.medianDom, avgReduction: mean(areaRed),
      brokerCount: brokers.size, sampleSize,
      avgPerformance: mean(perfs), avgSuccessRate: mean(srs), avgActivityShare: brokers.size ? 1 / brokers.size : 0,
    };
    computed.set(bk, { dims: b.dims, window: b.window, area, brokers, order });
  }

  // Momentum helper: a broker's dominance in the longest window for the same segment.
  const domIn = (segKey: string, window: number, brokerId: string): number | null =>
    computed.get(`${segKey}#${window}`)?.brokers.get(brokerId)?.dominance ?? null;

  // 3) Per-broker discovery (best/worst) for each (broker, window).
  //    bestByBrokerWindow: `${brokerId}#${window}` → discovery.
  interface Discovery { strongest: string | null; weakest: string | null; bestNeighborhood: string | null; bestPropertyType: string | null; bestPriceBucket: string | null }
  const discovery = new Map<string, Discovery>();
  {
    interface Agg { dims: Dims; dominance: number }
    const byBW = new Map<string, Agg[]>();
    for (const c of computed.values()) {
      for (const [id, s] of c.brokers) {
        const k = `${id}#${c.window}`;
        const arr = byBW.get(k) ?? []; arr.push({ dims: c.dims, dominance: s.dominance }); byBW.set(k, arr);
      }
    }
    for (const [k, aggs] of byBW) {
      const sorted = [...aggs].sort((a, b) => b.dominance - a.dominance || segLabel(a.dims).localeCompare(segLabel(b.dims)));
      const bestOf = (pick: (d: Dims) => string | null): string | null => {
        for (const a of sorted) { const v = pick(a.dims); if (v) return v; }
        return null;
      };
      discovery.set(k, {
        strongest: sorted.length ? segLabel(sorted[0].dims) : null,
        weakest: sorted.length ? segLabel(sorted[sorted.length - 1].dims) : null,
        bestNeighborhood: bestOf((d) => d.neighborhood),
        bestPropertyType: bestOf((d) => d.propertyType),
        bestPriceBucket: bestOf((d) => d.priceBucket),
      });
    }
  }

  // 4) Build profiles.
  const profiles: CompetitiveProfile[] = [];
  for (const [bk, c] of computed) {
    const segKey = bk.slice(0, bk.lastIndexOf("#"));
    if (c.brokers.size < 2 && c.area.sampleSize < COMPETITIVE_SMALL_SAMPLE) continue; // not meaningful

    const leaderId = c.order[0] ?? null;
    const runnerUpId = c.order[1] ?? null;
    const leader = leaderId ? c.brokers.get(leaderId)! : null;
    const leaderMomentum = leader ? (leader.dominance - (domIn(segKey, LONGEST, leader.brokerId) ?? leader.dominance)) : 0;

    for (const [id, s] of c.brokers) {
      const small = c.area.sampleSize < COMPETITIVE_SMALL_SAMPLE;
      const sole = c.brokers.size === 1;
      const rank = c.order.indexOf(id);
      const position: MarketPosition = small ? "INSUFFICIENT"
        : sole ? "SOLE"
          : rank === 0 ? "LEADER"
            : rank === 1 ? "RUNNER_UP"
              : rank < Math.max(2, Math.ceil(c.brokers.size / 3)) ? "CONTENDER" : "TRAILING";

      const leaderGap = leader ? round(leader.dominance - s.dominance, 2) : null;
      const momentum = round((s.dominance - (domIn(segKey, LONGEST, id) ?? s.dominance)), 1);
      const growth = c.window === LONGEST ? 0 : Math.max(0, momentum);
      const decline = c.window === LONGEST ? 0 : Math.max(0, -momentum);

      const meaningful = !small && !sole;
      const activityDelta = meaningful ? round(s.activityShare - c.area.avgActivityShare, 4) : null;
      const performanceDelta = meaningful && s.performance != null && c.area.avgPerformance != null ? round(s.performance - c.area.avgPerformance, 2) : null;
      const successDelta = meaningful && s.successRate != null && c.area.avgSuccessRate != null ? round(s.successRate - c.area.avgSuccessRate, 4) : null;
      const exitSpeedDelta = meaningful ? round(s.exitSpeed - 50, 1) : null;
      const listingShareDelta = meaningful ? round(s.activeShare - c.area.avgActivityShare, 4) : null;

      const { strengths, weaknesses, opportunities, risks } = meaningful
        ? detectItems({ s, area: c.area, leaderGap, growth, decline, leaderMomentum, isLeader: rank === 0, others: [...c.brokers.values()].filter((x) => x.brokerId !== id), domIn, segKey, window: c.window })
        : { strengths: [], weaknesses: [], opportunities: [], risks: [] };

      const disc = discovery.get(`${id}#${c.window}`) ?? { strongest: null, weakest: null, bestNeighborhood: null, bestPropertyType: null, bestPriceBucket: null };
      const confidence = round(clamp(Math.min(70, c.area.sampleSize * 4) + Math.min(20, s.total * 4) + s.avgScoreConf * 10, 0, 99), 1);

      profiles.push({
        brokerId: id,
        city: c.dims.city, neighborhood: c.dims.neighborhood, propertyType: c.dims.propertyType,
        rooms: c.dims.rooms, priceBucket: c.dims.priceBucket, windowDays: c.window,
        marketPosition: position, leaderGap, marketShare: round(s.activeShare, 4),
        marketGrowth: growth, marketDecline: decline,
        activityDelta, performanceDelta, successDelta, exitSpeedDelta, listingShareDelta,
        competitiveStrengths: strengths, competitiveWeaknesses: weaknesses,
        competitiveOpportunities: opportunities, competitiveRisks: risks,
        strongestSegment: disc.strongest, weakestSegment: disc.weakest,
        bestPropertyType: disc.bestPropertyType, bestPriceBucket: disc.bestPriceBucket, bestNeighborhood: disc.bestNeighborhood,
        sampleSize: c.area.sampleSize, confidence,
        evidence: [
          { label: "מיקום תחרותי", metric: "market_position", value: position },
          { label: "פער מהמובילה", metric: "leader_gap", value: leaderGap },
          { label: "נתח נכסים פעילים", metric: "market_share", value: round(s.activeShare * 100, 1) },
          { label: "גודל מדגם באזור", metric: "sample_size", value: c.area.sampleSize },
          ...(small ? [{ label: "מדגם קטן מדי", metric: "small_sample", value: c.area.sampleSize }] : []),
        ],
        metadata: { runnerUpBrokerId: runnerUpId, leaderBrokerId: leaderId, momentum, sole, insufficient: small },
      });
    }
  }

  // Stable, deterministic ordering.
  profiles.sort((a, b) =>
    a.brokerId.localeCompare(b.brokerId) ||
    (a.city ?? "").localeCompare(b.city ?? "") || (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "") ||
    (a.propertyType ?? "").localeCompare(b.propertyType ?? "") || (a.rooms ?? 0) - (b.rooms ?? 0) ||
    (a.priceBucket ?? "").localeCompare(b.priceBucket ?? "") || a.windowDays - b.windowDays,
  );
  return profiles;
}

function detectItems(ctx: {
  s: BrokerSeg; area: Area; leaderGap: number | null; growth: number; decline: number; leaderMomentum: number;
  isLeader: boolean; others: BrokerSeg[]; domIn: (k: string, w: number, b: string) => number | null; segKey: string; window: number;
}): { strengths: CompetitiveItem[]; weaknesses: CompetitiveItem[]; opportunities: CompetitiveItem[]; risks: CompetitiveItem[] } {
  const { s, area, leaderGap, growth, decline, leaderMomentum, isLeader, others } = ctx;
  const strengths: CompetitiveItem[] = [];
  const weaknesses: CompetitiveItem[] = [];
  const opportunities: CompetitiveItem[] = [];
  const risks: CompetitiveItem[] = [];

  // ── Strengths (only when supported by evidence) ───────────────────────────
  if (s.medianDom != null && area.medianDom != null && area.medianDom > 0 && s.medianDom <= area.medianDom * 0.8)
    strengths.push({ type: "strength", label: "יציאות שוק מהירות מהממוצע", metric: "median_days_on_market", value: s.medianDom, comparedTo: "area_average" });
  if (s.avgReduction != null && area.avgReduction != null && area.avgReduction > 0 && s.avgReduction <= area.avgReduction * 0.8)
    strengths.push({ type: "strength", label: "הורדות מחיר נמוכות מהממוצע", metric: "avg_price_reduction", value: round(s.avgReduction * 100, 1), comparedTo: "area_average" });
  if (s.activeShare >= 0.30)
    strengths.push({ type: "strength", label: "נפח נכסים פעילים גבוה", metric: "active_listing_share", value: round(s.activeShare * 100, 1) });
  if (s.eligible >= 3 && (s.successRate ?? 0) >= 0.6)
    strengths.push({ type: "strength", label: "שיעור הצלחת שוק גבוה", metric: "success_rate", value: round((s.successRate ?? 0) * 100, 1) });
  if (s.dominance >= 60)
    strengths.push({ type: "strength", label: "דומיננטיות גבוהה באזור", metric: "dominance", value: s.dominance });
  if (growth >= 10)
    strengths.push({ type: "strength", label: "מומנטום חיובי", metric: "market_growth", value: growth, comparedTo: "previous_window" });

  // ── Weaknesses ────────────────────────────────────────────────────────────
  if (s.medianDom != null && area.medianDom != null && area.medianDom > 0 && s.medianDom >= area.medianDom * 1.2)
    weaknesses.push({ type: "weakness", label: "זמן שיווק ארוך מהממוצע", metric: "median_days_on_market", value: s.medianDom, comparedTo: "area_average" });
  if (s.eligible >= 3 && (s.rejectionRate ?? 0) >= 0.4)
    weaknesses.push({ type: "weakness", label: "שיעור דחיית שוק גבוה", metric: "rejection_rate", value: round((s.rejectionRate ?? 0) * 100, 1) });
  if (s.avgReduction != null && area.avgReduction != null && area.avgReduction > 0 && s.avgReduction >= area.avgReduction * 1.2)
    weaknesses.push({ type: "weakness", label: "הורדות מחיר גדולות מהממוצע", metric: "avg_price_reduction", value: round(s.avgReduction * 100, 1), comparedTo: "area_average" });
  if (area.brokerCount >= 2 && s.activeShare <= 0.5 * area.avgActivityShare)
    weaknesses.push({ type: "weakness", label: "נוכחות שוק חלשה", metric: "active_listing_share", value: round(s.activeShare * 100, 1), comparedTo: "area_average" });
  if (area.brokerCount >= 2 && s.activityShare <= 0.5 * area.avgActivityShare)
    weaknesses.push({ type: "weakness", label: "פעילות שוק נמוכה", metric: "activity_share", value: round(s.activityShare * 100, 1), comparedTo: "area_average" });
  if (decline >= 10)
    weaknesses.push({ type: "weakness", label: "מומנטום יורד", metric: "market_decline", value: decline, comparedTo: "previous_window" });

  // ── Opportunities (evidence-based, never advice) ──────────────────────────
  if (!isLeader && leaderMomentum < -5)
    opportunities.push({ type: "opportunity", label: "מובילת האזור מאבדת תאוצה", metric: "leader_momentum", value: round(leaderMomentum, 1), comparedTo: "leader" });
  if (area.brokerCount <= 2 && area.sampleSize >= COMPETITIVE_SMALL_SAMPLE)
    opportunities.push({ type: "opportunity", label: "תחרות נמוכה באזור", metric: "broker_count", value: area.brokerCount });
  if (area.eligible > 0 && area.success / area.eligible >= 0.5)
    opportunities.push({ type: "opportunity", label: "קבלת השוק באזור גבוהה", metric: "area_acceptance_rate", value: round((area.success / area.eligible) * 100, 1) });
  if (area.brokerCount >= 2 && (others.length ? Math.max(...others.map((o) => o.activeShare), s.activeShare) : 1) < 0.4)
    opportunities.push({ type: "opportunity", label: "שוק מפוצל — אין שחקן דומיננטי", metric: "max_active_share", value: round(Math.max(...[...others, s].map((o) => o.activeShare)) * 100, 1) });

  // ── Risks ─────────────────────────────────────────────────────────────────
  if (!isLeader && (leaderGap ?? 0) >= 40)
    risks.push({ type: "risk", label: "המובילה מרחיבה את הפער", metric: "leader_gap", value: leaderGap, comparedTo: "leader" });
  if (others.some((o) => {
    const m = o.dominance - (ctx.domIn(ctx.segKey, Math.max(...COMPETITIVE_WINDOWS), o.brokerId) ?? o.dominance);
    return ctx.window !== Math.max(...COMPETITIVE_WINDOWS) && m >= 20;
  }))
    risks.push({ type: "risk", label: "מתחרה צומח במהירות", metric: "competitor_growth", value: null, comparedTo: "runner_up" });
  if (s.eligible >= 3 && (s.rejectionRate ?? 0) >= 0.4)
    risks.push({ type: "risk", label: "מגמת דחיית שוק גבוהה", metric: "rejection_rate", value: round((s.rejectionRate ?? 0) * 100, 1) });
  if (!isLeader && decline >= 10)
    risks.push({ type: "risk", label: "נתח שוק מתכווץ", metric: "market_decline", value: decline, comparedTo: "previous_window" });
  if (s.medianDom != null && area.medianDom != null && area.medianDom > 0 && s.medianDom >= area.medianDom * 1.2)
    risks.push({ type: "risk", label: "זמן שיווק עולה", metric: "median_days_on_market", value: s.medianDom, comparedTo: "area_average" });

  return { strengths, weaknesses, opportunities, risks };
}
