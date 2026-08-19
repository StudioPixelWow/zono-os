// ============================================================================
// ZONO — Seller lifecycle + marketing-health: PURE deterministic core (no IO,
// no clock, no LLM). Slice: Seller Lifecycle Automation. Given REAL server-derived
// signals for ONE property, resolve exactly ONE customer-facing lifecycle state,
// a deterministic marketing-health verdict with reason codes, and the next
// recommended AGENT action. Fully unit-testable with plain inputs. The server
// layer supplies the signals; this file decides — never the other way around.
// ============================================================================

export type SellerLifecycleState =
  | "preparing"        // הנכס בהכנה
  | "ready_to_market"  // הנכס מוכן לשיווק
  | "marketing"        // השיווק התחיל
  | "interest"         // יש התעניינות
  | "viewings"         // מתקיימים ביקורים
  | "needs_strategy"   // נדרש עדכון אסטרטגיה
  | "progressing"      // יש התקדמות לעסקה
  | "closed";          // נמכר / נסגר

export type MarketingHealth =
  | "not_marketed"
  | "no_future_marketing"
  | "no_recent_interest"
  | "viewings_no_progress"
  | "needs_attention"
  | "strong_interest"
  | "healthy";

export type HealthReason =
  | "not_marketed" | "no_future_publication" | "no_interest_yet"
  | "viewings_without_progress" | "stalled_no_activity" | "strong_interest"
  | "recently_published" | "active_campaign" | "has_interest" | "progressing" | "closed";

export type NextAgentAction =
  | "start_marketing" | "schedule_more_marketing" | "contact_interested_buyers"
  | "collect_viewing_feedback" | "discuss_strategy_with_seller" | "refresh_creative"
  | "advance_deal" | "none";

// Property status buckets.
const CLOSED_STATUSES = new Set(["sold", "rented", "withdrawn", "archived"]);
const PROGRESS_STATUSES = new Set(["under_offer", "in_contract"]);
const MARKETABLE_STATUSES = new Set(["active", "published"]);
const PREP_STATUSES = new Set(["draft", "ready"]);

// Deterministic thresholds (single source of truth).
export const STRATEGY_DAYS = 14;         // "long enough in market to expect traction"
export const STALE_ACTIVITY_DAYS = 10;   // no meaningful activity for this long
export const STRONG_INTEREST_COUNT = 3;

export interface SellerSignals {
  status: string;                 // properties.status
  daysListed: number;             // days since listed_at / created_at
  hasActiveCampaign: boolean;     // distribution_campaigns active/scheduled/running
  publications: number;           // distribution_posts publish_state='published'
  hasFuturePublication: boolean;  // a queued/scheduled post exists
  interestedCount: number;        // interested + viewing_requested recos + interest edges (distinct)
  qualifiedLeads: number;         // leads.stage='qualified' for the property
  viewingsScheduled: number;      // meetings viewing/open_house scheduled/confirmed
  viewingsCompleted: number;      // meetings viewing/open_house completed
  feedbackCount: number;          // post-viewing feedback / interested responses recorded
  hasOpenDeal: boolean;           // deals status='open' for the property
  hasOffer: boolean;              // offers status in submitted/countered/accepted
  dealWon: boolean;               // deals status='won'
  lastActivityDaysAgo: number;    // days since last meaningful activity (Infinity if none)
}

/** Resolve the SINGLE current lifecycle state (deterministic, priority-ordered). */
export function deriveSellerLifecycleState(s: SellerSignals): SellerLifecycleState {
  if (s.dealWon || CLOSED_STATUSES.has(s.status)) return "closed";
  if (s.hasOpenDeal || s.hasOffer || PROGRESS_STATUSES.has(s.status)) return "progressing";

  const isMarketing = s.hasActiveCampaign || s.publications > 0;
  const hasInterest = s.interestedCount > 0 || s.qualifiedLeads > 0;
  const hasViewings = s.viewingsScheduled > 0 || s.viewingsCompleted > 0;

  if (isMarketing) {
    // Enough time in market but no progression (there is no open deal/offer here,
    // as that returns "progressing" above) → strategy review is due.
    if (s.daysListed >= STRATEGY_DAYS) {
      const noTraction = !hasInterest && !hasViewings;
      const viewingsStuck = s.viewingsCompleted >= 2;
      if (noTraction || viewingsStuck) return "needs_strategy";
    }
    if (hasViewings) return "viewings";
    if (hasInterest) return "interest";
    return "marketing";
  }

  if (PREP_STATUSES.has(s.status)) return s.status === "ready" ? "ready_to_market" : "preparing";
  // Marketable status but no marketing evidence yet.
  if (MARKETABLE_STATUSES.has(s.status)) return "ready_to_market";
  return "preparing";
}

