"use server";
import { revalidatePath } from "next/cache";
import {
  recordReview, createReviewRequest, recordReferral, recomputeReputation,
  type ReviewInput, type ReferralInput,
} from "./service";

export interface RepActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/reputation"); revalidatePath("/"); } catch { /* noop */ } }

export async function recordReviewAction(input: ReviewInput): Promise<RepActionState> {
  try { await recordReview(input); revalidate(); return { ok: true, message: "הביקורת נרשמה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום הביקורת נכשל" }; }
}
export async function createReviewRequestAction(input: { buyerId?: string; sellerId?: string; dealId?: string; channel?: string; note?: string }): Promise<RepActionState> {
  try { await createReviewRequest(input); revalidate(); return { ok: true, message: "בקשת ביקורת הוכנה (טיוטה — נשלחת ידנית)" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הכנת בקשת הביקורת נכשלה" }; }
}
export async function recordReferralAction(input: ReferralInput): Promise<RepActionState> {
  try { await recordReferral(input); revalidate(); return { ok: true, message: "ההפניה נרשמה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום ההפניה נכשל" }; }
}
export async function recomputeReputationAction(): Promise<RepActionState> {
  try { const r = await recomputeReputation(); revalidate(); return { ok: true, message: `חושבו ${r.advocates} תומכים ו-${r.geoScopes} אזורי מוניטין` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "חישוב המוניטין נכשל" }; }
}
