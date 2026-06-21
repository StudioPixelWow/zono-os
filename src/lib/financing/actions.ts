"use server";
import { revalidatePath } from "next/cache";
import { saveFinancialProfile, recomputeAllFinancing, getBuyerFinancing, type BuyerFinancing } from "./service";
import type { FinancialInputs } from "./engine";

export interface FinancingActionState { ok?: boolean; error?: string; message?: string }

function revalidate() { try { revalidatePath("/financing"); revalidatePath("/"); } catch { /* noop */ } }

export async function saveFinancialProfileAction(buyerId: string, input: FinancialInputs & { employmentType?: string | null; notes?: string | null }): Promise<FinancingActionState> {
  try { const { result } = await saveFinancialProfile(buyerId, input); revalidate(); return { ok: true, message: `נשמר — תקציב מומלץ ${result.recommendedBudget.toLocaleString("he-IL")} ₪, מוכנות ${result.overallReadiness}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת הפרופיל הפיננסי נכשלה" }; }
}
export async function recomputeAllFinancingAction(): Promise<FinancingActionState> {
  try { const r = await recomputeAllFinancing(); revalidate(); return { ok: true, message: `חושבו מחדש ${r.updated} פרופילים` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "חישוב מחדש נכשל" }; }
}
export async function getBuyerFinancingAction(buyerId: string): Promise<BuyerFinancing | null> {
  return getBuyerFinancing(buyerId);
}
