// ============================================================================
// 🗺️ Geo Intelligence — structured mock areas (pure). 32.4.
// Used ONLY when the org has no market snapshots yet, so the Smart Map still
// works visually. Every area is flagged `mock` and clearly labelled in the UI.
// Realistic Israeli neighborhoods across a few cities + a couple of streets.
// ============================================================================
import type { GeoArea, GeoMetrics } from "./types";

interface Spec {
  city: string; neighborhood: string; street?: string; types: string[];
  avgPrice: number; pricePerSqm: number; listings: number; supply: number; demand: number;
  transactions: number; exclusivityPct: number; dom: number; growth: number;
  recruitment: number; adRoi: number; newListings: number; drops: number; investor: number;
}

const SPECS: Spec[] = [
  { city: "תל אביב", neighborhood: "נאות אפקה", types: ["apartment", "penthouse"], avgPrice: 4820000, pricePerSqm: 42500, listings: 126, supply: 38, demand: 88, transactions: 31, exclusivityPct: 72, dom: 54, growth: 8.3, recruitment: 95, adRoi: 90, newListings: 22, drops: 3, investor: 68 },
  { city: "תל אביב", neighborhood: "לב העיר", types: ["apartment", "studio"], avgPrice: 3650000, pricePerSqm: 51000, listings: 210, supply: 62, demand: 82, transactions: 40, exclusivityPct: 48, dom: 62, growth: 5.1, recruitment: 74, adRoi: 71, newListings: 34, drops: 9, investor: 80 },
  { city: "תל אביב", neighborhood: "צפון הישן", types: ["apartment", "penthouse", "garden"], avgPrice: 6900000, pricePerSqm: 58000, listings: 88, supply: 30, demand: 76, transactions: 18, exclusivityPct: 66, dom: 71, growth: 6.4, recruitment: 82, adRoi: 79, newListings: 12, drops: 2, investor: 55 },
  { city: "תל אביב", neighborhood: "פלורנטין", street: "רחוב אברבנאל", types: ["studio", "apartment"], avgPrice: 2650000, pricePerSqm: 46000, listings: 140, supply: 55, demand: 90, transactions: 27, exclusivityPct: 41, dom: 48, growth: 9.6, recruitment: 88, adRoi: 84, newListings: 29, drops: 5, investor: 92 },
  { city: "תל אביב", neighborhood: "רמת אביב", types: ["apartment", "garden"], avgPrice: 5300000, pricePerSqm: 47000, listings: 96, supply: 44, demand: 70, transactions: 20, exclusivityPct: 58, dom: 66, growth: 3.8, recruitment: 69, adRoi: 66, newListings: 15, drops: 4, investor: 47 },
  { city: "רמת גן", neighborhood: "מרכז", types: ["apartment"], avgPrice: 2950000, pricePerSqm: 34000, listings: 168, supply: 68, demand: 64, transactions: 26, exclusivityPct: 39, dom: 78, growth: 2.1, recruitment: 58, adRoi: 55, newListings: 24, drops: 12, investor: 61 },
  { city: "רמת גן", neighborhood: "שכונת הלל", types: ["apartment", "garden"], avgPrice: 3200000, pricePerSqm: 33000, listings: 110, supply: 40, demand: 72, transactions: 19, exclusivityPct: 63, dom: 58, growth: 4.9, recruitment: 77, adRoi: 73, newListings: 16, drops: 3, investor: 44 },
  { city: "גבעתיים", neighborhood: "בורוכוב", types: ["apartment"], avgPrice: 3050000, pricePerSqm: 36000, listings: 92, supply: 35, demand: 79, transactions: 22, exclusivityPct: 61, dom: 51, growth: 6.9, recruitment: 84, adRoi: 81, newListings: 14, drops: 2, investor: 50 },
  { city: "הרצליה", neighborhood: "הרצליה פיתוח", types: ["villa", "penthouse"], avgPrice: 9800000, pricePerSqm: 61000, listings: 64, supply: 28, demand: 66, transactions: 11, exclusivityPct: 70, dom: 84, growth: 5.7, recruitment: 80, adRoi: 74, newListings: 8, drops: 1, investor: 38 },
  { city: "הרצליה", neighborhood: "נווה עמל", types: ["apartment", "garden"], avgPrice: 3400000, pricePerSqm: 32000, listings: 120, supply: 58, demand: 60, transactions: 17, exclusivityPct: 45, dom: 74, growth: 1.4, recruitment: 55, adRoi: 52, newListings: 20, drops: 8, investor: 40 },
  { city: "ראשון לציון", neighborhood: "נחלת יהודה", types: ["apartment", "garden"], avgPrice: 2450000, pricePerSqm: 28000, listings: 180, supply: 72, demand: 58, transactions: 30, exclusivityPct: 36, dom: 82, growth: 0.6, recruitment: 52, adRoi: 49, newListings: 31, drops: 14, investor: 57 },
  { city: "ראשון לציון", neighborhood: "אברמוביץ׳", street: "רחוב רוטשילד", types: ["apartment"], avgPrice: 2600000, pricePerSqm: 29500, listings: 134, supply: 50, demand: 68, transactions: 24, exclusivityPct: 47, dom: 63, growth: 3.2, recruitment: 66, adRoi: 62, newListings: 22, drops: 6, investor: 63 },
];

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

function specToArea(s: Spec, i: number): GeoArea {
  const metrics: GeoMetrics = {
    avgPrice: s.avgPrice, pricePerSqm: s.pricePerSqm, activeListings: s.listings,
    supply: clamp(s.supply), demandScore: clamp(s.demand), transactions: s.transactions,
    exclusivityPct: clamp(s.exclusivityPct), daysOnMarket: s.dom, priceGrowthPct: s.growth,
    recruitmentScore: clamp(s.recruitment), adRoiScore: clamp(s.adRoi), newListings: s.newListings,
    priceReductions: s.drops, investorActivity: clamp(s.investor),
  };
  const rec = metrics.demandScore >= 65 && metrics.supply <= 45 && metrics.daysOnMarket <= 60
    ? `${s.neighborhood} מציג ביקוש גבוה, ירידה בהיצע וזמן מכירה קצר. מומלץ להפעיל קמפיין גיוס בלעדיות באזור זה.`
    : metrics.recruitmentScore >= 70
      ? `פוטנציאל גיוס גבוה ב${s.neighborhood} — כדאי לפנות לבעלי נכסים ולהציע ייצוג בבלעדיות.`
      : `${s.neighborhood} יציב יחסית. עקבו אחר מגמת המחירים והביקוש לזיהוי חלון הזדמנות.`;
  return {
    id: `mock-${i}-${s.neighborhood}`,
    name: s.street ? `${s.neighborhood} · ${s.street}` : s.neighborhood,
    level: s.street ? "street" : "neighborhood",
    city: s.city, neighborhood: s.neighborhood, street: s.street ?? null,
    propertyTypes: s.types, metrics,
    reasons: [`ביקוש ${metrics.demandScore}/100`, `היצע ${metrics.supply}/100`, `זמן מכירה ${metrics.daysOnMarket} ימים`],
    aiRecommendation: rec, derived: false, mock: true,
  };
}

export function generateMockAreas(): GeoArea[] {
  return SPECS.map(specToArea);
}
