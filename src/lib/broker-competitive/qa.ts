// ============================================================================
// Broker Competitive Intelligence™ — MAI-8 QA (PURE, deterministic).
//
// Exercises computeBrokerCompetitive against the phase spec scenarios. No DB,
// no LLM, no randomness — runnable with `npx tsx`. Asserts evidence-only
// behaviour: correct leader gap, growth/decline detection, low confidence on
// small samples, neutral sole profiles, correct strongest-segment discovery,
// safe handling of unattributed records, and byte-identical reruns.
// ============================================================================
import { computeBrokerCompetitive } from "./engine";
import type { CompetitiveRecord, CompetitiveProfile } from "./types";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

export interface CompetitiveQaCase { name: string; pass: boolean; detail: string }

const NOW = Date.parse("2026-06-27T00:00:00Z");
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
type Cls = MarketAcceptanceClassification | null;

let seq = 0;
function cr(brokerId: string, classification: Cls, opts: Partial<CompetitiveRecord> = {}): CompetitiveRecord {
  const state: ListingLifecycleState | null =
    classification === "ACTIVE" || classification === "LIKELY_REJECTED" ? "ACTIVE"
      : classification === "RETURNED" ? "RETURNED"
        : classification === "LIKELY_ACCEPTED" || classification === "LIKELY_MARKET_EXIT" ? "DISAPPEARED" : "ACTIVE";
  return {
    brokerId, provider: "yad2", externalId: `L${seq++}`, classification,
    currentState: opts.currentState ?? state, scoreConfidence: opts.scoreConfidence ?? 0.9,
    daysOnMarket: opts.daysOnMarket ?? 25, lastKnownPrice: opts.lastKnownPrice ?? 2_000_000,
    reductionPct: opts.reductionPct ?? null,
    city: opts.city ?? "חולון", neighborhood: opts.neighborhood ?? null,
    propertyType: opts.propertyType ?? null, rooms: opts.rooms ?? null,
    lastScanAt: opts.lastScanAt ?? isoDaysAgo(2),
  };
}
const many = (n: number, b: string, c: Cls, o: Partial<CompetitiveRecord> = {}) => Array.from({ length: n }, () => cr(b, c, o));
const find = (ps: CompetitiveProfile[], broker: string, neighborhood: string | null, window: number) =>
  ps.find((p) => p.brokerId === broker && p.neighborhood === neighborhood && p.propertyType === null && p.windowDays === window);

