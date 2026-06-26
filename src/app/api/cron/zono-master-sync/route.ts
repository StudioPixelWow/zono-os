import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities } from "@/lib/external-listings/service";
import { runZonoOrchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ZONO Master Sync (Vercel Cron). Runs the full orchestration per organization:
 * external sync → transactions → bridge → events → alerts. Secured by CRON_SECRET.
 * Service-role; session-scoped recompute (snapshots/decision-brain) runs on the
 * next dashboard load. Supersedes the per-pipeline crons (kept for compatibility).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const orgs = await organizationsWithActiveLocalities();
    const results = [];
    for (const orgId of orgs) {
      const r = await runZonoOrchestrator({
        organizationId: orgId,
        trigger: "scheduled_cron",
        force: true,
        source: "zono-master-sync",
      });
      results.push({ organizationId: orgId, status: r.status, durationMs: r.durationMs, steps: r.steps.map((s) => ({ name: s.name, status: s.status, summary: s.summary })) });
    }
    return NextResponse.json({ ok: true, organizations: orgs.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
