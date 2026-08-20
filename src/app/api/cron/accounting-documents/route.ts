// ============================================================================
// ZONO — ACCOUNTING DOCUMENTS recovery cron (GET). Finishes issuing Morning /
// Green-Invoice documents for VERIFIED payments whose document is still pending or
// retryably-failed (a Morning outage at webhook time, or a transient error). INERT
// without MORNING_* credentials (ensureAccountingDocument… returns not_configured
// and changes nothing), so it is safe to run before Sandbox/production is set up.
// Bounded batch · idempotent · concurrency-safe (the service claims each row) ·
// GET + Bearer CRON_SECRET. Never issues for an unverified or pre-cutoff payment.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ensureAccountingDocumentForVerifiedPayment } from "@/lib/accounting/document-service";
import { morningConfig } from "@/lib/accounting/morning-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 25;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

interface Row { id: string; invoice_status: string | null; invoice_next_retry_at: string | null; verified_at: string | null }

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = morningConfig();
  if (!cfg.configured) return NextResponse.json({ ok: true, inert: true, reason: "morning_not_configured" });

  const nowIso = new Date().toISOString();
  const db = createServiceRoleClient();
  let issued = 0, retried = 0, failed = 0, skipped = 0;

  try {
    // Candidates: verified payments with NO document yet (invoice_doc_id IS NULL —
    // the strong duplicate guard) that are pending, retryably-failed, or never
    // attempted (null status). Retryable/pending are always in scope; a NEVER-
    // ATTEMPTED (null) payment is only picked up when a go-live cutoff is set AND
    // it was verified on/after it — this prevents accidental historical backfill
    // (the service also re-gates the cutoff). Ordered oldest-first.
    const { data } = await db.from("payments" as never)
      .select("id,invoice_status,invoice_next_retry_at,verified_at")
      .eq("verified", true)
      .is("invoice_doc_id", null)
      .order("verified_at", { ascending: true })
      .limit(BATCH * 3);
    const rows = ((data as Row[] | null) ?? []).filter((r) => {
      if (r.invoice_status === "pending") return true;
      if (r.invoice_status === "failed") return !r.invoice_next_retry_at || r.invoice_next_retry_at <= nowIso;
      // never-attempted (null): only with a cutoff and verified on/after it
      return !r.invoice_status && !!cfg.invoicingStartAt && !!r.verified_at && r.verified_at >= cfg.invoicingStartAt;
    }).slice(0, BATCH);

    for (const r of rows) {
      const out = await ensureAccountingDocumentForVerifiedPayment(r.id);
      if (out.ok) issued++;
      else if (out.status === "retry_scheduled") retried++;
      else if (out.status === "failed") failed++;
      else skipped++;
    }
    return NextResponse.json({ ok: true, scanned: rows.length, issued, retried, failed, skipped });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "accounting_cron_failed", issued, retried, failed }, { status: 500 });
  }
}
