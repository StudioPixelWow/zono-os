// ============================================================================
// ZONO Property Radar™ — fast filter (pure, deterministic, extremely cheap).
// This runs BEFORE any scoring and is the key to scale: it eliminates >90% of
// buyers in O(1) per buyer (no allocation-heavy work) so the expensive scoring
// only ever touches a small, relevant subset. Rules are fully configurable.
// ============================================================================
import type {
  FastFilterConfig,
  FastFilterResult,
  MatchableBuyer,
  MatchableProperty,
} from "./types";

export const DEFAULT_FAST_FILTER_CONFIG: FastFilterConfig = {
  enforceActive: true,
  enforceCity: true,
  enforceBudget: true,
  enforcePropertyType: true,
  budgetOverMaxTolerance: 0.05, // allow 5% over the stated max
  budgetUnderMinTolerance: 0.2, // allow well-below-min (cheaper is fine)
  activeStatuses: ["active"],
};

const PASS: FastFilterResult = { passed: true };

function norm(s: string): string {
  return s.trim();
}

/**
 * Decide whether a buyer is even worth scoring against a property. Returns the
 * first failing rule (so the reason is specific). A dimension with NO buyer
 * preference is treated as "open" and never rejects.
 */
export function fastFilterBuyer(
  buyer: MatchableBuyer,
  property: MatchableProperty,
  config: FastFilterConfig = DEFAULT_FAST_FILTER_CONFIG,
): FastFilterResult {
  // 1) Inactive / closed / archived buyers are never matched.
  if (config.enforceActive && !config.activeStatuses.includes(buyer.status)) {
    return { passed: false, rejectionCode: "inactive", rejectionReason: "✗ קונה לא פעיל" };
  }

  // 2) Wrong city — only when both sides have a city to compare.
  if (config.enforceCity && property.city && buyer.preferredCities.length > 0) {
    const target = norm(property.city);
    const wanted = buyer.preferredCities.some((c) => norm(c) === target);
    if (!wanted) {
      return { passed: false, rejectionCode: "wrong_city", rejectionReason: "✗ אזור לא מבוקש" };
    }
  }

  // 3) Budget impossible — price clearly above the buyer's max (with tolerance).
  if (config.enforceBudget && property.price != null) {
    if (buyer.budgetMax != null) {
      const ceiling = buyer.budgetMax * (1 + config.budgetOverMaxTolerance);
      if (property.price > ceiling) {
        return { passed: false, rejectionCode: "budget", rejectionReason: "✗ חורג מהתקציב" };
      }
    }
    if (buyer.budgetMin != null) {
      const floorPrice = buyer.budgetMin * (1 - config.budgetUnderMinTolerance);
      if (property.price < floorPrice) {
        return { passed: false, rejectionCode: "budget", rejectionReason: "✗ מתחת לטווח התקציב" };
      }
    }
  }

  // 4) Property type impossible — buyer wants specific types and this isn't one.
  if (
    config.enforcePropertyType &&
    property.propertyType &&
    buyer.preferredTypes.length > 0
  ) {
    const target = norm(property.propertyType);
    const wanted = buyer.preferredTypes.some((t) => norm(t) === target);
    if (!wanted) {
      return { passed: false, rejectionCode: "property_type", rejectionReason: "✗ סוג נכס לא מבוקש" };
    }
  }

  return PASS;
}
