"use server";

import { revalidatePath } from "next/cache";
import { recomputeRevenueIntelligence, setRevenueTarget } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface RevenueActionState { error?: string; ok?: boolean; message?: string }

export async function recomputeRevenueAction(): Promise<RevenueActionState> {
  try {
    const s = await recomputeRevenueIntelligence();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[revenue] decision recalc failed:", e); }
    revalidatePath("/revenue");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `סטטוס: ${s.gapLevel} · פער ${Math.round(s.gap).toLocaleString()}₪ · בסיכון ${Math.round(s.atRisk).toLocaleString()}₪` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב מודיעין ההכנסות נכשל" };
  }
}

export async function setRevenueTargetAction(periodType: string, amount: number): Promise<RevenueActionState> {
  try {
    if (!Number.isFinite(amount) || amount < 0) return { error: "סכום יעד לא תקין" };
    await setRevenueTarget({ scopeType: "organization", scopeId: null, scopeLabel: "כל המשרד", periodType, amount });
    try { await recomputeRevenueIntelligence(); } catch (e) { console.error("[revenue] recompute after target failed:", e); }
    revalidatePath("/revenue");
    return { ok: true, message: "היעד נשמר" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שמירת היעד נכשלה" };
  }
}
