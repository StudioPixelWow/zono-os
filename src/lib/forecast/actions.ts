"use server";

import { revalidatePath } from "next/cache";
import { generateForecastsForOrg, generatePipelineSnapshot } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface ForecastActionState { error?: string; ok?: boolean; message?: string }

export async function recomputeForecastAction(): Promise<ForecastActionState> {
  try {
    const s = await generateForecastsForOrg();
    await generatePipelineSnapshot();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[forecast] decision recalc failed:", e); }
    revalidatePath("/forecast");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `${s.forecasts} תחזיות · ${s.likely} צפויות להיסגר · ${s.atRisk} בסיכון` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב התחזית נכשל" };
  }
}
