"use server";

import { revalidatePath } from "next/cache";
import { generateDailyBatch, markDailyItem, recomputeDistributionIntelligence, setCommunityApproval } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface DistActionState { error?: string; ok?: boolean; message?: string }

function revalidate() {
  revalidatePath("/distribution");
  revalidatePath("/distribution/daily");
  revalidatePath("/");
}

export async function setCommunityApprovalAction(communityId: string, status: string, reason?: string): Promise<DistActionState> {
  try { await setCommunityApproval(communityId, status, reason); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}

export async function recomputeDistributionAction(): Promise<DistActionState> {
  try {
    const s = await recomputeDistributionIntelligence();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[distribution] decision recalc failed:", e); }
    revalidate();
    return { ok: true, message: `${s.communities} קהילות · ${s.matches} התאמות · ${s.plans} תוכניות הפצה · ${s.opportunities} הזדמנויות` };
  } catch (e) { return { error: e instanceof Error ? e.message : "חישוב מודיעין ההפצה נכשל" }; }
}

export async function generateDailyBatchAction(): Promise<DistActionState> {
  try {
    const r = await generateDailyBatch();
    revalidate();
    return r.items > 0 ? { ok: true, message: `הוכן שולחן פרסום עם ${r.items} פריטים` } : { ok: true, message: "אין פריטים זמינים — אשר קהילות וחשב מודיעין הפצה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "הכנת השולחן היומי נכשלה" }; }
}

export async function markDailyItemAction(itemId: string, status: string, url?: string, reason?: string): Promise<DistActionState> {
  try {
    if (status === "manual_published" && url && !/^https?:\/\//i.test(url)) return { error: "כתובת פוסט לא תקינה" };
    await markDailyItem(itemId, status, { url, reason });
    revalidatePath("/distribution/daily");
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
