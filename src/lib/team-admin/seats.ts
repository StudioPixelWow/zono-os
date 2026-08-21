// ============================================================================
// ZONO — Team & Seats: CANONICAL, PURE seat truth. ONE derivation of an office
// member's ZONO access state (no parallel seat table) + ONE reusable billing
// preview. Billing model (audited): a paid seat = a public.users row with
// status='active' (owner included); price is the canonical per-agent price from
// COMMERCIAL_MODEL.pricePerAgentIls, injected by the caller (never hardcoded
// here); a quantity change is effective NEXT billing cycle, no proration; and the
// PROVIDER quantity auto-sync is currently unwired (MODEL_D) — so this module
// only PREVIEWS cost, it never asserts a seat was provisioned to GROW.
// Pure + client-safe + unit-testable (no server-only, no @/ imports).
// ============================================================================

export type AccessState = "NO_ACCESS" | "INVITED" | "ACTIVE" | "SUSPENDED";

export const ACCESS_LABEL_HE: Record<AccessState, string> = {
  NO_ACCESS: "ללא גישה",
  INVITED: "הזמנה נשלחה",
  ACTIVE: "פעיל",
  SUSPENDED: "מושהה",
};

/**
 * Derive an office member's ZONO access state from EXISTING canonical truth:
 * the linked Auth user's status (public.users.status) + whether a pending
 * org_invitation exists for them. No new persistence, no parallel seat count.
 */
export function deriveAccessState(input: { userId: string | null; userStatus: string | null; hasPendingInvite: boolean }): AccessState {
  const s = (input.userStatus ?? "").toLowerCase();
  if (input.userId && s === "active") return "ACTIVE";
  if (input.userId && (s === "disabled" || s === "suspended" || s === "inactive")) return "SUSPENDED";
  if (input.hasPendingInvite) return "INVITED";
  return "NO_ACCESS";
}

/** A member consumes a PAID seat only when ACTIVE (matches billableAgents = active users). */
export const consumesSeat = (state: AccessState): boolean => state === "ACTIVE";

export interface SeatBillingPreview {
  currentSeats: number;
  nextSeats: number;
  unitPriceIls: number;
  currentMonthlyIls: number;
  nextMonthlyIls: number;
  monthlyDeltaIls: number;
  /** ZONO billing: a quantity change takes effect at the next billing cycle (no proration). */
  effectiveTiming: "next_cycle";
}

/**
 * Reusable seat billing preview. `unitPriceIls` MUST be the canonical
 * COMMERCIAL_MODEL.pricePerAgentIls, passed by the caller — kept out of this pure
 * module so there is exactly one price source. Used for activate / reactivate /
 * suspend previews; no duplicate pricing math anywhere else.
 */
export function seatBillingPreview(currentSeats: number, nextSeats: number, unitPriceIls: number): SeatBillingPreview {
  const cur = Math.max(0, Math.round(currentSeats));
  const nxt = Math.max(0, Math.round(nextSeats));
  const unit = Math.max(0, unitPriceIls);
  return {
    currentSeats: cur,
    nextSeats: nxt,
    unitPriceIls: unit,
    currentMonthlyIls: cur * unit,
    nextMonthlyIls: nxt * unit,
    monthlyDeltaIls: (nxt - cur) * unit,
    effectiveTiming: "next_cycle",
  };
}

export const ilsMonthly = (n: number): string => `₪${Math.round(n).toLocaleString("he-IL")}`;
