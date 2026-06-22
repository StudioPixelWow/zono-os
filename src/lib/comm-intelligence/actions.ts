"use server";
import { revalidatePath } from "next/cache";
import {
  ingestCommunication, resolveObjection, markCommitmentFulfilled, markOpportunityActioned, recomputeAllEntities,
  type IngestInput,
} from "./service";

export interface CommActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/communication"); revalidatePath("/"); } catch { /* noop */ } }

export async function ingestCommunicationAction(input: IngestInput): Promise<CommActionState> {
  try { const r = await ingestCommunication(input); revalidate(); return { ok: true, message: `נקלט — כוונה: ${r.intent}, סנטימנט: ${r.sentiment}${r.objections ? `, ${r.objections} התנגדויות` : ""}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "קליטת התקשורת נכשלה" }; }
}
export async function resolveObjectionAction(objectionId: string, method: string): Promise<CommActionState> {
  try { await resolveObjection(objectionId, method); revalidate(); return { ok: true, message: "ההתנגדות סומנה כפתורה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון ההתנגדות נכשל" }; }
}
export async function markCommitmentFulfilledAction(commitmentId: string): Promise<CommActionState> {
  try { await markCommitmentFulfilled(commitmentId); revalidate(); return { ok: true, message: "ההתחייבות סומנה כבוצעה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון ההתחייבות נכשל" }; }
}
export async function markOpportunityActionedAction(opportunityId: string): Promise<CommActionState> {
  try { await markOpportunityActioned(opportunityId); revalidate(); return { ok: true, message: "ההזדמנות סומנה כטופלה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון ההזדמנות נכשל" }; }
}
export async function recomputeAllAction(): Promise<CommActionState> {
  try { const r = await recomputeAllEntities(); revalidate(); return { ok: true, message: `חושבו מחדש ${r.entities} ישויות` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "החישוב מחדש נכשל" }; }
}
