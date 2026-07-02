// ============================================================================
// ✅ Buyer Intelligence Agent — self-tests (pure, offline). 29.4. Part 11.
// Scenarios: new / hot / cold / luxury / investor / family / dormant / ghosting /
// budget-change / timeline-change / perfect-match / no-matches — plus the agent
// emitting recommendation + mission proposals (nothing auto-executes).
// ============================================================================
import { buildBuyerScorecard } from "./scorecard";
import { buyerAgent } from "./agent";
import type { BuyerSignals, BuyerMatchInput } from "./types";

export interface BACheck { name: string; pass: boolean; detail: string }
export interface BASelfCheck { ok: boolean; total: number; passed: number; checks: BACheck[] }

const match = (score: number, ageDays: number | null = 5): BuyerMatchInput => ({ listingId: `L${score}`, title: `נכס ${score}`, score, ageDays, reasons: [`ציון ${score}`] });

const sig = (over: Partial<BuyerSignals> = {}): BuyerSignals => ({
  id: "B1", name: "דנה קונה",
  readiness: 60, urgency: 55, trust: 60, probabilityToBuy: 60, communicationHealth: 60, budgetConfidence: 60, completeness: 70,
  decisionStyle: "מעורב", motivation: "מגורים", timeline: "1–3 חודשים",
  behavior: { views: 4, saves: 2, rejects: 0, visits: 1, offers: 0, calls: 1, meetings: 1, messages: 2, searches: 1 },
  healthScore: 62, healthLabel: "יציב", recencyScore: 75, engagementScore: 55, totalActivities: 8, lastActivityAt: "2026-06-30T00:00:00Z",
  relationshipDegree: 2, classification: ["ליד קונה"], learnings: [], lifecycleRoles: ["buyer"], repeatClient: false, investor: false, formerClient: false, lifecycleStage: "buyer_viewing",
  matches: [match(88), match(70), match(50)], brokerConnections: ["מתווך A"], truthScore: 65, budgetChanged: false, timelineChanged: false, ...over,
});

