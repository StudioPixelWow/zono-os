// ============================================================================
// ZONO — Seller lifecycle CRON (server-only). Scans actively-listed + recently-
// closed properties and sends at most ONE restrained seller transition each
// (live / first-interest / price-update / closed), consent-gated + idempotent via
// notification_deliveries. Bearer CRON_SECRET. Business hours; WhatsApp defers
// past quiet hours. The weekly report runs on its own separate cron.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runSellerLifecycleDispatch } from "@/lib/customer-comm/seller-comm";

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
    const r = await runSellerLifecycleDispatch({ propertyLimit: 300 });
    return NextResponse.json({ ok: true, ...r, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "seller_lifecycle_dispatch_failed" }, { status: 500 });
  }
}
