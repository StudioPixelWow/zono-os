"use server";
import { revalidatePath } from "next/cache";
import { ensureJourney, advanceStage, recomputeAllJourneys } from "./service";

export interface JourneyActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/journeys"); revalidatePath("/"); } catch { /* noop */ } }

export async function ensureJourneyAction(input: { entityType: string; entityId: string; journeyType?: string }): Promise<JourneyActionState> {
  try { await ensureJourney(input.entityType, input.entityId, input.journeyType); revalidate(); return { ok: true, message: "מסע נוצר/אותחל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המסע נכשלה" }; }
}
export async function advanceStageAction(input: { journeyId: string; toStage: string }): Promise<JourneyActionState> {
  try { await advanceStage(input.journeyId, input.toStage); revalidate(); return { ok: true, message: "השלב עודכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון השלב נכשל" }; }
}
export async function recomputeAllJourneysAction(): Promise<JourneyActionState> {
  try { const r = await recomputeAllJourneys(); revalidate(); return { ok: true, message: `חושבו מחדש ${r.journeys} מסעות` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "החישוב מחדש נכשל" }; }
}
