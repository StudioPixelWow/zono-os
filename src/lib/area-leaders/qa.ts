// ============================================================================
// Area Leader & Market Dominance Engine™ — MAI-7 QA (PURE, deterministic).
//
// Exercises computeAreaLeaders against the scenarios in the phase spec. No DB,
// no LLM, no randomness — runnable with `npx tsx`. Asserts evidence-only
// behaviour: strong leaders detected, ties + small samples never crown an
// unstable leader, momentum tracks recent vs long-run, neighborhoods lead
// independently, and reruns are byte-identical.
// ============================================================================
import { computeAreaLeaders } from "./engine";
import type { AreaLeaderRecord } from "./types";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

export interface AreaLeaderQaCase { name: string; pass: boolean; detail: string }

const NOW = Date.parse("2026-06-27T00:00:00Z");
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
type Cls = MarketAcceptanceClassification | null;

let seq = 0;
function ar(brokerId: string, classification: Cls, opts: Partial<AreaLeaderRecord> = {}): AreaLeaderRecord {
  const state: ListingLifecycleState | null =
    classification === "ACTIVE" || classification === "LIKELY_REJECTED" ? "ACTIVE"
      : classification === "RETURNED" ? "RETURNED"
        : classification === "LIKELY_ACCEPTED" || classification === "LIKELY_MARKET_EXIT" ? "DISAPPEARED"
          : "ACTIVE";
  return {
    brokerId, provider: "yad2", externalId: `L${seq++}`, classification,
    currentState: opts.currentState ?? state, scoreConfidence: opts.scoreConfidence ?? 0.9,
    daysOnMarket: opts.daysOnMarket ?? 25, lastKnownPrice: opts.lastKnownPrice ?? 2_000_000,
    city: opts.city ?? "חולון", neighborhood: opts.neighborhood ?? null,
    propertyType: opts.propertyType ?? null, rooms: opts.rooms ?? null,
    lastScanAt: opts.lastScanAt ?? isoDaysAgo(2),
  };
}
const many = (n: number, b: string, c: Cls, o: Partial<AreaLeaderRecord> = {}) => Array.from({ length: n }, () => ar(b, c, o));

