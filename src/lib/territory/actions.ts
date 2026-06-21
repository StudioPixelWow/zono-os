"use server";

import { revalidatePath } from "next/cache";
import { generateTerritories, generateTerritoryRecommendations } from "./service";

export interface TerritoryActionState { ok?: boolean; error?: string; message?: string }

// In a "use server" module every export must be an async function.
export async function generateTerritoriesAction(): Promise<TerritoryActionState> {
  try {
    const r = await generateTerritories();
    // Feed territory signals/streets/clusters into the Recommendation OS.
    let recs = 0;
    try { recs = (await generateTerritoryRecommendations()).created; } catch (e) { console.error("[territory] recs failed:", e); }
    revalidatePath("/territories");
    revalidatePath("/recommendations");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `חושבו ${r.territories} טריטוריות · ${r.signals} סיגנלים · ${recs} המלצות` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב הטריטוריות נכשל" };
  }
}
