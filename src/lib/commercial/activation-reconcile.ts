// ============================================================================
// ZONO — VERIFIED-GROW-PAYMENT → ACTIVATION RECONCILER (server-only). P8.4C.
// Closes the last billing reliability gap: a GROW payment can become
// AUTHORITATIVELY verified (markPaymentVerified) and yet, if the webhook process
// dies before activateOrgSubscriptionFromVerifiedPayment runs, the org stays
// paid-but-not-active with nothing to self-heal it. This reconciler finds those
// stranded verified payments and drives them through the SAME canonical
// activation function the webhook uses — never a second activation path.
//
// Scope is strictly ACTIVATION. The Morning/accounting side effect is already
// self-healed independently by the accounting-documents cron (which idempotently
// issues a document for any verified payment lacking invoice_doc_id), so this
// reconciler never calls Morning and never risks a duplicate document.
//
// Idempotent by DB truth: activateOrgSubscriptionFromVerifiedPayment keys on
// subscriptions PK = org_id and re-asserts 'active' in place, and the candidate
// predicate excludes already-active orgs — so a double/concurrent run converges
// to ONE active subscription with no duplicate effect. Payment truth and
// activation truth stay separate: an activation failure NEVER marks the payment
// failed (the candidate simply remains eligible for the next run).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { activateOrgSubscriptionFromVerifiedPayment } from "./activate";
import { getOrgBillingQuantity } from "./billing";
import { growCreds } from "./grow-client";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { decideActivation } from "./activation-reconcile-core";

export { decideActivation } from "./activation-reconcile-core";
export type { ActivationDecision, ReconcilablePayment } from "./activation-reconcile-core";

export interface ActivationReconcileResult {
  checked: number;          // verified grow payments examined
  activated: number;        // stranded payments driven to active this run
  alreadyConverged: number; // subscription already active (healthy no-op)
  skipped: number;          // ineligible (no txn / terminal / no subscription)
  failed: number;           // activation attempt failed → stays eligible next run
}

/**
 * Find AUTHORITATIVELY-verified GROW payments whose org subscription has not
 * converged to 'active' and activate them through the canonical helper. Bounded,
 * service-role, per-payment isolated (one failure never aborts the batch). Safe
 * to run repeatedly and concurrently.
 */
export async function reconcileVerifiedGrowActivations(limit = 200): Promise<ActivationReconcileResult> {
  const db = createServiceRoleClient();
  const out: ActivationReconcileResult = { checked: 0, activated: 0, alreadyConverged: 0, skipped: 0, failed: 0 };

  // Candidates: verified GROW payments with a real provider txn. org is taken
  // from the payment row (server-derived) — never from any client input.
  const { data: pays } = await db.from("payments" as never)
    .select("id,org_id,provider,verified,provider_txn_id")
    .eq("provider", "grow").eq("verified", true).not("provider_txn_id", "is", null)
    .limit(limit);
  const rows = ((pays as Array<{ id: string; org_id: string; provider: string | null; verified: boolean | null; provider_txn_id: string | null }> | null) ?? []);

  const env = growCreds().env === "production" ? "production" : "sandbox";

  for (const p of rows) {
    out.checked++;
    try {
      // Load THIS org's subscription (explicit org scope — no cross-tenant read).
      const { data: sub } = await db.from("subscriptions" as never)
        .select("status,grow_subscription_id").eq("org_id", p.org_id).maybeSingle();
      const s = sub as { status: string | null; grow_subscription_id: string | null } | null;

      const decision = decideActivation(p, s?.status ?? null);
      if (decision === "already_active") { out.alreadyConverged++; continue; }
      if (decision !== "activate") { out.skipped++; continue; }

      // Server-derived acknowledged quantity — the same source the webhook uses.
      const q = await getOrgBillingQuantity(p.org_id);
      const r = await activateOrgSubscriptionFromVerifiedPayment({
        orgId: p.org_id,
        recurringDebitId: s?.grow_subscription_id ?? null,
        quantity: q.billableAgents,
        transactionId: p.provider_txn_id,
        environment: env,
      });

      if (r.ok) {
        out.activated++;
        // Observability: a recovered activation is auditable via the billing feed.
        await emitBusinessEvent({
          type: DOMAIN_EVENTS.billingSubscriptionActivated, entityType: "billing", entityId: p.org_id, orgId: p.org_id,
          payload: { recovered: true, reference: p.id },
          idempotencyKey: `billing.activation.recovered:${p.id}`,
        }).catch(() => undefined);
      } else {
        // Activation failed → payment stays verified (NEVER marked failed); the
        // candidate remains eligible for the next run. Safe category only.
        // Observability: a stranded paid-but-not-active org is now QUERYABLE via
        // domain_events (not just console) so a chronic failure is diagnosable.
        out.failed++;
        console.error(`[activation-reconcile] activation failed org=${p.org_id} payment=${p.id}`);
        await emitBusinessEvent({
          type: DOMAIN_EVENTS.billingActivationFailed, entityType: "billing", entityId: p.org_id, orgId: p.org_id,
          payload: { reference: p.id, reason: "activation_call_failed" },
          idempotencyKey: `billing.activation_failed:${p.id}:${new Date().toISOString().slice(0, 10)}`,
        }).catch(() => undefined);
      }
    } catch (e) {
      out.failed++;
      const reason = e instanceof Error ? e.message : "error";
      console.error(`[activation-reconcile] error payment=${p.id}: ${reason}`);
      await emitBusinessEvent({
        type: DOMAIN_EVENTS.billingActivationFailed, entityType: "billing", entityId: p.org_id, orgId: p.org_id,
        payload: { reference: p.id, reason: "exception" },
        idempotencyKey: `billing.activation_failed:${p.id}:${new Date().toISOString().slice(0, 10)}`,
      }).catch(() => undefined);
    }
  }
  return out;
}
