// ============================================================================
// 💬 ZONO — WhatsApp Cloud API webhook (/api/whatsapp/webhook). PHASE 48.0.
// GET  = Meta subscription verification (hub.challenge).
// POST = incoming messages + statuses → verified (X-Hub-Signature-256) →
//        idempotent processing into the EXISTING whatsapp_* tables.
// Tokens are read server-side only; nothing is ever auto-sent from here.
// ============================================================================
import type { NextRequest } from "next/server";
import { verifyWebhook, verifySignature, processWebhook } from "@/lib/whatsapp/cloud/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const r = verifyWebhook({ mode: p.get("hub.mode"), token: p.get("hub.verify_token"), challenge: p.get("hub.challenge") });
  if (r.ok && r.challenge) return new Response(r.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = verifySignature(raw, req.headers.get("x-hub-signature-256"));
  if (!sig.ok) return new Response("invalid signature", { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const result = await processWebhook(payload).catch(() => null);
  // Always 200 once accepted so Meta does not retry-storm; body is diagnostic only.
  return Response.json({ ok: true, verified: sig.reason, ...(result ?? {}) });
}
