// ============================================================================
// Broker Gap Analysis & Zone Dominance Score™ — MAI-10 engine (PURE, det.).
//
// For each broker × segment × window: recomputes the segment's Winning DNA
// cohort (the observed leaders, same rule as MAI-9), measures the broker's gaps
// against that DNA + the area leader, and derives a cautious 0–100 Zone
// Dominance Score + band. EVIDENCE ONLY — never a recommendation, never advice,
// never an official-sale claim. No LLM, no randomness, no invented values:
// weak evidence yields INSUFFICIENT_DATA, never a high score.
// ============================================================================
import { priceBucket } from "@/lib/market-acceptance/aggregates";
import { LEADER_FLOOR, WEAK_DNA_FLOOR, MAX_LEADERS } from "@/lib/winning-dna/types";
import {
  GAP_WINDOWS, GAP_SMALL_SAMPLE, GAP_MIN_CONFIDENCE,
  type GapRecord, type GapResult, type GapItem, type StrengthItem, type GapEvidence,
  type ZoneDominanceLevel, type GapSeverity,
} from "./types";

const DAY_MS = 86_400_000;
const LONGEST = Math.max(...GAP_WINDOWS);
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

function segmentDimsFor(r: GapRecord): { key: string; dims: Dims }[] {
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
  neighborhoods: Set<string>; propertyTypes: Set<string>;
}
const newAcc = (): Acc => ({ active: 0, success: 0, exit: 0, rejected: 0, returned: 0, total: 0, dom: [], resolvedDom: [], reductions: [], confSum: 0, confN: 0, neighborhoods: new Set(), propertyTypes: new Set() });

