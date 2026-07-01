// ============================================================================
// ✅ Decision Engine self-tests (pure, offline). 27.4.
// Validates priority math, evidence-only decisions, risks, opportunities, and
// the "no data → no fabricated recommendations" rule.
// ============================================================================
import { computePriority } from "./priority";
import { buildOfficeDecisions, businessScore, aiConfidence } from "./planner";
import { buildRisks, buildOpportunities } from "./risk-opportunity";
import type { OfficeDecisionSignals } from "./types";

export interface DECheck { name: string; pass: boolean; detail: string }
export interface DESelfCheck { ok: boolean; total: number; passed: number; checks: DECheck[] }

function sig(over: Partial<OfficeDecisionSignals>): OfficeDecisionSignals {
  return {
    officeId: "O1", officeName: "RE/MAX Family", brand: "RE/MAX",
    marketRank: 2, totalOffices: 8, listingSharePct: 17, brokerSharePct: 12, luxurySharePct: 10, commercialSharePct: 3,
    activeListings: 24, brokers: 2, neighborhoods: 6, growthPct: 5, momentum: "stable", threatLevel: "moderate",
    fastestGrowingCompetitor: null, weakAreas: [], expansionOpportunities: [], swotWeaknesses: [], swotThreats: [], swotOpportunities: [],
    inventoryConflicts: 0, stagnantListings: 0, hasData: true, ...over,
  };
}

export function runSelfCheck(): DESelfCheck {
  const checks: DECheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Priority bounded + weighted.
  add("priority bounded", (() => { const p = computePriority({ businessImpact: 100, urgency: 100, confidence: 100, timeSensitivity: 100, marketConditions: 100, missingAction: true }); return p <= 100 && p >= 0; })(), "");
  add("priority ordered", computePriority({ businessImpact: 90, urgency: 90, confidence: 80, timeSensitivity: 80, marketConditions: 70, missingAction: true }) > computePriority({ businessImpact: 20, urgency: 20, confidence: 40, timeSensitivity: 20, marketConditions: 30, missingAction: false }), "");

  // No data → no fabricated recommendations.
  const empty = sig({ hasData: false, activeListings: 0, brokers: 0, neighborhoods: 0 });
  add("no data → no decisions", buildOfficeDecisions(empty).length === 0, "");
  add("no data → no risks", buildRisks(empty).length === 0, "");
  add("no data → confidence low", aiConfidence(empty) <= 20, `${aiConfidence(empty)}`);
  add("no data → business 0", businessScore(empty) === 0, "");

  // Growing office w/ few brokers + expansion → recruit decision, evidence-cited.
  const growing = sig({ momentum: "growing", growthPct: 22, brokers: 2, expansionOpportunities: [{ name: "סביניה", reason: "8 מודעות פעילות ללא נוכחות" }], fastestGrowingCompetitor: { name: "Anglo Saxon", growthPct: 18 } });
  const gd = buildOfficeDecisions(growing);
  add("recruit decision exists", gd.some((d) => d.category === "BROKERAGE"), "");
  add("expansion decision exists", gd.some((d) => d.category === "TERRITORY" && /סביניה/.test(d.title)), "");
  add("every decision has evidence", gd.every((d) => d.evidence.length > 0 && d.actions.length > 0), "");
  add("every decision has readiness", gd.every((d) => !!d.executionReadiness), "");

  // Declining office → decline decision + risk.
  const declining = sig({ momentum: "declining", growthPct: -25 });
  add("decline decision", buildOfficeDecisions(declining).some((d) => d.category === "OPERATIONS"), "");
  add("decline risk high", buildRisks(declining).some((r) => r.type === "office_decline" && r.severity === "high"), "");

  // Competitive threat → risk + defend decision.
  const threat = sig({ fastestGrowingCompetitor: { name: "RE/MAX Smart", growthPct: 35 }, threatLevel: "high" });
  add("competitive risk", buildRisks(threat).some((r) => r.type === "competitive_threat" && r.severity === "high"), "");
  add("defend decision", buildOfficeDecisions(threat).some((d) => d.category === "COMPETITIVE"), "");

  // Opportunities are evidence-backed.
  const opp = sig({ expansionOpportunities: [{ name: "רמת הדר", reason: "היצע גבוה" }], swotOpportunities: [{ text: "מתחרה נחלש", evidence: "Anglo -12%" }] });
  const opps = buildOpportunities(opp);
  add("opportunities exist", opps.length > 0, "");
  add("opportunities evidence", opps.every((o) => o.evidence.length > 0), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
