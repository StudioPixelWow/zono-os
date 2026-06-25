// ============================================================================
// ZONO — Office KPI cards (pure). Builds clickable KPI cards with change vs
// yesterday / last week + a sparkline series, from already-aggregated KPIs.
// ============================================================================
import { pctChange } from "./analytics";
import type { KpiCard, OfficeKpiKey, OfficeKpis } from "./types";

const META: Record<OfficeKpiKey, { label: string; format: KpiCard["format"] }> = {
  activeListings: { label: "נכסים פעילים", format: "int" },
  externalListingsMonitored: { label: "מודעות במעקב", format: "int" },
  privateListings: { label: "נכסים פרטיים", format: "int" },
  exclusiveListings: { label: "בלעדיות", format: "int" },
  newListingsToday: { label: "נכסים חדשים היום", format: "int" },
  priceDropsToday: { label: "ירידות מחיר היום", format: "int" },
  hotDeals: { label: "עסקאות חמות", format: "int" },
  backOnMarket: { label: "חזרו לשוק", format: "int" },
  buyerMatchesToday: { label: "התאמות קונים היום", format: "int" },
  perfectMatches: { label: "התאמות מושלמות", format: "int" },
  sellerOpportunities: { label: "הזדמנויות מוכרים", format: "int" },
  highExclusiveProbability: { label: "סבירות בלעדיות גבוהה", format: "int" },
  callsToday: { label: "שיחות היום", format: "int" },
  whatsappsToday: { label: "וואטסאפ היום", format: "int" },
  meetingsToday: { label: "פגישות היום", format: "int" },
  tasksDue: { label: "משימות לביצוע", format: "int" },
  overdueTasks: { label: "משימות באיחור", format: "int" },
  dealsInProgress: { label: "עסקאות בתהליך", format: "int" },
  estimatedPipeline: { label: "צפי פייפליין", format: "currency" },
  estimatedCommission: { label: "צפי עמלות", format: "currency" },
  creditsUsed: { label: "קרדיטים שנוצלו", format: "int" },
  creditsSaved: { label: "קרדיטים שנחסכו", format: "int" },
  duplicateScansAvoided: { label: "סריקות כפולות שנחסכו", format: "int" },
  providerQualityScore: { label: "איכות ספקים", format: "percent" },
};

const ORDER: OfficeKpiKey[] = [
  "newListingsToday", "privateListings", "exclusiveListings", "priceDropsToday", "hotDeals", "backOnMarket",
  "buyerMatchesToday", "perfectMatches", "sellerOpportunities", "highExclusiveProbability",
  "callsToday", "whatsappsToday", "meetingsToday", "tasksDue", "overdueTasks", "dealsInProgress",
  "estimatedPipeline", "estimatedCommission", "activeListings", "externalListingsMonitored",
  "creditsUsed", "creditsSaved", "duplicateScansAvoided", "providerQualityScore",
];

export function buildKpiCards(kpis: OfficeKpis, prevDay?: Partial<OfficeKpis> | null, prevWeek?: Partial<OfficeKpis> | null): KpiCard[] {
  return ORDER.map((key) => {
    const value = kpis[key];
    const y = prevDay?.[key];
    const w = prevWeek?.[key];
    return {
      key, label: META[key].label, value, format: META[key].format,
      changeVsYesterday: typeof y === "number" ? pctChange(value, y) : null,
      changeVsLastWeek: typeof w === "number" ? pctChange(value, w) : null,
      spark: [],
    };
  });
}
