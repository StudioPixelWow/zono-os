// ============================================================================
// ZONO — Accounting document MANUAL RETRY (server action). Owner/manager-only.
// Lets an operator re-issue a Morning document for a VERIFIED payment whose
// document FAILED — never for an unverified payment, never for one that already
// has a document, and never across tenants (the payment must belong to the
// caller's org, re-derived server-side; the browser-supplied id is not trusted).
// Idempotent: a double click converges via the service's atomic claim.
// ============================================================================
"use server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { ensureAccountingDocumentForVerifiedPayment } from "./document-service";

async function ownerContext(): Promise<{ orgId: string } | null> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id || !sc.user) return null;
  const db = await createClient();
  const { data } = await db.rpc("has_min_role", { p_min: "manager" });
  if (data !== true) return null; // fail closed
  return { orgId: sc.profile.org_id };
}

export async function retryAccountingDocumentAction(paymentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ownerContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (typeof paymentId !== "string" || !paymentId) return { ok: false, error: "bad_request" };

  // Cross-tenant guard: the payment MUST belong to the caller's org.
  const db: ReturnType<typeof createServiceRoleClient> = createServiceRoleClient();
  const { data } = await db.from("payments" as never)
    .select("id,org_id,verified,invoice_status,invoice_doc_id").eq("id", paymentId).maybeSingle();
  const p = data as { org_id: string | null; verified: boolean; invoice_status: string | null; invoice_doc_id: string | null } | null;
  if (!p || p.org_id !== ctx.orgId) return { ok: false, error: "not_found" };
  if (p.verified !== true) return { ok: false, error: "not_verified" };
  if (p.invoice_doc_id) return { ok: false, error: "already_issued" };
  if (p.invoice_status !== "failed") return { ok: false, error: "not_retryable" };

  const out = await ensureAccountingDocumentForVerifiedPayment(paymentId);
  return out.ok ? { ok: true } : { ok: false, error: out.reason };
}
