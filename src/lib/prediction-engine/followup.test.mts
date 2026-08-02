// ============================================================================
// 🔮 Prediction follow-up guard — P1-3 acceptance test.
// Run: npx tsx src/lib/prediction-engine/followup.test.mts   (exit 0 = pass)
// Reproduces the exact production contradiction (100% missed on 0 leads) and
// proves it is gone, while a real population still forecasts normally.
// ============================================================================
import { forecast } from "./forecast.ts";
import { followUpPopulation, hasNoFollowUpPopulation, overloadFollowUpPenalty } from "./followup.ts";
import type { PredictionSignals, PerfSignal, SignalEntity } from "./types.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const EMPTY: PredictionSignals = {
  sellersAtRisk: [], hotBuyers: [], staleListings: [], leadFollowUps: [],
  performance: null, conversation: null, marketing: null, territory: null, orgScore: null, orgRiskCount: 0,
};
const sig = (o: Partial<PredictionSignals> = {}): PredictionSignals => ({ ...EMPTY, ...o });
const ent = (id: string): SignalEntity => ({ kind: "lead", id, name: "ליד " + id, score: 60, reason: "", riskLabel: null, href: `/lead/${id}`, lastActivityAt: new Date(NOW - 86400000).toISOString() });

// The production shape: performance object PRESENT but empty population, 0% rate.
const emptyPerf: PerfSignal = { daily: 0, weekly: 0, followUpRatePct: 0, conversionOpportunities: 0, weakSpots: [], peopleTracked: 0 };
const realPerf: PerfSignal = { daily: 60, weekly: 55, followUpRatePct: 40, conversionOpportunities: 3, weakSpots: [], peopleTracked: 12 };

const mf = (s: PredictionSignals) => forecast(s, NOW).find((p) => p.kind === "missed_followup")!;
const bo = (s: PredictionSignals) => forecast(s, NOW).find((p) => p.kind === "broker_overload")!;

console.log("\n— P1-3: the exact production contradiction —");
{
  const p = mf(sig({ performance: emptyPerf })); // perf present, 0 population, 0 leads
  check("empty population ⇒ missed_followup is INSUFFICIENT (not 100%)",
    p.probability === null && p.dataSufficiency === "none");
  check("empty population ⇒ no '100%' in headline",
    !p.headline.includes("100%"));
}

console.log("\n— real population still forecasts —");
{
  const p = mf(sig({ performance: realPerf })); // 40% follow-up over 12 people
  check("real population, 40% rate ⇒ 60% missed, real probability",
    p.probability === 60 && p.dataSufficiency === "high");
}
{
  const p = mf(sig({ leadFollowUps: [ent("a"), ent("b")] })); // leads but no perf
  check("leads-only ⇒ real low-sufficiency estimate (not insufficient)",
    p.probability != null && p.dataSufficiency === "low");
}

console.log("\n— broker_overload no longer inflated by empty population —");
{
  const load = bo(sig({ performance: emptyPerf, conversation: { whatsappUnread: 0, whatsappWaiting: 0, facebookComments: 0, facebookLeads: 0 } }));
  check("empty population ⇒ overload load is 0 (no phantom +30)", load.probability === 0);
}

console.log("\n— helper units —");
check("followUpPopulation counts perf.peopleTracked + leads",
  followUpPopulation(realPerf, [ent("a")]) === 13);
check("hasNoFollowUpPopulation true only when both empty",
  hasNoFollowUpPopulation(emptyPerf, []) === true && hasNoFollowUpPopulation(emptyPerf, [ent("a")]) === false);
check("overloadFollowUpPenalty 0 for empty population, >0 for real",
  overloadFollowUpPenalty(emptyPerf) === 0 && overloadFollowUpPenalty(realPerf) === (100 - 40) * 0.3);

console.log(`\n${failed === 0 ? "🟢" : "🔴"} followup(P1-3): ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