/** Deterministic marketing-health verdict + the reasons behind it (codes). */
export function deriveMarketingHealth(s: SellerSignals): { health: MarketingHealth; reasons: HealthReason[] } {
  const reasons: HealthReason[] = [];

  if (s.dealWon || CLOSED_STATUSES.has(s.status)) return { health: "healthy", reasons: ["closed"] };
  if (s.hasOpenDeal || s.hasOffer || PROGRESS_STATUSES.has(s.status)) return { health: "healthy", reasons: ["progressing"] };

  const isMarketing = s.hasActiveCampaign || s.publications > 0;
  const hasInterest = s.interestedCount > 0 || s.qualifiedLeads > 0;
  const strong = s.interestedCount >= STRONG_INTEREST_COUNT || (s.interestedCount >= 1 && s.viewingsCompleted >= 2);

  if (!isMarketing) return { health: "not_marketed", reasons: ["not_marketed"] };
  if (strong) return { health: "strong_interest", reasons: ["strong_interest"] };

  if (s.viewingsCompleted >= 2 && !s.hasOpenDeal && !s.hasOffer) {
    reasons.push("viewings_without_progress");
    return { health: "viewings_no_progress", reasons };
  }
  if (!s.hasFuturePublication && !s.hasActiveCampaign && s.publications > 0) {
    reasons.push("no_future_publication");
    return { health: "no_future_marketing", reasons };
  }
  if (s.daysListed >= STRATEGY_DAYS && !hasInterest && s.viewingsScheduled === 0) {
    reasons.push("no_interest_yet");
    return { health: "no_recent_interest", reasons };
  }
  if (s.daysListed >= STRATEGY_DAYS && s.lastActivityDaysAgo >= STALE_ACTIVITY_DAYS) {
    reasons.push("stalled_no_activity");
    return { health: "needs_attention", reasons };
  }

  if (s.hasActiveCampaign) reasons.push("active_campaign");
  if (hasInterest) reasons.push("has_interest");
  if (!reasons.length) reasons.push("recently_published");
  return { health: "healthy", reasons };
}

/** The next AGENT action (surfaced first — never auto-tells the seller to cut price). */
export function nextAgentAction(state: SellerLifecycleState, health: MarketingHealth): NextAgentAction {
  if (state === "closed") return "none";
  if (state === "progressing") return "advance_deal";
  switch (health) {
    case "not_marketed": return "start_marketing";
    case "no_future_marketing": return "schedule_more_marketing";
    case "no_recent_interest": return "refresh_creative";
    case "viewings_no_progress": return "discuss_strategy_with_seller";
    case "needs_attention": return "discuss_strategy_with_seller";
    case "strong_interest": return "contact_interested_buyers";
    default: break;
  }
  if (state === "viewings") return "collect_viewing_feedback";
  if (state === "interest") return "contact_interested_buyers";
  if (state === "ready_to_market") return "start_marketing";
  return "none";
}

/** Whether this lifecycle state should STOP future seller marketing-performance automation. */
export function isSellerLifecycleClosed(status: string, dealWon: boolean): boolean {
  return dealWon || CLOSED_STATUSES.has(status);
}

// ── Seller-safe post-viewing feedback mapping (NEVER exposes buyer identity) ──
export type BuyerFeedbackSignal = "interested" | "advance" | "rejected" | "viewing_requested" | "none";
/** Map an aggregate set of buyer feedback signals to ONE seller-safe Hebrew phrase set.
 *  Counts only — no names, phones, notes. */
export function sellerSafeFeedbackSummary(counts: { interested: number; advancing: number; notSuitable: number; total: number }): string[] {
  const out: string[] = [];
  if (counts.total <= 0) return ["טרם נרשם משוב מביקורים."];
  if (counts.advancing > 0) out.push(counts.advancing === 1 ? "אחד המתעניינים ביקש להמשיך" : `${counts.advancing} מתעניינים ביקשו להמשיך`);
  if (counts.interested > 0) out.push(counts.interested === 1 ? "מתעניין אחד ציין שהנכס מעניין" : `${counts.interested} מתעניינים ציינו שהנכס מעניין`);
  if (counts.notSuitable > 0) out.push(counts.notSuitable === 1 ? "אחד ציין שהנכס אינו מתאים לו" : `${counts.notSuitable} ציינו שהנכס אינו מתאים`);
  if (!out.length) out.push("התקבל משוב ראשוני מהביקורים.");
  return out;
}
