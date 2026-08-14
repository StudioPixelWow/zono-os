// ============================================================================
// ZONO — SUBSCRIPTION ACTIVATION FROM A VERIFIED GROW PAYMENT (server-only). P8.4.
// The ONLY path that turns a trial into a paid, provider-backed subscription, and
// the ONLY legitimate writer of subscriptions.provider_quantity — reached STRICTLY
// after a server-to-server VERIFIED provider confirmation (webhook →
// getTransactionInfo re-query). It never runs from a browser redirect and never
// from an unverified callback. Idempotent (subscriptions PK = org_id): a replayed
// verified webhook re-asserts the same state without duplicating anything. Does
// NOT reset the trial window that predates it.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface ActivateInput {
  orgId: string;
  recurringDebitId: string | null;   // Grow recurring code → stored as grow_subscription_id
  quantity: number;                  // provider-ACKNOWLEDGED quantity (verified)
  // P8.4B: identifiers needed to later change the recurring amount / cancel it,
  // and the environment the provider transaction ran under (sandbox|production).
  transactionId?: string | null;
  transactionToken?: string | null;
  asmachta?: string | null;
  environment?: "sandbox" | "production" | null;
}

/**
 * Activate (or re-assert) a provider-backed subscription after a VERIFIED payment.
 * Writes provider_quantity = the acknowledged quantity — this is the sole verified
 * "ack" moment (P8.3 forbade the reconciler from writing provider_quantity). Uses
 * the existing P8.3 columns; no migration required for initial activation.
 */
export async function activateOrgSubscriptionFromVerifiedPayment(input: ActivateInput): Promise<{ ok: boolean }> {
  const db = createServiceRoleClient();
  const now = new Date().toISOString();
  // Update the existing (trial) subscription row in place — never create a second.
  const { data, error } = await db.from("subscriptions" as never)
    .update({
      status: "active",
      grow_subscription_id: input.recurringDebitId,
      grow_transaction_id: input.transactionId ?? null,
      grow_transaction_token: input.transactionToken ?? null,
      grow_asmachta: input.asmachta ?? null,
      provider_env: input.environment ?? null,
      subscription_quantity: input.quantity,
      provider_quantity: input.quantity,      // ACK — verified provider confirmation ONLY
      quantity_sync_status: "synced",
      quantity_synced_at: now,
      quantity_sync_error: null,
      updated_at: now,
    } as never)
    .eq("org_id", input.orgId)
    .select("org_id")
    .maybeSingle();
  if (error) return { ok: false };
  if (data) return { ok: true };
  // No trial row existed (edge case) — insert a provider-backed one. period_start
  // = now; no trial_ends_at is fabricated.
  const { error: insErr } = await db.from("subscriptions" as never).insert({
    org_id: input.orgId, plan_tier: "starter", status: "active",
    period_start: now, grow_subscription_id: input.recurringDebitId,
    grow_transaction_id: input.transactionId ?? null, grow_transaction_token: input.transactionToken ?? null,
    grow_asmachta: input.asmachta ?? null, provider_env: input.environment ?? null,
    subscription_quantity: input.quantity, provider_quantity: input.quantity,
    quantity_sync_status: "synced", quantity_synced_at: now, cancel_at_period_end: false,
  } as never);
  return { ok: !insErr };
}
