// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK route. Phase 3C.
// GET  → subscription verification challenge (hub.* params).
// POST → verified, deduplicated event ingestion. The signature is checked over the
//   EXACT raw request bytes BEFORE any trusted field is parsed; the org is derived
//   from provider evidence, never the payload. Meta receives a fast acknowledgement
//   that does NOT imply successful internal processing. Not a generic proxy.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { handleChallenge, ingestWebhook } from "@/lib/meta/webhooks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const r = handleChallenge({ mode: sp.get("hub.mode"), verifyToken: sp.get("hub.verify_token"), challenge: sp.get("hub.challenge") });
  if (!r.ok) return NextResponse.json({ error: "verification_failed" }, { status: 403 });
  // Meta expects the raw challenge echoed back as text/plain.
  return new NextResponse(r.challenge ?? "", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-hub-signature-256");
  const contentType = req.headers.get("content-type");
  // Read the EXACT raw bytes for signature verification.
  const raw = await req.text();
  const result = await ingestWebhook(raw, signature, contentType);
  // Always 200-acknowledge a well-formed delivery attempt so Meta does not retry a
  // storm; a rejected signature returns 401 (never processed). Ack ≠ processed.
  if (!result.accepted) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true });
}
