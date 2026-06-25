// ============================================================================
// ZONO Property Radar™ — deterministic matching engine (pure, client-safe).
// matchPropertyToBuyers(property, buyers) is the SOURCE OF TRUTH for matching.
// It is O(buyers): fast-filter first (rejects >90% cheaply), then score only the
// survivors, then sort. No AI, no I/O, no randomness — so it scales to tens of
// thousands of buyers per property. AI may later enrich explanations only.
// ============================================================================
import { DEFAULT_FAST_FILTER_CONFIG, fastFilterBuyer } from "./filters";
import { buildMatchExplanation, deterministicMatchExplainer } from "./explanation";
import { DEFAULT_MATCH_WEIGHTS, matchLevelForScore, scoreBuyerProperty } from "./scoring";
import type {
  BuyerMatch,
  MatchEngineInput,
  MatchEngineResult,
  MatchableProperty,
  NormalizedListingDetails,
  NormalizedListingMetadata,
} from "./types";

// ── Listing → MatchableProperty (pure parsing) ───────────────────────────────
function parseFloorNumber(floor: string | null | undefined): number | null {
  if (floor == null) return null;
  const s = String(floor).trim();
  if (/קרקע|ground/i.test(s)) return 0;
  const m = s.match(/-?\d+/); // first integer (handles "קומה 3", "3 מתוך 5")
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

const PARKING_KEYS = ["parking", "hasparking", "has_parking", "חניה", "חנייה"];
const BALCONY_KEYS = ["balcony", "hasbalcony", "has_balcony", "מרפסת", "מרפסת_שמש"];

function rawFlag(raw: Record<string, unknown> | undefined, keys: string[]): boolean | null {
  if (!raw) return null;
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase();
    if (keys.some((want) => key === want || key.includes(want))) {
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v > 0;
      if (typeof v === "string") {
        const t = v.trim().toLowerCase();
        if (["true", "yes", "1", "כן", "יש"].includes(t)) return true;
        if (["false", "no", "0", "לא", "אין"].includes(t)) return false;
      }
    }
  }
  return null;
}

/** Flatten a normalized listing into the matcher's property shape (pure). */
export function normalizeListingForMatching(
  source: NormalizedListingMetadata | NormalizedListingDetails,
  sourceId: string,
): MatchableProperty {
  const raw = { ...(source.rawMetadata ?? {}), ...((source as NormalizedListingDetails).rawFullPayload ?? {}) };
  return {
    sourceId,
    city: source.city ?? null,
    neighborhood: source.neighborhood ?? null,
    price: source.price ?? null,
    rooms: source.rooms ?? null,
    propertyType: source.propertyType ?? null,
    sizeSqm: source.sizeSqm ?? null,
    floorNumber: parseFloorNumber(source.floor),
    hasParking: rawFlag(raw, PARKING_KEYS),
    hasBalcony: rawFlag(raw, BALCONY_KEYS),
  };
}

/**
 * Match one property against a buyer list. Returns relevant matches sorted by
 * score desc (highest first) plus counts. Rejected buyers are excluded unless
 * `includeRejected` is set.
 */
export function matchPropertyToBuyers(input: MatchEngineInput): MatchEngineResult {
  const weights = input.weights ?? DEFAULT_MATCH_WEIGHTS;
  const filterConfig = input.filterConfig ?? DEFAULT_FAST_FILTER_CONFIG;
  const explainer = input.explainer ?? deterministicMatchExplainer;
  const { property, buyers } = input;

  const matches: BuyerMatch[] = [];
  let filteredOutCount = 0;
  let perfectCount = 0;
  let excellentCount = 0;

  for (const buyer of buyers) {
    // 1) cheap fast-filter — eliminates the vast majority.
    const filter = fastFilterBuyer(buyer, property, filterConfig);
    if (!filter.passed) {
      filteredOutCount++;
      if (input.includeRejected) {
        matches.push({
          buyerId: buyer.id,
          buyer,
          matchScore: 0,
          matchLevel: "rejected",
          breakdown: {
            priceScore: 0, locationScore: 0, roomsScore: 0, propertyTypeScore: 0,
            sizeScore: 0, parkingScore: 0, balconyScore: 0, floorScore: 0, timelineScore: 0,
          },
          manualBonus: buyer.manualBonus || 0,
          manualPenalty: buyer.manualPenalty || 0,
          explanation: buildMatchExplanation(
            { buyer, property, breakdown: {
                priceScore: 0, locationScore: 0, roomsScore: 0, propertyTypeScore: 0,
                sizeScore: 0, parkingScore: 0, balconyScore: 0, floorScore: 0, timelineScore: 0,
              }, weights, score: 0, level: "rejected", rejection: filter },
            explainer,
          ),
          rejected: true,
        });
      }
      continue;
    }

    // 2) score the survivor.
    const { breakdown, total } = scoreBuyerProperty(buyer, property, weights);
    const level = matchLevelForScore(total);
    if (level === "rejected") {
      filteredOutCount++;
      if (!input.includeRejected) continue;
    }

    if (level === "perfect") perfectCount++;
    else if (level === "excellent") excellentCount++;

    matches.push({
      buyerId: buyer.id,
      buyer,
      matchScore: total,
      matchLevel: level,
      breakdown,
      manualBonus: buyer.manualBonus || 0,
      manualPenalty: buyer.manualPenalty || 0,
      explanation: buildMatchExplanation({ buyer, property, breakdown, weights, score: total, level }, explainer),
      rejected: level === "rejected",
    });
  }

  // 3) sort relevant matches highest-first (stable on buyerId for determinism).
  const relevant = matches.filter((m) => !m.rejected);
  relevant.sort((a, b) => (b.matchScore - a.matchScore) || a.buyerId.localeCompare(b.buyerId));

  const output = input.includeRejected ? matches : relevant;
  if (input.includeRejected) {
    output.sort((a, b) => (b.matchScore - a.matchScore) || a.buyerId.localeCompare(b.buyerId));
  }

  return {
    matches: output,
    evaluatedCount: buyers.length,
    filteredOutCount,
    relevantCount: relevant.length,
    perfectCount,
    excellentCount,
  };
}
