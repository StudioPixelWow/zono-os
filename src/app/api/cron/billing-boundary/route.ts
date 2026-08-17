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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

interface SubRow {
  org_id: string; status: string | null; cancel_at_period_end: boolean | null;
  period_end: string | null; subscription_quantity: number | null; provider_quantity: number | null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date().toISOString();
  const db = createServiceRoleClient();

  let processed = 0, cancelled = 0, synced = 0, failed = 0, inert = 0;
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
        continue;
      }
      // Quantity drift → provider-first push at the boundary.
      const r = await syncRecurringQuantityAtBoundary(s.org_id);
      if (r.ok) synced++;
      else if (r.reason === "PENDING_SANDBOX_CREDENTIALS") inert++;
      else if (r.reason === "NOT_OWED" || r.reason === "NO_RECURRING_SUBSCRIPTION") { /* nothing to do */ }
      else failed++;
    }

    return NextResponse.json({ ok: true, processed, cancelled, synced, failed, inert, durationMs: Date.now() - new Date(now).getTime() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "billing_boundary_failed", processed, cancelled, synced, failed }, { status: 500 });
  }
}
