// ============================================================================
// 🗺️ Geo Intelligence — derive GeoAreas from real market cells (pure). 32.4.
// Real metrics come straight from the market snapshot; the layers we don't yet
// measure directly are derived DETERMINISTICALLY from real signals and flagged
// `derived`. No invented facts — every derived number traces to a real input.
// ============================================================================
import type { GeoArea, GeoInsight, GeoMetrics } from "./types";
import { HEATMAP_LAYERS } from "./layers";
import { formatValue } from "./color";

/** Minimal shape we need from a MarketHeatmapCell (structurally compatible). */
export interface MarketCellInput {
  localityId: string | null;
  localityName: string;
  demand: number;
  supply: number;
  opportunity: number;
  avgPrice: number | null;
  avgPricePerSqm: number | null;
  externalListings: number;
  internalProperties: number;
  priceDrops: number;
  belowAverage: number;
  activeBuyers: number;
  matchedBuyers: number;
  transactionScore: number;
  competitionScore: number;
  momentumScore: number;
  reasons?: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

function deriveMetrics(c: MarketCellInput): GeoMetrics {
  const activeListings = c.externalListings + c.internalProperties;
  const daysOnMarket = clamp(70 + (c.supply - c.demand) * 0.4 - (c.momentumScore - 50) * 0.3, 18, 140);
  const priceGrowthPct = Number((((c.momentumScore - 50) / 50) * 12).toFixed(1));
  const adRoiScore = clamp(c.demand * 0.5 + (100 - c.competitionScore) * 0.3 + (100 - c.supply) * 0.2);
  const investorActivity = clamp(c.belowAverage * 6 + c.priceDrops * 4 + c.demand * 0.2);
  const transactions = Math.round((c.transactionScore / 100) * Math.max(4, activeListings * 0.35));
  const newListings = Math.round(c.externalListings * 0.15);
  return {
    avgPrice: c.avgPrice, pricePerSqm: c.avgPricePerSqm, activeListings,
    supply: clamp(c.supply), demandScore: clamp(c.demand), transactions,
    exclusivityPct: clamp(c.competitionScore), daysOnMarket, priceGrowthPct,
    recruitmentScore: clamp(c.opportunity), adRoiScore, newListings,
    priceReductions: c.priceDrops, investorActivity,
  };
}

function recommend(m: GeoMetrics, name: string): string {
  if (m.demandScore >= 65 && m.supply <= 45 && m.daysOnMarket <= 60)
    return `${name} מציג ביקוש גבוה, היצע נמוך וזמן מכירה קצר. מומלץ להפעיל קמפיין גיוס בלעדיות באזור.`;
  if (m.recruitmentScore >= 70)
    return `פוטנציאל גיוס גבוה ב${name} — כדאי לפנות לבעלי נכסים ולהציע ייצוג בבלעדיות.`;
  if (m.adRoiScore >= 70)
    return `${name} משתלם לפרסום: ביקוש חזק מול תחרות נמוכה. שווה להשקיע בקמפיין ממוקד.`;
  if (m.priceReductions >= 4)
    return `ריבוי ירידות מחיר ב${name} — הזדמנות לקונים ולמשא ומתן; עדכנו קונים רלוונטיים.`;
  if (m.supply >= 65 && m.demandScore < 45)
    return `היצע עודף וביקוש מתון ב${name}. התמקדו בתמחור נכון ובבידול השיווק.`;
  return `${name} יציב יחסית. עקבו אחר מגמת המחירים והביקוש לקראת חלון הזדמנות.`;
}

export function cellToArea(c: MarketCellInput): GeoArea {
  const metrics = deriveMetrics(c);
  return {
    id: c.localityId ?? `loc-${c.localityName}`,
    name: c.localityName, level: "neighborhood",
    city: null, neighborhood: c.localityName, street: null,
    propertyTypes: ["apartment"],
    metrics, reasons: c.reasons ?? [],
    aiRecommendation: recommend(metrics, c.localityName),
    derived: true, mock: false,
  };
}

/** Cross-area insights (used by the AI Insights panel). */
export function globalInsights(areas: GeoArea[]): GeoInsight[] {
  if (!areas.length) return [];
  const out: GeoInsight[] = [];
  const top = (key: keyof GeoMetrics, layerId: string, title: (a: GeoArea) => string) => {
    const best = [...areas].filter((a) => a.metrics[key] != null).sort((a, b) => (b.metrics[key] as number) - (a.metrics[key] as number))[0];
    if (best) out.push({ title: title(best), body: best.aiRecommendation, layerId });
  };
  top("recruitmentScore", "recruitment_opportunity", (a) => `הזדמנות הגיוס החזקה ביותר: ${a.name} (${formatValue(a.metrics.recruitmentScore, "score")})`);
  top("demandScore", "demand", (a) => `הביקוש הגבוה ביותר: ${a.name} (${formatValue(a.metrics.demandScore, "score")})`);
  top("adRoiScore", "ad_roi", (a) => `ה-ROI הגבוה ביותר לפרסום: ${a.name}`);
  const lowSupply = [...areas].filter((a) => a.metrics.demandScore >= 55).sort((a, b) => a.metrics.supply - b.metrics.supply)[0];
  if (lowSupply) out.push({ title: `ביקוש גבוה מול היצע נמוך: ${lowSupply.name}`, body: `שוק מוכר — ${lowSupply.name} עם היצע ${formatValue(lowSupply.metrics.supply, "score")} וביקוש ${formatValue(lowSupply.metrics.demandScore, "score")}.`, layerId: "supply" });
  const rising = [...areas].sort((a, b) => b.metrics.priceGrowthPct - a.metrics.priceGrowthPct)[0];
  if (rising && rising.metrics.priceGrowthPct > 0) out.push({ title: `המחירים עולים מהר ביותר: ${rising.name} (${formatValue(rising.metrics.priceGrowthPct, "signed_percent")})`, body: rising.aiRecommendation, layerId: "price_growth" });
  return out.slice(0, 6);
}

/** All layer ids (for QA / UI iteration). */
export const ALL_LAYER_IDS = HEATMAP_LAYERS.map((l) => l.id);
