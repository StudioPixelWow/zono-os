"use server";
// ============================================================================
// ZONO — Legal documents server actions. Org-scoped wrappers over the service +
// repository. Catalog reads are open to all authenticated users; template-section
// edits require admin (RLS-enforced too). No external e-signature / sending.
// ============================================================================
import { revalidatePath } from "next/cache";
import { legalRepository } from "./repository";
import {
  createDocumentFromTemplate, saveDocument, finalizeForSignature, changeStatus,
  signDocumentManually, duplicateDocument, getDocumentRender, previewTemplate,
  type CreateFromTemplateInput, type SignInput, type DocumentRenderView,
} from "./service";
import {
  type LegalTemplateRow, type LegalTemplateFull, type LegalDocumentRow,
  type LegalDocStatus, type LegalEntityType,
} from "./types";
import type { ValidationError } from "./engine";

export interface ActionResult<T = undefined> { ok: boolean; message?: string; data?: T; errors?: ValidationError[] }
const revalidate = () => { try { revalidatePath("/legal-templates"); } catch { /* noop */ } };

// ── Catalog reads ───────────────────────────────────────────────────────────
export async function listLegalTemplatesAction(opts: { category?: string; search?: string } = {}): Promise<LegalTemplateRow[]> {
  return legalRepository.listTemplates(opts);
}
export async function getLegalTemplateAction(id: string): Promise<LegalTemplateFull | null> {
  return legalRepository.getTemplateFull(id);
}

// ── Template editing (admin) ──────────────────────────────────────────────────
export async function updateLegalTemplateSectionAction(sectionId: string, patch: { title?: string | null; body?: string }): Promise<ActionResult> {
  const ok = await legalRepository.updateSection(sectionId, patch);
  revalidate();
  return { ok, message: ok ? undefined : "עדכון הסעיף נכשל (נדרשת הרשאת מנהל)." };
}

// ── Documents ─────────────────────────────────────────────────────────────────
export async function createLegalDocumentAction(input: CreateFromTemplateInput): Promise<ActionResult<{ documentId: string }>> {
  const res = await createDocumentFromTemplate(input);
  // STABILIZATION: emit document.created (was missing) → timeline / search / graph
  // (relates_to edges from the linked property/buyer/seller/lead/deal). Best-effort.
  if (res.ok && res.documentId) {
    try {
      const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
      await emitBusinessEvent({
        type: DOMAIN_EVENTS.documentCreated, entityType: "document", entityId: res.documentId,
        payload: { propertyId: input.propertyId ?? undefined, buyerId: input.buyerId ?? undefined, sellerId: input.sellerId ?? undefined, leadId: input.leadId ?? undefined, dealId: input.dealId ?? undefined },
      });
    } catch (e) { console.error("[legal] create emit failed:", e); }
  }
  revalidate();
  return res.ok ? { ok: true, data: { documentId: res.documentId! } } : { ok: false, message: res.message };
}
export async function saveLegalDocumentAction(id: string, patch: { title?: string; fieldValues?: Record<string, string> }): Promise<ActionResult> {
  const res = await saveDocument(id, patch);
  revalidate();
  return res;
}
export async function finalizeLegalDocumentAction(id: string): Promise<ActionResult> {
  const res = await finalizeForSignature(id);
  revalidate();
  return res;
}
export async function changeLegalDocumentStatusAction(id: string, status: LegalDocStatus): Promise<ActionResult> {
  const res = await changeStatus(id, status);
  revalidate();
  return res;
}
export async function signLegalDocumentAction(id: string, signer: SignInput): Promise<ActionResult> {
  const res = await signDocumentManually(id, signer);
  // STABILIZATION: emit document.signed (was missing) → timeline + canonical memory
  // milestone. Best-effort; never blocks signing.
  if (res.ok) {
    try {
      const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
      await emitBusinessEvent({ type: DOMAIN_EVENTS.documentSigned, entityType: "document", entityId: id });
    } catch (e) { console.error("[legal] sign emit failed:", e); }
  }
  revalidate();
  return res;
}
export async function duplicateLegalDocumentAction(id: string): Promise<ActionResult<{ documentId: string }>> {
  const res = await duplicateDocument(id);
  revalidate();
  return res.ok ? { ok: true, data: { documentId: res.documentId! } } : { ok: false, message: res.message };
}

// ── Document reads ──────────────────────────────────────────────────────────
export async function getLegalDocumentAction(id: string): Promise<DocumentRenderView | null> {
  return getDocumentRender(id);
}
export async function listLegalDocumentsAction(filter: { entityType?: LegalEntityType; entityId?: string; status?: string } = {}): Promise<LegalDocumentRow[]> {
  return legalRepository.listDocuments(filter);
}
export async function previewLegalTemplateAction(templateId: string, values: Record<string, string>) {
  return previewTemplate(templateId, values);
}
