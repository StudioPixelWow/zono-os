"use server";
import { revalidatePath } from "next/cache";
import {
  generateQuickCreative, listQuickOutputs, resolveBrandSnapshot, setQuickFavorite, approveQuickOutput, rejectQuickOutput,
  duplicateQuickOutput, editQuickText, replaceQuickImage, regenerateQuickRequest, generateQuickCreativeImage, type GenerateQuickInput,
} from "./quick-creative-service";

export interface QcActionState { ok?: boolean; error?: string; message?: string; warnings?: string[] }

/** Generate the final ad image (Gemini Nano Banana) for one output. */
export async function generateQuickImageAction(input: { outputId: string; entityType: string; entityId: string }): Promise<QcActionState> {
  try {
    const r = await generateQuickCreativeImage(input.outputId);
    revalidate(input.entityType, input.entityId);
    return { ok: true, message: `התמונה נוצרה · ${r.provider}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "יצירת התמונה נכשלה" };
  }
}
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function brandPreviewAction(input: { entityType?: string; entityId?: string }): Promise<QcActionState & { agentPhoto?: string | null; officeLogo?: string | null; colors?: string[]; agentName?: string | null; officeName?: string | null }> {
  try { const b = await resolveBrandSnapshot(input); return { ok: true, warnings: b.warnings, agentPhoto: b.snapshot.agentPhoto, officeLogo: b.snapshot.officeLogo, colors: b.snapshot.colors, agentName: b.snapshot.agentName, officeName: b.snapshot.officeName }; }
  catch (e) { return { error: e instanceof Error ? e.message : "טעינת המותג נכשלה" }; }
}
export async function generateQuickCreativeAction(g: GenerateQuickInput): Promise<QcActionState> {
  try { const r = await generateQuickCreative(g); revalidate(g.entityType, g.entityId); return { ok: true, message: `נוצרו ${r.created} וריאציות` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "היצירה נכשלה" }; }
}
export async function listQuickOutputsAction(input: { entityType?: string; entityId?: string }): Promise<{ outputs: Record<string, unknown>[] }> {
  try { return { outputs: await listQuickOutputs(input) }; } catch { return { outputs: [] }; }
}
export async function favoriteQuickAction(input: { outputId: string; value: boolean; entityType: string; entityId: string }): Promise<QcActionState> {
  try { await setQuickFavorite(input.outputId, input.value); revalidate(input.entityType, input.entityId); return { ok: true, message: input.value ? "נוסף למועדפים" : "הוסר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function approveQuickAction(input: { outputId: string; entityType: string; entityId: string }): Promise<QcActionState> {
  try { await approveQuickOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: "אושר — ZONO ילמד מהסגנון" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function rejectQuickAction(input: { outputId: string; entityType: string; entityId: string }): Promise<QcActionState> {
  try { await rejectQuickOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: "נדחה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הדחייה נכשלה" }; }
}
export async function duplicateQuickAction(input: { outputId: string; entityType: string; entityId: string }): Promise<QcActionState> {
  try { await duplicateQuickOutput(input.outputId); revalidate(input.entityType, input.entityId); return { ok: true, message: "שוכפל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השכפול נכשל" }; }
}
export async function editQuickTextAction(input: { outputId: string; patch: { headline?: string; subheadline?: string; body_text?: string; cta_text?: string }; entityType: string; entityId: string }): Promise<QcActionState> {
  try { await editQuickText(input.outputId, input.patch); revalidate(input.entityType, input.entityId); return { ok: true, message: "הטקסט עודכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function replaceQuickImageAction(input: { outputId: string; imageUrl: string; entityType: string; entityId: string }): Promise<QcActionState> {
  try { await replaceQuickImage(input.outputId, input.imageUrl); revalidate(input.entityType, input.entityId); return { ok: true, message: "התמונה הוחלפה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ההחלפה נכשלה" }; }
}
export async function regenerateQuickAction(input: { requestId: string; entityType: string; entityId: string }): Promise<QcActionState> {
  try { const r = await regenerateQuickRequest(input.requestId); revalidate(input.entityType, input.entityId); return { ok: true, message: `נוצרו מחדש ${r.created} וריאציות` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירה מחדש נכשלה" }; }
}
