/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Internal Remote E-Signature 1.0 (server-only).
//
// A self-hosted secure electronic-signature flow — ZONO captures the signature
// itself (no external provider). It is NOT a certified/qualified digital
// signature; it is: secure consent + drawn-signature capture + document lock +
// immutable signed artifact + audit trail.
//
// Reuses the canonical models — NO duplicate document truth:
//   • document      → legal_documents (rendered_body + rendered_hash + property/
//                     buyer/seller association + the sent/viewed/signed states)
//   • signature     → legal_document_signatures (signer, ip, device, hash, audit)
//   • storage       → the private "documents" bucket + short-lived signed URLs
//   • completion    → document.signed domain event (in-app notification)
// The only new model is signature_requests (the remote request + secure token).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { generateSigningToken, hashToken, timingSafeEqualHex, sha256Hex } from "./tokens";

const DOCS_BUCKET = "documents";
const SIGNED_TTL_SEC = 300;
const DEFAULT_EXPIRY_DAYS = 7;

const appBase = () =>
  (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")).replace(/\/$/, "");

export type SignatureRequestStatus = "draft" | "ready" | "sent" | "opened" | "signed" | "completed" | "expired" | "revoked";

export interface CreateSignatureRequestInput {
  orgId: string;
  documentId: string;
  recipient: { name: string; email: string; phone?: string | null };
  createdBy: string | null;
  expiryDays?: number;
}
export interface CreatedSignatureRequest {
  requestId: string;
  rawToken: string;        // caller sends this in the URL; never persisted
  signingUrl: string;
  documentTitle: string;
  expiresAt: string;
}

/** Create a remote signing request for a legal_documents row + mint a secure token. */
export async function createSignatureRequest(input: CreateSignatureRequestInput, db: any = createServiceRoleClient()): Promise<{ ok: true; data: CreatedSignatureRequest } | { ok: false; error: string }> {
  const { data: doc } = await db.from("legal_documents")
    .select("id,title,rendered_body,rendered_hash,property_id,organization_id")
    .eq("id", input.documentId).eq("organization_id", input.orgId).maybeSingle();
  if (!doc) return { ok: false, error: "המסמך לא נמצא." };
  if (!doc.rendered_body) return { ok: false, error: "המסמך עדיין לא נוצר (אין תוכן לחתימה)." };

  const { raw, hash } = generateSigningToken();
  const days = input.expiryDays ?? DEFAULT_EXPIRY_DAYS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString();

  const { data: row, error } = await db.from("signature_requests").insert({
    org_id: input.orgId, document_id: input.documentId, property_id: doc.property_id ?? null,
    recipient_name: input.recipient.name, recipient_email: input.recipient.email, recipient_phone: input.recipient.phone ?? null,
    mode: "remote", status: "sent", token_hash: hash, document_hash: doc.rendered_hash ?? null,
    expires_at: expiresAt, sent_at: now.toISOString(), created_by: input.createdBy,
  }).select("id").single();
  if (error || !row) return { ok: false, error: error?.message || "יצירת הבקשה נכשלה." };

  // Move the document into the remote-signing lifecycle (states already exist).
  await db.from("legal_documents").update({ status: "sent", updated_at: now.toISOString() }).eq("id", input.documentId).eq("organization_id", input.orgId);

  return { ok: true, data: { requestId: row.id, rawToken: raw, signingUrl: `${appBase()}/sign/${raw}`, documentTitle: doc.title ?? "מסמך", expiresAt } };
}

export interface ResolvedSigningRequest {
  requestId: string;
  status: SignatureRequestStatus;
  documentId: string;
  documentTitle: string;
  renderedBody: string;
  recipientName: string;
  officeName: string;
  agentName: string | null;
  agentAvatarUrl: string | null;
  propertyLabel: string | null;
  expired: boolean;
}
export type ResolveResult =
  | { ok: true; data: ResolvedSigningRequest }
  | { ok: false; reason: "not_found" | "expired" | "revoked"; completed?: false }
  | { ok: false; reason: "completed"; completedAt: string | null; documentTitle: string };

/** Resolve a raw token to its request + the document to display. Enforces expiry
 *  and revocation. Marks the request 'expired' if past its expiry. */
export async function resolveSigningRequest(rawToken: string, db: any = createServiceRoleClient()): Promise<ResolveResult> {
  const h = hashToken(rawToken);
  const { data: req } = await db.from("signature_requests").select("*").eq("token_hash", h).maybeSingle();
  if (!req || !timingSafeEqualHex(hashToken(rawToken), req.token_hash)) return { ok: false, reason: "not_found" };
  if (req.status === "revoked") return { ok: false, reason: "revoked" };
  if (req.status === "completed" || req.status === "signed") return { ok: false, reason: "completed", completedAt: req.completed_at ?? req.signed_at ?? null, documentTitle: "" };
  if (new Date(req.expires_at).getTime() < Date.now()) {
    await db.from("signature_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", req.id);
    return { ok: false, reason: "expired" };
  }

  const { data: doc } = await db.from("legal_documents")
    .select("id,title,rendered_body,property_id,agent_id,organization_id").eq("id", req.document_id).maybeSingle();
  if (!doc) return { ok: false, reason: "not_found" };

  const [{ data: org }, { data: agent }, { data: prop }] = await Promise.all([
    db.from("organizations").select("name").eq("id", req.org_id).maybeSingle(),
    doc.agent_id ? db.from("users").select("full_name,avatar_url").eq("id", doc.agent_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.property_id ? db.from("properties").select("title,city").eq("id", doc.property_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return {
    ok: true,
    data: {
      requestId: req.id, status: req.status, documentId: doc.id, documentTitle: doc.title ?? "מסמך",
      renderedBody: doc.rendered_body ?? "", recipientName: req.recipient_name,
      officeName: (org?.name as string) || "ZONO", agentName: agent?.full_name ?? null, agentAvatarUrl: agent?.avatar_url ?? null,
      propertyLabel: prop ? [(prop as any).title, (prop as any).city].filter(Boolean).join(" · ") || null : null,
      expired: false,
    },
  };
}

/** Record the first meaningful OPEN of a valid signing link (idempotent). */
export async function markSigningOpened(requestId: string, db: any = createServiceRoleClient()): Promise<void> {
  const { data: req } = await db.from("signature_requests").select("id,status,opened_at,document_id,org_id").eq("id", requestId).maybeSingle();
  if (!req || req.opened_at || ["completed", "signed", "revoked", "expired"].includes(req.status)) return;
  const now = new Date().toISOString();
  await db.from("signature_requests").update({ status: "opened", opened_at: now, updated_at: now }).eq("id", requestId);
  await db.from("legal_documents").update({ status: "viewed", updated_at: now }).eq("id", req.document_id).eq("organization_id", req.org_id);
}

export interface CompleteSignatureInput {
  rawToken: string;
  signatureDataUrl: string;  // "data:image/png;base64,..."
  consent: boolean;
  ip: string | null;
  userAgent: string | null;
}
export interface CompleteResult { ok: boolean; alreadyCompleted?: boolean; documentTitle?: string; signedAt?: string | null; error?: string }

/** Atomically complete a remote signature: revalidate, verify the document hasn't
 *  changed, build + store the immutable signed artifact, record the signature +
 *  audit, lock the document, emit document.signed. Idempotent on double-submit. */
export async function completeSignature(input: CompleteSignatureInput, db: any = createServiceRoleClient()): Promise<CompleteResult> {
  const h = hashToken(input.rawToken);
  const { data: req } = await db.from("signature_requests").select("*").eq("token_hash", h).maybeSingle();
  if (!req || !timingSafeEqualHex(hashToken(input.rawToken), req.token_hash)) return { ok: false, error: "invalid_token" };

  // Idempotent: already done → return the existing result, never double-sign.
  if (req.status === "completed" || req.status === "signed") {
    return { ok: true, alreadyCompleted: true, signedAt: req.completed_at ?? req.signed_at ?? null };
  }
  if (req.status === "revoked") return { ok: false, error: "revoked" };
  if (new Date(req.expires_at).getTime() < Date.now()) {
    await db.from("signature_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", req.id);
    return { ok: false, error: "expired" };
  }
  if (!input.consent) return { ok: false, error: "consent_required" };
  if (!/^data:image\/(png|jpeg);base64,/.test(input.signatureDataUrl) || input.signatureDataUrl.length > 400_000) {
    return { ok: false, error: "invalid_signature" };
  }

  const { data: doc } = await db.from("legal_documents")
    .select("id,title,rendered_body,rendered_hash,organization_id,agent_id,property_id,buyer_id,seller_id").eq("id", req.document_id).maybeSingle();
  if (!doc || !doc.rendered_body) return { ok: false, error: "document_missing" };

  // VERSION SAFETY: the document must not have changed since the request was made.
  if (req.document_hash && doc.rendered_hash && req.document_hash !== doc.rendered_hash) {
    await db.from("signature_requests").update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", req.id);
    return { ok: false, error: "document_changed" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: org } = await db.from("organizations").select("name").eq("id", req.org_id).maybeSingle();
  const officeName = (org?.name as string) || "ZONO";
  const signatureHash = sha256Hex(input.signatureDataUrl);
  const preHash = doc.rendered_hash || sha256Hex(doc.rendered_body);

  // Build the immutable signed artifact (self-contained HTML: exact document +
  // signature block + audit certificate). Layout- and Hebrew-faithful.
  const artifact = buildSignedArtifactHtml({
    documentTitle: doc.title ?? "מסמך", renderedBody: doc.rendered_body, officeName,
    signerName: req.recipient_name, signerEmail: req.recipient_email, signatureDataUrl: input.signatureDataUrl,
    signedAt: nowIso, requestRef: String(req.id).slice(0, 8), preHash, ip: input.ip, userAgent: input.userAgent,
  });
  const artifactHash = sha256Hex(artifact);
  const path = `${req.org_id}/signed/${req.id}.html`;
  const up = await db.storage.from(DOCS_BUCKET).upload(path, new Blob([artifact], { type: "text/html" }), { upsert: false, contentType: "text/html" });
  if (up.error && !String(up.error.message || "").toLowerCase().includes("exists")) {
    return { ok: false, error: "storage_failed" };
  }

  // Record the signature + full audit metadata (canonical legal_document_signatures).
  await db.from("legal_document_signatures").insert({
    document_id: doc.id, signer_name: req.recipient_name, signer_email: req.recipient_email, signer_phone: req.recipient_phone ?? null,
    signer_role: "recipient", signed_at: nowIso, ip_address: input.ip, device_info: input.userAgent,
    signature_hash: signatureHash,
    audit_metadata: {
      method: "חתימה אלקטרונית פנימית", signature_request_id: req.id, request_ref: String(req.id).slice(0, 8),
      pre_signature_hash: preHash, signed_artifact_hash: artifactHash, signed_artifact_path: path,
      consent: true, ip: input.ip, user_agent: input.userAgent,
    },
  });

  // Complete the request + LOCK the document (immutable signed version).
  await db.from("signature_requests").update({
    status: "completed", signed_at: nowIso, completed_at: nowIso,
    signed_artifact_path: path, signed_artifact_hash: artifactHash,
    signer_ip: input.ip, signer_user_agent: input.userAgent, updated_at: nowIso,
  }).eq("id", req.id);
  await db.from("legal_documents").update({ status: "signed", updated_at: nowIso }).eq("id", doc.id).eq("organization_id", req.org_id);

  // Notify the broker (document.signed → in-app; deep-links to /legal-templates/[id]).
  // The signer is a public recipient with no user account, so we set the actor to the
  // document's AGENT — otherwise the notification projector (which needs an actor to
  // notify) would skip it and the broker would never learn the client signed.
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.documentSigned, entityType: "document", entityId: doc.id, orgId: req.org_id,
      actorUserId: (doc.agent_id as string | null) ?? (req.created_by as string | null) ?? null,
      idempotencyKey: `document.signed:remote:${req.id}`,
      payload: { recipientName: req.recipient_name, documentTitle: doc.title, propertyId: doc.property_id },
    });
  } catch { /* best-effort */ }

  return { ok: true, documentTitle: doc.title ?? "מסמך", signedAt: nowIso };
}

/** Short-lived signed URL to view/download the immutable signed artifact. */
export async function getSignedArtifactUrl(requestId: string, orgId: string, db: any = createServiceRoleClient()): Promise<string | null> {
  const { data: req } = await db.from("signature_requests").select("signed_artifact_path").eq("id", requestId).eq("org_id", orgId).maybeSingle();
  if (!req?.signed_artifact_path) return null;
  const { data } = await db.storage.from(DOCS_BUCKET).createSignedUrl(req.signed_artifact_path, SIGNED_TTL_SEC);
  return data?.signedUrl ?? null;
}

// ── signed artifact builder ──────────────────────────────────────────────────
function esc(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function buildSignedArtifactHtml(a: {
  documentTitle: string; renderedBody: string; officeName: string; signerName: string; signerEmail: string;
  signatureDataUrl: string; signedAt: string; requestRef: string; preHash: string; ip: string | null; userAgent: string | null;
}): string {
  const when = (() => { try { return new Date(a.signedAt).toLocaleString("he-IL"); } catch { return a.signedAt; } })();
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(a.documentTitle)} — נחתם</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;background:#fff}
.doc{max-width:820px;margin:0 auto;padding:32px}
.sig-block{margin-top:28px;padding:18px 20px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa}
.sig-img{max-width:280px;max-height:120px;display:block;margin:8px 0}
.cert{margin-top:20px;padding:16px 20px;border-top:2px solid #6d28d9;font-size:12px;color:#4b5563}
.cert h3{color:#6d28d9;margin:0 0 8px;font-size:13px}
.cert dt{font-weight:700;color:#374151}.cert dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}
</style></head><body><div class="doc">
<div class="rendered">${a.renderedBody}</div>
<div class="sig-block">
  <p style="margin:0;font-weight:700">חתימה אלקטרונית</p>
  <img class="sig-img" src="${a.signatureDataUrl}" alt="חתימה" />
  <p style="margin:2px 0;font-size:13px">${esc(a.signerName)} · ${esc(a.signerEmail)}</p>
  <p style="margin:2px 0;font-size:13px;color:#4b5563">נחתם: ${esc(when)}</p>
  <p style="margin:8px 0 0;font-size:11px;color:#6b7280">אני מאשר/ת כי קראתי את המסמך וכי חתימתי האלקטרונית מהווה אישור למסמך זה.</p>
</div>
<div class="cert">
  <h3>אישור חתימה — ZONO</h3>
  <dl>
    <dt>מסמך</dt><dd>${esc(a.documentTitle)}</dd>
    <dt>חותם/ת</dt><dd>${esc(a.signerName)} (${esc(a.signerEmail)})</dd>
    <dt>מועד חתימה</dt><dd>${esc(when)}</dd>
    <dt>מזהה בקשה</dt><dd>${esc(a.requestRef)}</dd>
    <dt>טביעת מסמך (pre)</dt><dd>${esc(a.preHash)}</dd>
    <dt>שיטת חתימה</dt><dd>חתימה אלקטרונית פנימית</dd>
    <dt>IP</dt><dd>${esc(a.ip || "—")}</dd>
  </dl>
  <p style="margin-top:10px;font-size:10.5px;color:#9ca3af">חתימה אלקטרונית פנימית — אינה חתימה דיגיטלית מאושרת/מוסמכת.</p>
</div>
</div></body></html>`;
}
