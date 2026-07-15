import { NextResponse, type NextRequest } from "next/server";
import { backfillJourneyGraph } from "@/lib/kernel/journey-graph-backfill";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * ZONO OS 2.0 — Batch 5.6C · Canonical Journey graph backfill (on-demand + cron).
 * Seeds/refreshes HAS_JOURNEY edges on entity_relationships idempotently. Dual-
 * gated: CRON_SECRET → all orgs; an authenticated MANAGER → own org only.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    try {
      const result = await backfillJourneyGraph();
      return NextResponse.json({ ok: true, scope: "all_orgs", ...result });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "backfill failed" }, { status: 500 });
    }
  }

  const { user, profile } = await getSessionContext();
  if (!user || !profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { isManager = false; }
  if (!isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const result = await backfillJourneyGraph(profile.org_id);
    return NextResponse.json({ ok: true, scope: "own_org", orgId: profile.org_id, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "backfill failed" }, { status: 500 });
  }
}
