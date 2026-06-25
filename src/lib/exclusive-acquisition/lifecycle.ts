// ============================================================================
// ZONO — seller lifecycle state machine (pure, deterministic).
// Advances an opportunity through: new_opportunity → contact_recommended →
// contacted → follow_up → negotiating → exclusive_signed | lost | archived.
// Transitions are automatic where the signals allow; terminal states stick.
// ============================================================================
import type { LifecycleContext, SellerLifecycleStage } from "./types";

const TERMINAL: SellerLifecycleStage[] = ["exclusive_signed", "lost", "archived"];

export const LIFECYCLE_LABEL: Record<SellerLifecycleStage, string> = {
  new_opportunity: "הזדמנות חדשה",
  contact_recommended: "מומלץ ליצור קשר",
  contacted: "נוצר קשר",
  follow_up: "מעקב",
  negotiating: "במשא ומתן",
  exclusive_signed: "בלעדיות נחתמה",
  lost: "אבוד",
  archived: "ארכיון",
};

/** Compute the next lifecycle stage from the current stage + context. Pure. */
export function nextLifecycleStage(current: SellerLifecycleStage, ctx: LifecycleContext): SellerLifecycleStage {
  // Outcomes are authoritative + terminal.
  if (ctx.lastOutcome === "exclusive_signed") return "exclusive_signed";
  if (ctx.lastOutcome === "lost" || ctx.lastOutcome === "declined" || ctx.lastOutcome === "not_interested") return "lost";

  // Already terminal → stay (unless an outcome above reopened it).
  if (TERMINAL.includes(current)) return current;

  // Listing removed and nothing signed → archive.
  if (ctx.removed) return "archived";

  // Positive engagement → negotiating.
  if (ctx.hasPositiveResponse) return "negotiating";

  // Contact made → contacted / follow_up depending on elapsed time.
  if (ctx.contactAttempts > 0) {
    if (ctx.hoursSinceLastContact != null && ctx.hoursSinceLastContact >= 48) return "follow_up";
    return "contacted";
  }

  // No contact yet → recommend contacting when worthwhile.
  if (ctx.exclusiveProbability >= 50) return "contact_recommended";
  return "new_opportunity";
}

/** A transition is "advancing" if it moves further down the funnel. */
const ORDER: SellerLifecycleStage[] = ["new_opportunity", "contact_recommended", "contacted", "follow_up", "negotiating", "exclusive_signed"];
export function isAdvancing(from: SellerLifecycleStage, to: SellerLifecycleStage): boolean {
  return ORDER.indexOf(to) > ORDER.indexOf(from);
}
