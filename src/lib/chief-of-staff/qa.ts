// ============================================================================
// ✅ AI Chief of Staff — self-tests (pure, offline). Phase 27.6.
// Validates the Organization Score, CEO Dashboard, cross-module reasoning,
// ranked recommendations, execution interventions and organizational memory
// across the mandated scenarios: growing / declining / no-data organizations,
// many offices / brokers / missions / risks, and a mixed market.
// ============================================================================
import { computeOrganizationScore, computeDashboard } from "./score";
import {
  crossModuleInsights, buildExecutiveRecommendations, buildInterventions, buildBusinessMemory,
  type ReasoningInput, type MissionLite, type MemoryInput,
} from "./reasoning";
import type { OrgSignals } from "./types";

export interface COSCheck { name: string; pass: boolean; detail: string }
export interface COSSelfCheck { ok: boolean; total: number; passed: number; checks: COSCheck[] }

const baseSignals = (over: Partial<OrgSignals> = {}): OrgSignals => ({
  offices: 8, brokers: 24, activeListings: 140, activeCities: 4, brands: 3,
  agentsWithOffice: 20, linkCoveragePct: 80, resolutionRatePct: 78, dataQualityScore: 82,
  missions: { active: 6, completed: 9, cancelled: 1, blocked: 1, waiting: 2, inProgress: 3, executionScore: 62, completionRatePct: 60 },
  market: { citiesAnalyzed: 4, avgBusinessScore: 70, avgConfidence: 66, decliningCities: 0, riskCount: 2, opportunityCount: 3, competitiveAlerts: 2 },
  sourcesUsed: 5,
  ...over,
});

const baseReasoning = (over: Partial<ReasoningInput> = {}): ReasoningInput => ({
  signals: baseSignals(),
  decliningCities: [], growingCompetitors: [], decliningCompetitors: [], emergingAreas: [],
  weakCoverageCities: [], priorities: [], risks: [], opportunities: [],
  blockedMissions: [], waitingMissions: [],
  ...over,
});

