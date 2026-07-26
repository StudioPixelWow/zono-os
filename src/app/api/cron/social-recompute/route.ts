// ============================================================================
// GET /api/cron/social-recompute  (P4.5, Vercel Cron)
// Scheduled, bounded social-interaction processing. Secured by CRON_SECRET (no
// session/browser auth). Iterates the server-side list of organizations that have
// social interactions and runs the EXISTING recomputeSocialLeads for each inside
// a service-role org context (runWithServiceRoleOrg) — every read/write is
// explicitly org-scoped, so tenants stay isolated and one org's failure never
// aborts the run or writes cross-tenant. Creates only review-first social_leads;
// NEVER creates CRM leads or emits lead.created. Dark until the ingestion feature
// flag is enabled. Idempotent: the partial unique index guarantees no duplicate
// social_leads even if runs overlap.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runWithServiceRoleOrg } from "@/lib/supabase/server-context";
import { recomputeSocialLeads, organizationsWithSocialInteractions } from "@/lib/social/service";
import { SOCIAL_INTERACTION_INGEST_ENABLED } from "@/lib/social/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Respect the existing feature state — dark by default, never globally enabled here.
  if (!SOCIAL_INTERACTION_INGEST_ENABLED) {
    return NextResponse.json({ ok: true, disabled: true, organizations: 0 });
  }

  const startedMs = Date.now();
  console.log(JSON.stringify({ at: "social_recompute.start" }));

  let orgs: string[] = [];
  try {
    orgs = await organizationsWithSocialInteractions();
  } catch (e) {
    console.error(JSON.stringify({ at: "social_recompute.org_list_failed", error: (e instanceof Error ? e.message : "err").slice(0, 160) }));
    return NextResponse.json({ ok: false, error: "org_list_failed" }, { status: 500 });
  }

  const totals = { scanned: 0, created: 0, deduped: 0, skipped: 0, failed: 0 };
  let failedOrgs = 0;
  for (const orgId of orgs) {
    try {
      const r = await runWithServiceRoleOrg(orgId, () => recomputeSocialLeads());
      totals.scanned += r.scanned; totals.created += r.created; totals.deduped += r.deduped;
      totals.skipped += r.skipped; totals.failed += r.failed;
    } catch (e) {
      // Per-organization isolation: this org's failure never aborts the run.
      failedOrgs += 1;
      console.error(JSON.stringify({ at: "social_recompute.org_failed", org: orgId, error: (e instanceof Error ? e.message : "err").slice(0, 160) }));
    }
  }

  const durationMs = Date.now() - startedMs;
  // Operational log — counts + org ids only. No message text, profile urls, PII or secrets.
  console.log(JSON.stringify({ at: "social_recompute.done", durationMs, organizations: orgs.length, failedOrgs, ...totals }));
  // Response carries only aggregate counts — no per-org detail, no sensitive data.
  return NextResponse.json({ ok: true, organizations: orgs.length, failedOrgs, durationMs, ...totals });
}
