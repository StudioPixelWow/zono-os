"use server";

import { revalidatePath } from "next/cache";
import { recomputeTeamIntelligence } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface TeamActionState { error?: string; ok?: boolean; message?: string }

export async function recomputeTeamAction(): Promise<TeamActionState> {
  try {
    const s = await recomputeTeamIntelligence();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[team] decision recalc failed:", e); }
    revalidatePath("/team");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `${s.agents} סוכנים · ${s.coachingSignals} סיגנלי ליווי · בריאות משרד ${s.officeHealth}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב מודיעין הצוות נכשל" };
  }
}
