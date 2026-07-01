// ============================================================================
// 🧭 ZONO Decision Engine™ — service (server-only). 27.4.
// Gathers evidence from the EXISTING intelligence engines (competitive /
// territory / inventory / competitive dashboard) and produces decision packages
// + daily briefings. READ-ONLY. No valuation / MAI / discovery changes.
// ============================================================================
import "server-only";
import { normCityKb } from "../brokerage-data/brokerage-knowledge";
import { getOfficeCompetitiveProfile, getCityCompetitiveDashboard } from "../brokerage-data/competitive-intelligence";
import { getOfficeTerritory } from "../brokerage-data/territory-intelligence";
import { getOfficeInventory } from "../brokerage-data/office-inventory";
import { computePriority } from "./priority";
import { buildOfficeDecisions, businessScore, aiConfidence } from "./planner";
import { buildRisks, buildOpportunities } from "./risk-opportunity";
import {
  DECISION_ENGINE_VERSION,
  type DecisionPackage, type DailyBriefing, type OfficeDecisionSignals, type Decision, type Risk, type Opportunity,
} from "./types";

/** Decision package for one office. */
export async function getOfficeDecisionPackage(officeId: string): Promise<DecisionPackage | null> {
  const [comp, terr, inv] = await Promise.all([
    getOfficeCompetitiveProfile(officeId).catch(() => null),
    getOfficeTerritory(officeId).catch(() => null),
    getOfficeInventory(officeId).catch(() => null),
  ]);
  if (!comp) return null;

  const sig: OfficeDecisionSignals = {
    officeId, officeName: comp.officeName, brand: comp.brand,
    marketRank: comp.marketRank, totalOffices: comp.totalOffices,
    listingSharePct: comp.listingSharePct, brokerSharePct: comp.brokerSharePct,
    luxurySharePct: comp.luxurySharePct, commercialSharePct: comp.commercialSharePct,
    activeListings: comp.activeListings, brokers: comp.brokers, neighborhoods: comp.neighborhoods,
    growthPct: comp.growthPct, momentum: comp.momentum, threatLevel: comp.threatLevel,
    fastestGrowingCompetitor: comp.competitors.fastestGrowing[0] ? { name: comp.competitors.fastestGrowing[0].officeName, growthPct: comp.competitors.fastestGrowing[0].value } : null,
    weakAreas: (terr?.weakAreas ?? []).map((w) => ({ name: w.name, sharePct: w.sharePct })),
    expansionOpportunities: (terr?.expansionOpportunities ?? []).map((e) => ({ name: e.name, reason: e.reason })),
    swotWeaknesses: comp.swot.weaknesses, swotThreats: comp.swot.threats, swotOpportunities: comp.swot.opportunities,
    inventoryConflicts: inv?.totals.conflicts ?? 0, stagnantListings: inv?.totals.inactive ?? 0,
    hasData: comp.activeListings > 0 || comp.brokers > 0 || (terr?.topNeighborhoods.length ?? 0) > 0,
  };

  const notes: string[] = [];
  if (!sig.hasData) notes.push("אין מספיק נתונים מקושרים למשרד — הפעל שיוך נכסי סוכנים/מחקר עיר. אין המלצות ספקולטיביות.");

  return {
    subjectType: "office", subjectId: officeId, subjectName: comp.officeName,
    businessScore: businessScore(sig), aiConfidence: aiConfidence(sig),
    decisions: buildOfficeDecisions(sig), risks: buildRisks(sig), opportunities: buildOpportunities(sig),
    notes, version: DECISION_ENGINE_VERSION,
  };
}

let _b = 0;
const bid = (p: string) => `${p}-${++_b}`;

