// ============================================================================
// Broker Market Intelligence™ — MAI-6 QA (PURE, deterministic).
//
// Exercises computeBrokerMarketProfile against the scenarios in the phase spec.
// No DB, no LLM, no randomness — runnable with `npx tsx`. Asserts evidence-only
// behaviour: never an official sale, correct counts, dominant segment, and
// confidence that drops on small samples.
// ============================================================================
import { computeBrokerMarketProfile } from "./engine";
import type { BrokerListingRecord } from "./types";
import type { MarketAcceptanceClassification, ListingLifecycleState } from "@/lib/market-acceptance/types";

export interface BrokerMarketQaCase {
  name: string;
  pass: boolean;
  detail: string;
}

type Cls = MarketAcceptanceClassification | null;

/** Build a listing record with sensible defaults. */
function rec(
  i: number,
  classification: Cls,
  opts: Partial<BrokerListingRecord> = {},
): BrokerListingRecord {
  const state: ListingLifecycleState | null =
    classification === "ACTIVE" || classification === "LIKELY_REJECTED" ? "ACTIVE"
      : classification === "RETURNED" ? "RETURNED"
        : classification === "LIKELY_ACCEPTED" || classification === "LIKELY_MARKET_EXIT" ? "DISAPPEARED"
          : null;
  return {
    provider: "yad2", externalId: `L${i}`, classification,
    currentState: opts.currentState ?? state, scoreConfidence: opts.scoreConfidence ?? 0.9,
    daysOnMarket: opts.daysOnMarket ?? 20, lastKnownPrice: opts.lastKnownPrice ?? 2_200_000,
    reductionPct: opts.reductionPct ?? null,
    city: opts.city ?? "רחובות", neighborhood: opts.neighborhood ?? "רחובות צפון",
    propertyType: opts.propertyType ?? "apartment", rooms: opts.rooms ?? 4,
  };
}

