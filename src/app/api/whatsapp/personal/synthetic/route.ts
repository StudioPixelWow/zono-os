// ============================================================================
// ZONO — PERSONAL WhatsApp (Beta) SYNTHETIC monitor endpoint (SRE, server-only).
// ----------------------------------------------------------------------------
// Executes the read-only synthetic readiness sweep on each request and exposes
// the dedicated synthetic metrics (Prometheus text). A scheduler / Prometheus
// job hits this every 5 minutes → the sweep runs and the gauges refresh. It
// creates NO customer session and NO real WhatsApp session. Fail-closed bearer
// auth (SYNTHETIC_TOKEN → METRICS_TOKEN → PERSONAL_WEBHOOK_TOKEN).
// `?format=json` returns the per-check detail for humans/on-call.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { runSynthetic } from "@/lib/whatsapp/provider/personal/synthetic";
import { registry } from "@/lib/whatsapp/provider/personal/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.SYNTHETIC_TOKEN?.trim() || process.env.METRICS_TOKEN?.trim() || process.env.PERSONAL_WEBHOOK_TOKEN?.trim();
  if (!token) return false;                                   // fail closed
  return (req.headers.get("authorization") ?? "") === `Bearer ${token}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  const result = await runSynthetic();

  if (new URL(req.url).searchParams.get("format") === "json") {
    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  }
  // Prometheus scrape: 200 always so the scrape succeeds; health is in the gauge.
  return new NextResponse(registry.render({ include: "wa_personal_synthetic" }), {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" },
  });
}
