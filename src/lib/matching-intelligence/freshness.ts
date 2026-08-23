// ============================================================================
// Buyer Command Center 5.1 — MATCH FRESHNESS model (PURE, deterministic).
// Every buyer↔property match has exactly one freshness state, derived ONLY from
// real timestamps + real shortlist/feedback state — never invented. This is the
// single source the internal buyer page and "new since last review" read from.
// ============================================================================

/** The canonical match freshness states (internal enum — never shown raw to users). */
export type MatchFreshness =
  | "NEW"             // computed after the broker's last review, not yet acted on
  | "REVIEWED"        // seen by the broker (review timestamp is newer), not shortlisted
  | "SHORTLISTED"     // added to the personal selection, not yet sent
  | "SENT"            // selection sent to the buyer
  | "VIEWED"          // buyer opened the property from the portal
  | "LIKED"           // buyer marked it interesting
  | "REJECTED"        // buyer marked it not suitable
  | "VISIT_REQUESTED" // buyer asked to see it
  | "INACTIVE";       // property unavailable / match deactivated — kept for history

/** Shortlist state as stored in buyer_property_shortlist.state. */
export type ShortlistState = "selected" | "sent" | "viewed" | "liked" | "rejected" | "visit_requested";

export interface FreshnessInput {
  /** match_intelligence_profiles.match_status ('active' | 'inactive' | ...). */
  matchStatus: string | null;
  /** Whether the property is still in a marketable status. */
  propertyAvailable: boolean;
  /** buyer_property_shortlist.state for this pair, or null if not shortlisted. */
  shortlistState: ShortlistState | null;
  /** match_intelligence_profiles.last_calculated_at (ISO) — when it last (re)computed. */
  lastCalculatedAt: string | null;
  /** buyers.matches_last_reviewed_at (ISO) — when the broker last reviewed matches. */
  reviewedAt: string | null;
}

const SHORTLIST_TO_FRESHNESS: Record<ShortlistState, MatchFreshness> = {
  liked: "LIKED",
  rejected: "REJECTED",
  visit_requested: "VISIT_REQUESTED",
  viewed: "VIEWED",
  sent: "SENT",
  selected: "SHORTLISTED",
};

/**
 * Derive the single freshness state. Precedence: unavailable/deactivated → INACTIVE;
 * else the buyer/broker action recorded on the shortlist; else NEW-vs-REVIEWED from
 * the real review timestamp. Deterministic and side-effect free.
 */
export function deriveMatchFreshness(input: FreshnessInput): MatchFreshness {
  if (!input.propertyAvailable || input.matchStatus === "inactive") return "INACTIVE";
  if (input.shortlistState) return SHORTLIST_TO_FRESHNESS[input.shortlistState];
  // Not shortlisted yet → NEW if computed after the last review (or never reviewed).
  if (!input.reviewedAt) return "NEW";
  if (!input.lastCalculatedAt) return "REVIEWED";
  return input.lastCalculatedAt > input.reviewedAt ? "NEW" : "REVIEWED";
}

/** Is this match NEW since the broker's last review? (excludes already-acted states). */
export function isNewSinceReview(input: FreshnessInput): boolean {
  return deriveMatchFreshness(input) === "NEW";
}

/** Hebrew, user-safe labels for each freshness state (internal enum stays internal). */
export const FRESHNESS_LABEL_HE: Record<MatchFreshness, string> = {
  NEW: "חדש",
  REVIEWED: "נבדק",
  SHORTLISTED: "בבחירה",
  SENT: "נשלח",
  VIEWED: "נצפה",
  LIKED: "אהב",
  REJECTED: "לא מתאים",
  VISIT_REQUESTED: "ביקש ביקור",
  INACTIVE: "לא זמין יותר",
};

/** Tone hint for UI badges (maps to the design-system Badge tones). */
export const FRESHNESS_TONE: Record<MatchFreshness, "brand" | "success" | "warning" | "neutral"> = {
  NEW: "brand",
  REVIEWED: "neutral",
  SHORTLISTED: "brand",
  SENT: "brand",
  VIEWED: "success",
  LIKED: "success",
  REJECTED: "neutral",
  VISIT_REQUESTED: "success",
  INACTIVE: "warning",
};