export function runSelfCheck(): COSSelfCheck {
  const checks: COSCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // ── Organization Score: bounds + 8 dims + overall ──────────────────────────
  const growing = computeOrganizationScore(baseSignals({ market: { citiesAnalyzed: 5, avgBusinessScore: 85, avgConfidence: 80, decliningCities: 0, riskCount: 0, opportunityCount: 5, competitiveAlerts: 1 }, missions: { active: 5, completed: 20, cancelled: 0, blocked: 0, waiting: 1, inProgress: 4, executionScore: 88, completionRatePct: 82 } }));
  const declining = computeOrganizationScore(baseSignals({ market: { citiesAnalyzed: 5, avgBusinessScore: 30, avgConfidence: 50, decliningCities: 4, riskCount: 8, opportunityCount: 0, competitiveAlerts: 5 }, missions: { active: 12, completed: 1, cancelled: 6, blocked: 5, waiting: 6, inProgress: 1, executionScore: 20, completionRatePct: 12 }, dataQualityScore: 35 }));
  const empty = computeOrganizationScore(baseSignals({ offices: 0, brokers: 0, activeListings: 0, activeCities: 0, brands: 0, agentsWithOffice: 0, linkCoveragePct: 0, resolutionRatePct: 0, dataQualityScore: 0, missions: { active: 0, completed: 0, cancelled: 0, blocked: 0, waiting: 0, inProgress: 0, executionScore: 0, completionRatePct: 0 }, market: { citiesAnalyzed: 0, avgBusinessScore: 0, avgConfidence: 0, decliningCities: 0, riskCount: 0, opportunityCount: 0, competitiveAlerts: 0 }, sourcesUsed: 1 }));

  add("score has 8 dims", growing.dims.length === 8, `${growing.dims.length}`);
  add("all dims 0..100", [growing, declining, empty].every((s) => s.dims.every((d) => d.score >= 0 && d.score <= 100) && s.overall >= 0 && s.overall <= 100), "");
  add("growing > declining overall", growing.overall > declining.overall, `${growing.overall} vs ${declining.overall}`);
  add("empty org low + low confidence", empty.overall < 45 && empty.confidence <= 30, `overall ${empty.overall} conf ${empty.confidence}`);
  add("growing confidence high", growing.confidence >= 60, `${growing.confidence}`);
  add("declining execution low", declining.execution < 45, `${declining.execution}`);
  add("dims carry basis", growing.dims.every((d) => d.basis.length > 0), "");

  // ── Dashboard: 6 health lenses + risk inversion ────────────────────────────
  const dashG = computeDashboard(baseSignals(), growing);
  const dashD = computeDashboard(baseSignals({ market: { citiesAnalyzed: 5, avgBusinessScore: 30, avgConfidence: 40, decliningCities: 4, riskCount: 9, opportunityCount: 0, competitiveAlerts: 5 }, missions: { active: 10, completed: 1, cancelled: 5, blocked: 6, waiting: 4, inProgress: 1, executionScore: 20, completionRatePct: 12 } }), declining);
  add("dashboard 6 health lenses", dashG.health.length === 6, `${dashG.health.length}`);
  add("dashboard keys complete", ["business", "execution", "market", "sales", "growth", "risk"].every((k) => dashG.health.some((h) => h.key === k)), "");
  add("risk health inverts with risks", (dashD.health.find((h) => h.key === "risk")?.score ?? 100) < (dashG.health.find((h) => h.key === "risk")?.score ?? 0), "");
  add("aiConfidence mirrors score confidence", dashG.aiConfidence === growing.confidence, "");

  // ── Cross-module reasoning chains ──────────────────────────────────────────
  const richReasoning = baseReasoning({
    growingCompetitors: [{ city: "רחובות", name: "רי/מקס פסגה", growthPct: 28 }],
    weakCoverageCities: [{ city: "רחובות", businessScore: 38 }],
    decliningCities: [{ city: "נס ציונה", trendPct: -14 }],
    emergingAreas: [{ city: "רחובות", title: "אזור מתפתח", evidence: "היצע גבוה", area: "מרכז" }],
    blockedMissions: [{ missionType: "RECRUIT_BROKER", goal: "גייס מתווך", entity: "משרד א", priority: 80, status: "BLOCKED" }],
    waitingMissions: [{ missionType: "EXPAND_TERRITORY", goal: "הרחב טריטוריה", entity: "משרד ב", priority: 70, status: "WAITING_FOR_APPROVAL" }],
    signals: baseSignals({ dataQualityScore: 40, market: { citiesAnalyzed: 3, avgBusinessScore: 45, avgConfidence: 50, decliningCities: 1, riskCount: 3, opportunityCount: 2, competitiveAlerts: 1 } }),
  });
  const insights = crossModuleInsights(richReasoning);
  add("reasoning produces insights", insights.length >= 4, `${insights.length}`);
  add("insight has multi-step chain", insights.every((i) => i.chain.length >= 3), "");
  add("insight connects modules", insights.some((i) => i.modules.length >= 2), "");
  add("competitor+coverage chain present", insights.some((i) => i.modules.includes("Competitive") && /גייס|קמפיין/.test(i.recommendation)), "");
  add("execution bottleneck chain present", insights.some((i) => /צוואר בקבוק|תקוע/.test(i.title)), "");
  add("low data quality chain present", insights.some((i) => /איכות נתונים/.test(i.title)), "");
  add("no-data → no chains", crossModuleInsights(baseReasoning({ signals: baseSignals({ dataQualityScore: 90 }) })).length === 0, "");

  // ── Ranked recommendations ─────────────────────────────────────────────────
  const openMissions: MissionLite[] = [
    { missionType: "RECRUIT_BROKER", goal: "גייס מתווך רחובות", entity: "משרד א", priority: 88, status: "READY" },
    { missionType: "MARKETING_CAMPAIGN", goal: "קמפיין", entity: "משרד ב", priority: 55, status: "IN_PROGRESS" },
  ];
  const recReasoning = baseReasoning({
    priorities: [
      { city: "רחובות", category: "COMPETITIVE", title: "עקוב אחר מתחרה", why: "מתחרה צומח", evidence: "+28%", priority: 82, readiness: "needs_approval" },
      { city: "נס ציונה", category: "MARKET", title: "שוק בירידה", why: "מלאי יורד", evidence: "-14%", priority: 60, readiness: "needs_approval" },
    ],
    risks: [{ city: "נס ציונה", title: "ירידת מלאי", evidence: "-14%", severity: "high" }],
    opportunities: [{ city: "רחובות", title: "אזור מתפתח", evidence: "היצע גבוה", area: "מרכז" }],
  });
  const recs = buildExecutiveRecommendations(recReasoning, openMissions);
  add("top priorities ranked desc", recs.topPriorities.length === 2 && recs.topPriorities[0].urgency >= recs.topPriorities[1].urgency, "");
  add("top missions sorted by priority", recs.topMissions[0]?.title === "גייס מתווך רחובות", recs.topMissions[0]?.title ?? "");
  add("highestRoi non-empty + weighted", recs.highestRoi.length > 0 && recs.highestRoi[0].businessImpact === "high", "");
  add("recs carry evidence + why", recs.topRisks.every((r) => r.evidence.length > 0 && r.why.length > 0), "");
  add("recs carry alternatives (risk)", recs.topRisks.every((r) => r.alternatives.length > 0), "");
  add("recs cite source module", recs.topPriorities.every((r) => r.sourceModule.startsWith("Decision")), "");

  // ── Execution coordinator interventions ────────────────────────────────────
  const intv = buildInterventions(richReasoning);
  add("interventions for blocked+waiting", intv.length === 2 && intv.every((r) => r.kind === "intervention"), `${intv.length}`);
  add("interventions never execute (recommend)", intv.every((r) => /שחרר|אשר/.test(r.title) && r.alternatives.length > 0), "");

  // ── Organizational memory ──────────────────────────────────────────────────
  const mem: MemoryInput = {
    completed: [{ missionType: "RECRUIT_BROKER", goal: "a" }, { missionType: "RECRUIT_BROKER", goal: "b" }, { missionType: "SELLER_OPPORTUNITY", goal: "c" }],
    cancelled: [{ missionType: "MARKETING_CAMPAIGN", goal: "x" }, { missionType: "MARKETING_CAMPAIGN", goal: "y" }],
    active: [{ missionType: "EXPAND_TERRITORY" }],
  };
  const memory = buildBusinessMemory(mem);
  add("memory counts completed/failed", memory.completedMissions === 3 && memory.failedMissions === 2, "");
  add("memory finds successful strategy", memory.successfulStrategies.some((s) => s.key === "RECRUIT_BROKER" && s.count === 2), "");
  add("memory finds repeated problem", memory.repeatedProblems.some((p) => p.key === "MARKETING_CAMPAIGN" && p.count === 2), "");
  add("empty memory notes it", buildBusinessMemory({ completed: [], cancelled: [], active: [] }).notes.length > 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
