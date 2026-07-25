// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · messaging webhook ingress. Phase 6.
// GET  → Meta verification challenge (hub.challenge).
// POST → verify signature (reuses 6.8) → extract secret-free signals → derive org
//   from the TRUSTED asset mapping (never the payload) → enqueue a bounded pull.
//   Returns fast; no long provider pull here. No browser calls this.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { handleMessagingWebhook } from "@/lib/meta/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const verify = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (sp.get("hub.mode") === "subscribe" && verify && sp.get("hub.verify_token") === verify) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();   // exact raw bytes for signature verification
  const r = await handleMessagingWebhook(raw, req.headers.get("x-hub-signature-256") ?? req.headers.get("x-hub-signature"), req.headers.get("content-type"));
  // Always 200 to Meta once verified/handled (avoids delivery retries storms).
  return NextResponse.json({ ok: r.accepted, reason: r.reason }, { status: r.accepted ? 200 : 401 });
}
