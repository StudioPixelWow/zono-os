"use server";

import { revalidatePath } from "next/cache";
import type { JourneyStage } from "@/lib/supabase/types";
import { setJourneyStage } from "./repository";

export interface JourneyActionState {
  error?: string;
}

/** Move a property to a new journey stage (logs an activity). */
export async function setJourneyStageAction(
  propertyId: string,
  stage: JourneyStage,
): Promise<JourneyActionState> {
  try {
    await setJourneyStage(propertyId, stage);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[journey] stage transition failed:", e);
    return { error: `עדכון שלב המסע נכשל: ${msg}` };
  }
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  return {};
}