export function runSelfCheck(): BASelfCheck {
  const checks: BACheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const card = (o: Partial<BuyerSignals>) => buildBuyerScorecard(sig(o));
  const hasRisk = (c: ReturnType<typeof card>, t: string) => c.risks.some((r) => r.type === t);

  const base = card({});
  add("scorecard full model", typeof base.health.buyerHealth === "number" && !!base.strategy.recommendedStrategy && Array.isArray(base.matchIntel.perfect) && Array.isArray(base.risks) && base.aiRecommendation.length > 0, "");
  add("health has 10 metrics", ["buyerHealth", "buyingReadiness", "buyingMomentum", "buyingConfidence", "trust", "urgency", "activity", "relationshipHealth", "communicationHealth", "decisionConfidence"].every((k) => typeof (base.health as unknown as Record<string, number>)[k] === "number"), "");

  // New buyer.
  const fresh = card({ totalActivities: 0, behavior: { views: 0, saves: 0, rejects: 0, visits: 0, offers: 0, calls: 0, meetings: 0, messages: 0, searches: 0 }, matches: [], completeness: 40 });
  add("new buyer → health 'חדש' + collect info", fresh.health.label === "חדש" && (fresh.strategy.recommendedStrategy === "COLLECT_INFORMATION" || fresh.strategy.recommendedStrategy === "CONTACT"), fresh.strategy.recommendedStrategy);

  // Hot buyer (offer + readiness) → close/negotiate.
  const hot = card({ readiness: 80, probabilityToBuy: 80, behavior: { views: 6, saves: 3, rejects: 0, visits: 2, offers: 1, calls: 2, meetings: 2, messages: 3, searches: 2 }, classification: ["קונה חם"] });
  add("hot buyer → close/negotiate strategy", ["CLOSE_DEAL", "NEGOTIATE"].includes(hot.strategy.recommendedStrategy), hot.strategy.recommendedStrategy);
  add("hot buyer high impact", hot.strategy.businessImpact === "high", "");

  // Cold buyer.
  const cold = card({ readiness: 25, probabilityToBuy: 20, recencyScore: 60, classification: ["קונה קר"] });
  add("cold buyer → nurture + cold risk", cold.strategy.recommendedStrategy === "LONG_TERM_NURTURE" && hasRisk(cold, "cold_buyer"), cold.strategy.recommendedStrategy);

  // Luxury buyer.
  const lux = card({ classification: ["יוקרה", "קונה חם"], matches: [match(88), match(72)] });
  add("luxury buyer → luxury opportunity", lux.opportunities.some((o) => o.type === "luxury_opportunity"), "");

  // Investor.
  const inv = card({ investor: true, classification: ["משקיע"] });
  add("investor → investment opportunity", inv.opportunities.some((o) => o.type === "investment_opportunity"), "");

  // Family (via journey roles / classification) — just ensure classification surfaces.
  const fam = card({ classification: ["משפחה", "ליד קונה"] });
  add("family classification carried", fam.classification.includes("משפחה"), "");

  // Dormant.
  const dormant = card({ recencyScore: 5, engagementScore: 5, classification: ["רדום"] });
  add("dormant → no_activity risk + nurture", hasRisk(dormant, "no_activity") && ["LONG_TERM_NURTURE", "CONTACT"].includes(dormant.strategy.recommendedStrategy), dormant.strategy.recommendedStrategy);

  // Ghosting.
  const ghost = card({ recencyScore: 5, totalActivities: 10, behavior: { views: 5, saves: 2, rejects: 0, visits: 1, offers: 0, calls: 2, meetings: 1, messages: 3, searches: 1 } });
  add("ghosting risk detected", hasRisk(ghost, "ghosting"), "");

  // Budget change.
  const budget = card({ budgetChanged: true, budgetConfidence: 30 });
  add("budget change → budget_problem risk", hasRisk(budget, "budget_problem"), "");

  // Timeline change.
  const timeline = card({ timelineChanged: true });
  add("timeline change → timeline_delay risk", hasRisk(timeline, "timeline_delay"), "");

  // Perfect match.
  const perfect = card({ matches: [match(92), match(88)] });
  add("perfect match → perfect tier + market opp", perfect.matchIntel.perfect.length >= 1 && perfect.opportunities.some((o) => o.type === "market_opportunity"), "");
  add("match intel explains why", perfect.matchIntel.perfect.every((m) => m.why.length > 0), "");

  // No matches.
  const noMatch = card({ matches: [] });
  add("no matches → poor_matching risk + note", hasRisk(noMatch, "poor_matching") && noMatch.matchIntel.notes.length > 0, "");

  // Expired matches.
  const expired = card({ matches: [match(85, 120)] });
  add("expired match tier", expired.matchIntel.expired.length >= 1, "");

  // Strategy + playbook + seller connection.
  add("playbook ordered + mission mapped", base.strategy.playbook.every((a, i) => a.order === i + 1 && !!a.missionType), "");
  add("seller connection priority listings", base.sellerConnection.priorityListings.length > 0, "");
  add("strategy change signal valid", ["working", "switch", "succeeded", "failed", "review"].includes(base.strategy.change.signal), base.strategy.change.signal);

  // Agent proposals — recommendation-only, nothing executes.
  const proposals = buyerAgent.run({ now: Date.now(), orgId: "o", data: { buyers: [sig({ behavior: { views: 6, saves: 3, rejects: 0, visits: 2, offers: 1, calls: 2, meetings: 2, messages: 3, searches: 2 }, readiness: 80 })] } });
  add("agent emits proposals per buyer", proposals.length > 0 && proposals.every((p) => p.entityType === "buyer" && p.entityId === "B1"), "");
  add("agent emits mission proposal (approval-gated)", proposals.some((p) => p.kind === "mission" && !!p.missionType), "");
  add("agent no auto-exec (request approval only)", buyerAgent.permissions.includes("REQUEST_APPROVAL") && !buyerAgent.permissions.includes("AUTO_EXECUTE"), "");
  add("empty buyers → no proposals", buyerAgent.run({ now: Date.now(), orgId: "o", data: {} }).length === 0, "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
