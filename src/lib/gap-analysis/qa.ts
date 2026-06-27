// ============================================================================
// Broker Gap Analysis™ — MAI-10 QA (PURE, deterministic).
//
// Exercises computeBrokerGapAnalysis against the phase spec scenarios. No DB,
// no LLM, no randomness — runnable with `npx tsx`. Asserts evidence-only
// behaviour: high score + small gaps near the Winning DNA, lower score + gaps
// far from it, strengths (not gaps) when faster, INSUFFICIENT_DATA on small
// samples and missing DNA, leader-like score for the leader, and stable reruns.
// ============================================================================
import { computeBrokerGapAnalysis } from "./engine";
import type { GapRecord, GapResult } from "./types";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

export interface GapQaCase { name: string; pass: boolean; detail: string }

const NOW = Date.parse("2026-06-27T00:00:00Z");
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
type Cls = MarketAcceptanceClassification | null;

let seq = 0;
function gr(brokerId: string, classification: Cls, opts: Partial<GapRecord> = {}): GapRecord {
  const state: ListingLifecycleState | null =
    classification === "ACTIVE" || classification === "LIKELY_REJECTED" ? "ACTIVE"
      : classification === "RETURNED" ? "RETURNED"
        : classification === "LIKELY_ACCEPTED" || classification === "LIKELY_MARKET_EXIT" ? "DISAPPEARED" : "ACTIVE";
  return {
    brokerId, provider: "yad2", externalId: `L${seq++}`, classification,
    currentState: opts.currentState ?? state, scoreConfidence: opts.scoreConfidence ?? 0.9,
    daysOnMarket: opts.daysOnMarket ?? 20, lastKnownPrice: opts.lastKnownPrice ?? 2_200_000,
    reductionPct: opts.reductionPct ?? null,
    city: opts.city ?? "חולון", neighborhood: opts.neighborhood ?? null,
    propertyType: opts.propertyType ?? null, rooms: opts.rooms ?? null,
    lastScanAt: opts.lastScanAt ?? isoDaysAgo(2),
  };
}
const many = (n: number, b: string, c: Cls, o: Partial<GapRecord> = {}) => Array.from({ length: n }, () => gr(b, c, o));
const find = (ps: GapResult[], broker: string, w = 30) =>
  ps.find((p) => p.brokerId === broker && p.neighborhood === null && p.propertyType === null && p.windowDays === w);

