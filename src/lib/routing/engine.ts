/**
 * Lead Routing Intelligence — Agent Twin scoring + lead-fit ranking.
 * Pure, client-safe, deterministic, no LLM. The brain that answers
 * "who should receive this lead and why?".
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── Agent Twin inputs ────────────────────────────────────────────────────────
export interface AgentTwinInput {
  activeLeads: number;
  activeBuyers: number;
  activeSellers: number;
  activeProperties: number;
  activeMatches: number;
  closedDeals: number;
  lostDeals: number;
  totalLeadsHandled: number;
  totalRevenue: number;
  avgDaysToClose: number | null;
  recentDeals90d: number;
  localitiesCovered: number;
  propertyTypesCovered: number;
  maxLocalityDeals: number;
  avgResponseMinutes: number | null;
}

// ── 10 score functions ───────────────────────────────────────────────────────
export function calculateConversionScore(i: AgentTwinInput): number {
  if (i.totalLeadsHandled === 0) return 40;
  return clamp((i.closedDeals / i.totalLeadsHandled) * 130);
}

export function calculateResponsivenessScore(i: AgentTwinInput): number {
  if (i.avgResponseMinutes == null) return 55;
  if (i.avgResponseMinutes <= 15) return 95;
  if (i.avgResponseMinutes <= 60) return 80;
  if (i.avgResponseMinutes <= 240) return 60;
  if (i.avgResponseMinutes <= 1440) return 40;
  return 25;
}

export function calculateExpertiseScore(i: AgentTwinInput): number {
  return clamp(Math.min(60, i.propertyTypesCovered * 15) + Math.min(40, i.closedDeals * 4));
}

export function calculateTerritoryScore(i: AgentTwinInput): number {
  return clamp(Math.min(70, i.maxLocalityDeals * 8) + Math.min(30, i.localitiesCovered * 8));
}

export function calculateCustomerScore(i: AgentTwinInput): number {
  return clamp(Math.min(60, (i.activeBuyers + i.activeSellers) * 5) + Math.min(40, i.closedDeals * 4));
}

/** Higher = more spare capacity (a positive for routing). */
export function calculateWorkloadScore(i: AgentTwinInput): number {
  const load = i.activeLeads * 3 + i.activeMatches * 2 + (i.activeBuyers + i.activeSellers);
  return clamp(100 - load * 2);
}

export function calculateMomentumScore(i: AgentTwinInput): number {
  return clamp(40 + i.recentDeals90d * 12);
}

export function calculateSatisfactionScore(i: AgentTwinInput): number {
  // Proxy from win/loss until survey data exists.
  const total = i.closedDeals + i.lostDeals;
  if (total === 0) return 60;
  return clamp(50 + (i.closedDeals / total) * 50);
}

export function calculateReliabilityScore(i: AgentTwinInput): number {
  const total = i.closedDeals + i.lostDeals;
  let s = total === 0 ? 55 : 40 + (i.closedDeals / total) * 50;
  if (i.avgDaysToClose != null && i.avgDaysToClose <= 60) s += 8;
  return clamp(s);
}

export interface AgentScores {
  agent_score: number; territory_score: number; conversion_score: number; responsiveness_score: number;
  expertise_score: number; customer_score: number; workload_score: number; momentum_score: number;
  satisfaction_score: number; reliability_score: number;
}

export function calculateAgentScore(i: AgentTwinInput): AgentScores {
  const conversion = calculateConversionScore(i);
  const responsiveness = calculateResponsivenessScore(i);
  const expertise = calculateExpertiseScore(i);
  const territory = calculateTerritoryScore(i);
  const customer = calculateCustomerScore(i);
  const workload = calculateWorkloadScore(i);
  const momentum = calculateMomentumScore(i);
  const satisfaction = calculateSatisfactionScore(i);
  const reliability = calculateReliabilityScore(i);
  // Overall performance (workload is a routing modifier, not core ability).
  const agent = clamp(conversion * 0.28 + reliability * 0.16 + expertise * 0.16 + territory * 0.14 + responsiveness * 0.12 + momentum * 0.08 + customer * 0.06);
  return { agent_score: agent, territory_score: territory, conversion_score: conversion, responsiveness_score: responsiveness, expertise_score: expertise, customer_score: customer, workload_score: workload, momentum_score: momentum, satisfaction_score: satisfaction, reliability_score: reliability };
}

