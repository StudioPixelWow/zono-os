"use server";
import { revalidatePath } from "next/cache";
import { generateOutputsForAsset, setOutputFavorite, approveOutput, rejectOutput, duplicateOutput, regenerateOutput } from "./output-service";

export interface OutputActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function generateOutputsAction(input: { creativeAssetId: string; entityType: string; entityId: string }): Promise<OutputActionState> {
  try { const r = await generateOutputsForAsset(input.creativeAssetId); revalidate(input.entityType, input.entityId); return { ok: true, message: `נוצרו ${r.created} וריאציות קריאייטיב` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת הקריאייטיב נכשלה" }; }
}
export async function favoriteOutputAction(input: { outputId: string; value: boolean; entityType: string; entityId: string }): Promise<OutputActionState> {
  try { await setOutputFavorite(input.outputId, input.value); revalidate(input.entityType, input.entityId); return { ok: true, message: input.value ? "נוסף למועדפים" : "הוסר מהמועדפים" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function approveOutputAction(input: { outputId: string; entityType: string; entityId: string }): Promise<OutputActionState> {
  try { await approveOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקריאייטיב אושר — ZONO ילמד מזה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function rejectOutputAction(input: { outputId: string; entityType: string; entityId: string }): Promise<OutputActionState> {
  try { await rejectOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקריאייטיב נדחה — ZONO ילמד להימנע" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הדחייה נכשלה" }; }
}
export async function duplicateOutputAction(input: { outputId: string; entityType: string; entityId: string }): Promise<OutputActionState> {
  try { await duplicateOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקריאייטיב שוכפל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השכפול נכשל" }; }
}
export async function regenerateOutputAction(input: { outputId: string; entityType: string; entityId: string }): Promise<OutputActionState> {
  try { const r = await regenerateOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: `נוצרו מחדש ${r.created} וריאציות` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירה מחדש נכשלה" }; }
}
