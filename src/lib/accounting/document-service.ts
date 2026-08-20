/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Accounting document ISSUE SERVICE (server-only). The single entry point:
//   ensureAccountingDocumentForVerifiedPayment(paymentId)
// A verified GROW payment → EXACTLY ONE Morning document. Guarantees:
//   • VERIFIED-ONLY: refuses any payment that isn't authoritative-verified.
//   • IDEMPOTENT: invoice state lives on the payment row; a row that already has a
//     Morning doc id is never re-issued.
//   • CONCURRENCY-SAFE: an atomic compare-and-set claim (…→'issuing', guarded by
//     invoice_doc_id IS NULL) means only ONE worker calls Morning — two callbacks,
//     two cron workers, a webhook replay, or manual retry all converge on one doc.
//   • NON-BLOCKING: never throws; a Morning outage marks the row retryable and the
//     recovery cron finishes it — the GROW webhook/subscription never roll back.
//   • RECONCILED: the document total must match the charged amount or it is flagged
//     for operator attention (never silently "issued"), without re-issuing.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { morningConfig } from "./morning-config";
import { getMorningDocumentPolicy, amountsReconcile, classifyMorningFailure } from "./morning-policy";
import { resolveBillingCustomer } from "./billing-customer";
import {
  morningSearchClientByTaxId, morningCreateClient, morningCreateDocument, morningDocUrl,
  type MorningClientInput,
} from "./morning-client";

const MAX_ATTEMPTS = 6;
const TABLE = "payments";

export type EnsureOutcome =
  | { ok: true; status: "issued" | "already_issued"; docId: string; number: string | null }
  | { ok: false; status: "skipped" | "not_verified" | "not_eligible" | "claimed_elsewhere" | "not_configured" | "no_customer" | "retry_scheduled" | "failed"; reason: string };

interface PayRow {
  id: string; org_id: string | null; draft_id: string | null; provider: string; provider_txn_id: string | null;
  amount_ils: number; currency: string; verified: boolean; verified_at: string | null; environment: string;
  plan_tier: string; invoice_status: string | null; invoice_doc_id: string | null; invoice_number: string | null;
  invoice_attempts: number;
}

function backoffIso(attempts: number): string {
  const mins = Math.min(60, 5 * Math.pow(2, Math.max(0, attempts - 1))); // 5,10,20,40,60,60
  return new Date(Date.now() + mins * 60_000).toISOString();
}

/**
 * Ensure a Morning accounting document exists for a VERIFIED payment. Safe to call
 * from the webhook, the recovery cron, and manual retry concurrently.
 */
