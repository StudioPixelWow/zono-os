// ============================================================================
// 🌐 ZONO — Distribution GROUPS publishing · LOST-ACK RECONCILE CRON (GET).
// ----------------------------------------------------------------------------
// P9.1 recovery tick. Finds group posts stranded in-flight (publish_state
// 'dispatching'/'awaiting_confirmation') whose extension LEASE expired without a
// reported result, and moves them to 'awaiting_reconciliation' — an AMBIGUOUS
// state resolved ONLY by an explicit human decision (אכן פורסם / לא פורסם /
// ביטול) in Publishing Control. It NEVER re-posts and NEVER requeues, so a lost
// acknowledgement can never cause a duplicate Facebook post.
//
// All work is done by the DB function reconcile_stale_distribution_posts():
// set-based, idempotent (a swept row leaves the in-flight states), concurrency-
// safe (FOR UPDATE SKIP LOCKED) and auditable (one append-only event per post).
// GET + Bearer CRON_SECRET (identical to meta-recover / kernel-drain).
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Slack beyond lease expiry before a post is treated as truly stranded, so a
// briefly-late extension ack is never swept out from under the human.
const GRACE_SECONDS = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // distribution_* RPCs are not in the generated Database types (same as
    // claim_next_distribution_post, which the state machine calls via `Db = any`);
    // cast to a loose rpc signature so the typed client does not reject the name.
    const db = createServiceRoleClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const sweep = await db.rpc("reconcile_stale_distribution_posts", { p_grace_seconds: GRACE_SECONDS });
    if (sweep.error) return NextResponse.json({ ok: false, error: sweep.error.message }, { status: 500 });
    // P9.2: pause future posts whose linked property became unavailable (sold/rented/
    // withdrawn/archived) so an office never keeps marketing a property it no longer has.
    const guard = await db.rpc("pause_posts_for_unavailable_properties", {});
    if (guard.error) return NextResponse.json({ ok: false, error: guard.error.message }, { status: 500 });
    const swept = typeof sweep.data === "number" ? sweep.data : Number(sweep.data ?? 0);
    const pausedUnavailable = typeof guard.data === "number" ? guard.data : Number(guard.data ?? 0);
    return NextResponse.json({ ok: true, swept, pausedUnavailable, graceSeconds: GRACE_SECONDS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "reconcile_failed" }, { status: 500 });
  }
}
