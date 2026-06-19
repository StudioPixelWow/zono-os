"use server";

import { revalidatePath } from "next/cache";
import { generateMarketSnapshotsForOrganization } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface MarketActionState {
  error?: string;
  ok?: boolean;
  localities?: number;
  snapshots?: number;
}

/** Recompute the demand heatmap, then refresh the Decision Brain so the new
 *  market opportunity clusters surface immediately. */
export async function recalcMarketHeatmapAction(): Promise<MarketActionState> {
  try {
    const summary = await generateMarketSnapshotsForOrganization();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[market] decision recalc failed:", e); }
    revalidatePath("/market");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, ...summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[market] recalc failed:", e);
    return { error: `חישוב מפת הביקוש נכשל: ${msg}` };
  }
}
