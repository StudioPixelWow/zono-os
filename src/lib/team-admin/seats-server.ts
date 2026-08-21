import "server-only";
// ============================================================================
// ZONO — Team & Seats: server-side seat-quantity STAGING. A seat-change event
// (user activated / suspended / invitation accepted) moves the billable count
// (billableAgents = active users). This stages the new expected quantity onto
// the subscription (subscription_quantity) via the canonical reconciler, so the
// billing-boundary cron sees `subscription_quantity != provider_quantity` and
// converges the GROW provider at the next billing cycle. It NEVER calls a
// provider directly, never charges, and never issues a Morning document —
// payment/accounting truth stays entirely separate. Best-effort + idempotent
// (a losing concurrent reconciler is a no-op).
// ============================================================================
import { reconcileOrgBillingQuantity } from "@/lib/commercial/billing";

export async function stageOrgSeatQuantity(orgId: string): Promise<void> {
  if (!orgId) return;
  try { await reconcileOrgBillingQuantity(orgId); }
  catch (e) { console.error("[seats] stage quantity failed", e instanceof Error ? e.message : e); }
}
