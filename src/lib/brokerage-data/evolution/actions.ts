"use server";
// ============================================================================
// ZONO Brokerage Evolution — server actions. Reads are RLS-scoped; the
// recompute is owner-gated. Time Machine read is read-only / city-scoped.
// ============================================================================
import { revalidatePath } from "next/cache";
import { requireOwner } from "../permissions";
import {
  recomputeBrokerageEvolution, getEvolutionDashboard, getMarketAtDate,
  type EvolutionDashboard, type EvolutionRefreshResult, type TimeMachineSnapshot,
} from "./service";

export async function getEvolutionDashboardAction(): Promise<EvolutionDashboard | null> {
  try { return await getEvolutionDashboard(); }
  catch (e) { console.error("[evolution] dashboard failed:", e); return null; }
}

export async function getMarketAtDateAction(date: string): Promise<TimeMachineSnapshot | null> {
  try { return await getMarketAtDate(date); }
  catch (e) { console.error("[evolution] time machine failed:", e); return null; }
}

export interface EvolutionActionState { error?: string; message?: string; result?: EvolutionRefreshResult }

/** Owner — recompute the whole evolution layer now. */
export async function recomputeEvolutionAction(): Promise<EvolutionActionState> {
  try {
    await requireOwner();
    const result = await recomputeBrokerageEvolution();
    revalidatePath("/brokerage-data");
    return { result, message: `אבולוציה חושבה מחדש: ${result.snapshots} תצלומי-זמן · ${result.dnaRows} DNA · ${result.neighborhoods} שכונות · ${result.markets} שווקים · ${result.predictions} תחזיות · ${result.events} אירועים (${result.ms}ms).` };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה בחישוב האבולוציה" }; }
}
