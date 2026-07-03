// ============================================================================
// 🌐 AI Brokerage Website — public-safe redaction (pure). 32.1. Part: SECURITY.
// The single security boundary: converts internal intelligence into public-safe
// presentations and NEVER leaks internal notes, private missions, hidden
// workflows, churn/risk or raw internal scores. Evidence-only.
// ============================================================================
import type { TrustTier, DemandLevel, MarketPosition, PropertyBadges, SiteListingInput } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function trustTier(truthScore: number | null): TrustTier {
  if (truthScore == null) return "listed";
  return truthScore >= 70 ? "verified" : truthScore >= 45 ? "reviewed" : "listed";
}
export function demandLevel(score: number | null): DemandLevel {
  if (score == null) return "low";
  return score >= 66 ? "high" : score >= 40 ? "medium" : "low";
}
export function marketPosition(p: MarketPosition): MarketPosition { return p; }

// A small whitelist of PUBLIC-FRIENDLY strategy labels. Unknown/internal-only
// strategies map to null so no internal code is ever exposed.
const PUBLIC_STRATEGY: Record<string, string> = {
  reduce_price: "מחיר מותאם לשוק", price_reduction: "מחיר מותאם לשוק", price_alignment: "מחיר מותאם לשוק",
  hold: "מחיר יציב", keep: "מחיר יציב",
  refresh_marketing: "בקידום פעיל", launch_campaign: "בקידום פעיל", premium_exposure: "חשיפה מוגברת",
  luxury_campaign: "נכס יוקרה", open_house: "בית פתוח בקרוב", aggressive_selling: "למכירה מהירה",
};
export function publicStrategyLabel(strategy: string): string | null { return PUBLIC_STRATEGY[strategy] ?? null; }

export function badgesFor(l: SiteListingInput): PropertyBadges {
  const domBand = l.domBand === "very_slow" ? "slow" : l.domBand;
  return {
    trust: trustTier(l.truthScore),
    demand: demandLevel(l.buyerDemandScore),
    marketScore: l.marketScore != null ? clamp(l.marketScore) : null,
    pricePosition: l.valuationAvailable ? l.rangePosition : "unknown",
    priceGapPct: l.valuationAvailable ? l.priceGapPct : null,
    matchingBuyers: Math.max(0, Math.min(99, Math.round(l.matchingBuyers))),   // COUNT only
    domBand: (domBand as PropertyBadges["domBand"]) ?? null,
    competition: l.competitionPressure != null ? demandLevel(l.competitionPressure) : null,
    strategyLabel: publicStrategyLabel(l.strategy),
  };
}

// ── QA guard: no forbidden internal terms leak into a serialized view model ──
const FORBIDDEN = ["note", "internal", "mission", "workflow", "churn", "risk", "businessScore", "executionScore", "truthScore", "priorityScore", "createdBy", "org_id", "organization_id", "secret"];
export function containsForbidden(obj: unknown): string | null {
  const json = JSON.stringify(obj ?? {});
  for (const key of FORBIDDEN) {
    // Match as a JSON key ("key":) so evidence prose isn't falsely flagged.
    if (new RegExp(`"${key}"\\s*:`).test(json)) return key;
  }
  return null;
}
