import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities, syncExternalListingsForOrganization } from "@/lib/external-listings/service";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SOFT_BUDGET_MS = 250_000;
// Below this inventory size an org gets a FULL catch-up scan to grow toward ~1000;
// once populated it drops to a QUICK newest-first maintenance top-up.
const DEEP_TARGET = 800;

/**
 * Order orgs LEAST-RECENTLY-SCANNED first (never-scanned first) so a thin / newly
 * onboarded office gets its deep scan before already-populated incumbents. This is
 * why a stuck-at-100 office (e.g. Landsman Rehovot, last scanned once) is scanned
 * first on the next run instead of waiting behind a heavy incumbent.
 */
async function orderByStalestScan(orgIds: string[]): Promise<string[]> {
  try {
    const db = createServiceRoleClient();
    const { data } = await db
      .from("import_jobs" as never)
      .select("org_id,created_at")
      .in("org_id", orgIds as never)
      .order("created_at", { ascending: false })
      .limit(5000);
    const last = new Map<string, string>();
    for (const r of ((data ?? []) as { org_id: string; created_at: string }[])) if (!last.has(r.org_id)) last.set(r.org_id, r.created_at);
    return [...orgIds].sort((a, b) => (last.get(a) ?? "").localeCompare(last.get(b) ?? ""));
  } catch {
    return orgIds;
  }
}

async function listingCount(orgId: string): Promise<number> {
  try {
    const db = createServiceRoleClient();
    const { count } = await db.from("external_listings" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Nightly external-listings sync (Vercel Cron, 02:00). Secured by CRON_SECRET.
 * ADAPTIVE DEPTH: a thin office gets a FULL catch-up scan (≤500/source) to grow
 * toward ~1000; a populated office gets a QUICK newest-first maintenance top-up.
 * Newest-first + upsert dedup means repeated full runs accumulate the provider's
 * available inventory over successive nights. Stalest-org first + a soft time
 * budget guarantee a thin office is actually reached and deep-scanned.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const orgs = await orderByStalestScan(await organizationsWithActiveLocalities());
    const results: unknown[] = [];
    const startedAt = Date.now();
    for (const orgId of orgs) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) {
        results.push({ organizationId: orgId, status: "deferred", reason: "soft time budget — next cron continues" });
        continue;
      }
      const mode = (await listingCount(orgId)) < DEEP_TARGET ? "full" : "quick";
      try {
        const s = await syncExternalListingsForOrganization(orgId, { mode });
        results.push({ organizationId: orgId, mode, inserted: s.inserted, updated: s.updated, success: s.success });
      } catch (e) {
        results.push({ organizationId: orgId, mode, success: false, error: e instanceof Error ? e.message : "sync failed" });
      }
    }
    return NextResponse.json({ ok: true, organizations: orgs.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
