"use server";
import { revalidatePath } from "next/cache";
import { generateVisualForOutput, setVisualFavorite, approveVisual, rejectVisual, generateVisualVariation } from "./visual-service";

export interface VisualActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function generateVisualAction(input: { creativeOutputId: string; entityType: string; entityId: string }): Promise<VisualActionState> {
  try {
    const r = await generateVisualForOutput(input.creativeOutputId);
    revalidate(input.entityType, input.entityId);
    const label = r.provider === "mock" ? "מצב הדגמה (placeholder)" : r.provider === "gemini" ? "Gemini" : r.provider === "openai" ? "OpenAI" : r.provider;
    return { ok: true, message: `נוצר ויזואל · ${label}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת הויזואל נכשלה" }; }
}
export async function variationVisualAction(input: { visualId: string; mode: string; entityType: string; entityId: string }): Promise<VisualActionState> {
  try { const r = await generateVisualVariation(input.visualId, input.mode); revalidate(input.entityType, input.entityId); return { ok: true, message: `נוצרה וריאציה · ${r.provider === "mock" ? "הדגמה" : r.provider}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הוריאציה נכשלה" }; }
}
export async function approveVisualAction(input: { visualId: string; entityType: string; entityId: string }): Promise<VisualActionState> {
  try { await approveVisual(input.visualId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הויזואל אושר והוזרק לקריאייטיב" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function rejectVisualAction(input: { visualId: string; entityType: string; entityId: string }): Promise<VisualActionState> {
  try { await rejectVisual(input.visualId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הויזואל נדחה — ZONO ילמד" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הדחייה נכשלה" }; }
}
export async function favoriteVisualAction(input: { visualId: string; value: boolean; entityType: string; entityId: string }): Promise<VisualActionState> {
  try { await setVisualFavorite(input.visualId, input.value); revalidate(input.entityType, input.entityId); return { ok: true, message: input.value ? "נוסף למועדפים" : "הוסר מהמועדפים" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
