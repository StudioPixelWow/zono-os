// ============================================================================
// 🏆 ZONO — Local Market Domination — engine (pure). 34.0.
// Aggregates EXISTING per-area signals (from the Market Intelligence heatmap +
// Facebook-groups intelligence) into a Domination Score per area, detects
// territory actions, builds phased plans, and assembles the dashboard model. It
// RE-SCORES nothing that engines already own — it combines their outputs. Every
// action explains WHY; everything approval-gated; nothing executes.
// ============================================================================

export type Level = "city" | "neighborhood";
export type DominationBand = "dominant" | "contested" | "weak" | "absent";

/** Normalized per-area signal (built by the server from existing engines). */
export interface AreaSignal {
  key: string; name: string; city: string | null; level: Level;
  internalListings: number; externalListings: number;   // ours vs the market
  buyerDemand: number;         // 0..100
  supply: number;              // 0..100
  competition: number;         // 0..100 pressure
  momentum: number;            // 0..100
  opportunity: number;         // 0..100 (existing opportunity score)
  priceDrops: number; activeBuyers: number; avgPrice: number | null; luxuryShare: number;
  groupCoverage: number;       // # Facebook groups covering the area
  groupLeads: number;
  campaignCoverage: number;    // # active campaigns for the area
  transactions: number;
}

export interface DominationBreakdown { marketShare: number; listingCoverage: number; demand: number; competition: number; groupCoverage: number; campaignCoverage: number; momentum: number }
export interface AreaDomination {
  key: string; name: string; city: string | null; level: Level;
  dominationScore: number; band: DominationBand; confidence: number;
  marketShare: number; breakdown: DominationBreakdown; evidence: string[];
}

export type ActionKind =
  | "no_listings" | "weak_listings" | "no_marketing" | "weak_groups" | "strong_competitor"
  | "growing_demand" | "luxury_opportunity" | "rental_opportunity" | "investment_opportunity" | "missing_content";
export interface TerritoryAction { areaKey: string; areaName: string; kind: ActionKind; title: string; why: string; evidence: string[]; priority: number; impact: "low" | "medium" | "high"; cta: { href: string; label: string } }

export interface PlanTask { area: string; task: string; kind: string; requiresApproval: boolean }
export interface DominationPlan { horizon: "7d" | "30d" | "90d"; label: string; tasks: PlanTask[] }

