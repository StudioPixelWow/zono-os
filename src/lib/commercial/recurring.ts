// ============================================================================
// ZONO — RECURRING QUANTITY UPDATE + CANCELLATION (P8.4B).
// The provider-independent DECISION logic is PURE and fully testable now. The
// actual Grow calls (updateDirectDebit) are credential-gated: without GROW_*
// configured they return PENDING_SANDBOX_CREDENTIALS and change NOTHING — they
// never guess provider behavior and never move money.
//
// LOCKED PRODUCT DECISIONS:
//   A) A quantity change takes effect on the NEXT BILLING CYCLE — no mid-cycle
//      proration, no immediate charge/credit. Between changes ZONO tracks the
//      expected quantity; the provider amount is pushed only at the boundary.
//   B) A return from custom (>10) to standard (≤10) does NOT auto-resume provider
//      sync; it stays CUSTOM_REVIEW_REQUIRED until approveStandardBillingReturn.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { growCreds, growUpdateDirectDebit } from "./grow-client";
import { getOrgBillingQuantity } from "./billing";
import { decideRecurringUpdate, type RecurringUpdateAction } from "./recurring-decision";

export { decideRecurringUpdate, type RecurringUpdateAction, type RecurringDecision, type RecurringDecisionInput } from "./recurring-decision";

// ── Server wrappers (credential-gated; no proration; never fake provider state) ──
export type RecurringOpResult =
  | { ok: true; changed: boolean; action: RecurringUpdateAction }
  | { ok: false; reason: "PENDING_SANDBOX_CREDENTIALS" | "NO_RECURRING_SUBSCRIPTION" | "PROVIDER_ERROR" | "NOT_OWED" };

interface RecurringRow {
  grow_transaction_id: string | null;
  grow_transaction_token: string | null;
  grow_asmachta: string | null;
  provider_quantity: number | null;
  quantity_sync_status: string | null;
}

async function loadRecurringRow(orgId: string): Promise<RecurringRow | null> {
  const db = createServiceRoleClient();
  const { data } = await (db.from("subscriptions" as never)
    .select("grow_transaction_id,grow_transaction_token,grow_asmachta,provider_quantity,quantity_sync_status")
    .eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: RecurringRow | null }>);
  return data ?? null;
}

/**
 * Push the current billable quantity to the provider at the billing boundary
 * (Decision A). Gated: without Grow credentials, returns PENDING_SANDBOX_CREDENTIALS
 * and changes nothing. Only sends when an UPDATE is genuinely owed and not held.
 * provider_quantity is updated ONLY after Grow confirms the update (verified ack).
 */
export async function syncRecurringQuantityAtBoundary(orgId: string): Promise<RecurringOpResult> {
  const q = await getOrgBillingQuantity(orgId);
  const row = await loadRecurringRow(orgId);
  if (!row || !row.grow_transaction_id || !row.grow_transaction_token || !row.grow_asmachta) {
    return { ok: false, reason: "NO_RECURRING_SUBSCRIPTION" };
  }
  const decision = decideRecurringUpdate({
    billableAgents: q.billableAgents, customPricingRequired: q.customPricingRequired,
    unitPriceIls: q.unitPriceIls, providerQuantity: row.provider_quantity, syncStatus: row.quantity_sync_status,
  });
  if (decision.action !== "UPDATE_OWED" || decision.targetSumIls === null) {
    return { ok: false, reason: "NOT_OWED" };
  }
  if (!growCreds().configured) return { ok: false, reason: "PENDING_SANDBOX_CREDENTIALS" };

  const res = await growUpdateDirectDebit({
    transactionId: row.grow_transaction_id, transactionToken: row.grow_transaction_token, asmachta: row.grow_asmachta,
    sum: decision.targetSumIls, changeStatus: 1,
  });
  if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR" };

  // Verified provider ack → update provider_quantity + synced state (only now).
  const db = createServiceRoleClient();
  const now = new Date().toISOString();
  await db.from("subscriptions" as never).update({
    provider_quantity: decision.targetQuantity, subscription_quantity: decision.targetQuantity,
    quantity_sync_status: "synced", quantity_synced_at: now, updated_at: now,
  } as never).eq("org_id", orgId);
  return { ok: true, changed: true, action: "UPDATE_OWED" };
}

/**
 * Cancel a recurring subscription at the provider (updateDirectDebit changeStatus=2).
 * Gated on credentials. Does NOT delete any ZONO data. On a real provider ack the
 * subscription is marked cancel_at_period_end (data preserved; access unaffected —
 * no billing→enforcement link).
 */
export async function cancelGrowRecurring(orgId: string): Promise<RecurringOpResult> {
  const row = await loadRecurringRow(orgId);
  if (!row || !row.grow_transaction_id || !row.grow_transaction_token || !row.grow_asmachta) {
    return { ok: false, reason: "NO_RECURRING_SUBSCRIPTION" };
  }
  if (!growCreds().configured) return { ok: false, reason: "PENDING_SANDBOX_CREDENTIALS" };

  const res = await growUpdateDirectDebit({
    transactionId: row.grow_transaction_id, transactionToken: row.grow_transaction_token, asmachta: row.grow_asmachta,
    changeStatus: 2,
  });
  if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR" };

  const db = createServiceRoleClient();
  await db.from("subscriptions" as never).update({ cancel_at_period_end: true, updated_at: new Date().toISOString() } as never).eq("org_id", orgId);
  return { ok: true, changed: true, action: "NONE" };
}
