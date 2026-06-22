"use server";
import { revalidatePath } from "next/cache";
import {
  saveDna, lockDna, updateAssetFlags, addAssetNote, deleteAsset, submitFeedback, requestAnalysis, ensureDnaProfile,
  type SaveDnaInput,
} from "./service";

export interface CsActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { revalidatePath("/creative-studio"); if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function saveDnaAction(input: SaveDnaInput): Promise<CsActionState> {
  try { await saveDna(input); revalidate(input.entityType, input.entityId); return { ok: true, message: "פרופיל ה-DNA נשמר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת הפרופיל נכשלה" }; }
}
export async function lockDnaAction(entityType: string, entityId: string): Promise<CsActionState> {
  try { await lockDna(entityType, entityId); revalidate(entityType, entityId); return { ok: true, message: "ה-DNA ננעל כקו שיווקי מאושר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הנעילה נכשלה" }; }
}
export async function ensureDnaAction(entityType: string, entityId: string): Promise<CsActionState> {
  try { await ensureDnaProfile(entityType, entityId); revalidate(entityType, entityId); return { ok: true, message: "פרופיל DNA נוצר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הפרופיל נכשלה" }; }
}
export async function updateAssetFlagsAction(input: { assetId: string; flags: Record<string, boolean>; entityType: string; entityId: string }): Promise<CsActionState> {
  try { await updateAssetFlags(input.assetId, input.flags); revalidate(input.entityType, input.entityId); return { ok: true, message: "התיוג עודכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון התיוג נכשל" }; }
}
export async function addAssetNoteAction(input: { assetId: string; note: string; entityType: string; entityId: string }): Promise<CsActionState> {
  try { await addAssetNote(input.assetId, input.note); revalidate(input.entityType, input.entityId); return { ok: true, message: "ההערה נשמרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת ההערה נכשלה" }; }
}
export async function deleteAssetAction(input: { assetId: string; entityType: string; entityId: string }): Promise<CsActionState> {
  try { await deleteAsset(input.assetId); revalidate(input.entityType, input.entityId); return { ok: true, message: "החומר הוסר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ההסרה נכשלה" }; }
}
export async function submitFeedbackAction(input: { entityType: string; entityId: string; feedbackType: string; assetId?: string; note?: string }): Promise<CsActionState> {
  try { await submitFeedback(input); revalidate(input.entityType, input.entityId); return { ok: true, message: "המשוב נשמר ונלמד" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת המשוב נכשלה" }; }
}
export async function requestAnalysisAction(entityType: string, entityId: string): Promise<CsActionState> {
  try { const r = await requestAnalysis(entityType, entityId); revalidate(entityType, entityId); return { ok: true, message: `משימת ניתוח DNA נוצרה (${r.jobId.slice(0, 8)}) — ניתוח AI יופעל בשלב הבא` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת משימת הניתוח נכשלה" }; }
}
