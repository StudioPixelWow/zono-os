"use server";
import { revalidatePath } from "next/cache";
import {
  createCommission, recalcCommission, submitCommissionForApproval, approveCommission, cancelCommission,
  createCollection, recordCollection, reverseCollection, markCollectionPaid, markCollectionOverdue, getCollectionEvents,
  type CommissionInput, type CollectionEventDTO,
} from "./service";

export interface CommissionActionState { ok?: boolean; error?: string; message?: string; id?: string }

function revalidate() { try { revalidatePath("/commissions"); revalidatePath("/deals"); } catch { /* noop */ } }

export async function createCommissionAction(input: CommissionInput): Promise<CommissionActionState> {
  try { const r = await createCommission(input); revalidate(); return { ok: true, id: r.id, message: "העמלה חושבה ונשמרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת העמלה נכשלה" }; }
}
export async function recalcCommissionAction(id: string, input: Omit<CommissionInput, "dealId">): Promise<CommissionActionState> {
  try { await recalcCommission(id, input); revalidate(); return { ok: true, message: "העמלה חושבה מחדש" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "חישוב מחדש נכשל" }; }
}
export async function submitCommissionAction(id: string): Promise<CommissionActionState> {
  try { await submitCommissionForApproval(id); revalidate(); return { ok: true, message: "נשלח לאישור" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השליחה לאישור נכשלה" }; }
}
export async function approveCommissionAction(id: string): Promise<CommissionActionState> {
  try { await approveCommission(id); revalidate(); return { ok: true, message: "העמלה אושרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "אישור העמלה נכשל" }; }
}
export async function cancelCommissionAction(id: string): Promise<CommissionActionState> {
  try { await cancelCommission(id); revalidate(); return { ok: true, message: "העמלה בוטלה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול העמלה נכשל" }; }
}
export async function createCollectionAction(commissionId: string, amountDue: number, dueDate?: string | null, invoiceRef?: string | null): Promise<CommissionActionState> {
  try { const r = await createCollection(commissionId, { amountDue, dueDate, invoiceRef }); revalidate(); return { ok: true, id: r.id, message: "גבייה נוצרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הגבייה נכשלה" }; }
}
export async function recordCollectionAction(collectionId: string, amount: number, receiptRef?: string | null, note?: string | null): Promise<CommissionActionState> {
  try { await recordCollection(collectionId, amount, { receiptRef, note }); revalidate(); return { ok: true, message: "התקבול נרשם" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום התקבול נכשל" }; }
}
export async function reverseCollectionAction(collectionId: string, amount: number, note?: string | null): Promise<CommissionActionState> {
  try { await reverseCollection(collectionId, amount, note); revalidate(); return { ok: true, message: "התקבול הופך" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "היפוך התקבול נכשל" }; }
}
export async function markCollectionPaidAction(collectionId: string): Promise<CommissionActionState> {
  try { await markCollectionPaid(collectionId); revalidate(); return { ok: true, message: "סומן כשולם" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function markCollectionOverdueAction(collectionId: string): Promise<CommissionActionState> {
  try { await markCollectionOverdue(collectionId); revalidate(); return { ok: true, message: "סומן כפגר תשלום" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function getCollectionEventsAction(collectionId: string): Promise<CollectionEventDTO[]> {
  try { return await getCollectionEvents(collectionId); } catch { return []; }
}