/** Daily AI briefing for a city (Command Center). */
export async function getCityDecisionBriefing(cityRaw: string): Promise<DailyBriefing> {
  _b = 0;
  const dash = await getCityCompetitiveDashboard(cityRaw);
  const snap = dash.snapshot;
  const notes = [...dash.notes];

  const priorities: Decision[] = [];
  const conf = Math.min(100, 40 + snap.activeListings);
  const mkDecision = (category: Decision["category"], title: string, urgency: number, impact: number, evidence: string[], why: string): Decision => {
    const pr = computePriority({ businessImpact: impact, urgency, confidence: conf, timeSensitivity: urgency, marketConditions: 50 + snap.inventoryTrendPct, missingAction: true });
    return { id: bid("dec"), category, title, priorityScore: pr, executionReadiness: "needs_approval", evidence, why, actions: [{ id: bid("act"), title, priority: pr, expectedImpact: impact >= 65 ? "high" : "medium", effort: "medium", deadlineDays: 14, confidence: conf, reason: evidence[0] ?? "" }] };
  };

  if (snap.inventoryTrendPct <= -10) priorities.push(mkDecision("MARKET", "שוק בירידה — התמקד בשימור מלאי ולקוחות", 80, 70, [`מגמת מלאי ${snap.inventoryTrendPct}% ב-60 יום`, `${snap.activeListings} מודעות פעילות`], "ירידת מלאי עירונית מחייבת שימור"));
  for (const area of dash.emergingAreas.slice(0, 2)) priorities.push(mkDecision("TERRITORY", `נצל אזור מתפתח: ${area.area ?? area.title}`, 55, 65, [area.evidence], "אזור עם היצע/ביקוש וכניסת שחקנים נמוכה"));
  if (dash.topGrowing[0]) priorities.push(mkDecision("COMPETITIVE", `עקוב אחר המתחרה הצומח ${dash.topGrowing[0].officeName}`, 75, 60, [`${dash.topGrowing[0].officeName} +${dash.topGrowing[0].growthPct}% ב-60 יום`], "מתחרה בצמיחה מהירה"));
  if (dash.topDeclining[0]) priorities.push(mkDecision("COMPETITIVE", `הזדמנות: ${dash.topDeclining[0].officeName} נחלש`, 50, 55, [`${dash.topDeclining[0].officeName} ${dash.topDeclining[0].growthPct}% ב-60 יום`], "מתחרה נחלש — הזדמנות לנתח שוק"));

  const topRisks: Risk[] = [];
  if (snap.inventoryTrendPct < 0) topRisks.push({ id: bid("risk"), type: "market_decline", severity: snap.inventoryTrendPct <= -15 ? "high" : "moderate", title: "ירידת מלאי עירונית", evidence: `מגמת מלאי ${snap.inventoryTrendPct}%` });
  for (const o of dash.topDeclining.slice(0, 3)) topRisks.push({ id: bid("risk"), type: "office_decline", severity: o.growthPct <= -20 ? "high" : "moderate", title: `${o.officeName} בירידה`, evidence: `${o.growthPct}% מודעות ב-60 יום` });

  const topOpportunities: Opportunity[] = dash.emergingAreas.map((a) => ({ id: bid("opp"), type: "territory", title: a.title, evidence: a.evidence, area: a.area }));
  if (dash.highestLuxuryShare[0] && dash.highestLuxuryShare[0].value < 60) topOpportunities.push({ id: bid("opp"), type: "market", title: "שוק יוקרה פתוח", evidence: `מוביל יוקרה מחזיק ${dash.highestLuxuryShare[0].value}% בלבד`, area: null });

  return {
    city: cityRaw.trim(), cityNormalized: normCityKb(cityRaw),
    businessScore: Math.max(0, Math.min(100, Math.round(0.4 * Math.max(0, Math.min(100, 50 + snap.inventoryTrendPct)) + 0.3 * Math.min(100, snap.activeOffices * 8) + 0.3 * Math.min(100, snap.activeBrokers * 4)))),
    aiConfidence: conf,
    todaysPriorities: priorities.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 10),
    topRisks: topRisks.slice(0, 8), topOpportunities: topOpportunities.slice(0, 8),
    competitorAlerts: dash.topGrowing.slice(0, 5).map((o) => `${o.officeName} צומח +${o.growthPct}% (${o.activeListings} מודעות)`),
    brokerAlerts: dash.topBrokers.slice(0, 5).map((b) => `${b.name}: ${b.active} מודעות פעילות`),
    propertyAlerts: dash.largestInventories.slice(0, 3).map((o) => `${o.officeName} מוביל מלאי (${o.activeListings})`),
    valuationAlerts: [],
    marketAlerts: [`ריכוזיות שוק: ${snap.concentrationLevel} (HHI ${snap.marketConcentration})`, `מגמת מלאי: ${snap.inventoryTrendPct}%`, `נתח מוביל: ${snap.topOfficeSharePct}%`],
    notes, version: DECISION_ENGINE_VERSION,
  };
}
