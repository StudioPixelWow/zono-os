"use server";
import { revalidatePath } from "next/cache";
import {
  createDraftOffer, submitOffer, recordSellerResponse, counterOffer, acceptOffer, rejectOffer,
  withdrawOffer, expireOffer, convertOfferToDeal, getOfferDetail,
  type CreateOfferInput, type OfferDetail,
} from "./service";

export interface OfferActionState { ok?: boolean; error?: string; message?: string; id?: string; dealId?: string }

function revalidate() { try { revalidatePath("/offers"); revalidatePath("/negotiation"); } catch { /* noop */ } }

export async function createOfferAction(input: CreateOfferInput): Promise<OfferActionState> {
  try { const r = await createDraftOffer(input); revalidate(); return { ok: true, id: r.id, message: "טיוטת הצעה נוצרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת ההצעה נכשלה" }; }
}
export async function submitOfferAction(id: string): Promise<OfferActionState> {
  try { await submitOffer(id); revalidate(); return { ok: true, message: "ההצעה הוגשה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הגשת ההצעה נכשלה" }; }
}
export async function sellerResponseAction(id: string, kind: "counter" | "accept" | "reject", amount?: number | null, note?: string | null): Promise<OfferActionState> {
  try { await recordSellerResponse(id, { kind, amount, note }); revalidate(); return { ok: true, message: kind === "counter" ? "נרשמה הצעה נגדית" : kind === "accept" ? "המוכר קיבל" : "המוכר דחה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום התשובה נכשל" }; }
}
export async function counterOfferAction(id: string, amount: number, note?: string | null): Promise<OfferActionState> {
  try { await counterOffer(id, { amount, note }); revalidate(); return { ok: true, message: "נרשמה הצעה נגדית" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום ההצעה הנגדית נכשל" }; }
}
export async function acceptOfferAction(id: string): Promise<OfferActionState> {
  try { await acceptOffer(id); revalidate(); return { ok: true, message: "ההצעה אושרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "אישור ההצעה נכשל" }; }
}
export async function rejectOfferAction(id: string, reason?: string): Promise<OfferActionState> {
  try { await rejectOffer(id, reason); revalidate(); return { ok: true, message: "ההצעה נדחתה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "דחיית ההצעה נכשלה" }; }
}
export async function withdrawOfferAction(id: string): Promise<OfferActionState> {
  try { await withdrawOffer(id); revalidate(); return { ok: true, message: "ההצעה בוטלה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול ההצעה נכשל" }; }
}
export async function expireOfferAction(id: string): Promise<OfferActionState> {
  try { await expireOffer(id); revalidate(); return { ok: true, message: "ההצעה סומנה כפגת תוקף" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function convertOfferToDealAction(id: string): Promise<OfferActionState> {
  try { const r = await convertOfferToDeal(id); revalidate(); return { ok: true, dealId: r.dealId, message: "ההצעה הומרה לעסקה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "המרת ההצעה לעסקה נכשלה" }; }
}
export async function getOfferDetailAction(id: string): Promise<OfferDetail | null> {
  return getOfferDetail(id);
}