export function runCompetitiveQa(): { cases: CompetitiveQaCase[]; allPass: boolean } {
  const cases: CompetitiveQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) Area leader → leader gap correct.
  {
    seq = 0;
    const recs = [...many(6, "A", "LIKELY_ACCEPTED"), ...many(2, "B", "ACTIVE")];
    const ps = computeBrokerCompetitive(recs, NOW);
    const a = find(ps, "A", null, 30); const b = find(ps, "B", null, 30);
    const pass = a?.marketPosition === "LEADER" && a?.leaderGap === 0 &&
      b?.marketPosition === "RUNNER_UP" && (b?.leaderGap ?? 0) > 0;
    add("Area leader → leader gap correct", !!pass,
      `A=${a?.marketPosition}/${a?.leaderGap} B=${b?.marketPosition}/${b?.leaderGap}`);
  }

  // 2) Growing broker → growth detected.
  {
    seq = 0;
    const recs = [
      ...many(6, "G", "ACTIVE", { lastScanAt: isoDaysAgo(2) }), ...many(2, "H", "ACTIVE", { lastScanAt: isoDaysAgo(2) }),
      ...many(8, "K", "ACTIVE", { lastScanAt: isoDaysAgo(50) }), // only in 60/90 windows
    ];
    const ps = computeBrokerCompetitive(recs, NOW);
    const g30 = find(ps, "G", null, 30); const g90 = find(ps, "G", null, 90);
    const pass = (g30?.marketGrowth ?? 0) > 0 && g90?.marketGrowth === 0;
    add("Growing broker → growth detected", !!pass,
      `growth30=${g30?.marketGrowth} growth90=${g90?.marketGrowth}`);
  }

  // 3) Declining broker → decline detected.
  {
    seq = 0;
    const recs = [
      ...many(1, "D", "ACTIVE", { lastScanAt: isoDaysAgo(2) }), ...many(8, "D", "ACTIVE", { lastScanAt: isoDaysAgo(50) }),
      ...many(6, "E", "ACTIVE", { lastScanAt: isoDaysAgo(2) }),
    ];
    const ps = computeBrokerCompetitive(recs, NOW);
    const d30 = find(ps, "D", null, 30);
    const pass = (d30?.marketDecline ?? 0) > 0 && d30?.marketGrowth === 0;
    add("Declining broker → decline detected", !!pass,
      `decline30=${d30?.marketDecline} growth30=${d30?.marketGrowth}`);
  }

  // 4) Small sample → low confidence + INSUFFICIENT.
  {
    seq = 0;
    const recs = [...many(2, "A", "LIKELY_ACCEPTED"), ...many(1, "B", "ACTIVE")]; // 3 < 5
    const ps = computeBrokerCompetitive(recs, NOW);
    const a = find(ps, "A", null, 30);
    const pass = a?.marketPosition === "INSUFFICIENT" && (a?.confidence ?? 99) < 40 &&
      a?.competitiveStrengths.length === 0;
    add("Small sample → low confidence", !!pass,
      `pos=${a?.marketPosition} conf=${a?.confidence}`);
  }

  // 5) No competitors → neutral profile.
  {
    seq = 0;
    const recs = many(6, "A", "LIKELY_ACCEPTED");
    const ps = computeBrokerCompetitive(recs, NOW);
    const a = find(ps, "A", null, 30);
    const pass = a?.marketPosition === "SOLE" && a?.competitiveStrengths.length === 0 &&
      a?.competitiveRisks.length === 0 && a?.competitiveOpportunities.length === 0;
    add("No competitors → neutral profile", !!pass,
      `pos=${a?.marketPosition} strengths=${a?.competitiveStrengths.length} risks=${a?.competitiveRisks.length}`);
  }

  // 6) Mixed portfolio → correct strongest segment (best neighborhood).
  {
    seq = 0;
    const recs = [
      ...many(5, "B", "LIKELY_ACCEPTED", { neighborhood: "צפון" }), ...many(1, "X", "ACTIVE", { neighborhood: "צפון" }),
      ...many(1, "B", "ACTIVE", { neighborhood: "דרום" }), ...many(5, "X", "LIKELY_ACCEPTED", { neighborhood: "דרום" }),
    ];
    const ps = computeBrokerCompetitive(recs, NOW);
    const bNorth = find(ps, "B", "צפון", 30);
    const pass = bNorth?.bestNeighborhood === "צפון" && (bNorth?.strongestSegment ?? "").includes("צפון");
    add("Mixed portfolio → correct strongest segment", !!pass,
      `bestNeighborhood=${bNorth?.bestNeighborhood} strongest=${bNorth?.strongestSegment}`);
  }

  // 7) No broker → ignored safely.
  {
    seq = 0;
    const ps = computeBrokerCompetitive(many(6, "", "LIKELY_ACCEPTED"), NOW);
    add("No broker → ignored safely", ps.length === 0, `results=${ps.length}`);
  }

  // 8) Deterministic rerun → byte-identical output.
  {
    const mk = () => { seq = 0; return [...many(6, "A", "LIKELY_ACCEPTED"), ...many(3, "B", "ACTIVE"), ...many(2, "B", "LIKELY_REJECTED")]; };
    const a = JSON.stringify(computeBrokerCompetitive(mk(), NOW));
    const b = JSON.stringify(computeBrokerCompetitive(mk(), NOW));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
