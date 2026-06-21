"use server";

import { revalidatePath } from "next/cache";
import { generateTerritories } from "./service";

export interface TerritoryActionState { ok?: boolean; error?: string; message?: string }

// In a "use server" module every export must be an async function.
export async function generateTerritoriesAction(): Promise<TerritoryActionState> {
  try {
    const r = await generateTerritories();
    revalidatePath("/territories");
    revalidatePath("/");
    revalidatePath("/command");
    return { ok: true, message: `חושבו ${r.territories} טריטוריות · ${r.signals} סיגנלים` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב הטריטוריות נכשל" };
  }
}
