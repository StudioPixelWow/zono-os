import { NextResponse, type NextRequest } from "next/server";
import { runScheduledAgents, listOrgsWithAgents } from "@/lib/agent-framework";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Persistent Agent Operations™ scheduled runner (Vercel Cron, Phase 29.2).
 * Runs ONLY eligible + enabled agents per org (scheduler foundation), persisting
 * their runs + inbox recommendations. NOTHING is auto-executed — every produced
 * item is 'pending' until a human approves/rejects. Reuses Chief of Staff +
 * Mission Action Center read-only. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const orgs = await listOrgsWithAgents();
    let ran = 0;
    for (const orgId of orgs) {
      const r = await runScheduledAgents(orgId, "cron").catch(() => ({ ok: false, ran: 0 }));
      ran += r.ran;
    }
    return NextResponse.json({ ok: true, orgs: orgs.length, agentsRun: ran, note: "no auto-execution — items await approval" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
