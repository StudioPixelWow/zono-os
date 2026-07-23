// ============================================================================
// 💳 ZONO — Grow payment webhook. Batch 6.4. The ONLY path that can activate an
// account. Mirrors the frozen WhatsApp Cloud webhook: RAW body → HMAC-SHA256
// verify (fail closed) → parse → confirm. A browser returning from Grow NEVER
// activates anything — only a signed webhook that passes verification does.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/commercial/verification";
import { growWebhookSecret } from "@/lib/commercial/grow";
import { confirmVerifiedGrowPayment, recordGrowFailure } from "@/lib/commercial/confirm";
import type { PaymentStatus } from "@/lib/commercial/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();                       // RAW body — verify BEFORE parse
  const header = req.headers.get("x-grow-signature") ?? req.headers.get("x-signature");
  if (!verifyWebhookSignature(growWebhookSecret(), raw, header)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; }
  catch { return new NextResponse("bad json", { status: 400 }); }

  // Grow echoes our paymentId back in a custom field; the transaction id gives
  // idempotency. Field names are mapped defensively (finalized with Grow later).
  const p = payload as Record<string, string | undefined>;
  const paymentId = p.cField1 ?? p.customField1 ?? p.paymentId;
  const txnId = p.transactionId ?? p.transactionToken ?? p.asmachta ?? "";
  const status = String(p.status ?? p.paymentStatus ?? "").toLowerCase();
  if (!paymentId) return NextResponse.json({ ok: false, reason: "no_payment_ref" });

  try {
    const success = ["paid", "success", "approved", "completed"].includes(status) || p.statusCode === "2";
    if (success) {
      const r = await confirmVerifiedGrowPayment({ paymentId, providerTxnId: String(txnId), signature: header ?? "", rawPayload: payload });
      return NextResponse.json({ ok: r.ok });
    }
    const map: Record<string, PaymentStatus> = { failed: "failed", cancelled: "cancelled", canceled: "cancelled", expired: "expired" };
    await recordGrowFailure(paymentId, (map[status] ?? "failed") as "failed" | "cancelled" | "expired");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });   // 200 to avoid retry storms once accepted
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "grow-webhook" });
}
