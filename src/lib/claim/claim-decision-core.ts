// ============================================================================
// ZONO — Claim My Listings: PURE decision + dedupe planning (P10). No DB.
// Deterministic transitions for a candidate (claim / reject / snooze) and an
// idempotent claim planner that reuses an existing internal property instead of
// creating a duplicate. Unit-tested.
// ============================================================================
export type ClaimDecision = "candidate" | "claimed" | "rejected" | "snoozed";
export type SnoozeWindow = "tomorrow" | "week" | "default";

export interface DecisionTransition { ok: boolean; next: ClaimDecision; error?: string }

/** Legal transitions. A confirmed claim is terminal for the candidate; reject/snooze
 *  are reversible from candidate; snoozed → candidate on window expiry (see isSnoozeElapsed). */
export function transitionDecision(current: ClaimDecision, action: "claim" | "reject" | "snooze" | "reopen"): DecisionTransition {
  if (current === "claimed") return { ok: false, next: "claimed", error: "already_claimed" };
  switch (action) {
    case "claim": return { ok: true, next: "claimed" };
    case "reject": return { ok: true, next: "rejected" };
    case "snooze": return { ok: true, next: "snoozed" };
    case "reopen":
      return current === "snoozed" || current === "rejected"
        ? { ok: true, next: "candidate" }
        : { ok: false, next: current, error: "not_reopenable" };
    default: return { ok: false, next: current, error: "unknown_action" };
  }
}

/** Snooze duration in ms. Deterministic (caller supplies now). */
export function snoozeUntil(nowMs: number, window: SnoozeWindow): number {
  const day = 86_400_000;
  if (window === "tomorrow") return nowMs + day;
  if (window === "week") return nowMs + 7 * day;
  return nowMs + 3 * day; // default revisit window
}

/** A snoozed candidate reappears only once its window has elapsed (§N/§AM). */
export function isSnoozeElapsed(snoozeUntilMs: number | null, nowMs: number): boolean {
  return snoozeUntilMs == null ? true : nowMs >= snoozeUntilMs;
}

// ── Idempotent claim planner (§I/§Y/§AN) ─────────────────────────────────────
export interface ClaimPlanInput {
  listingPromotedPropertyId: string | null; // external_listings.promoted_property_id
  listingPrimaryPropertyId: string | null;  // external_listings.primary_property_id (dedupe anchor)
  existingBySourceId: string | null;         // internal property already imported from this source_id
  duplicateGroupPromotedId: string | null;   // a sibling in the same duplicate_group already promoted
}
export type ClaimPlan =
  | { action: "reuse"; propertyId: string; reason: string }
  | { action: "create"; reason: string };

/**
 * Decide whether a claim CREATES a new internal property or REUSES an existing one.
 * Reuse order (strongest linkage first) guarantees repeated clicks / re-ingestion /
 * duplicate-group siblings all resolve to ONE canonical property — 0 duplicates.
 */
export function planClaim(i: ClaimPlanInput): ClaimPlan {
  if (i.listingPromotedPropertyId) return { action: "reuse", propertyId: i.listingPromotedPropertyId, reason: "listing_already_promoted" };
  if (i.listingPrimaryPropertyId) return { action: "reuse", propertyId: i.listingPrimaryPropertyId, reason: "listing_primary_link" };
  if (i.existingBySourceId) return { action: "reuse", propertyId: i.existingBySourceId, reason: "existing_by_source_id" };
  if (i.duplicateGroupPromotedId) return { action: "reuse", propertyId: i.duplicateGroupPromotedId, reason: "duplicate_group_sibling" };
  return { action: "create", reason: "no_existing_link" };
}
