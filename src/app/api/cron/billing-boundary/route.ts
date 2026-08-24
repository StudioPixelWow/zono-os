// ============================================================================
// 💳 ZONO — BILLING BOUNDARY cron (GET). GROW recurring lifecycle at the cycle
// boundary. Provider-FIRST and INERT without GROW credentials (the underlying
// services return PENDING_SANDBOX_CREDENTIALS and change nothing), so this is
// safe to run before Sandbox/production is configured.
//
// Processes ONLY subscriptions with genuine due work (never every sub every day):
//   • cancel_at_period_end + period ended → cancel at GROW, then mark cancelled
//     LOCALLY only after the provider confirms (or when there is no live
//     instruction to cancel). A provider error leaves it for the next run.
//   • pending quantity drift (subscription_quantity ≠ provider_quantity) →
//     syncRecurringQuantityAtBoundary: updateDirectDebit to the SERVER-derived
//     monthly amount, persist provider_quantity only after provider success.
// Idempotent: the underlying provider-first services no-op when already synced /
// already cancelled, so a double cron run causes no duplicate provider change.
// GET + Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { syncRecurringQuantityAtBoundary, cancelGrowRecurring } from "@/lib/commercial/recurring";
import { reconcileVerifiedGrowActivations } from "@/lib/commercial/activation-reconcile";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  return isCronAuthorized(process.env.CRON_SECRET, req.headers.get("authorization"));
}

interface SubRow {
  org_id: string; status: string | null; cancel_at_period_end: boolean | null;
  period_end: string | null; subscription_quantity: number | null; provider_quantity: number | null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const startedMs = Date.now();
  const now = new Date().toISOString();
  const db = createServiceRoleClient();

  // ── Sub-job A: recurring quantity/cancel boundary (fully isolated) ─────────
  // Wrapped so a fetch/provider failure here can NEVER skip the activation
  // reconciler below; each subscription is additionally isolated so one bad row
  // does not abort the remaining bounded batch.
  let processed = 0, cancelled = 0, synced = 0, failed = 0, inert = 0;
  let boundaryError: string | null = null;
  try {
    // Read active subscriptions (bounded), then select genuine DUE work in JS —
    // PostgREST cannot compare two columns, so drift is computed here. Provider
    // calls still only fire for real due work (and the services re-gate them),
    // so we never issue a provider update for every subscription.
    const { data } = await db.from("subscriptions" as never)
      .select("org_id,status,cancel_at_period_end,period_end,subscription_quantity,provider_quantity")
      .neq("status", "cancelled")
      .limit(500);
    const rows = ((data as SubRow[] | null) ?? []).filter((s) =>
      (s.cancel_at_period_end === true && !!s.period_end && s.period_end <= now) ||
      (s.subscription_quantity != null && s.subscription_quantity !== s.provider_quantity)
    );

    for (const s of rows) {
      processed++;
      try {
        const cancelDue = s.cancel_at_period_end === true && !!s.period_end && s.period_end <= now;
        if (cancelDue) {
          const r = await cancelGrowRecurring(s.org_id);
          // Provider confirmed OR there is no live instruction to stop → finalize local.
          if (r.ok || (!r.ok && (r.reason === "NO_RECURRING_SUBSCRIPTION" || r.reason === "PENDING_SANDBOX_CREDENTIALS"))) {
            if (!r.ok && r.reason === "PENDING_SANDBOX_CREDENTIALS") inert++;
            await db.from("subscriptions" as never).update({ status: "cancelled", updated_at: now } as never).eq("org_id", s.org_id);
            cancelled++;
          } else {
            failed++; // PROVIDER_ERROR — never local-cancel on provider failure; retry next run.
          }
        } else {
          // Quantity drift → provider-first push at the boundary.
          const r = await syncRecurringQuantityAtBoundary(s.org_id);
          if (r.ok) synced++;
          else if (r.reason === "PENDING_SANDBOX_CREDENTIALS") inert++;
          else if (r.reason === "NOT_OWED" || r.reason === "NO_RECURRING_SUBSCRIPTION") { /* nothing to do */ }
          else failed++;
        }
      } catch (err) {
        failed++; // isolated: one subscription's failure never aborts the batch
        console.error(`[billing-boundary] subscription ${s.org_id} failed:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    boundaryError = err instanceof Error ? err.message : "boundary_sub_job_failed";
    console.error("[billing-boundary] boundary sub-job failed:", boundaryError);
  }

  // ── Sub-job B: verified-GROW activation reconcile (independent) ────────────
  // Recover any verified GROW payment whose subscription never converged to
  // 'active' (webhook crashed between markPaymentVerified and activation).
  // Idempotent + bounded. Runs regardless of the boundary sub-job's outcome.
  let activation = { checked: 0, activated: 0, alreadyConverged: 0, skipped: 0, failed: 0 };
  let activationError: string | null = null;
  try { activation = await reconcileVerifiedGrowActivations(); }
  catch (err) { activationError = err instanceof Error ? err.message : "activation_reconcile_failed"; console.error("[billing-boundary] activation reconcile failed:", activationError); }

  // ── Sub-job C: grace-expiry → BILLING_RESTRICTED (8.2; independent) ────────
  // Flip orgs whose 7-day grace window has passed to 'suspended' (restricted).
  // Provider-independent, idempotent, data-preserving; the entitlement gate
  // (billing-access.ts) reads the resulting state to block premium mutations.
  const restriction = { checked: 0, restricted: 0, failed: 0 };
  let restrictionError: string | null = null;
  try {
    const { data: graceRows } = await db.from("subscriptions" as never)
      .select("org_id,grace_until")
      .eq("status", "grace_period")
      .not("grace_until", "is", null)
      .lte("grace_until", now)
      .limit(500) as unknown as { data: Array<{ org_id: string; grace_until: string | null }> | null };
    const { restrictAfterGraceWindow } = await import("@/lib/commercial/lifecycle-server");
    for (const g of (graceRows ?? [])) {
      restriction.checked++;
      try { const r = await restrictAfterGraceWindow(g.org_id); if (r.restricted) restriction.restricted++; }
      catch (err) { restriction.failed++; console.error(`[billing-boundary] restrict ${g.org_id} failed:`, err instanceof Error ? err.message : err); }
    }
  } catch (err) {
    restrictionError = err instanceof Error ? err.message : "restriction_sub_job_failed";
    console.error("[billing-boundary] restriction sub-job failed:", restrictionError);
  }

  // All sub-jobs failing looks like infra failure (non-2xx); a single sub-job
  // failure is a partial outcome reported honestly with ok:false + 200.
  const ok = boundaryError === null && activationError === null && restrictionError === null;
  const status = boundaryError !== null && activationError !== null && restrictionError !== null ? 500 : 200;
  return NextResponse.json(
    { ok, processed, cancelled, synced, failed, inert, boundaryError, activation, activationError, restriction, restrictionError, durationMs: Date.now() - startedMs },
    { status },
  );
}
