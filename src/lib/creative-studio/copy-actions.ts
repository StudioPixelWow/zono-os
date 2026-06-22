"use server";
import { revalidatePath } from "next/cache";
import { generateCopyForAsset, setCopyFavorite, approveCopy, rejectCopy, regenerateCopy } from "./copy-service";

export interface CopyActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function generateCopyAction(input: { creativeAssetId: string; entityType: string; entityId: string }): Promise<CopyActionState> {
  try {
    const r = await generateCopyForAsset(input.creativeAssetId);
    revalidate(input.entityType, input.entityId);
    const label = r.provider === "mock" ? "מצב הדגמה" : r.provider === "gemini" ? "Gemini" : r.provider === "openai" ? "OpenAI" : r.provider;
    return { ok: true, message: `נוצרו ${r.created} טקסטים שיווקיים · ${label}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת הטקסטים נכשלה" }; }
}
export async function favoriteCopyAction(input: { copyId: string; value: boolean; entityType: string; entityId: string }): Promise<CopyActionState> {
  try { await setCopyFavorite(input.copyId, input.value); revalidate(input.entityType, input.entityId); return { ok: true, message: input.value ? "נוסף למועדפים" : "הוסר מהמועדפים" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function approveCopyAction(input: { copyId: string; entityType: string; entityId: string }): Promise<CopyActionState> {
  try { await approveCopy(input.copyId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הטקסט אושר — ZONO ילמד מזה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function rejectCopyAction(input: { copyId: string; entityType: string; entityId: string }): Promise<CopyActionState> {
  try { await rejectCopy(input.copyId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הטקסט נדחה — ZONO ילמד להימנע" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הדחייה נכשלה" }; }
}
export async function regenerateCopyAction(input: { copyId: string; entityType: string; entityId: string }): Promise<CopyActionState> {
  try { const r = await regenerateCopy(input.copyId); revalidate(input.entityType, input.entityId); return { ok: true, message: `נוצרו מחדש ${r.created} טקסטים` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירה מחדש נכשלה" }; }
}
