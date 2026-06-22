"use server";
import { revalidatePath } from "next/cache";
import { generateConcepts, favoriteConcept, approveConcept, deleteConcept } from "./concept-service";

export interface ConceptActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function generateConceptsAction(entityType: string, entityId: string): Promise<ConceptActionState> {
  try {
    const r = await generateConcepts(entityType, entityId);
    revalidate(entityType, entityId);
    const label = r.provider === "mock" ? "מצב הדגמה" : r.provider === "gemini" ? "Gemini" : r.provider === "openai" ? "OpenAI" : r.provider;
    return { ok: true, message: `נוצרו ${r.created} קונספטים שיווקיים · ${label}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת הקונספטים נכשלה" }; }
}
export async function favoriteConceptAction(input: { conceptId: string; value: boolean; entityType: string; entityId: string }): Promise<ConceptActionState> {
  try { await favoriteConcept(input.conceptId, input.value); revalidate(input.entityType, input.entityId); return { ok: true, message: input.value ? "נוסף למועדפים" : "הוסר מהמועדפים" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function approveConceptAction(input: { conceptId: string; entityType: string; entityId: string }): Promise<ConceptActionState> {
  try { await approveConcept(input.conceptId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקונספט אושר — ZONO ילמד מזה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function deleteConceptAction(input: { conceptId: string; entityType: string; entityId: string }): Promise<ConceptActionState> {
  try { await deleteConcept(input.conceptId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקונספט נמחק — ZONO ילמד להימנע" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "המחיקה נכשלה" }; }
}