export function deriveStrengths(s: AgentScores): { strengths: string[]; weaknesses: string[]; growth: string } {
  const map: { key: keyof AgentScores; label: string }[] = [
    { key: "territory_score", label: "טריטוריה" }, { key: "conversion_score", label: "המרה" },
    { key: "responsiveness_score", label: "זמינות" }, { key: "expertise_score", label: "מומחיות נכסים" },
    { key: "customer_score", label: "ניהול לקוחות" }, { key: "momentum_score", label: "מומנטום" },
    { key: "reliability_score", label: "אמינות" },
  ];
  const ranked = [...map].sort((a, b) => (s[b.key] as number) - (s[a.key] as number));
  const strengths = ranked.filter((r) => (s[r.key] as number) >= 65).slice(0, 3).map((r) => r.label);
  const weaknesses = [...ranked].reverse().filter((r) => (s[r.key] as number) < 45).slice(0, 2).map((r) => r.label);
  const growth = weaknesses[0] ? `שיפור ${weaknesses[0]}` : `העמקת ${ranked[0].label}`;
  return { strengths: strengths.length ? strengths : [ranked[0].label], weaknesses, growth };
}

// ── Lead routing: fit of one agent to one lead ───────────────────────────────
export interface LeadContext {
  locality: string | null;
  propertyType: string | null;
  dealType: string | null;
  leadScore: number | null; // 0..100
}

export interface AgentForRouting {
  userId: string;
  name: string;
  scores: AgentScores;
  avgDaysToClose: number | null;
  avgDealValue: number;
  localityDeals: number; // agent's deals in the lead's locality
  localityConversion: number; // %
  propertyTypeConversion: number; // %
  propertyTypeDeals: number;
}

export interface RoutingCandidate {
  userId: string; name: string; rank: number; score: number; probability: number;
  expectedDaysToClose: number | null; expectedRevenue: number; reasons: string[];
}

const confidence = (n: number) => clamp(50 + Math.min(40, n * 5));

/** Score how well an agent fits a specific lead (0..100) + expected outcomes. */
export function scoreAgentForLead(lead: LeadContext, a: AgentForRouting): { score: number; probability: number; reasons: string[]; expectedDays: number | null; expectedRevenue: number } {
  const reasons: string[] = [];
  // Territory fit
  let territoryFit = 50;
  if (a.localityDeals >= 8) { territoryFit = 95; reasons.push(`${a.localityDeals} עסקאות באזור`); }
  else if (a.localityDeals >= 3) { territoryFit = 78; reasons.push(`ניסיון באזור (${a.localityDeals} עסקאות)`); }
  else if (a.localityDeals >= 1) territoryFit = 62;
  else territoryFit = a.scores.territory_score * 0.4;

  // Property-type expertise fit
  let propFit = 50;
  if (a.propertyTypeDeals >= 5) { propFit = 90; reasons.push("מומחיות בסוג הנכס"); }
  else if (a.propertyTypeDeals >= 2) propFit = 72;
  else propFit = a.scores.expertise_score * 0.5;

  if (a.scores.responsiveness_score >= 80) reasons.push("תגובה מהירה");
  if (a.scores.conversion_score >= 70) reasons.push("המרה גבוהה");
  if (a.scores.workload_score < 35) reasons.push("⚠ עומס גבוה");

  // Composite fit — performance + lead-specific fit, modified by capacity.
  let fit = a.scores.conversion_score * 0.26 + territoryFit * 0.24 + propFit * 0.18 + a.scores.responsiveness_score * 0.14 + a.scores.reliability_score * 0.10;
  fit += a.scores.workload_score * 0.08; // capacity bonus
  const score = clamp(fit);

  // Expected conversion blends agent conversion + fit + lead quality.
  const leadQ = lead.leadScore ?? 55;
  const probability = clamp(a.scores.conversion_score * 0.45 + score * 0.35 + leadQ * 0.20);
  const expectedDays = a.avgDaysToClose;
  const expectedRevenue = Math.round(a.avgDealValue * (probability / 100));
  if (!reasons.length) reasons.push("התאמה כללית");
  return { score, probability, reasons, expectedDays, expectedRevenue };
}

export function rankAgentsForLead(lead: LeadContext, agents: AgentForRouting[]): RoutingCandidate[] {
  return agents
    .map((a) => { const r = scoreAgentForLead(lead, a); return { userId: a.userId, name: a.name, score: r.score, probability: r.probability, expectedDaysToClose: r.expectedDays, expectedRevenue: r.expectedRevenue, reasons: r.reasons }; })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export function routingConfidence(candidates: RoutingCandidate[]): number {
  if (candidates.length < 2) return candidates.length ? 70 : 0;
  return confidence(candidates[0].score - candidates[1].score);
}

export function territoryConfidenceLabel(deals: number): string {
  return deals >= 8 ? "גבוה מאוד" : deals >= 4 ? "גבוה" : deals >= 1 ? "בינוני" : "נמוך";
}
