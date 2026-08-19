// ============================================================================
// ZONO — Marketing Autopilot weekly SCAN (server-only). Restrained: once per
// workweek it evaluates active properties and emits marketing.attention_required
// (idempotent per property/day) for the ones needing marketing work. It NEVER
// publishes or messages — surfacing only (Morning Brief / in-app). Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runMarketingAttentionScan } from "@/lib/marketing-autopilot/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const r = await runMarketingAttentionScan({ orgLimit: 100, perOrgLimit: 200 });
    return NextResponse.json({ ok: true, ...r, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "marketing_scan_failed" }, { status: 500 });
  }
}
