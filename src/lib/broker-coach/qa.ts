// ============================================================================
// Evidence-Based Broker Coach™ — MAI-11 QA (PURE, deterministic).
//
// Exercises computeBrokerCoach against the phase spec scenarios. No DB, no LLM,
// no randomness — runnable with `npx tsx`. Asserts evidence-only behaviour:
// recommendations only from real evidence, "Not enough evidence" on weak data,
// recommendations vanish when their gap vanishes, high confidence ⇒ high
// priority, brokerless input ignored, every recommendation traces to source
// data, and reruns are byte-identical.
// ============================================================================
import { computeBrokerCoach } from "./engine";
import type { BrokerCoachInput, CoachGap, CoachGapProfile, CoachRecommendation } from "./types";

export interface CoachQaCase { name: string; pass: boolean; detail: string }

const gap = (type: CoachGap["type"], severity: CoachGap["severity"], confidence: number, brokerValue: number, benchmarkValue: number, gapValue: number): CoachGap =>
  ({ type, label: type, brokerValue, benchmarkValue, gapValue, severity, confidence });

const profile = (segmentLabel: string, confidence: number, opts: Partial<CoachGapProfile> = {}): CoachGapProfile => ({
  segmentLabel, windowDays: 30,
  zoneDominanceScore: opts.zoneDominanceScore ?? 55, zoneDominanceLevel: opts.zoneDominanceLevel ?? "COMPETITIVE",
  leaderGap: opts.leaderGap ?? 25, winningDnaMatchScore: opts.winningDnaMatchScore ?? 60,
  confidence, momentum: opts.momentum ?? 0, gaps: opts.gaps ?? [], strengths: opts.strengths ?? [],
});

const allRecs = (r: { recommendations: CoachRecommendation[]; warnings: CoachRecommendation[]; opportunities: CoachRecommendation[]; strengths: CoachRecommendation[] }) =>
  [...r.recommendations, ...r.warnings, ...r.opportunities, ...r.strengths];

export function runBrokerCoachQa(): { cases: CoachQaCase[]; allPass: boolean } {
  const cases: CoachQaCase[] = [];
  const add = (name: string, pass: boolean, detail: string) => cases.push({ name, pass, detail });

  // 1) Large evidence → recommendations generated.
  {
    const input: BrokerCoachInput = { brokerId: "A", gapProfiles: [profile("חולון / צפון", 80, {
      gaps: [gap("EXIT_SPEED", "HIGH", 0.9, 31, 18, 13), gap("SUCCESS_RATE", "MEDIUM", 0.85, 0.61, 0.74, 0.13)],
    })] };
    const r = computeBrokerCoach([input])[0];
    const pass = r.recommendations.length >= 2 && r.overallConfidence > 0 &&
      r.recommendations.every((x) => x.supportingEvidence.length > 0 && x.generatedFrom.length > 0);
    add("Large evidence → recommendations generated", !!pass,
      `recs=${r.recommendations.length} overallConf=${r.overallConfidence}`);
  }

  // 2) Weak evidence → no recommendation ("Not enough evidence").
  {
    const input: BrokerCoachInput = { brokerId: "B", gapProfiles: [profile("חולון", 20, { zoneDominanceScore: null, zoneDominanceLevel: "INSUFFICIENT_DATA", gaps: [] })] };
    const r = computeBrokerCoach([input])[0];
    const pass = r.recommendations.length === 0 && r.metadata.notEnoughEvidence === true &&
      r.insights.some((i) => i.title === "Not enough evidence");
    add("Weak evidence → no recommendation", !!pass,
      `recs=${r.recommendations.length} notEnough=${r.metadata.notEnoughEvidence}`);
  }

  // 3) Gap disappears → recommendation disappears.
  {
    const withGap: BrokerCoachInput = { brokerId: "C", gapProfiles: [profile("חולון", 80, { leaderGap: 10, gaps: [gap("EXIT_SPEED", "HIGH", 0.9, 31, 18, 13)] })] };
    const without: BrokerCoachInput = { brokerId: "C", gapProfiles: [profile("חולון", 80, { leaderGap: 10, gaps: [] })] };
    const r1 = computeBrokerCoach([withGap])[0];
    const r2 = computeBrokerCoach([without])[0];
    const had = r1.recommendations.some((x) => x.id === "rec:PERFORMANCE:EXIT_SPEED");
    const gone = !r2.recommendations.some((x) => x.id === "rec:PERFORMANCE:EXIT_SPEED");
    add("Gap disappears → recommendation disappears", had && gone, `had=${had} gone=${gone}`);
  }

  // 4) High confidence → high priority.
  {
    const input: BrokerCoachInput = { brokerId: "D", gapProfiles: [profile("חולון", 90, { leaderGap: 5, gaps: [gap("EXIT_SPEED", "HIGH", 0.95, 40, 16, 24)] })] };
    const r = computeBrokerCoach([input])[0];
    const top = r.recommendations[0];
    const pass = !!top && top.id === "rec:PERFORMANCE:EXIT_SPEED" && top.priorityBand === "HIGH" && top.priority >= 66;
    add("High confidence → high priority", !!pass, `top=${top?.id} band=${top?.priorityBand} priority=${top?.priority}`);
  }

  // 5) No broker → ignored.
  {
    const out = computeBrokerCoach([{ brokerId: "", gapProfiles: [profile("חולון", 80, { gaps: [gap("EXIT_SPEED", "HIGH", 0.9, 31, 18, 13)] })] }]);
    add("No broker → ignored safely", out.length === 0, `results=${out.length}`);
  }

  // 6) Deterministic rerun → byte-identical output.
  {
    const mk = (): BrokerCoachInput[] => [{ brokerId: "A", gapProfiles: [profile("חולון", 80, {
      gaps: [gap("EXIT_SPEED", "HIGH", 0.9, 31, 18, 13), gap("PRICE_REDUCTION", "MEDIUM", 0.8, 0.09, 0.03, 0.06)],
      strengths: [{ type: "SUCCESS_RATE", label: "שיעור הצלחה גבוה", brokerValue: 0.8, benchmarkValue: 0.6, advantage: 0.2 }],
    })] }];
    const a = JSON.stringify(computeBrokerCoach(mk()));
    const b = JSON.stringify(computeBrokerCoach(mk()));
    add("Deterministic rerun → same output", a === b, a === b ? "stable" : "DIVERGED");
  }

  // 7) Evidence traceability → every recommendation references source data.
  {
    const input: BrokerCoachInput = { brokerId: "E", gapProfiles: [profile("חולון / צפון", 85, {
      leaderGap: 45, momentum: -8,
      gaps: [gap("MARKET_SHARE", "HIGH", 0.9, 0.1, 0.4, 0.3), gap("COVERAGE", "MEDIUM", 0.7, 1, 3, 2)],
      strengths: [{ type: "EXIT_SPEED", label: "יציאות מהירות", brokerValue: 14, benchmarkValue: 20, advantage: 6 }],
    })] };
    const r = computeBrokerCoach([input])[0];
    const recs = allRecs(r);
    const traceable = recs.length > 0 && recs.every((x) => x.supportingEvidence.length > 0 && x.generatedFrom.length > 0);
    const evidencePresent = r.evidence.length > 0 && r.evidence.every((e) => !!e.source);
    add("Evidence traceability → every recommendation references source", traceable && evidencePresent,
      `recs=${recs.length} traceable=${traceable} evidence=${r.evidence.length}`);
  }

  const allPass = cases.every((c) => c.pass);
  return { cases, allPass };
}
