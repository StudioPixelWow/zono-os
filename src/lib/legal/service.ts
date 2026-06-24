// ============================================================================
// ZONO — Legal documents service (server-only). Orchestrates: build a document
// from a template (CRM prefill → defaults → render), validate, save, status
// transitions, MANUAL signing (no external provider), signed-lock + duplicate,
// every step writing to the audit trail. Real persistence only.
// ============================================================================
import "server-only";
import { createHash } from "node:crypto";
import { legalRepository, legalScope } from "./repository";
import {
  applyDefaults, prefillFromContext, renderFullText, renderSections, validateDocument,
  canTransition, isLocked, type PrefillContext, type ValidationError, type RenderedSection,
} from "./engine";
import {
  type LegalDocStatus, type LegalDocumentRow, type LegalTemplateFull, type LegalDocumentFull,
} from "./types";

function sha256(s: string): string { return createHash("sha256").update(s, "utf8").digest("hex"); }
function todayIso(): string { return new Date().toISOString().slice(0, 10); }

export interface EntityRefs {
  propertyId?: string | null; buyerId?: string | null; sellerId?: string | null;
  leadId?: string | null; dealId?: string | null;
}

/** Build a CRM prefill context from the org/agent + linked entities. */
export async function buildPrefillContext(refs: EntityRefs): Promise<PrefillContext> {
  const s = await legalScope();
  if (!s) return {};
  const ctx: PrefillContext = {
    office_name: s.orgName, agent_name: s.agentName, agent_phone: s.agentPhone,
    agent_email: s.agentEmail, agreement_date: todayIso(),
  };
  const pick = async (table: string, id: string, cols: string) => {
    const { data } = await s.db.from(table as never).select(cols).eq("id", id).maybeSingle();
    return (data ?? null) as Record<string, unknown> | null;
  };
  if (refs.buyerId) {
    const b = await pick("buyers", refs.buyerId, "full_name,phone,email");
    if (b) { ctx.buyer_name = b.full_name as string; ctx.buyer_phone = b.phone as string; ctx.buyer_email = b.email as string;
      ctx.client_name = ctx.client_name ?? (b.full_name as string); ctx.client_phone = ctx.client_phone ?? (b.phone as string); ctx.client_email = ctx.client_email ?? (b.email as string); }
  }
  if (refs.sellerId) {
    const se = await pick("sellers", refs.sellerId, "full_name,phone,email");
    if (se) { ctx.seller_name = se.full_name as string; ctx.seller_phone = se.phone as string; ctx.seller_email = se.email as string;
      ctx.client_name = ctx.client_name ?? (se.full_name as string); ctx.client_phone = ctx.client_phone ?? (se.phone as string); ctx.client_email = ctx.client_email ?? (se.email as string); }
  }
  if (refs.leadId) {
    const l = await pick("leads", refs.leadId, "full_name,phone,email");
    if (l) { ctx.client_name = ctx.client_name ?? (l.full_name as string); ctx.client_phone = ctx.client_phone ?? (l.phone as string); ctx.client_email = ctx.client_email ?? (l.email as string); }
  }
  if (refs.propertyId) {
    const p = await pick("properties", refs.propertyId, "title,city,price");
    if (p) {
      ctx.property_address = (p.title as string) ?? null;
      ctx.city = (p.city as string) ?? null;
      if (p.price != null) ctx.price = `₪${Number(p.price).toLocaleString("en-US")}`;
    }
  }
  return ctx;
}

export interface CreateFromTemplateInput extends EntityRefs {
  templateId?: string; templateKey?: string;
  overrides?: Record<string, string>;     // explicit field values from the caller
  title?: string;
}

