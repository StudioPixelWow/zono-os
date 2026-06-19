"use server";

import { revalidatePath } from "next/cache";
import { recomputeCompetitorsForOrg } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface CompetitorActionState { error?: string; ok?: boolean; message?: string }

export async function recomputeCompetitorsAction(): Promise<CompetitorActionState> {
  try {
    const s = await recomputeCompetitorsForOrg();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[competitor] decision recalc failed:", e); }
    revalidatePath("/competitors");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `${s.competitors} מתחרים · ${s.signals} סיגנלים` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב המתחרים נכשל" };
  }
}
