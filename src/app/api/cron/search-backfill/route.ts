import { NextResponse, type NextRequest } from "next/server";
import { backfillSearch } from "@/lib/search-projection";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * ZONO OS 2.0 — Batch 5.6B · Search projection backfill (on-demand + cron).
 * Seeds/refreshes canonical search_documents (incl. first-class journey docs)
 * idempotently via the SAME builders as the live event path — safe to re-run.
 *
 * Dual-gated:
 *  • Vercel Cron / ops with CRON_SECRET → backfills ALL orgs.
 *  • An authenticated MANAGER → backfills their OWN org only.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    try {
      const result = await backfillSearch();
      return NextResponse.json({ ok: true, scope: "all_orgs", ...result });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "backfill failed" }, { status: 500 });
    }
  }

  // Manager session → own org only (RLS-safe scoping via profile.org_id).
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { isManager = false; }
  if (!isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const result = await backfillSearch({ orgId: profile.org_id });
    return NextResponse.json({ ok: true, scope: "own_org", orgId: profile.org_id, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "backfill failed" }, { status: 500 });
  }
}