/** Create a draft legal document from a template, prefilled from CRM data. */
export async function createDocumentFromTemplate(input: CreateFromTemplateInput): Promise<{ ok: boolean; documentId?: string; message?: string }> {
  const full = input.templateId
    ? await legalRepository.getTemplateFull(input.templateId)
    : input.templateKey ? await legalRepository.getTemplateFullByKey(input.templateKey) : null;
  if (!full) return { ok: false, message: "התבנית לא נמצאה." };

  const ctx = await buildPrefillContext(input);
  let values = prefillFromContext(full.fields, ctx, input.overrides ?? {});
  values = applyDefaults(full.fields, values);

  const renderedBody = renderFullText(full.sections, values, { keepUnfilled: false });
  const title = input.title?.trim() || full.template.title;

  const row = await legalRepository.insertDocument({
    template_id: full.template.id, title, status: "draft",
    field_values: values, rendered_body: renderedBody, rendered_hash: sha256(renderedBody),
    template_version: full.template.version, version: 1,
    property_id: input.propertyId ?? null, buyer_id: input.buyerId ?? null,
    seller_id: input.sellerId ?? null, lead_id: input.leadId ?? null, deal_id: input.dealId ?? null,
  });
  if (!row) return { ok: false, message: "יצירת המסמך נכשלה (הרשאות/חיבור)." };
  await legalRepository.insertAudit(row.id, "created", { template_key: full.template.key, version: full.template.version });
  return { ok: true, documentId: row.id };
}

/** Re-render the document with the supplied field values + save (draft editing). */
export async function saveDocument(id: string, patch: { title?: string; fieldValues?: Record<string, string> }): Promise<{ ok: boolean; message?: string }> {
  const doc = await legalRepository.getDocument(id);
  if (!doc) return { ok: false, message: "המסמך לא נמצא." };
  if (isLocked(doc.status)) return { ok: false, message: "מסמך חתום נעול — ניתן לשכפל לגרסה חדשה בלבד." };
  const full = doc.template_id ? await legalRepository.getTemplateFull(doc.template_id) : null;
  const values = { ...doc.field_values, ...(patch.fieldValues ?? {}) };
  const renderedBody = full ? renderFullText(full.sections, values, { keepUnfilled: false }) : doc.rendered_body;
  const res = await legalRepository.updateDocument(id, {
    title: patch.title?.trim() || doc.title, field_values: values,
    rendered_body: renderedBody, rendered_hash: renderedBody ? sha256(renderedBody) : doc.rendered_hash,
  });
  if (!res.ok) return res;
  await legalRepository.insertAudit(id, "updated", { fields: Object.keys(patch.fieldValues ?? {}) });
  return { ok: true };
}

/** Validate required fields and (if valid) mark the document ready for signature. */
export async function finalizeForSignature(id: string): Promise<{ ok: boolean; errors?: ValidationError[]; message?: string }> {
  const doc = await legalRepository.getDocument(id);
  if (!doc) return { ok: false, message: "המסמך לא נמצא." };
  if (!doc.template_id) return { ok: false, message: "למסמך אין תבנית מקושרת." };
  const full = await legalRepository.getTemplateFull(doc.template_id);
  if (!full) return { ok: false, message: "התבנית לא נמצאה." };
  const v = validateDocument(full.fields, doc.field_values);
  if (!v.ok) return { ok: false, errors: v.errors, message: "יש להשלים שדות חובה לפני הכנה לחתימה." };
  const res = await changeStatus(id, "ready_for_signature");
  return res;
}

/** Apply a status transition (validated against the status machine). */
export async function changeStatus(id: string, to: LegalDocStatus): Promise<{ ok: boolean; message?: string }> {
  const doc = await legalRepository.getDocument(id);
  if (!doc) return { ok: false, message: "המסמך לא נמצא." };
  if (doc.status === to) return { ok: true };
  if (!canTransition(doc.status, to)) return { ok: false, message: `מעבר סטטוס לא חוקי (${doc.status} → ${to}).` };
  const res = await legalRepository.updateDocument(id, { status: to });
  if (!res.ok) return res;
  await legalRepository.insertAudit(id, "status_changed", { from: doc.status, to });
  return { ok: true };
}

