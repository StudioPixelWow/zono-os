// ============================================================================
// ZONO — PERSONAL WhatsApp (Beta) inbound WEBHOOK (server-only).
// ----------------------------------------------------------------------------
// The external Evolution worker POSTs inbound events here. This route is
// transport-shape-agnostic: it authenticates fail-closed, then delegates ALL
// Evolution parsing to the adapter's C9 compat normalizer and feeds the CANONICAL
// result into the EXISTING shared ingest (no new model). It NEVER reads an
// Evolution field itself, never logs message bodies, and always returns 200 once
// authenticated so the worker never retry-storms.
//
// C10: when the personal transport is globally disabled, the route still
// authenticates and safely acknowledges (200) but triggers NO business side
// effects — it records only a minimal operational event (no content).
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { ingestBridgeMessage, ingestBridgeStatus } from "@/lib/whatsapp/provider/ingest";
import { normalizePersonalWebhook } from "@/lib/whatsapp/provider/personal";
import { personalWebhookToken } from "@/lib/whatsapp/provider/personal/webhook-url";
import { isPersonalWhatsappEnabled } from "@/lib/whatsapp/provider/personal-flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = personalWebhookToken();
  if (!token) return false;                                   // fail closed
  return (req.headers.get("authorization") ?? "") === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("forbidden", { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad_json" }, { status: 200 }); }

  // C10 disabled: authenticate, ack safely, NO side effects, minimal op log only.
  if (!isPersonalWhatsappEnabled()) {
    const evt = (body as { event?: string } | null)?.event ?? "unknown";
    console.log(`[wa-personal] disabled — acked event '${evt}' with no side effects`);
    return NextResponse.json({ ok: true, disabled: true }, { status: 200 });
  }

  try {
    const norm = normalizePersonalWebhook(body, new Date().toISOString());
    if (norm.kind === "message") {
      const r = await ingestBridgeMessage(norm.ctx, norm.message);
      return NextResponse.json({ ok: r.ok, reason: r.reason }, { status: 200 });
    }
    if (norm.kind === "status") {
      await ingestBridgeStatus(norm.ctx, norm.state, { displayName: null, phone: null, error: null });
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return NextResponse.json({ ok: false, reason: norm.reason }, { status: 200 });
  } catch (e) {
    console.error("[wa-personal] ingest failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 200 });
  }
}
