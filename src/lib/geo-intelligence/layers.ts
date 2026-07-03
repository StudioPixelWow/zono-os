// ============================================================================
// 🗺️ Geo Intelligence — the 14 switchable heat layers (pure). 32.4.
// Each layer: id, label, icon, description, metricKey, legend + colorScale, and
// a value format. UI selection is separate from the colour logic (see color.ts).
// ============================================================================
import type { HeatLayer, GeoMetricKey } from "./types";

// Shared ramps (low → high). Distinct palettes so different layers never look
// alike — the map must never be "one colour".
const PRICE_RAMP = ["#2563EB", "#22C55E", "#FACC15", "#F97316", "#EF4444"];      // cheap→luxury
const COUNT_RAMP = ["#DBEAFE", "#60A5FA", "#2563EB", "#1E3A8A"];                 // few→crowded
const DEMAND_RAMP = ["#E0F2FE", "#38BDF8", "#F97316", "#DC2626"];               // cold→boiling
const SUPPLY_RAMP = ["#ECFEFF", "#67E8F9", "#0891B2", "#164E63"];               // scarce→flooded
const GREEN_RAMP = ["#F1F5F9", "#A7F3D0", "#34D399", "#059669"];               // weak→strong opp.
const GOLD_RAMP = ["#FEF9C3", "#FDE047", "#F59E0B", "#B45309"];                // low→high value
const TIME_RAMP = ["#DCFCE7", "#86EFAC", "#FCD34D", "#F97316", "#DC2626"];      // fast→slow (reversed meaning)
const GROWTH_RAMP = ["#DC2626", "#F97316", "#FDE047", "#4ADE80", "#16A34A"];   // fall→rise
const DROP_RAMP = ["#F1F5F9", "#FDBA74", "#FB923C", "#DC2626"];                // few→many drops
const INVEST_RAMP = ["#EDE9FE", "#C4B5FD", "#8B5CF6", "#6D28D9"];              // low→high investor
const NEW_RAMP = ["#F0FDFA", "#5EEAD4", "#14B8A6", "#0F766E"];                // few→many new
const EXCL_RAMP = ["#F5F3FF", "#DDD6FE", "#A78BFA", "#7C3AED"];               // low→high exclusivity
const AD_RAMP = ["#FDF2F8", "#FBCFE8", "#F472B6", "#BE185D"];                 // low→high ad ROI

export const HEATMAP_LAYERS: HeatLayer[] = [
  { id: "avg_price", label: "מחירי דירות", icon: "Home", description: "מחיר ממוצע לפי אזור", metricKey: "avgPrice", legend: ["זול", "ממוצע", "יקר", "יוקרתי"], colorScale: PRICE_RAMP, format: "shekel", higherIsBetter: true },
  { id: "price_per_sqm", label: 'מחיר למ״ר', icon: "Coins", description: 'מחיר ממוצע למ״ר', metricKey: "pricePerSqm", legend: ["נמוך", "בינוני", "גבוה", "גבוה מאוד"], colorScale: PRICE_RAMP, format: "shekel_sqm", higherIsBetter: true },
  { id: "active_listings", label: "כמות נכסים", icon: "Building2", description: "כמות נכסים פעילים באזור", metricKey: "activeListings", legend: ["מעט", "בינוני", "הרבה", "עמוס"], colorScale: COUNT_RAMP, format: "count", higherIsBetter: true },
  { id: "supply", label: "היצע", icon: "Warehouse", description: "לחץ ההיצע באזור", metricKey: "supply", legend: ["מועט", "בינוני", "רב", "עודף"], colorScale: SUPPLY_RAMP, format: "score", higherIsBetter: false },
  { id: "demand", label: "ביקוש", icon: "Flame", description: "צפיות, שמירות, לידים ופניות", metricKey: "demandScore", legend: ["נמוך", "בינוני", "גבוה", "רותח"], colorScale: DEMAND_RAMP, format: "score", higherIsBetter: true },
  { id: "transactions", label: "עסקאות", icon: "Handshake", description: "עסקאות שנסגרו בתקופה", metricKey: "transactions", legend: ["מעט", "בינוני", "הרבה", "שוק פעיל"], colorScale: GREEN_RAMP, format: "count", higherIsBetter: true },
  { id: "exclusivity", label: "בלעדיות", icon: "ShieldCheck", description: "אחוז נכסי בלעדיות באזור", metricKey: "exclusivityPct", legend: ["נמוך", "בינוני", "גבוה", "שליטה"], colorScale: EXCL_RAMP, format: "percent", higherIsBetter: true },
  { id: "days_on_market", label: "זמן מכירה", icon: "Clock", description: "מספר ימים ממוצע למכירה", metricKey: "daysOnMarket", legend: ["מהיר", "סביר", "איטי", "תקוע"], colorScale: TIME_RAMP, format: "days", higherIsBetter: false },
  { id: "price_growth", label: "עליית מחירים", icon: "TrendingUp", description: "שינוי מחיר באחוזים", metricKey: "priceGrowthPct", legend: ["ירידה", "יציב", "עלייה", "זינוק"], colorScale: GROWTH_RAMP, format: "signed_percent", higherIsBetter: true },
  { id: "recruitment_opportunity", label: "הזדמנויות גיוס", icon: "Target", description: "איפה הכי כדאי לגייס בלעדיות", metricKey: "recruitmentScore", legend: ["חלש", "סביר", "טוב", "הזדמנות חזקה"], colorScale: GREEN_RAMP, format: "score", higherIsBetter: true },
  { id: "ad_roi", label: "ROI לפרסום", icon: "Megaphone", description: "ציון כדאיות לפרסום באזור", metricKey: "adRoiScore", legend: ["נמוך", "בינוני", "גבוה", "מצוין"], colorScale: AD_RAMP, format: "score", higherIsBetter: true },
  { id: "new_listings", label: "נכסים חדשים", icon: "FilePlus2", description: "נכסים שעלו בתקופה האחרונה", metricKey: "newListings", legend: ["מעט", "בינוני", "הרבה", "גל חדש"], colorScale: NEW_RAMP, format: "count", higherIsBetter: true },
  { id: "price_reductions", label: "נכסים שירדו במחיר", icon: "TrendingDown", description: "כמות/אחוז ירידות מחיר", metricKey: "priceReductions", legend: ["מעט", "בינוני", "הרבה", "לחץ מחירים"], colorScale: DROP_RAMP, format: "count", higherIsBetter: false },
  { id: "investor_activity", label: "משקיעים פעילים", icon: "Wallet", description: "ריכוז פעילות משקיעים באזור", metricKey: "investorActivity", legend: ["נמוך", "בינוני", "גבוה", "חם למשקיעים"], colorScale: INVEST_RAMP, format: "score", higherIsBetter: true },
];

// Gold ramp is intentionally available for future value layers.
export const _GOLD_RAMP = GOLD_RAMP;

export const LAYER_BY_ID: Record<string, HeatLayer> = Object.fromEntries(HEATMAP_LAYERS.map((l) => [l.id, l]));
export const DEFAULT_LAYER_ID = "avg_price";

export function metricValue(m: Record<GeoMetricKey, number | null>, key: GeoMetricKey): number | null {
  return m[key];
}
