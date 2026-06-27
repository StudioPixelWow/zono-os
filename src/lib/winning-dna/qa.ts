// ============================================================================
// Broker Winning DNA™ — MAI-9 QA (PURE, deterministic).
//
// Exercises computeBrokerWinningDNA against the phase spec scenarios. No DB, no
// LLM, no randomness — runnable with `npx tsx`. Asserts evidence-only behaviour:
// DNA extracted from strong markets, low confidence on small samples, weak DNA
// in fragmented markets, shared DNA across multiple leaders, independent DNA per
// neighborhood, no DNA when there are no leaders, and byte-identical reruns.
// ============================================================================
import { computeBrokerWinningDNA } from "./engine";
import type { WinningDNARecord, WinningDNAResult } from "./types";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

export interface WinningDNAQaCase { name: string; pass: boolean; detail: string }

const NOW = Date.parse("2026-06-27T00:00:00Z");
const isoDaysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
type Cls = MarketAcceptanceClassification | null;

let seq = 0;
function wr(brokerId: string, classification: Cls, opts: Partial<WinningDNARecord> = {}): WinningDNARecord {
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
const many = (n: number, b: string, c: Cls, o: Partial<WinningDNARecord> = {}) => Array.from({ length: n }, () => wr(b, c, o));
const cityRow = (rs: WinningDNAResult[], w = 30) => rs.find((r) => r.neighborhood === null && r.propertyType === null && r.windowDays === w);

export function runWinningDNAQa(): { cases: WinningDNAQaCase[]; allPass: boolean } {
  const cases: WinningDNAQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) Strong market → DNA extracted.
  {
    seq = 0;
    const recs = [...many(6, "A", "LIKELY_ACCEPTED", { daysOnMarket: 18 }), ...many(2, "B", "ACTIVE")];
    const r = cityRow(computeBrokerWinningDNA(recs, NOW));
    const pass = !!r && r.winningProfile.weak === false && r.winningProfile.leaderCount >= 1 &&
      r.marketSuccessRate != null && r.medianDaysOnMarket != null && r.confidence > 0;
    add("Strong market → DNA extracted", !!pass,
      `weak=${r?.winningProfile.weak} leaders=${r?.winningProfile.leaderCount} success=${r?.marketSuccessRate} conf=${r?.confidence}`);
  }

  // 2) Small sample → low confidence.
  {
    seq = 0;
    const recs = [...many(3, "A", "LIKELY_ACCEPTED"), ...many(1, "B", "ACTIVE")]; // sample 4 < 5
    const r = cityRow(computeBrokerWinningDNA(recs, NOW));
    const note = !!r && r.evidence.some((e) => e.metric === "small_sample");
    const pass = !!r && r.confidence < 40 && note;
    add("Small sample → low confidence", !!pass, `conf=${r?.confidence} sample=${r?.sampleSize} note=${note}`);
  }

  // 3) Fragmented market → weak DNA.
  {
    seq = 0;
    const recs = [...many(8, "A", "ACTIVE"), ...many(2, "B", "ACTIVE"), ...many(2, "C", "ACTIVE")];
    const r = cityRow(computeBrokerWinningDNA(recs, NOW));
    const pass = !!r && r.winningProfile.weak === true && r.confidence <= 35;
    add("Fragmented market → weak DNA", !!pass,
      `weak=${r?.winningProfile.weak} top=${r?.metadata.topDominance} conf=${r?.confidence}`);
  }

  // 4) Multiple leaders → shared DNA.
  {
    seq = 0;
    const recs = [
      ...many(4, "A", "LIKELY_ACCEPTED"), ...many(2, "A", "ACTIVE"),
      ...many(4, "B", "LIKELY_ACCEPTED"), ...many(2, "B", "ACTIVE"),
      ...many(1, "C", "ACTIVE"),
    ];
    const r = cityRow(computeBrokerWinningDNA(recs, NOW));
    const ids = (r?.metadata.leaderBrokerIds as string[] | undefined) ?? [];
    const pass = !!r && r.winningProfile.leaderCount === 2 && ids.includes("A") && ids.includes("B") && r.winningProfile.weak === false;
    add("Multiple leaders → shared DNA", !!pass, `leaders=${r?.winningProfile.leaderCount} ids=${ids.join(",")}`);
  }

  // 5) Different neighborhoods → independent DNA.
  {
    seq = 0;
    const recs = [
      ...many(4, "A", "LIKELY_ACCEPTED", { neighborhood: "צפון" }), ...many(2, "A", "ACTIVE", { neighborhood: "צפון" }), ...many(1, "X", "ACTIVE", { neighborhood: "צפון" }),
      ...many(4, "B", "LIKELY_ACCEPTED", { neighborhood: "דרום" }), ...many(2, "B", "ACTIVE", { neighborhood: "דרום" }), ...many(1, "Y", "ACTIVE", { neighborhood: "דרום" }),
    ];
    const rs = computeBrokerWinningDNA(recs, NOW);
    const north = rs.find((r) => r.neighborhood === "צפון" && r.windowDays === 30);
    const south = rs.find((r) => r.neighborhood === "דרום" && r.windowDays === 30);
    const nIds = (north?.metadata.leaderBrokerIds as string[] | undefined) ?? [];
    const sIds = (south?.metadata.leaderBrokerIds as string[] | undefined) ?? [];
    const pass = nIds.includes("A") && !nIds.includes("B") && sIds.includes("B") && !sIds.includes("A");
    add("Different neighborhoods → independent DNA", !!pass, `north=${nIds.join(",")} south=${sIds.join(",")}`);
  }

  // 6) No leaders → no DNA.
  {
    seq = 0;
    const recs = [...many(2, "A", "ACTIVE"), ...many(2, "B", "ACTIVE"), ...many(2, "C", "ACTIVE"), ...many(2, "D", "ACTIVE")];
    const r = cityRow(computeBrokerWinningDNA(recs, NOW));
    add("No leaders → no DNA", r === undefined, `cityRow=${r ? "present" : "absent"}`);
  }

  // 7) No broker → ignored safely.
  {
    seq = 0;
    const rs = computeBrokerWinningDNA(many(6, "", "LIKELY_ACCEPTED"), NOW);
    add("No broker → ignored safely", rs.length === 0, `results=${rs.length}`);
  }

  // 8) Deterministic rerun → byte-identical output.
  {
    const mk = () => { seq = 0; return [...many(6, "A", "LIKELY_ACCEPTED"), ...many(2, "B", "ACTIVE")]; };
    const a = JSON.stringify(computeBrokerWinningDNA(mk(), NOW));
    const b = JSON.stringify(computeBrokerWinningDNA(mk(), NOW));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
