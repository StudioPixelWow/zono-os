// ============================================================================
// Autonomous Growth Strategy™ — MAI-12 QA (PURE, deterministic).
//
// Exercises computeBrokerStrategy against the phase spec scenarios. No DB, no
// LLM, no randomness — runnable with `npx tsx`. Asserts evidence-only behaviour:
// strategy only from real coach evidence, "no strategy" on weak evidence,
// blocked recommendations excluded from the active plan, simulation clearly
// marked, conflicting actions resolved (blocked), and stable reruns.
// ============================================================================
import { computeBrokerStrategy } from "./engine";
import type { StrategyInput, CoachItemLite, BrokerStrategyResult, StrategyAction } from "./types";

export interface StrategyQaCase { name: string; pass: boolean; detail: string }

const item = (id: string, kind: CoachItemLite["kind"], impact: CoachItemLite["estimatedImpact"], confidence: number, opts: Partial<CoachItemLite> = {}): CoachItemLite => ({
  id, kind, title: opts.title ?? id, confidence, estimatedImpact: impact,
  supportingEvidence: opts.supportingEvidence ?? ["עדות נצפית מדידה"],
  generatedFrom: opts.generatedFrom ?? ["broker_gap_analysis.exit_speed_gap_days"],
  blockedBy: opts.blockedBy ?? [],
});

const input = (brokerId: string, coachItems: CoachItemLite[], opts: Partial<StrategyInput> = {}): StrategyInput => ({
  brokerId, coachItems,
  currentZoneScore: opts.currentZoneScore ?? 60, currentLeaderGap: opts.currentLeaderGap ?? 20, momentum: opts.momentum ?? 0,
  currentMarketShare: opts.currentMarketShare ?? 0.12, currentSuccessRate: opts.currentSuccessRate ?? 0.6,
  gapSeverityByType: opts.gapSeverityByType ?? {}, strengthTypes: opts.strengthTypes ?? [],
});

const allActions = (r: BrokerStrategyResult): StrategyAction[] =>
  [...r.dailyActions, ...r.weeklyActions, ...r.monthlyActions];

export function runBrokerStrategyQa(): { cases: StrategyQaCase[]; allPass: boolean } {
  const cases: StrategyQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) High evidence → strategy generated.
  {
    const r = computeBrokerStrategy([input("A", [
      item("rec:PERFORMANCE:EXIT_SPEED", "recommendation", "HIGH", 90, { generatedFrom: ["broker_gap_analysis.exit_speed_gap_days", "broker_winning_dna.median_days_on_market"] }),
      item("rec:COVERAGE:COVERAGE", "recommendation", "MEDIUM", 80, { generatedFrom: ["broker_gap_analysis.coverage_gap", "broker_winning_dna.listing_patterns"] }),
      item("rec:LISTING:MARKET_SHARE", "recommendation", "HIGH", 85, { generatedFrom: ["broker_gap_analysis.market_share_gap"] }),
    ], { gapSeverityByType: { EXIT_SPEED: "HIGH", COVERAGE: "MEDIUM", MARKET_SHARE: "HIGH" } })])[0];
    const acts = allActions(r);
    const pass = acts.length >= 3 && (r.expectedImprovement ?? 0) > 0 &&
      acts.every((a) => a.requiredEvidence.length > 0 && a.generatedFrom.length > 0);
    add("High evidence → strategy generated", !!pass,
      `actions=${acts.length} improvement=${r.expectedImprovement} priority=${r.overallPriority}`);
  }

  // 2) Weak evidence → no strategy.
  {
    const r = computeBrokerStrategy([input("B", [])])[0];
    const pass = r.metadata.notEnoughEvidence === true && allActions(r).length === 0 && r.overallPriority === "NONE";
    add("Weak evidence → no strategy", !!pass, `active=${r.metadata.activeCount} priority=${r.overallPriority}`);
  }

  // 3) Blocked recommendation → blocked correctly (excluded from active plan).
  {
    const r = computeBrokerStrategy([input("C", [
      item("rec:PERFORMANCE:EXIT_SPEED", "recommendation", "HIGH", 88),                 // active
      item("rec:PRICING:PRICE_REDUCTION", "recommendation", "LOW", 25),                  // low confidence → blocked
    ], { gapSeverityByType: { EXIT_SPEED: "HIGH", PRICE_REDUCTION: "LOW" } })])[0];
    const blockedHas = r.blockedActions.some((a) => a.id === "act:PRICING:PRICE_REDUCTION" && a.blockedBy.includes("low_confidence"));
    const notActive = !allActions(r).some((a) => a.id === "act:PRICING:PRICE_REDUCTION");
    add("Blocked recommendation → blocked correctly", blockedHas && notActive, `blocked=${blockedHas} excluded=${notActive}`);
  }

  // 4) Simulation → clearly marked.
  {
    const r = computeBrokerStrategy([input("D", [item("rec:LISTING:MARKET_SHARE", "recommendation", "HIGH", 85)], { gapSeverityByType: { MARKET_SHARE: "HIGH" } })])[0];
    const sim = r.estimatedImpact;
    const pass = sim.simulation === true && !!sim.disclaimer && sim.zoneDominance.expected != null;
    add("Simulation → clearly marked", !!pass, `simulation=${sim.simulation} disclaimer="${sim.disclaimer.slice(0, 12)}…" zone=${sim.zoneDominance.current}→${sim.zoneDominance.expected}`);
  }

  // 5) Conflicting actions → resolved (gap of a type the broker is strong in is blocked).
  {
    const r = computeBrokerStrategy([input("E", [
      item("rec:PRICING:PRICE_REDUCTION", "recommendation", "HIGH", 80),   // conflicts with the PRICE_REDUCTION strength
      item("rec:PERFORMANCE:EXIT_SPEED", "recommendation", "HIGH", 85),    // unaffected
    ], { gapSeverityByType: { PRICE_REDUCTION: "HIGH", EXIT_SPEED: "HIGH" }, strengthTypes: ["PRICE_REDUCTION"] })])[0];
    const conflictBlocked = r.blockedActions.some((a) => a.id === "act:PRICING:PRICE_REDUCTION" && a.blockedBy.includes("conflicting_evidence"));
    const otherActive = allActions(r).some((a) => a.id === "act:PERFORMANCE:EXIT_SPEED");
    add("Conflicting actions → resolved", conflictBlocked && otherActive, `conflictBlocked=${conflictBlocked} otherActive=${otherActive}`);
  }

  // 6) Deterministic rerun → byte-identical output.
  {
    const mk = (): StrategyInput[] => [input("A", [
      item("rec:PERFORMANCE:EXIT_SPEED", "recommendation", "HIGH", 90),
      item("opp:MARKET_OPPORTUNITIES:NEAR_LEADERSHIP", "opportunity", "HIGH", 80),
    ], { gapSeverityByType: { EXIT_SPEED: "HIGH" } })];
    const a = JSON.stringify(computeBrokerStrategy(mk()));
    const b = JSON.stringify(computeBrokerStrategy(mk()));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  // 7) No broker → ignored safely.
  {
    const out = computeBrokerStrategy([input("", [item("rec:PERFORMANCE:EXIT_SPEED", "recommendation", "HIGH", 90)])]);
    add("No broker → ignored safely", out.length === 0, `results=${out.length}`);
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