export interface SignInput { signerName: string; signerRole?: string; signerEmail?: string; signerPhone?: string; ipAddress?: string; deviceInfo?: string }

/** MANUAL signature (no external provider). Records a signature + locks the doc. */
export async function signDocumentManually(id: string, signer: SignInput): Promise<{ ok: boolean; message?: string }> {
  const doc = await legalRepository.getDocument(id);
  if (!doc) return { ok: false, message: "המסמך לא נמצא." };
  if (isLocked(doc.status)) return { ok: false, message: "המסמך כבר חתום." };
  if (!signer.signerName?.trim()) return { ok: false, message: "נדרש שם חותם." };
  const signedAt = new Date().toISOString();
  const signatureHash = sha256(`${doc.rendered_hash ?? ""}|${signer.signerName}|${signedAt}`);
  const sig = await legalRepository.insertSignature({
    document_id: id, signer_name: signer.signerName.trim(), signer_role: signer.signerRole ?? null,
    signer_email: signer.signerEmail ?? null, signer_phone: signer.signerPhone ?? null,
    signed_at: signedAt, ip_address: signer.ipAddress ?? null, device_info: signer.deviceInfo ?? null,
    signature_hash: signatureHash, audit_metadata: { rendered_hash: doc.rendered_hash },
  });
  if (!sig) return { ok: false, message: "רישום החתימה נכשל." };
  // Move to signed (allowed from ready_for_signature/sent/viewed). Force when needed.
  if (canTransition(doc.status, "signed")) await legalRepository.updateDocument(id, { status: "signed" });
  else await legalRepository.updateDocument(id, { status: "signed" });
  await legalRepository.insertAudit(id, "signed", { signer: signer.signerName, signature_hash: signatureHash });
  return { ok: true };
}

/** Duplicate a document into a new editable version (the only path for a signed doc). */
export async function duplicateDocument(id: string): Promise<{ ok: boolean; documentId?: string; message?: string }> {
  const doc = await legalRepository.getDocument(id);
  if (!doc) return { ok: false, message: "המסמך לא נמצא." };
  const row = await legalRepository.insertDocument({
    template_id: doc.template_id, title: `${doc.title} (גרסה ${doc.version + 1})`, status: "draft",
    field_values: doc.field_values, rendered_body: doc.rendered_body, rendered_hash: doc.rendered_hash,
    template_version: doc.template_version, version: doc.version + 1, parent_document_id: doc.id,
    property_id: doc.property_id, buyer_id: doc.buyer_id, seller_id: doc.seller_id,
    lead_id: doc.lead_id, deal_id: doc.deal_id,
  });
  if (!row) return { ok: false, message: "השכפול נכשל." };
  await legalRepository.insertAudit(row.id, "duplicated", { from_document: doc.id, from_version: doc.version });
  return { ok: true, documentId: row.id };
}

// ── Read helpers for the UI ─────────────────────────────────────────────────────
export interface DocumentRenderView {
  document: LegalDocumentRow; sections: RenderedSection[]; full: LegalDocumentFull;
}
export async function getDocumentRender(id: string): Promise<DocumentRenderView | null> {
  const full = await legalRepository.getDocumentFull(id);
  if (!full) return null;
  const tpl = full.document.template_id ? await legalRepository.getTemplateFull(full.document.template_id) : null;
  const sections = tpl ? renderSections(tpl.sections, full.document.field_values, { keepUnfilled: false })
    : [{ order_index: 1, title: full.document.title, body: full.document.rendered_body ?? "" }];
  return { document: full.document, sections, full };
}
export async function previewTemplate(templateId: string, values: Record<string, string>): Promise<{ template: LegalTemplateFull; sections: RenderedSection[] } | null> {
  const tpl = await legalRepository.getTemplateFull(templateId);
  if (!tpl) return null;
  const merged = applyDefaults(tpl.fields, values);
  return { template: tpl, sections: renderSections(tpl.sections, merged, { keepUnfilled: true }) };
}
