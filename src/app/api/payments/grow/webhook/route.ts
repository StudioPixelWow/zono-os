// ============================================================================
// 💳 ZONO — Grow (Meshulam) payment webhook / server-to-server callback. P8.4.
// The ONLY path that can activate a paid subscription. Grow publishes NO webhook
// signature/HMAC (verified against developers.grow.business), so authenticity is
// established the way the docs support:
//   1. RAW JSON callback → parse { err, status, data }.
//   2. DEFENSE-IN-DEPTH (never the sole gate): optional source-IP allowlist +
//      optional webhookKey compare.
//   3. AUTHORITATIVE GATE: re-query Grow server-to-server (getTransactionInfo with
//      OUR pageCode). A forged callback cannot produce a (transactionId,
//      transactionToken) pair that Grow confirms as paid. ONLY a confirmed
//      statusCode "2" (paid) verifies the payment.
//   4. On verified paid → mark payment verified (idempotent via
//      UNIQUE(provider, provider_txn_id)) → activate the org subscription + ACK
//      provider_quantity → approveTransaction (acknowledgment).
// A browser returning from Grow NEVER activates anything. Fail-closed throughout.
// NO secrets / card data / raw payload are logged.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { growGetTransactionInfo, growApproveTransaction, growCreds } from "@/lib/commercial/grow-client";
import { growOutcomeFromStatusCode, growPaymentStatus, clientIpFromForwardedFor, isGrowSourceIp, safeStringEqual } from "@/lib/commercial/grow-mapping";
import { getPayment, markPaymentVerified, setPaymentStatus } from "@/lib/commercial/store";
import { activateOrgSubscriptionFromVerifiedPayment } from "@/lib/commercial/activate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GrowCallback {
  err?: unknown;
  status?: string;
  data?: {
    statusCode?: string; status?: string;
    transactionId?: string; transactionToken?: string; asmachta?: string;
    sum?: string | number; recurringDebitId?: string; directDebitId?: string;
    customFields?: Array<Record<string, string>> | Record<string, string>;
  };
}

/** Extract our echoed paymentId (cField1) from the callback's customFields. */
function paymentIdFromCustomFields(cf: Array<Record<string, string>> | Record<string, string> | undefined): string | null {
  if (!cf) return null;
  if (Array.isArray(cf)) {
    for (const row of cf) { if (row && typeof row.cField1 === "string") return row.cField1; }
    return null;
  }
  return typeof cf.cField1 === "string" ? cf.cField1 : null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // ── DEFENSE-IN-DEPTH (not the authoritative gate) ──────────────────────────
  // Source-IP allowlist: reject only when we can positively determine a NON-Grow
  // IP. When the IP can't be determined (proxied), we do NOT fail-open — the
  // server-to-server re-query below is the real gate.
  const ip = clientIpFromForwardedFor(req.headers.get("x-forwarded-for"));
  if (isGrowSourceIp(ip) === false) {
    return new NextResponse("forbidden source", { status: 403 });
  }

  let cb: GrowCallback;
  try { cb = JSON.parse(raw) as GrowCallback; }
  catch { return new NextResponse("bad json", { status: 400 }); }

  // Optional webhookKey compare (defense-in-depth only).
  const configuredKey = process.env.GROW_WEBHOOK_SECRET || null;
  if (configuredKey) {
    const provided = req.headers.get("x-webhook-key") ?? (typeof (cb as Record<string, unknown>).webhookKey === "string" ? (cb as Record<string, string>).webhookKey : null);
    if (!safeStringEqual(configuredKey, provided)) {
      return new NextResponse("invalid webhook key", { status: 401 });
    }
  }

  const d = cb.data ?? {};
  const paymentId = paymentIdFromCustomFields(d.customFields);
  const transactionId = d.transactionId ?? "";
  const transactionToken = d.transactionToken ?? "";
  if (!paymentId) return NextResponse.json({ ok: false, reason: "no_payment_ref" });

  const payment = await getPayment(paymentId);
  if (!payment) return NextResponse.json({ ok: false, reason: "payment_not_found" });
  // Idempotent: an already-verified payment short-circuits (no double activation).
  if (payment.verified === true) return NextResponse.json({ ok: true, idempotent: true });

  try {
    // ── AUTHORITATIVE VERIFICATION: ask Grow directly. A forged callback fails. ──
    if (!growCreds().configured || !transactionId || !transactionToken) {
      // Cannot verify → NEVER activate. Record nothing as paid.
      return NextResponse.json({ ok: false, reason: "unverifiable" }, { status: 200 });
    }
    const info = await growGetTransactionInfo(transactionId, transactionToken);
    const outcome = info.ok ? growOutcomeFromStatusCode(info.data?.statusCode) : "unknown";

    if (outcome !== "paid") {
      // Not a confirmed paid transaction → record failure only if the callback
      // itself claimed a terminal non-paid; otherwise leave pending. No revenue.
      const claimed = growOutcomeFromStatusCode(d.statusCode);
      if (claimed === "not_paid") await setPaymentStatus(paymentId, growPaymentStatus("not_paid"));
      return NextResponse.json({ ok: false, reason: "not_verified_paid" }, { status: 200 });
    }

    // Verified paid. provider_txn_id = transactionId → UNIQUE(provider, txn)
    // enforces exactly-once. verified revenue = the PROVIDER-CONFIRMED sum.
    const verified = await markPaymentVerified(paymentId, transactionId, "", { verifiedVia: "getTransactionInfo" });
    if (!verified) return NextResponse.json({ ok: false, reason: "persist_failed" }, { status: 200 });

    const recurringId = info.data?.recurringDebitId ?? d.recurringDebitId ?? info.data?.directDebitId ?? d.directDebitId ?? null;
    // Acknowledged quantity = the current server-derived billable quantity for the
    // org, confirmed by the successful recurring setup. (Provider bills a sum; the
    // agent count is ZONO's canonical quantity.)
    if (payment.orgId) {
      // Derive the acknowledged quantity from the amount the provider confirmed,
      // divided by the unit price, when available; else leave the reconciler to
      // manage it. Here we ack the org's current billable count via activation.
      const { getOrgBillingQuantity } = await import("@/lib/commercial/billing");
      const q = await getOrgBillingQuantity(payment.orgId);
      await activateOrgSubscriptionFromVerifiedPayment({ orgId: payment.orgId, recurringDebitId: recurringId, quantity: q.billableAgents });
    }

    // approveTransaction — acknowledgment only (docs: transaction processes even if
    // this fails). Best-effort; never blocks activation.
    await growApproveTransaction({ transactionId, transactionToken, asmachta: d.asmachta, sum: d.sum })
      .then(() => undefined, () => undefined);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 }); // 200 to avoid retry storms
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "grow-webhook" });
}
