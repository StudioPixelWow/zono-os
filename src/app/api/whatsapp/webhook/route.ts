// ============================================================================
// 💬 ZONO — WhatsApp Cloud API webhook (/api/whatsapp/webhook).
// GET  = Meta subscription verification (hub.challenge).
// POST = incoming messages + statuses → FAIL-CLOSED signature verify
//        (X-Hub-Signature-256) → EXACTLY-ONCE receipt gate → idempotent
//        processing into the EXISTING whatsapp_* tables (frozen processWebhook).
// Batch 6.6 hardening: signature now fails closed when no app secret is set, and
// a unique (phone_number_id, event_id) receipt ledger drops Meta retries before
// any side effect. Tokens are read server-side only; nothing is auto-sent here.
// ============================================================================
import type { NextRequest } from "next/server";
import { verifyWebhook, processWebhook } from "@/lib/whatsapp/cloud/service";
import { parseWebhook } from "@/lib/whatsapp/cloud/core";
import { verifySignatureStrict, recordReceiptOnce } from "@/lib/whatsapp/business/webhooks";

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
  // FAIL-CLOSED: reject unless a configured app secret verifies the raw body.
  if (!verifySignatureStrict(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("invalid signature", { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  // EXACTLY-ONCE: record each event in the unique receipt ledger; only proceed
  // when at least one event is new. Meta retries collapse to a no-op 200.
  const parsed = parseWebhook(payload);
  const events: { id: string; kind: "message" | "status" }[] = [
    ...parsed.messages.map((m) => ({ id: m.waMessageId, kind: "message" as const })),
    ...parsed.statuses.map((s) => ({ id: `${s.waMessageId}:${s.status}`, kind: "status" as const })),
  ];
  let fresh = 0;
  for (const e of events) { if (await recordReceiptOnce(parsed.phoneNumberId, e.id, e.kind)) fresh += 1; }
  if (events.length > 0 && fresh === 0) return Response.json({ ok: true, duplicate: true });

  const result = await processWebhook(payload).catch(() => null);
  // Always 200 once accepted + verified so Meta does not retry-storm.
  return Response.json({ ok: true, verified: true, fresh, ...(result ?? {}) });
}
