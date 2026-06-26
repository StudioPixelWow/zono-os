// ============================================================================
// Valuation Weight Engine™ — deterministic QA (PURE, no DB, no AI).
// Verifies the spec's six behaviors of the Market Acceptance weighting layer.
// ============================================================================
import { runValuationWeightEngine } from "./calculator";
import type { BaseValuationFacts, MarketAcceptanceFacts, ValuationWeightInput } from "./types";

function base(p: Partial<BaseValuationFacts>): BaseValuationFacts {
  return {
    estimatedValue: 2_400_000, lowValue: 2_280_000, highValue: 2_520_000, confidenceScore: 80,
    officialTxCount: 12, activeListingCount: 10, trendPercent: 1.5, dataQualityScore: 70,
    avgSimilarity: 75, hasLocation: true, hasFeatures: true, ...p,
  };
}
function acc(p: Partial<MarketAcceptanceFacts>): MarketAcceptanceFacts {
  return { present: true, sampleSize: 25, aggregateConfidence: 70, acceptanceRate: 0.5, exitRate: 0.6, rejectionRate: 0.1, medianDom: 25, absorptionSpeed: 70, ...p };
}
const run = (b: BaseValuationFacts, a: MarketAcceptanceFacts | null, profile: ValuationWeightInput["profile"] = "STANDARD") =>
  runValuationWeightEngine({ base: b, acceptance: a, profile });

export interface WeightQaCase { name: string; ok: boolean; detail: string }

/** Run the six MAI-5 acceptance scenarios. */
export function runValuationWeightQa(): { ok: boolean; cases: WeightQaCase[] } {
  const cases: WeightQaCase[] = [];

  // 1) Strong official data → Market Acceptance has small influence.
  {
    const strong = run(base({ officialTxCount: 20 }), acc({}));
    const noAcc = run(base({ officialTxCount: 20 }), null);
    const delta = Math.abs(strong.finalConfidence - noAcc.finalConfidence);
    const ok = strong.weights.officialTransactions >= strong.weights.marketAcceptance && delta <= 8;
    cases.push({ name: "strong official → small MA influence", ok, detail: `officialW=${strong.weights.officialTransactions} maW=${strong.weights.marketAcceptance} Δconf=${delta}` });
  }
  // 2) Weak official data → Market Acceptance influence grows.
  {
    const weak = run(base({ officialTxCount: 1 }), acc({}));
    const strong = run(base({ officialTxCount: 20 }), acc({}));
    const ok = weak.weights.marketAcceptance > strong.weights.marketAcceptance;
    cases.push({ name: "weak official → MA influence grows", ok, detail: `weakMaW=${weak.weights.marketAcceptance} strongMaW=${strong.weights.marketAcceptance}` });
  }
  // 3) Tiny sample → Market Acceptance ignored (weight 0).
  {
    const r = run(base({}), acc({ sampleSize: 3 }));
    const ok = r.weights.marketAcceptance === 0 && r.notes.some((n) => n.includes("קטן מדי"));
    cases.push({ name: "tiny sample → MA ignored", ok, detail: `maW=${r.weights.marketAcceptance}` });
  }
  // 4) Large sample → Market Acceptance contributes.
  {
    const r = run(base({}), acc({ sampleSize: 30 }));
    const ok = r.weights.marketAcceptance > 0 && r.evidence.some((e) => e.source === "marketAcceptance" && e.weight > 0);
    cases.push({ name: "large sample → MA contributes", ok, detail: `maW=${r.weights.marketAcceptance}` });
  }
  // 5) Rejected market → confidence decreases (vs no acceptance).
  {
    const rejected = run(base({ officialTxCount: 4 }), acc({ acceptanceRate: 0.1, rejectionRate: 0.7, absorptionSpeed: 20, aggregateConfidence: 60 }));
    const noAcc = run(base({ officialTxCount: 4 }), null);
    const ok = rejected.finalConfidence < noAcc.finalConfidence && rejected.rangeAdjustment === "widened";
    cases.push({ name: "rejected market → confidence decreases", ok, detail: `conf=${rejected.finalConfidence} vs ${noAcc.finalConfidence} range=${rejected.rangeAdjustment}` });
  }
  // 6) Accepted market → confidence improves + range narrows.
  {
    const accepted = run(base({ officialTxCount: 4 }), acc({ acceptanceRate: 0.8, rejectionRate: 0.05, absorptionSpeed: 90, aggregateConfidence: 80 }));
    const noAcc = run(base({ officialTxCount: 4 }), null);
    const ok = accepted.finalConfidence > noAcc.finalConfidence && accepted.rangeAdjustment === "narrowed";
    cases.push({ name: "accepted market → confidence improves", ok, detail: `conf=${accepted.finalConfidence} vs ${noAcc.finalConfidence} range=${accepted.rangeAdjustment}` });
  }
  // Invariant: value never changes regardless of acceptance.
  {
    const a = run(base({}), acc({ acceptanceRate: 0.9 }));
    const b = run(base({}), acc({ rejectionRate: 0.9 }));
    const ok = a.estimatedValue === 2_400_000 && b.estimatedValue === 2_400_000;
    cases.push({ name: "value invariant (official never overridden)", ok, detail: `a=${a.estimatedValue} b=${b.estimatedValue}` });
  }

  return { ok: cases.every((c) => c.ok), cases };
}