export async function ensureAccountingDocumentForVerifiedPayment(paymentId: string): Promise<EnsureOutcome> {
  const cfg = morningConfig();
  const db: any = createServiceRoleClient();

  const { data: pRaw } = await db.from(TABLE).select(
    "id,org_id,draft_id,provider,provider_txn_id,amount_ils,currency,verified,verified_at,environment,plan_tier,invoice_status,invoice_doc_id,invoice_number,invoice_attempts",
  ).eq("id", paymentId).maybeSingle();
  const p = pRaw as PayRow | null;
  if (!p) return { ok: false, status: "skipped", reason: "payment_not_found" };

  // ── Authoritative gates ────────────────────────────────────────────────────
  if (p.verified !== true || !p.provider_txn_id) return { ok: false, status: "not_verified", reason: "payment_not_verified" };
  if (p.invoice_doc_id) return { ok: true, status: "already_issued", docId: p.invoice_doc_id, number: p.invoice_number };
  if (!p.org_id) return { ok: false, status: "skipped", reason: "no_org" };
  if (!cfg.configured) return { ok: false, status: "not_configured", reason: "morning_not_configured" };

  // Go-live cutoff — never auto-issue for payments verified before the start-at.
  if (cfg.invoicingStartAt && p.verified_at && p.verified_at < cfg.invoicingStartAt) {
    return { ok: false, status: "not_eligible", reason: "before_go_live_cutoff" };
  }

  // ── Atomic claim (compare-and-set). invoice_doc_id IS NULL is the hard
  //    duplicate guard: a row that already produced a Morning doc is never claimed. ─
  const { data: claimed } = await db.from(TABLE)
    .update({ invoice_status: "issuing", invoice_provider: "morning", updated_at: new Date().toISOString() })
    .eq("id", paymentId)
    .is("invoice_doc_id", null)
    .or("invoice_status.is.null,invoice_status.eq.pending,invoice_status.eq.failed")
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, status: "claimed_elsewhere", reason: "issuing_or_issued_elsewhere" };

  try {
    // ── Billing customer + Morning client dedup ──────────────────────────────
    const resolved = await resolveBillingCustomer({ orgId: p.org_id, draftId: p.draft_id });
    if (!resolved) return await fail(db, p, "no_customer_name", "permanent");

    const clientId = await ensureMorningClient(db, p.org_id, resolved.client);

    // ── Document content (verified server-side facts) ────────────────────────
    const policy = getMorningDocumentPolicy({
      configuredDocType: cfg.documentType, configuredVatType: cfg.vatType, paymentConfirmed: true,
    });
    const date = (p.verified_at ?? new Date().toISOString()).slice(0, 10);
    const amount = Number(p.amount_ils);
    const currency = p.currency || "ILS";
    const description = `מנוי ZONO — ${p.plan_tier}`;

    const res = await morningCreateDocument({
      type: policy.documentType,
      date, lang: cfg.lang, currency, vatType: policy.vatType,
      clientId: clientId ?? null,
      client: clientId ? undefined : resolved.client,
      income: [{ description, quantity: 1, price: amount, currency, vatType: policy.vatType }],
      payment: [{ type: policy.paymentType, price: amount, currency, date }],
      remarks: `ZONO ${p.plan_tier} · txn ${p.provider_txn_id}`,
      emails: cfg.sendEmail ? resolved.client.emails : undefined, // Morning is the ONE delivery channel
    });

    if (!res.ok || !res.data?.id) {
      const kind = classifyMorningFailure(res.httpStatus);
      return await fail(db, p, res.error ?? "create_failed", kind);
    }

    // ── Reconciliation — the document total MUST match the charged amount ─────
    const docId = String(res.data.id);
    const number = res.data.number != null ? String(res.data.number) : null;
    const url = morningDocUrl(res.data);
    const docAmount = typeof res.data.amount === "number" ? res.data.amount : amount;

    if (!amountsReconcile(amount, docAmount)) {
      // A document WAS created — persist its ref (so no duplicate is ever issued),
      // but flag it terminally for operator attention rather than "issued".
      await db.from(TABLE).update({
        invoice_status: "failed", invoice_doc_id: docId, invoice_number: number, invoice_type: policy.documentType,
        invoice_url: url, invoice_amount: docAmount, invoice_currency: currency,
        invoice_error: `amount_mismatch:payment=${amount},doc=${docAmount}`,
        invoice_attempts: MAX_ATTEMPTS, invoice_next_retry_at: null, updated_at: new Date().toISOString(),
      }).eq("id", paymentId);
      await emitFailed(p.org_id, p.provider_txn_id, "amount_mismatch");
      return { ok: false, status: "failed", reason: "amount_mismatch" };
    }

    await db.from(TABLE).update({
      invoice_status: "issued", invoice_doc_id: docId, invoice_number: number, invoice_type: policy.documentType,
      invoice_url: url, invoice_amount: docAmount, invoice_currency: currency, invoice_error: null,
      invoice_issued_at: new Date().toISOString(), invoice_next_retry_at: null, updated_at: new Date().toISOString(),
    }).eq("id", paymentId);

    await emitBusinessEvent({
      type: DOMAIN_EVENTS.accountingDocumentIssued, entityType: "billing", entityId: p.org_id, orgId: p.org_id,
      payload: { paymentId, docId, number, type: policy.documentType },
      idempotencyKey: `accounting.issued:${p.provider_txn_id}`,
    }).catch(() => undefined);

    return { ok: true, status: "issued", docId, number };
  } catch {
    // Any unexpected error: release the claim as retryable (never leave 'issuing').
    return await fail(db, p, "unexpected_error", "transient");
  }
}

/** Dedup a Morning client for the org: reuse org.morning_client_id → else search by
 *  tax id → else create; persist the linkage. Returns the client id (or null → the
 *  document call falls back to inline client creation). */
async function ensureMorningClient(db: any, orgId: string, client: MorningClientInput): Promise<string | null> {
  const { data: org } = await db.from("organizations").select("morning_client_id").eq("id", orgId).maybeSingle();
  const existing = (org as { morning_client_id?: string | null } | null)?.morning_client_id ?? null;
  if (existing) return existing;

  // Deterministic lookup by tax id only (a strong identity); never merge on a weak match.
  if (client.taxId) {
    const found = await morningSearchClientByTaxId(client.taxId);
    const hit = found.ok ? found.data?.items?.[0]?.id ?? null : null;
    if (hit) { await db.from("organizations").update({ morning_client_id: hit }).eq("id", orgId); return hit; }
  }

  const created = await morningCreateClient(client);
  const id = created.ok ? created.data?.id ?? null : null;
  if (id) await db.from("organizations").update({ morning_client_id: id }).eq("id", orgId);
  return id ?? null; // null → morningCreateDocument creates the client inline (add:true)
}

async function fail(db: any, p: PayRow, error: string, kind: "transient" | "permanent"): Promise<EnsureOutcome> {
  const attempts = (p.invoice_attempts ?? 0) + 1;
  const terminal = kind === "permanent" || attempts >= MAX_ATTEMPTS;
  await db.from(TABLE).update({
    invoice_status: "failed", invoice_error: error.slice(0, 300), invoice_attempts: attempts,
    invoice_next_retry_at: terminal ? null : backoffIso(attempts), updated_at: new Date().toISOString(),
  }).eq("id", p.id);
  if (terminal) await emitFailed(p.org_id, p.provider_txn_id, error);
  return terminal
    ? { ok: false, status: "failed", reason: error }
    : { ok: false, status: "retry_scheduled", reason: error };
}

async function emitFailed(orgId: string | null, txn: string | null, error: string): Promise<void> {
  if (!orgId) return;
  await emitBusinessEvent({
    type: DOMAIN_EVENTS.accountingDocumentFailed, entityType: "billing", entityId: orgId, orgId,
    payload: { reason: error.slice(0, 120) }, idempotencyKey: `accounting.failed:${txn}:${error.slice(0, 40)}`,
  }).catch(() => undefined);
}