export function runGapAnalysisQa(): { cases: GapQaCase[]; allPass: boolean } {
  const cases: GapQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) Broker close to Winning DNA → high score, small gaps (a co-leader matching the DNA).
  {
    seq = 0;
    const recs = [
      ...many(4, "A", "LIKELY_ACCEPTED", { daysOnMarket: 18 }), ...many(2, "A", "ACTIVE"),
      ...many(4, "B", "LIKELY_ACCEPTED", { daysOnMarket: 18 }), ...many(2, "B", "ACTIVE"),
      ...many(1, "C", "ACTIVE"),
    ];
    const a = find(computeBrokerGapAnalysis(recs, NOW), "A");
    const pass = !!a && a.zoneDominanceScore != null && a.zoneDominanceScore >= 65 &&
      a.gaps.length <= 1 && (a.winningDnaMatchScore ?? 0) >= 80;
    add("Broker close to Winning DNA → high score, small gaps", !!pass,
      `score=${a?.zoneDominanceScore} level=${a?.zoneDominanceLevel} gaps=${a?.gaps.length} match=${a?.winningDnaMatchScore}`);
  }

  // 2) Broker far from Winning DNA → lower score, multiple gaps.
  {
    seq = 0;
    const recs = [
      ...many(5, "A", "LIKELY_ACCEPTED", { daysOnMarket: 15 }), ...many(4, "A", "ACTIVE"),
      ...many(1, "T", "LIKELY_ACCEPTED", { daysOnMarket: 70 }), ...many(3, "T", "LIKELY_REJECTED", { daysOnMarket: 80 }),
    ];
    const t = find(computeBrokerGapAnalysis(recs, NOW), "T");
    const pass = !!t && t.gaps.length >= 2 && (t.zoneDominanceScore ?? 100) < 60;
    add("Broker far from Winning DNA → lower score, multiple gaps", !!pass,
      `score=${t?.zoneDominanceScore} gaps=${t?.gaps.length}`);
  }

  // 3) Broker faster than Winning DNA → strength, not a gap.
  {
    seq = 0;
    const recs = [
      ...many(5, "A", "LIKELY_ACCEPTED", { daysOnMarket: 30 }), ...many(4, "A", "ACTIVE"),
      ...many(2, "F", "LIKELY_ACCEPTED", { daysOnMarket: 12 }), ...many(1, "F", "ACTIVE"),
    ];
    const f = find(computeBrokerGapAnalysis(recs, NOW), "F");
    const hasExitStrength = !!f && f.strengths.some((s) => s.type === "EXIT_SPEED");
    const hasExitGap = !!f && f.gaps.some((g) => g.type === "EXIT_SPEED");
    add("Broker faster than Winning DNA → strength not gap", hasExitStrength && !hasExitGap,
      `exitGapDays=${f?.exitSpeedGapDays} strength=${hasExitStrength} gap=${hasExitGap}`);
  }

  // 4) Small sample → INSUFFICIENT_DATA, low confidence.
  {
    seq = 0;
    const recs = [...many(2, "A", "LIKELY_ACCEPTED"), ...many(1, "B", "ACTIVE")]; // 3 < 5
    const a = find(computeBrokerGapAnalysis(recs, NOW), "A");
    const pass = !!a && a.zoneDominanceLevel === "INSUFFICIENT_DATA" && a.zoneDominanceScore === null;
    add("Small sample → INSUFFICIENT_DATA", !!pass,
      `level=${a?.zoneDominanceLevel} score=${a?.zoneDominanceScore} conf=${a?.confidence}`);
  }

  // 5) No Winning DNA → no score, safe insufficient.
  {
    seq = 0;
    const recs = [...many(2, "A", "ACTIVE"), ...many(2, "B", "ACTIVE"), ...many(2, "C", "ACTIVE"), ...many(2, "D", "ACTIVE")];
    const a = find(computeBrokerGapAnalysis(recs, NOW), "A");
    const pass = !!a && a.zoneDominanceScore === null && a.zoneDominanceLevel === "INSUFFICIENT_DATA" &&
      a.metadata.reason === "no_winning_dna";
    add("No Winning DNA → no score, safe insufficient", !!pass,
      `score=${a?.zoneDominanceScore} level=${a?.zoneDominanceLevel} reason=${a?.metadata?.reason}`);
  }

  // 6) Leader broker → leader-like score, minimal leader gap.
  {
    seq = 0;
    const recs = [
      ...many(6, "A", "LIKELY_ACCEPTED", { daysOnMarket: 16 }), ...many(5, "A", "ACTIVE"),
      ...many(1, "B", "ACTIVE"),
    ];
    const a = find(computeBrokerGapAnalysis(recs, NOW), "A");
    const pass = !!a && a.leaderGap === 0 && (a.zoneDominanceScore ?? 0) >= 70 &&
      (a.zoneDominanceLevel === "STRONG" || a.zoneDominanceLevel === "LEADER_LIKE");
    add("Leader broker → leader-like score, minimal leader gap", !!pass,
      `leaderGap=${a?.leaderGap} score=${a?.zoneDominanceScore} level=${a?.zoneDominanceLevel}`);
  }

  // 7) Mixed segment → moderate score and explainable gaps.
  {
    seq = 0;
    const recs = [
      ...many(6, "A", "LIKELY_ACCEPTED", { daysOnMarket: 15 }), ...many(4, "A", "ACTIVE"),
      ...many(3, "M", "LIKELY_ACCEPTED", { daysOnMarket: 40 }), ...many(2, "M", "ACTIVE"), ...many(1, "M", "LIKELY_REJECTED"),
    ];
    const m = find(computeBrokerGapAnalysis(recs, NOW), "M");
    const pass = !!m && m.zoneDominanceScore != null && m.gaps.length >= 1 &&
      ["EMERGING", "COMPETITIVE", "STRONG"].includes(m.zoneDominanceLevel);
    add("Mixed segment → moderate score + explainable gaps", !!pass,
      `score=${m?.zoneDominanceScore} level=${m?.zoneDominanceLevel} gaps=${m?.gaps.length}`);
  }

  // 8) Deterministic rerun → byte-identical output.
  {
    const mk = () => { seq = 0; return [...many(5, "A", "LIKELY_ACCEPTED"), ...many(3, "A", "ACTIVE"), ...many(2, "B", "LIKELY_REJECTED"), ...many(2, "B", "ACTIVE")]; };
    const a = JSON.stringify(computeBrokerGapAnalysis(mk(), NOW));
    const b = JSON.stringify(computeBrokerGapAnalysis(mk(), NOW));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