export function runAreaLeaderQa(): { cases: AreaLeaderQaCase[]; allPass: boolean } {
  const cases: AreaLeaderQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });
  const cityRow = (rs: ReturnType<typeof computeAreaLeaders>, w: number) =>
    rs.find((r) => r.neighborhood === null && r.propertyType === null && r.windowDays === w);

  // 1) Strong leader → leader detected.
  {
    seq = 0;
    const recs = [
      ...many(6, "A", "LIKELY_ACCEPTED"), ...many(2, "A", "ACTIVE"),
      ...many(1, "B", "ACTIVE"), ...many(1, "B", "LIKELY_REJECTED"),
    ];
    const r = cityRow(computeAreaLeaders(recs, NOW), 30);
    const pass = !!r && r.leaderBrokerId === "A" && (r.marketDominanceIndex ?? 0) > 40 &&
      r.runnerUpBrokerId === "B" && (r.runnerUpGap ?? 0) > 0 && r.leaderConfidence != null;
    add("Strong leader → leader detected", !!pass,
      `leader=${r?.leaderBrokerId} dom=${r?.marketDominanceIndex} runnerUp=${r?.runnerUpBrokerId} gap=${r?.runnerUpGap}`);
  }

  // 2) Tie → no unstable ranking (no leader crowned).
  {
    seq = 0;
    const recs = [
      ...many(2, "A", "LIKELY_ACCEPTED"), ...many(1, "A", "ACTIVE"),
      ...many(2, "B", "LIKELY_ACCEPTED"), ...many(1, "B", "ACTIVE"),
    ];
    const r = cityRow(computeAreaLeaders(recs, NOW), 30);
    const pass = !!r && r.leaderBrokerId === null && r.metadata.tie === true && r.sampleSize >= 5;
    add("Tie → no unstable ranking", !!pass,
      `leader=${r?.leaderBrokerId} tie=${r?.metadata?.tie} sample=${r?.sampleSize}`);
  }

  // 3) Small sample → no leader, low confidence, "מדגם קטן מדי".
  {
    seq = 0;
    const recs = [...many(2, "A", "LIKELY_ACCEPTED"), ...many(1, "B", "ACTIVE")]; // 3 < 5
    const r = cityRow(computeAreaLeaders(recs, NOW), 30);
    const hasNote = !!r && r.evidence.some((e) => e.metric === "small_sample");
    const pass = !!r && r.leaderBrokerId === null && r.sampleSize === 3 && r.confidence < 40 && hasNote;
    add("Small sample → no leader", !!pass,
      `leader=${r?.leaderBrokerId} sample=${r?.sampleSize} conf=${r?.confidence} note=${hasNote}`);
  }

  // 4) Broker disappears → leader recalculated (A leads, then A exits → B leads).
  {
    seq = 0;
    const before = [...many(5, "A", "LIKELY_ACCEPTED"), ...many(2, "A", "ACTIVE"), ...many(2, "B", "ACTIVE"), ...many(1, "B", "LIKELY_ACCEPTED")];
    const r1 = cityRow(computeAreaLeaders(before, NOW), 30);
    seq = 100;
    const after = [...many(7, "A", "LIKELY_MARKET_EXIT"), ...many(4, "B", "ACTIVE"), ...many(3, "B", "LIKELY_ACCEPTED")];
    const r2 = cityRow(computeAreaLeaders(after, NOW), 30);
    const pass = r1?.leaderBrokerId === "A" && r2?.leaderBrokerId === "B";
    add("Broker disappears → leader recalculated", !!pass,
      `before=${r1?.leaderBrokerId} after=${r2?.leaderBrokerId}`);
  }

  // 5) Momentum increase → momentum updated (leader fresh in 30d, diluted at 90d).
  {
    seq = 0;
    const recs = [
      ...many(4, "A", "LIKELY_ACCEPTED", { lastScanAt: isoDaysAgo(2) }),
      ...many(3, "A", "ACTIVE", { lastScanAt: isoDaysAgo(2) }),
      ...many(4, "C", "ACTIVE", { lastScanAt: isoDaysAgo(50) }), // only in 60/90 windows
    ];
    const rs = computeAreaLeaders(recs, NOW);
    const r30 = cityRow(rs, 30); const r90 = cityRow(rs, 90);
    const pass = r30?.leaderBrokerId === "A" && (r30?.marketMomentumIndex ?? 0) > 0 &&
      r90?.leaderBrokerId === "A" && r90?.marketMomentumIndex === 0;
    add("Momentum increase → momentum updated", !!pass,
      `mom30=${r30?.marketMomentumIndex} mom90=${r90?.marketMomentumIndex}`);
  }

  // 6) Neighborhood split → independent leaders.
  {
    seq = 0;
    const recs = [
      ...many(5, "A", "LIKELY_ACCEPTED", { neighborhood: "צפון" }), ...many(1, "B", "ACTIVE", { neighborhood: "צפון" }),
      ...many(5, "B", "LIKELY_ACCEPTED", { neighborhood: "דרום" }), ...many(1, "A", "ACTIVE", { neighborhood: "דרום" }),
    ];
    const rs = computeAreaLeaders(recs, NOW);
    const north = rs.find((r) => r.neighborhood === "צפון" && r.windowDays === 30);
    const south = rs.find((r) => r.neighborhood === "דרום" && r.windowDays === 30);
    const pass = north?.leaderBrokerId === "A" && south?.leaderBrokerId === "B";
    add("Neighborhood split → independent leaders", !!pass,
      `north=${north?.leaderBrokerId} south=${south?.leaderBrokerId}`);
  }

  // 7) No broker → ignored (unattributed records produce no segments).
  {
    seq = 0;
    const recs = [...many(6, "", "LIKELY_ACCEPTED")];
    const rs = computeAreaLeaders(recs, NOW);
    add("No broker → ignored safely", rs.length === 0, `results=${rs.length}`);
  }

  // 8) Deterministic rerun → byte-identical output.
  {
    seq = 0;
    const mk = () => { seq = 0; return [...many(6, "A", "LIKELY_ACCEPTED"), ...many(3, "B", "ACTIVE"), ...many(2, "B", "LIKELY_REJECTED")]; };
    const a = JSON.stringify(computeAreaLeaders(mk(), NOW));
    const b = JSON.stringify(computeAreaLeaders(mk(), NOW));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
