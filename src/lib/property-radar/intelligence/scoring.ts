// ============================================================================
// ZONO Property Radar™ — opportunity scoring (pure, deterministic, client-safe).
// Turns a normalized listing + context into a 0–100 opportunity score with an
// explainable Hebrew breakdown. No I/O, no randomness.
// ============================================================================
import type { NormalizedListingMetadata } from "../providers/types";
import type { PropertyRadarArea } from "../providers/types";
import type {
  OpportunityScoreBreakdown,
  OpportunityScoreInput,
  OpportunityScoreResult,
} from "./types";

const RARE_PROPERTY_TYPES: Record<string, number> = {
  פנטהאוז: 10,
  "דירת גג": 10,
  דופלקס: 8,
  "דירת גן": 6,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function freshnessPoints(publishedAt: string | null | undefined): { points: number; reason?: string } {
  if (!publishedAt) return { points: 0 };
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return { points: 0 };
  const ageMin = (Date.now() - ms) / 60000;
  if (ageMin < 0) return { points: 15, reason: "פורסם ממש עכשיו" };
  if (ageMin <= 30) return { points: 15, reason: "פורסם בחצי השעה האחרונה" };
  if (ageMin <= 120) return { points: 10, reason: "פורסם בשעתיים האחרונות" };
  if (ageMin <= 1440) return { points: 5, reason: "פורסם ב‑24 השעות האחרונות" };
  return { points: 0 };
}

function marketPricePoints(
  price: number | null | undefined,
  avg: number | null | undefined,
): { points: number; reason?: string } {
  if (!price || !avg || avg <= 0) return { points: 0 };
  const ratio = price / avg;
  if (ratio <= 0.92) return { points: 15, reason: "מחיר נמוך משמעותית ביחס לאזור" };
  if (ratio <= 0.96) return { points: 10, reason: "מחיר נמוך ביחס לאזור" };
  if (ratio <= 1.02) return { points: 5, reason: "מחיר תואם לאזור" };
  return { points: 0 };
}

function expertiseMatch(
  source: NormalizedListingMetadata,
  prefs: OpportunityScoreInput["agentPreferences"],
): boolean {
  if (!prefs) return false;
  const city = (source.city ?? "").trim();
  const nbhd = (source.neighborhood ?? "").trim();
  const cityMatch = !!city && (prefs.expertiseCities ?? []).some((c) => c.trim() === city);
  const nbhdMatch = !!nbhd && (prefs.expertiseNeighborhoods ?? []).some((n) => n.trim() === nbhd);
  return cityMatch || nbhdMatch;
}

function recommendationFor(total: number, isPrivate: boolean): string {
  if (total >= 80) return "הזדמנות חמה — מומלץ ליצור קשר מיד";
  if (total >= 60) return isPrivate ? "נכס פרטי חזק — שווה פנייה מהירה" : "הזדמנות טובה — שווה פנייה מהירה";
  if (total >= 40) return "כדאי לעקוב אחרי הנכס";
  return "עניין נמוך כרגע";
}

/**
 * 0–100 opportunity score. Components (max): private 25, expertise 15,
 * buyer-matches 20, freshness 15, market-price 15, rarity 10, phone 5, image 3.
 */
export function calculatePropertyOpportunityScore(
  input: OpportunityScoreInput,
): OpportunityScoreResult {
  const { source } = input;
  const buyerMatchCount = Math.max(0, input.buyerMatchCount ?? 0);
  const reasons: string[] = [];

  const isPrivate = source.listingType === "private";
  const privateListing = isPrivate ? 25 : 0;
  if (isPrivate) reasons.push("נכס פרטי");

  const isExpertise = expertiseMatch(source, input.agentPreferences);
  const expertiseArea = isExpertise ? 15 : 0;
  if (isExpertise) reasons.push("מתאים לאזור ההתמחות שלך");

  const buyerMatches = clamp(buyerMatchCount * 5, 0, 20);
  if (buyerMatchCount > 0) reasons.push(`נמצאו ${buyerMatchCount} קונים רלוונטיים`);

  const fresh = freshnessPoints(source.publishedAt);
  if (fresh.reason) reasons.push(fresh.reason);

  const market = marketPricePoints(source.price, input.marketAveragePrice);
  if (market.reason) reasons.push(market.reason);

  const rarity = source.propertyType ? RARE_PROPERTY_TYPES[source.propertyType.trim()] ?? 0 : 0;
  if (rarity > 0) reasons.push("סוג נכס מבוקש");

  const hasPhone = source.phone ? 5 : 0;
  if (hasPhone) reasons.push("יש מספר טלפון ליצירת קשר");

  const hasImage = source.imageUrl ? 3 : 0;

  const breakdown: OpportunityScoreBreakdown = {
    privateListing,
    expertiseArea,
    buyerMatches,
    freshness: fresh.points,
    marketPrice: market.points,
    rarity,
    hasPhone,
    hasImage,
  };

  const totalScore = clamp(
    Object.values(breakdown).reduce((a, b) => a + b, 0),
    0,
    100,
  );

  return {
    totalScore,
    breakdown,
    reasons,
    recommendation: recommendationFor(totalScore, isPrivate),
    buyerMatchCount,
  };
}

// ── Buyer-match estimate (PLACEHOLDER for Phase 8) ───────────────────────────
// ⚠️ Real buyer matching is NOT built yet. For now this returns 0 for everything
// except mock/dev PRIVATE listings, where it returns a deterministic 1–4 derived
// from the externalId so scoring/alerts can be exercised. Replace in Phase 8.
export function estimateBuyerMatchCount(
  source: NormalizedListingMetadata,
  _area: PropertyRadarArea,
): number {
  void _area;
  if (source.provider !== "mock") return 0;
  if (source.listingType !== "private") return 0;
  let h = 0;
  const id = source.externalId ?? "";
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 4) + 1; // deterministic 1..4
}
