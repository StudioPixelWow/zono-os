"use server";
import { revalidatePath } from "next/cache";
import {
  connectWhatsapp, recordInbound, createDraft, approveDraft, rejectDraft, markDraftSent,
  recordMissedCall, createFollowup, createCampaign, createSmartLink, computeDailyMissions,
} from "./service";

export interface WaActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/whatsapp"); revalidatePath("/"); } catch { /* noop */ } }

export async function connectWhatsappAction(): Promise<WaActionState> {
  try { await connectWhatsapp(); revalidate(); return { ok: true, message: "מצב ארגז חול הופעל — ללא שמירת אסימון. מוכן לאינטגרציית Meta API." }; }
  catch (e) { return { error: e instanceof Error ? e.message : "החיבור נכשל" }; }
}
export async function recordInboundAction(input: { text: string; contactName?: string; conversationId?: string }): Promise<WaActionState> {
  try { const r = await recordInbound(input); revalidate(); return { ok: true, message: `נרשם — כוונה זוהתה: ${r.intent}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום ההודעה נכשל" }; }
}
export async function createDraftAction(input: { conversationId?: string; body: string; kind?: string }): Promise<WaActionState> {
  try { const r = await createDraft(input); revalidate(); return { ok: true, message: r.requiresApproval ? "טיוטה נוצרה — דורשת אישור (תוכן רגיש)" : "טיוטה נוצרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הטיוטה נכשלה" }; }
}
export async function approveDraftAction(draftId: string): Promise<WaActionState> {
  try { await approveDraft(draftId); revalidate(); return { ok: true, message: "אושר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function rejectDraftAction(draftId: string): Promise<WaActionState> {
  try { await rejectDraft(draftId); revalidate(); return { ok: true, message: "נדחה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הדחייה נכשלה" }; }
}
export async function markDraftSentAction(draftId: string): Promise<WaActionState> {
  try { await markDraftSent(draftId); revalidate(); return { ok: true, message: "סומן כנשלח ידנית" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "סימון השליחה נכשל" }; }
}
export async function recordMissedCallAction(contactName?: string): Promise<WaActionState> {
  try { await recordMissedCall({ contactName }); revalidate(); return { ok: true, message: "שיחה שלא נענתה נרשמה + טיוטת שחזור" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הרישום נכשל" }; }
}
export async function createFollowupAction(input: { conversationId?: string; body: string; followupType?: string; mode?: string; dueAt?: string }): Promise<WaActionState> {
  try { await createFollowup(input); revalidate(); return { ok: true, message: "מעקב נוצר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המעקב נכשלה" }; }
}
export async function createCampaignAction(input: { name: string; goal: string; template?: string }): Promise<WaActionState> {
  try { await createCampaign(input); revalidate(); return { ok: true, message: "קמפיין נוצר כטיוטה — שליחה מבוקרת בלבד" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הקמפיין נכשלה" }; }
}
export async function createSmartLinkAction(input: { linkType: string; title?: string; propertyId?: string }): Promise<WaActionState> {
  try { const r = await createSmartLink(input); revalidate(); return { ok: true, message: `קישור חכם נוצר: /w/${r.slug}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הקישור נכשלה" }; }
}
export async function computeDailyMissionsAction(): Promise<WaActionState> {
  try { const r = await computeDailyMissions(); revalidate(); return { ok: true, message: `נוצרו ${r.created} משימות יומיות` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המשימות נכשלה" }; }
}
