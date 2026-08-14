// ============================================================================
// ZONO — CUSTOM → STANDARD BILLING RETURN APPROVAL (server-only). P8.4.
// LOCKED PRODUCT DECISION B: when an org that crossed into custom_pricing_required
// (>10 active) later returns to ≤10, the commercial EXPECTATION recomputes standard
// pricing automatically, but provider synchronization MUST NOT auto-resume. A
// privileged platform operator must explicitly approve the return to standard
// provider billing. This is that seam — server-authoritative, capability-gated,
// reason-mandatory, audited. It is NEVER exposed to customer users and performs no
// raw provider operation itself; it only clears the CUSTOM_REVIEW_REQUIRED hold so
// the P8.3 reconciler may resume standard sync on the next cycle.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "@/lib/platform-admin/server/auth";
import { writePlatformAudit } from "@/lib/platform-admin/server/audit";
import { getOrgBillingQuantity } from "./billing";

export interface StandardReturnResult { ok: boolean; reason?: string }

/**
 * Approve an org's return to standard per-agent provider billing after a custom
 * (>10) period. Requires platform.billing.manage + a mandatory reason. Only
 * succeeds when the org is genuinely back to ≤10 active agents (server-derived) —
 * it will NOT override a still-custom org. Clears the hold (quantity_sync_status
 * custom_review_required → sync_required) so the reconciler resumes; it does not
 * itself call the provider.
 */
export async function approveStandardBillingReturn(orgId: string, reason: string): Promise<StandardReturnResult> {
  const operator = await assertPlatformCapability("platform.billing.manage");
  if (!reason?.trim()) return { ok: false, reason: "reason_required" };

  const q = await getOrgBillingQuantity(orgId);
  if (q.customPricingRequired) return { ok: false, reason: "still_custom_pricing" }; // >10 → cannot approve

  const db = createServiceRoleClient();
  // Only lift an existing custom-review hold; never touch other states.
  const { data } = await db.from("subscriptions" as never)
    .update({ quantity_sync_status: "sync_required", updated_at: new Date().toISOString() } as never)
    .eq("org_id", orgId)
    .eq("quantity_sync_status", "custom_review_required")
    .select("org_id")
    .maybeSingle();

  await writePlatformAudit({
    operator, capability: "platform.billing.manage",
    action: "billing.standard_return.approved", resourceType: "organization",
    targetOrgId: orgId, metadata: { reason: reason.trim(), billableAgents: q.billableAgents, lifted: !!data },
  });

  return { ok: true, reason: data ? "hold_lifted" : "no_hold_present" };
}
