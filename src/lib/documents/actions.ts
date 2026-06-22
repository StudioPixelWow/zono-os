"use server";
import { revalidatePath } from "next/cache";
import {
  createDocumentFromTemplate, createDocumentManual, addDocumentVersion, addParticipant, createSignatureRequest,
  recordSignature, rejectDocument, cancelDocument, computeDealChecklist, getDocumentDetail,
  type EntityRefs, type DocumentDetail, type ManualDocInput,
} from "./service";

export interface DocActionState { ok?: boolean; error?: string; message?: string; id?: string }

function revalidate() { try { revalidatePath("/documents"); revalidatePath("/"); } catch { /* noop */ } }

export async function createDocumentManualAction(input: ManualDocInput): Promise<DocActionState> {
  if (!input.title?.trim() && !input.docCategory) return { error: "נא להזין כותרת וסוג מסמך" };
  try { const r = await createDocumentManual(input); revalidate(); return { ok: true, id: r.id, message: "המסמך נוצר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המסמך נכשלה" }; }
}

export async function createDocumentFromTemplateAction(templateKey: string, refs: EntityRefs): Promise<DocActionState> {
  try { const r = await createDocumentFromTemplate(templateKey, refs); revalidate(); return { ok: true, id: r.id, message: "המסמך נוצר — הוסף משתתפים והכן לחתימה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המסמך נכשלה" }; }
}
export async function addDocumentVersionAction(documentId: string, fileUrl?: string, note?: string): Promise<DocActionState> {
  try { await addDocumentVersion(documentId, { fileUrl, note }); revalidate(); return { ok: true, message: "גרסה חדשה נוספה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הוספת גרסה נכשלה" }; }
}
export async function addParticipantAction(documentId: string, input: { role?: string; participant_type?: string; contact_name?: string; contact_email?: string; contact_phone?: string }): Promise<DocActionState> {
  try { await addParticipant(documentId, input); revalidate(); return { ok: true, message: "משתתף נוסף" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הוספת משתתף נכשלה" }; }
}
export async function createSignatureRequestAction(documentId: string, channel?: string, note?: string): Promise<DocActionState> {
  try { await createSignatureRequest(documentId, { channel, note }); revalidate(); return { ok: true, message: "בקשת חתימה הוכנה (טיוטה — נשלחת ידנית)" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הכנת בקשת החתימה נכשלה" }; }
}
export async function recordSignatureAction(documentId: string, signerName: string, participantId?: string): Promise<DocActionState> {
  try { const r = await recordSignature(documentId, { signerName, participantId }); revalidate(); return { ok: true, message: r.status === "completed" ? "המסמך נחתם במלואו והושלם" : "החתימה נרשמה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום החתימה נכשל" }; }
}
export async function rejectDocumentAction(documentId: string, reason: string): Promise<DocActionState> {
  try { await rejectDocument(documentId, reason); revalidate(); return { ok: true, message: "המסמך נדחה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "דחיית המסמך נכשלה" }; }
}
export async function cancelDocumentAction(documentId: string): Promise<DocActionState> {
  try { await cancelDocument(documentId); revalidate(); return { ok: true, message: "המסמך בוטל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול המסמך נכשל" }; }
}
export async function recomputeChecklistAction(dealId: string): Promise<DocActionState> {
  try { const c = await computeDealChecklist(dealId); revalidate(); return { ok: true, message: `רשימת הבדיקה עודכנה — ${c.completionPct}% הושלם` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון רשימת הבדיקה נכשל" }; }
}
export async function getDocumentDetailAction(documentId: string): Promise<DocumentDetail | null> {
  return getDocumentDetail(documentId);
}
