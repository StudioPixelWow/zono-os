"use server";
import { revalidatePath } from "next/cache";
import { saveBrief, createGrowthPlan, runSimulation } from "./service";
import type { GrowthPlanType, ScenarioKey } from "./engine";

export interface AIActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/ai-office"); revalidatePath("/"); } catch { /* noop */ } }

export async function saveBriefAction(): Promise<AIActionState> {
  try { await saveBrief(); revalidate(); return { ok: true, message: "התדריך נשמר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת התדריך נכשלה" }; }
}
export async function createGrowthPlanAction(planType: GrowthPlanType): Promise<AIActionState> {
  try { await createGrowthPlan(planType); revalidate(); return { ok: true, message: "תוכנית צמיחה נוצרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת התוכנית נכשלה" }; }
}
export async function runSimulationAction(scenario: ScenarioKey): Promise<AIActionState> {
  try { const r = await runSimulation(scenario); revalidate(); return { ok: true, message: r.summary }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הסימולציה נכשלה" }; }
}