export interface DominationDashboard {
  generatedAt: string;
  summary: { areas: number; avgScore: number; dominant: number; contested: number; weak: number; absent: number; coverage: number };
  areas: AreaDomination[];
  topOpportunities: AreaDomination[];
  weakAreas: AreaDomination[];
  missingAreas: AreaDomination[];
  actionQueue: TerritoryAction[];
  plans: DominationPlan[];
  notes: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const CAMPAIGN_WIZARD = "/distribution/campaign-wizard";
const GROUPS_INTEL = "/distribution/groups/intelligence";

export function scoreArea(a: AreaSignal): AreaDomination {
  const totalMarket = a.internalListings + a.externalListings;
  const marketShare = totalMarket > 0 ? clamp((a.internalListings / totalMarket) * 100) : (a.internalListings > 0 ? 100 : 0);
  const listingCoverage = clamp(Math.min(100, a.internalListings * 12));
  const demand = clamp(a.buyerDemand);
  const competitionInv = clamp(100 - a.competition);
  const groupCov = clamp(Math.min(100, a.groupCoverage * 20));
  const campaignCov = clamp(Math.min(100, a.campaignCoverage * 34));
  const momentum = clamp(a.momentum);

  const dominationScore = clamp(
    marketShare * 0.28 + listingCoverage * 0.16 + demand * 0.12 + competitionInv * 0.12 +
    groupCov * 0.12 + campaignCov * 0.12 + momentum * 0.08,
  );
  const band: DominationBand = a.internalListings === 0 && a.externalListings > 0 ? "absent" : dominationScore >= 65 ? "dominant" : dominationScore >= 38 ? "contested" : "weak";

  // Confidence from data volume (listings + transactions + market presence).
  const volume = a.internalListings + a.externalListings + a.transactions + a.activeBuyers;
  const confidence = clamp(35 + Math.min(50, volume * 2) + (a.groupCoverage > 0 ? 5 : 0));

  const evidence = [
    `נתח שוק ${marketShare}% (${a.internalListings}/${totalMarket} נכסים)`,
    `ביקוש ${demand} · תחרות ${a.competition}`,
    a.groupCoverage ? `${a.groupCoverage} קבוצות` : "אין כיסוי קבוצות",
    a.campaignCoverage ? `${a.campaignCoverage} קמפיינים` : "אין קמפיינים",
  ];
  return { key: a.key, name: a.name, city: a.city, level: a.level, dominationScore, band, confidence, marketShare, breakdown: { marketShare, listingCoverage, demand, competition: a.competition, groupCoverage: groupCov, campaignCoverage: campaignCov, momentum }, evidence };
}

export function detectTerritoryActions(a: AreaSignal, dom: AreaDomination): TerritoryAction[] {
  const out: TerritoryAction[] = [];
  const A = (kind: ActionKind, title: string, why: string, evidence: string[], priority: number, impact: TerritoryAction["impact"], cta: TerritoryAction["cta"]): TerritoryAction => ({ areaKey: a.key, areaName: a.name, kind, title, why, evidence, priority, impact, cta });

  if (a.internalListings === 0 && a.externalListings > 0) out.push(A("no_listings", `אין מלאי ב${a.name}`, `${a.externalListings} נכסים בשוק ואין לנו ולו נכס אחד — הזדמנות גיוס.`, [`${a.externalListings} נכסים בשוק`], 95, "high", { href: CAMPAIGN_WIZARD, label: "גיוס מלאי" }));
  else if (a.internalListings <= 2 && a.externalListings >= 10) out.push(A("weak_listings", `מלאי חלש ב${a.name}`, `רק ${a.internalListings} נכסים מול ${a.externalListings} בשוק — כדאי לחזק אחיזה.`, [`${a.internalListings}/${a.internalListings + a.externalListings}`], 80, "high", { href: CAMPAIGN_WIZARD, label: "גיוס מוכרים" }));

  if (a.campaignCoverage === 0 && a.internalListings > 0) out.push(A("no_marketing", `אין שיווק ב${a.name}`, "יש נכסים בייצוג אך אין קמפיין פעיל — חשיפה חסרה.", [`${a.internalListings} נכסים · 0 קמפיינים`], 88, "high", { href: CAMPAIGN_WIZARD, label: "השקת קמפיין" }));
  if (a.groupCoverage === 0) out.push(A("weak_groups", `אין כיסוי קבוצות ב${a.name}`, "אין קבוצות פייסבוק לאזור — הוסיפו קבוצות להגברת חשיפה.", ["0 קבוצות"], 62, "medium", { href: GROUPS_INTEL, label: "מודיעין קבוצות" }));

  if (a.competition >= 65 && dom.marketShare < 40) out.push(A("strong_competitor", `מתחרה חזק ב${a.name}`, `לחץ תחרות גבוה (${a.competition}) ונתח שוק נמוך — נדרש מהלך אגרסיבי.`, [`תחרות ${a.competition}`, `נתח ${dom.marketShare}%`], 76, "high", { href: CAMPAIGN_WIZARD, label: "מהלך תחרותי" }));
  if (a.buyerDemand >= 65 && a.momentum >= 55) out.push(A("growing_demand", `ביקוש עולה ב${a.name}`, `ביקוש גבוה ומומנטום חיובי — חלון להגדלת נוכחות.`, [`ביקוש ${a.buyerDemand}`, `מומנטום ${a.momentum}`], 70, "medium", { href: CAMPAIGN_WIZARD, label: "ניצול ביקוש" }));

  if (a.luxuryShare >= 25) out.push(A("luxury_opportunity", `הזדמנות יוקרה ב${a.name}`, `${Math.round(a.luxuryShare)}% מההיצע יוקרה — קמפיין יוקרה ממוקד.`, [`${Math.round(a.luxuryShare)}% יוקרה`], 66, "medium", { href: CAMPAIGN_WIZARD, label: "קמפיין יוקרה" }));
  if (a.priceDrops >= 4) out.push(A("investment_opportunity", `הזדמנות השקעה ב${a.name}`, `${a.priceDrops} ירידות מחיר — פנייה למשקיעים.`, [`${a.priceDrops} ירידות מחיר`], 58, "medium", { href: CAMPAIGN_WIZARD, label: "פנייה למשקיעים" }));
  if (a.campaignCoverage === 0 && a.groupCoverage === 0 && a.externalListings > 0) out.push(A("missing_content", `אין תוכן/נוכחות ב${a.name}`, "אין קמפיין, אין קבוצות — האזור לא מכוסה שיווקית.", ["0 קמפיינים · 0 קבוצות"], 64, "medium", { href: CAMPAIGN_WIZARD, label: "בניית נוכחות" }));

  return out;
}

export function buildPlans(actions: TerritoryAction[]): DominationPlan[] {
  const byPriority = [...actions].sort((a, b) => b.priority - a.priority);
  const toTask = (a: TerritoryAction): PlanTask => ({ area: a.areaName, task: a.title, kind: a.kind, requiresApproval: true });
  return [
    { horizon: "7d", label: "7 ימים — רווחים מהירים", tasks: byPriority.filter((a) => a.priority >= 80).slice(0, 6).map(toTask) },
    { horizon: "30d", label: "30 יום — ביסוס אחיזה", tasks: byPriority.filter((a) => a.priority >= 60 && a.priority < 80).slice(0, 10).map(toTask) },
    { horizon: "90d", label: "90 יום — שליטה מלאה", tasks: byPriority.filter((a) => a.priority < 60).slice(0, 12).map(toTask) },
  ];
}

export function buildDomination(signals: AreaSignal[]): DominationDashboard {
  const areas = signals.map(scoreArea).sort((a, b) => b.dominationScore - a.dominationScore);
  const actionQueue = signals.flatMap((s) => detectTerritoryActions(s, scoreArea(s))).sort((a, b) => b.priority - a.priority);
  const plans = buildPlans(actionQueue);

  const dominant = areas.filter((a) => a.band === "dominant").length;
  const contested = areas.filter((a) => a.band === "contested").length;
  const weak = areas.filter((a) => a.band === "weak").length;
  const absent = areas.filter((a) => a.band === "absent").length;
  const avgScore = areas.length ? clamp(areas.reduce((s, a) => s + a.dominationScore, 0) / areas.length) : 0;
  const coverage = areas.length ? clamp(((dominant + contested) / areas.length) * 100) : 0;

  const notes: string[] = [];
  if (!areas.length) notes.push("אין עדיין נתוני שוק — חשבו מדדי שוק כדי לבנות אסטרטגיית שליטה.");

  return {
    generatedAt: new Date().toISOString(),
    summary: { areas: areas.length, avgScore, dominant, contested, weak, absent, coverage },
    areas,
    topOpportunities: [...signals].map(scoreArea).filter((a, i) => (signals[i].buyerDemand >= 55 || signals[i].externalListings >= 8) && a.band !== "dominant").sort((a, b) => (b.breakdown.demand - b.dominationScore) - (a.breakdown.demand - a.dominationScore)).slice(0, 8),
    weakAreas: areas.filter((a) => a.band === "weak").slice(0, 8),
    missingAreas: areas.filter((a) => a.band === "absent").slice(0, 8),
    actionQueue: actionQueue.slice(0, 20),
    plans, notes,
  };
}