export function runBrokerMarketQa(): { cases: BrokerMarketQaCase[]; allPass: boolean } {
  const cases: BrokerMarketQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) Broker with many listings → metrics created, high confidence, no sale claim.
  {
    const records: BrokerListingRecord[] = [];
    for (let i = 0; i < 22; i++) records.push(rec(i, "LIKELY_ACCEPTED", { daysOnMarket: 18 }));
    for (let i = 22; i < 31; i++) records.push(rec(i, "LIKELY_REJECTED", { daysOnMarket: 95 }));
    const p = computeBrokerMarketProfile("b1", records);
    const pass = p.totalObservedListings === 31 && p.likelyMarketSuccessCount === 22 &&
      p.eligibleListings === 31 && p.marketSuccessRate !== null && p.confidence >= 80 &&
      p.marketPerformanceIndex !== null;
    add("Broker with many listings → metrics created", pass,
      `total=${p.totalObservedListings} success=${p.likelyMarketSuccessCount} successRate=${p.marketSuccessRate} conf=${p.confidence} perf=${p.marketPerformanceIndex}`);
  }

  // 2) Broker with no listings → honest empty profile (no fabricated metrics).
  {
    const p = computeBrokerMarketProfile("b2", []);
    const pass = p.totalObservedListings === 0 && p.confidence === 0 &&
      p.marketSuccessRate === null && p.marketActivityScore === null &&
      p.marketPerformanceIndex === null && p.evidence.length > 0;
    add("Broker with no listings → empty profile", pass,
      `total=${p.totalObservedListings} conf=${p.confidence} successRate=${p.marketSuccessRate} activity=${p.marketActivityScore}`);
  }

  // 3) Returned listings → counted correctly (not treated as exit/success).
  {
    const records = [
      rec(0, "RETURNED"), rec(1, "RETURNED"),
      rec(2, "LIKELY_ACCEPTED"), rec(3, "ACTIVE"),
    ];
    const p = computeBrokerMarketProfile("b3", records);
    const pass = p.returnedListingCount === 2 && p.likelyMarketSuccessCount === 1 &&
      p.eligibleListings === 1; // returned + active excluded from denominator
    add("Returned listings → counted correctly", pass,
      `returned=${p.returnedListingCount} eligible=${p.eligibleListings}`);
  }

  // 4) Rejected listings → metrics correct (rejection rate + low performance).
  {
    const records = [
      rec(0, "LIKELY_REJECTED", { daysOnMarket: 120, reductionPct: 0.08 }),
      rec(1, "LIKELY_REJECTED", { daysOnMarket: 110, reductionPct: 0.06 }),
      rec(2, "LIKELY_REJECTED", { daysOnMarket: 100, reductionPct: 0.05 }),
      rec(3, "LIKELY_ACCEPTED", { daysOnMarket: 40 }),
    ];
    const p = computeBrokerMarketProfile("b4", records);
    const pass = p.likelyMarketRejectedCount === 3 && p.marketRejectionRate === 0.75 &&
      p.averagePriceReductionPct !== null && (p.marketPerformanceIndex ?? 100) < 50;
    add("Rejected listings → metrics correct", pass,
      `rejected=${p.likelyMarketRejectedCount} rejRate=${p.marketRejectionRate} avgRed=${p.averagePriceReductionPct} perf=${p.marketPerformanceIndex}`);
  }

  // 5) Mixed portfolio → dominant neighborhood correct (most observed activity).
  {
    const records = [
      rec(0, "LIKELY_ACCEPTED", { neighborhood: "רחובות צפון" }),
      rec(1, "ACTIVE", { neighborhood: "רחובות צפון" }),
      rec(2, "LIKELY_REJECTED", { neighborhood: "רחובות צפון" }),
      rec(3, "ACTIVE", { neighborhood: "קריית משה" }),
      rec(4, "LIKELY_ACCEPTED", { neighborhood: "מרכז" }),
    ];
    const p = computeBrokerMarketProfile("b5", records);
    const pass = p.dominantNeighborhood === "רחובות צפון";
    add("Mixed portfolio → dominant neighborhood correct", pass,
      `dominantNeighborhood=${p.dominantNeighborhood}`);
  }

  // 6) Low sample → low confidence.
  {
    const big = computeBrokerMarketProfile("b6a", Array.from({ length: 20 }, (_, i) => rec(i, "LIKELY_ACCEPTED")));
    const small = computeBrokerMarketProfile("b6b", [rec(0, "LIKELY_ACCEPTED")]);
    const pass = small.confidence < big.confidence && small.confidence < 50;
    add("Low sample → low confidence", pass,
      `smallConf=${small.confidence} bigConf=${big.confidence}`);
  }

  // 7) No broker assigned → ignored safely (engine only receives attributed
  //    records; an empty record set yields an empty profile, never a crash).
  {
    const p = computeBrokerMarketProfile("b7", []);
    const pass = p.totalObservedListings === 0 && p.evidence.length > 0;
    add("No broker assigned → ignored safely", pass, `total=${p.totalObservedListings}`);
  }

  // 8) No fake values — every null metric is a real "missing evidence" null.
  {
    const bare: BrokerListingRecord = {
      provider: "yad2", externalId: "B8", classification: "ACTIVE", currentState: "ACTIVE",
      scoreConfidence: 0.4, daysOnMarket: null, lastKnownPrice: null, reductionPct: null,
      city: null, neighborhood: null, propertyType: null, rooms: null,
    };
    const p = computeBrokerMarketProfile("b8", [bare]);
    const pass = p.marketSuccessRate === null && p.medianPriceReductionPct === null &&
      p.averageLastKnownPrice === null && p.marketPerformanceIndex === null;
    add("No fake values (active-only → null rates/metrics)", pass,
      `successRate=${p.marketSuccessRate} medRed=${p.medianPriceReductionPct} avgPrice=${p.averageLastKnownPrice} perf=${p.marketPerformanceIndex}`);
  }

  // 9) Determinism — identical input yields identical output.
  {
    const mk = () => [rec(0, "LIKELY_ACCEPTED"), rec(1, "LIKELY_REJECTED"), rec(2, "ACTIVE")];
    const a = JSON.stringify(computeBrokerMarketProfile("b9", mk()));
    const b = JSON.stringify(computeBrokerMarketProfile("b9", mk()));
    add("Deterministic (same input → same output)", a === b, a === b ? "stable" : "DIVERGED");
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
