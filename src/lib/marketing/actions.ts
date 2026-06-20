"use server";

import { revalidatePath } from "next/cache";
import { createCommunity, importCommunitiesCsv, recomputeMarketingIntelligence, type CommunityInput } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface MarketingActionState { error?: string; ok?: boolean; message?: string }

export async function recomputeMarketingAction(): Promise<MarketingActionState> {
  try {
    const s = await recomputeMarketingIntelligence();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[marketing] decision recalc failed:", e); }
    revalidatePath("/marketing");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `${s.communities} קהילות · ${s.segments} פלחים · ${s.properties} נכסים · ${s.opportunities} הזדמנויות · בריאות ${s.health}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב מודיעין השיווק נכשל" };
  }
}

export async function createCommunityAction(input: CommunityInput): Promise<MarketingActionState> {
  try {
    if (!input.name?.trim()) return { error: "נדרש שם קהילה" };
    await createCommunity(input);
    revalidatePath("/marketing");
    return { ok: true, message: "הקהילה נוספה" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "הוספת הקהילה נכשלה" };
  }
}

export async function importCommunitiesCsvAction(rows: CommunityInput[]): Promise<MarketingActionState> {
  try {
    const r = await importCommunitiesCsv(rows);
    revalidatePath("/marketing");
    return { ok: true, message: `נוספו ${r.created} קהילות` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "ייבוא הקהילות נכשל" };
  }
}
