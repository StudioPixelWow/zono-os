// ============================================================================
// GET /api/internal/social/ingestion-health  (P4.6)
// INTERNAL, read-only health probe for the social-ingestion pipeline. Mirrors the
// meta queue-health convention. PROTECTED: Bearer CRON_SECRET only. Returns
// aggregate counts + feature state — no identifiers, tokens, payloads, or PII.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getSocialIngestionHealth } from "@/lib/social/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await getSocialIngestionHealth()) });
}
