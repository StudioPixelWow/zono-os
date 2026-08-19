// ============================================================================
// ZONO — Property price-update CRON (server-only). Detects meaningful price drops
// (per-customer, from price_at_send vs current price) and processes recent
// back-on-market events, sending ONE consent-compliant customer message each,
// idempotent + audited via notification_deliveries. Bearer CRON_SECRET. Runs in
// business hours; WhatsApp defers past quiet hours via the existing engine.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runPriceUpdateDispatch } from "@/lib/customer-comm/price-drop";

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
    const r = await runPriceUpdateDispatch({ recoLimit: 3000, propertyLimit: 100 });
    return NextResponse.json({ ok: true, ...r, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "price_update_dispatch_failed" }, { status: 500 });
  }
}