function accumulate(a: Acc, r: GapRecord): void {
  a.total++; a.confN++; a.confSum += clamp(r.scoreConfidence, 0, 1);
  if (typeof r.daysOnMarket === "number" && Number.isFinite(r.daysOnMarket)) a.dom.push(r.daysOnMarket);
  if (typeof r.reductionPct === "number" && Number.isFinite(r.reductionPct) && r.reductionPct > 0) a.reductions.push(r.reductionPct);
  if (r.neighborhood) a.neighborhoods.add(r.neighborhood);
  if (r.propertyType) a.propertyTypes.add(r.propertyType);
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

interface Stat {
  brokerId: string; total: number; eligible: number;
  activeShare: number; activityShare: number; successRate: number | null; rejectionRate: number | null;
  medianDom: number | null; avgReduction: number | null; performance: number | null; dominance: number;
  exitSpeed: number; avgScoreConf: number; neighborhoods: number; propertyTypes: number;
}
function performanceOf(successRate: number | null, rejectionRate: number | null, medDom: number | null): number | null {
  if (successRate == null) return null;
  let idx = 50 + 45 * successRate - 25 * (rejectionRate ?? 0);
  if (medDom != null) idx += clamp(((60 - medDom) / 60) * 10, -10, 10);
  return clamp(idx, 0, 100);
}
function statOf(id: string, a: Acc, area: { active: number; success: number; activity: number; medianDom: number | null }): Stat {
  const movements = a.success + a.exit + a.rejected + a.returned;
  const eligible = a.success + a.exit + a.rejected;
  const activeShare = area.active > 0 ? a.active / area.active : 0;
  const activityShare = area.activity > 0 ? movements / area.activity : 0;
  const domSet = a.resolvedDom.length ? a.resolvedDom : a.dom;
  const medDom = median(domSet);
  const successRate = eligible > 0 ? a.success / eligible : null;
  const rejectionRate = eligible > 0 ? a.rejected / eligible : null;
  const performance = performanceOf(successRate, rejectionRate, medDom);
  const perfFactor = performance != null ? performance / 100 : 0.5;
  const successShare = area.success > 0 ? a.success / area.success : 0;
  const dominance = round(100 * (0.35 * activeShare + 0.30 * successShare + 0.20 * activityShare + 0.15 * perfFactor), 2);
  let exitSpeed = 50;
  if (medDom != null && area.medianDom != null && area.medianDom > 0) exitSpeed = clamp(50 + ((area.medianDom - medDom) / area.medianDom) * 50, 0, 100);
  return {
    brokerId: id, total: a.total, eligible,
    activeShare: round(activeShare, 4), activityShare: round(activityShare, 4),
    successRate: successRate == null ? null : round(successRate, 4),
    rejectionRate: rejectionRate == null ? null : round(rejectionRate, 4),
    medianDom: medDom == null ? null : round(medDom, 1),
    avgReduction: mean(a.reductions) == null ? null : round(mean(a.reductions)!, 4),
    performance: performance == null ? null : round(performance, 1), dominance,
    exitSpeed: round(exitSpeed, 1), avgScoreConf: a.confN ? a.confSum / a.confN : 0,
    neighborhoods: a.neighborhoods.size, propertyTypes: a.propertyTypes.size,
  };
}

interface Dna {
  present: boolean; weak: boolean; leaderCount: number; confidence: number;
  medianDom: number | null; medianReduction: number | null; successRate: number | null;
  dominance: number | null; marketShare: number | null; performance: number | null;
  listingsPerLeader: number | null; momentum: number; neighborhoods: number; propertyTypes: number;
}

function severityFrom(norm: number): GapSeverity { return norm >= 0.66 ? "HIGH" : norm >= 0.33 ? "MEDIUM" : "LOW"; }

const DISCLAIMER = "המדדים מבוססים על התנהגות שוק נצפית בלבד ואינם אישור מכירה רשמי.";

/** Compute gap analysis for every (broker × segment × window). Pure + det. */
export function computeBrokerGapAnalysis(records: GapRecord[], nowMs: number): GapResult[] {
  // 1) Bucket into (segment, window).
  const buckets = new Map<string, { dims: Dims; window: number; brokers: Map<string, Acc> }>();
  for (const r of records) {
    if (!r.brokerId) continue;
    const lastScanMs = r.lastScanAt ? new Date(r.lastScanAt).getTime() : NaN;
    const segs = segmentDimsFor(r);
    if (!segs.length) continue;
    for (const w of GAP_WINDOWS) {
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

  // 2) Per-bucket area + per-broker stats + Winning DNA cohort.
  interface Computed { dims: Dims; window: number; sampleSize: number; stats: Map<string, Stat>; order: string[]; dna: Dna; areaActive: number; dnaConf: number }
  const computed = new Map<string, Computed>();
  for (const [bk, b] of buckets) {
    let active = 0, success = 0, activity = 0, sampleSize = 0; const areaDom: number[] = [];
    for (const acc of b.brokers.values()) {
      active += acc.active; success += acc.success;
      activity += acc.success + acc.exit + acc.rejected + acc.returned;
      sampleSize += acc.total; areaDom.push(...(acc.resolvedDom.length ? acc.resolvedDom : acc.dom));
    }
    const area = { active, success, activity, medianDom: median(areaDom) };
    const stats = new Map<string, Stat>();
    for (const [id, acc] of b.brokers) stats.set(id, statOf(id, acc, area));
    const order = [...stats.values()].sort((x, y) => y.dominance - x.dominance || x.brokerId.localeCompare(y.brokerId)).map((s) => s.brokerId);

    // Winning DNA cohort (mirror MAI-9 leader selection).
    const topDom = stats.get(order[0] ?? "")?.dominance ?? 0;
    let leaderIds = order.filter((id) => (stats.get(id)?.dominance ?? 0) >= LEADER_FLOOR).slice(0, MAX_LEADERS);
    let weak = false;
    if (!leaderIds.length && topDom >= WEAK_DNA_FLOOR) { leaderIds = order.slice(0, 1); weak = true; }

    let dna: Dna;
    if (!leaderIds.length) {
      dna = { present: false, weak: false, leaderCount: 0, confidence: 0, medianDom: null, medianReduction: null, successRate: null, dominance: null, marketShare: null, performance: null, listingsPerLeader: null, momentum: 0, neighborhoods: 0, propertyTypes: 0 };
    } else {
      const dom: number[] = []; const reductions: number[] = []; const nb = new Set<string>(); const pt = new Set<string>();
      let lActive = 0, lSuccess = 0, lRejected = 0, lEligible = 0, lTotal = 0, confSum = 0, confN = 0;
      for (const id of leaderIds) {
        const acc = b.brokers.get(id)!;
        dom.push(...(acc.resolvedDom.length ? acc.resolvedDom : acc.dom)); reductions.push(...acc.reductions);
        lActive += acc.active; lSuccess += acc.success; lRejected += acc.rejected;
        lEligible += acc.success + acc.exit + acc.rejected; lTotal += acc.total; confSum += acc.confSum; confN += acc.confN;
        for (const x of acc.neighborhoods) nb.add(x); for (const x of acc.propertyTypes) pt.add(x);
      }
      const dnaSuccess = lEligible > 0 ? lSuccess / lEligible : null;
      const dnaRej = lEligible > 0 ? lRejected / lEligible : null;
      const dnaMedDom = median(dom);
      dna = {
        present: true, weak, leaderCount: leaderIds.length,
        confidence: confN ? confSum / confN : 0,
        medianDom: dnaMedDom, medianReduction: median(reductions),
        successRate: dnaSuccess, dominance: mean(leaderIds.map((id) => stats.get(id)!.dominance)),
        marketShare: active > 0 ? lActive / active : null, performance: performanceOf(dnaSuccess, dnaRej, dnaMedDom),
        listingsPerLeader: leaderIds.length ? lTotal / leaderIds.length : null,
        momentum: 0, neighborhoods: nb.size, propertyTypes: pt.size,
      };
    }
    computed.set(bk, { dims: b.dims, window: b.window, sampleSize, stats, order, dna, areaActive: active, dnaConf: dna.confidence });
  }

  const domIn = (segKey: string, window: number, brokerId: string): number | null =>
    computed.get(`${segKey}#${window}`)?.stats.get(brokerId)?.dominance ?? null;

  // 3) Build gap results per broker.
  const results: GapResult[] = [];
  for (const [bk, c] of computed) {
    const segKey = bk.slice(0, bk.lastIndexOf("#"));
    if (c.stats.size < 2 && c.sampleSize < GAP_SMALL_SAMPLE) continue; // not meaningful

    const leaderId = c.order[0] ?? null;
    const leaderDom = leaderId ? c.stats.get(leaderId)!.dominance : 0;
    const dnaMomentum = c.dna.present
      ? (mean(c.order.filter((id) => (c.stats.get(id)?.dominance ?? 0) >= LEADER_FLOOR).slice(0, MAX_LEADERS)
          .map((id) => (c.stats.get(id)!.dominance) - (domIn(segKey, LONGEST, id) ?? c.stats.get(id)!.dominance))) ?? 0)
      : 0;

    for (const [id, s] of c.stats) {
      const small = c.sampleSize < GAP_SMALL_SAMPLE;
      const brokerMomentum = round(s.dominance - (domIn(segKey, LONGEST, id) ?? s.dominance), 1);
      const leaderGap = round(leaderDom - s.dominance, 2);

      // Confidence.
      const confidence = round(clamp(
        Math.min(50, c.sampleSize * 4) + Math.min(20, s.total * 4) + s.avgScoreConf * 15 + (c.dna.present ? 10 : 0), 0, 99,
      ), 1);

      // No DNA → cannot benchmark → INSUFFICIENT_DATA (safe).
      if (!c.dna.present) {
        results.push(emptyResult(id, c.dims, c.window, leaderGap, confidence, c.sampleSize, "אין דפוס מנצח בפלח זה — לא ניתן לחשב פערים"));
        continue;
      }

      // ── Gaps vs Winning DNA / leader ────────────────────────────────────────
      const successRateGap = c.dna.successRate != null && s.successRate != null ? round(c.dna.successRate - s.successRate, 4) : null;
      const exitSpeedGapDays = c.dna.medianDom != null && s.medianDom != null ? round(s.medianDom - c.dna.medianDom, 1) : null;
      const marketShareGap = c.dna.marketShare != null ? round((c.stats.get(leaderId!)?.activeShare ?? c.dna.marketShare) - s.activeShare, 4) : null;
      const activityGap = c.dna.listingsPerLeader != null ? round(c.dna.listingsPerLeader - s.total, 1) : null;
      const performanceGap = c.dna.performance != null && s.performance != null ? round(c.dna.performance - s.performance, 1) : null;
      const momentumGap = round(dnaMomentum - brokerMomentum, 1);
      const coverageGap = round(Math.max(0, c.dna.neighborhoods - s.neighborhoods) + Math.max(0, c.dna.propertyTypes - s.propertyTypes), 1);
      const priceReductionGap = c.dna.medianReduction != null && s.avgReduction != null ? round(s.avgReduction - c.dna.medianReduction, 4) : null;

      // Winning DNA match score (0..100): reward being at/above the DNA.
      const matchParts: number[] = [];
      if (c.dna.successRate != null && s.successRate != null) matchParts.push(1 - clamp(Math.max(0, c.dna.successRate - s.successRate) / 0.5, 0, 1));
      if (c.dna.medianDom != null && s.medianDom != null && c.dna.medianDom > 0) matchParts.push(1 - clamp(Math.max(0, s.medianDom - c.dna.medianDom) / c.dna.medianDom, 0, 1));
      if (c.dna.performance != null && s.performance != null) matchParts.push(1 - clamp(Math.max(0, c.dna.performance - s.performance) / 50, 0, 1));
      if (c.dna.medianReduction != null && s.avgReduction != null) matchParts.push(1 - clamp(Math.max(0, s.avgReduction - c.dna.medianReduction) / 0.1, 0, 1));
      const winningDnaMatchScore = matchParts.length ? round((mean(matchParts) ?? 0) * 100, 1) : null;

      // ── Zone Dominance Score (cautious, weighted) ───────────────────────────
      const cMarketShare = clamp(s.activeShare * 200, 0, 100);
      const cSuccess = s.successRate != null ? s.successRate * 100 : 0;
      const cExit = s.exitSpeed;
      const cActivity = clamp(s.activityShare * 200, 0, 100);
      const cMatch = winningDnaMatchScore ?? 0;
      const cMomentum = clamp(50 + brokerMomentum / 2, 0, 100);
      const cConfidence = confidence;
      const rawScore = round(
        0.20 * cMarketShare + 0.20 * cSuccess + 0.15 * cExit + 0.15 * cActivity +
        0.15 * cMatch + 0.10 * cMomentum + 0.05 * cConfidence, 1,
      );

      const insufficient = small || confidence < GAP_MIN_CONFIDENCE;
      const zoneDominanceScore = insufficient ? null : rawScore;
      const zoneDominanceLevel: ZoneDominanceLevel = insufficient ? "INSUFFICIENT_DATA" : levelOf(rawScore);

      // ── Strengths (positive differences only) ───────────────────────────────
      const strengths: StrengthItem[] = [];
      if (exitSpeedGapDays != null && exitSpeedGapDays < 0)
        strengths.push({ type: "EXIT_SPEED", label: "יציאות שוק מהירות יותר מהדפוס המנצח", brokerValue: s.medianDom, benchmarkValue: c.dna.medianDom, advantage: round(-exitSpeedGapDays, 1) });
      if (successRateGap != null && successRateGap < 0)
        strengths.push({ type: "SUCCESS_RATE", label: "שיעור הצלחה גבוה מהדפוס המנצח", brokerValue: s.successRate, benchmarkValue: c.dna.successRate, advantage: round(-successRateGap, 4) });
      if (performanceGap != null && performanceGap < 0)
        strengths.push({ type: "PERFORMANCE", label: "ביצועים גבוהים מהדפוס המנצח", brokerValue: s.performance, benchmarkValue: c.dna.performance, advantage: round(-performanceGap, 1) });
      if (priceReductionGap != null && priceReductionGap < 0)
        strengths.push({ type: "PRICE_REDUCTION", label: "הורדות מחיר נמוכות מהדפוס המנצח", brokerValue: s.avgReduction, benchmarkValue: c.dna.medianReduction, advantage: round(-priceReductionGap, 4) });
      if (brokerMomentum >= 10)
        strengths.push({ type: "MOMENTUM", label: "מומנטום חיובי", brokerValue: brokerMomentum, benchmarkValue: 0, advantage: brokerMomentum });

      // ── Gaps (measurable weaknesses only) ───────────────────────────────────
      const gaps: GapItem[] = [];
      const conf01 = clamp(confidence / 100, 0, 0.99);
      if (exitSpeedGapDays != null && exitSpeedGapDays > 0 && c.dna.medianDom)
        gaps.push({ type: "EXIT_SPEED", label: `זמן השיווק החציוני איטי ב-${Math.round(exitSpeedGapDays)} ימים מהדפוס המנצח`, brokerValue: s.medianDom, benchmarkValue: c.dna.medianDom, gapValue: exitSpeedGapDays, severity: severityFrom(clamp(exitSpeedGapDays / Math.max(1, c.dna.medianDom), 0, 1)), confidence: conf01 });
      if (successRateGap != null && successRateGap > 0)
        gaps.push({ type: "SUCCESS_RATE", label: `שיעור ההצלחה נמוך ב-${Math.round(successRateGap * 100)} נקודות אחוז מהדפוס המנצח`, brokerValue: s.successRate, benchmarkValue: c.dna.successRate, gapValue: successRateGap, severity: severityFrom(clamp(successRateGap / 0.3, 0, 1)), confidence: conf01 });
      if (marketShareGap != null && marketShareGap > 0)
        gaps.push({ type: "MARKET_SHARE", label: `נתח השוק נמוך ב-${Math.round(marketShareGap * 100)}% מהמובילה`, brokerValue: s.activeShare, benchmarkValue: c.stats.get(leaderId!)?.activeShare ?? null, gapValue: marketShareGap, severity: severityFrom(clamp(marketShareGap / 0.4, 0, 1)), confidence: conf01 });
      if (activityGap != null && activityGap > 0)
        gaps.push({ type: "ACTIVITY", label: `נפח פעילות נמוך מהדפוס המנצח`, brokerValue: s.total, benchmarkValue: c.dna.listingsPerLeader, gapValue: activityGap, severity: severityFrom(clamp(activityGap / Math.max(1, c.dna.listingsPerLeader ?? 1), 0, 1)), confidence: conf01 });
      if (performanceGap != null && performanceGap > 0)
        gaps.push({ type: "PERFORMANCE", label: `מדד הביצועים נמוך ב-${Math.round(performanceGap)} נקודות מהדפוס המנצח`, brokerValue: s.performance, benchmarkValue: c.dna.performance, gapValue: performanceGap, severity: severityFrom(clamp(performanceGap / 40, 0, 1)), confidence: conf01 });
      if (momentumGap > 5)
        gaps.push({ type: "MOMENTUM", label: `מומנטום נמוך מהמובילים באזור`, brokerValue: brokerMomentum, benchmarkValue: round(dnaMomentum, 1), gapValue: round(momentumGap, 1), severity: severityFrom(clamp(momentumGap / 30, 0, 1)), confidence: conf01 });
      if (coverageGap > 0)
        gaps.push({ type: "COVERAGE", label: `כיסוי חלקי של שכונות/קטגוריות מנצחות`, brokerValue: s.neighborhoods + s.propertyTypes, benchmarkValue: c.dna.neighborhoods + c.dna.propertyTypes, gapValue: coverageGap, severity: severityFrom(clamp(coverageGap / 5, 0, 1)), confidence: conf01 });
      if (priceReductionGap != null && priceReductionGap > 0)
        gaps.push({ type: "PRICE_REDUCTION", label: `הורדות מחיר גבוהות ב-${Math.round(priceReductionGap * 100)}% מהדפוס המנצח`, brokerValue: s.avgReduction, benchmarkValue: c.dna.medianReduction, gapValue: priceReductionGap, severity: severityFrom(clamp(priceReductionGap / 0.1, 0, 1)), confidence: conf01 });

      // ── Evidence (Hebrew, grounded) ─────────────────────────────────────────
      const evidence: GapEvidence[] = [];
      if (exitSpeedGapDays != null && c.dna.medianDom != null && s.medianDom != null)
        evidence.push({ label: `זמן השיווק החציוני של המתווך הוא ${Math.round(s.medianDom)} ימים לעומת ${Math.round(c.dna.medianDom)} ימים בדפוס המנצח`, metric: "exit_speed_gap_days", brokerValue: s.medianDom, benchmarkValue: c.dna.medianDom, gapValue: exitSpeedGapDays });
      if (successRateGap != null && c.dna.successRate != null && s.successRate != null)
        evidence.push({ label: `שיעור ההצלחה המשוער ${successRateGap > 0 ? "נמוך" : "גבוה"} ב-${Math.abs(Math.round(successRateGap * 100))} נקודות אחוז מדפוס ההצלחה באזור`, metric: "success_rate_gap", brokerValue: s.successRate, benchmarkValue: c.dna.successRate, gapValue: successRateGap });
      evidence.push({ label: `ציון שליטה באזור: ${zoneDominanceScore == null ? "לא זמין (נתונים לא מספיקים)" : Math.round(zoneDominanceScore)}`, metric: "zone_dominance_score", brokerValue: zoneDominanceScore });
      evidence.push({ label: DISCLAIMER, metric: "disclaimer" });

      results.push({
        brokerId: id, city: c.dims.city, neighborhood: c.dims.neighborhood, propertyType: c.dims.propertyType,
        rooms: c.dims.rooms, priceBucket: c.dims.priceBucket, windowDays: c.window,
        zoneDominanceScore, zoneDominanceLevel,
        leaderGap, winningDnaMatchScore,
        successRateGap, exitSpeedGapDays, marketShareGap, activityGap, performanceGap, momentumGap, coverageGap, priceReductionGap,
        strengths, gaps, evidence,
        metadata: { dnaWeak: c.dna.weak, dnaLeaderCount: c.dna.leaderCount, leaderBrokerId: leaderId, brokerMomentum, rawScore, insufficient },
        confidence,
      });
    }
  }

  results.sort((a, b) =>
    a.brokerId.localeCompare(b.brokerId) ||
    (a.city ?? "").localeCompare(b.city ?? "") || (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "") ||
    (a.propertyType ?? "").localeCompare(b.propertyType ?? "") || (a.rooms ?? 0) - (b.rooms ?? 0) ||
    (a.priceBucket ?? "").localeCompare(b.priceBucket ?? "") || a.windowDays - b.windowDays,
  );
  return results;
}

function levelOf(score: number): ZoneDominanceLevel {
  if (score <= 30) return "LOW";
  if (score <= 50) return "EMERGING";
  if (score <= 70) return "COMPETITIVE";
  if (score <= 85) return "STRONG";
  return "LEADER_LIKE";
}

function emptyResult(brokerId: string, dims: Dims, window: number, leaderGap: number, confidence: number, sampleSize: number, note: string): GapResult {
  return {
    brokerId, city: dims.city, neighborhood: dims.neighborhood, propertyType: dims.propertyType,
    rooms: dims.rooms, priceBucket: dims.priceBucket, windowDays: window,
    zoneDominanceScore: null, zoneDominanceLevel: "INSUFFICIENT_DATA",
    leaderGap, winningDnaMatchScore: null,
    successRateGap: null, exitSpeedGapDays: null, marketShareGap: null, activityGap: null,
    performanceGap: null, momentumGap: null, coverageGap: null, priceReductionGap: null,
    strengths: [], gaps: [],
    evidence: [{ label: note, metric: "insufficient" }, { label: DISCLAIMER, metric: "disclaimer" }],
    metadata: { insufficient: true, reason: "no_winning_dna", sampleSize },
    confidence: Math.min(confidence, 29),
  };
}
