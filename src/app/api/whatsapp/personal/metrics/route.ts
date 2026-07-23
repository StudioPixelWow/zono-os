// ============================================================================
// ZONO — PERSONAL WhatsApp (Beta) METRICS scrape endpoint (server-only).
// ----------------------------------------------------------------------------
// Prometheus scrapes this for ZONO-side transport metrics (per-agent / session /
// QR / reconnect / outbound / inbound / failure-rate). Fail-closed bearer auth
// (METRICS_TOKEN, falling back to PERSONAL_WEBHOOK_TOKEN). Text exposition
// format. Visibility only — reads counters, changes nothing.
//
// Serverless note: counters are per-instance. For always-on scraping, run this on
// a long-lived host, or rely on the structured JSON logs → log-based metrics.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { registry, setWorkerConfigured } from "@/lib/whatsapp/provider/personal/observability";
import { personalTransportConfigured } from "@/lib/whatsapp/provider/personal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.METRICS_TOKEN?.trim() || process.env.PERSONAL_WEBHOOK_TOKEN?.trim();
  if (!token) return false;                                   // fail closed
  return (req.headers.get("authorization") ?? "") === `Bearer ${token}`;
}

export function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });
  setWorkerConfigured(personalTransportConfigured());         // reflect current config on scrape
  // Synthetic series are owned by the /synthetic endpoint's own scrape job —
  // exclude them here so the two jobs don't produce duplicate time series.
  return new NextResponse(registry.render({ exclude: "wa_personal_synthetic" }), {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" },
  });
}
