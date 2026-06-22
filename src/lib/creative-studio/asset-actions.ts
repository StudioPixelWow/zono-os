"use server";
import { revalidatePath } from "next/cache";
import { generateAssetsForCampaign, setAssetFavorite, approveAsset, rejectAsset, duplicateAsset, approveAllForCampaign } from "./asset-service";

export interface AssetActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function generateAssetsAction(input: { campaignId: string; entityType: string; entityId: string }): Promise<AssetActionState> {
  try {
    const r = await generateAssetsForCampaign(input.campaignId);
    revalidate(input.entityType, input.entityId);
    const label = r.provider === "mock" ? "מצב הדגמה" : r.provider === "gemini" ? "Gemini" : r.provider === "openai" ? "OpenAI" : r.provider;
    return { ok: true, message: `נוצרו ${r.created} נכסי שיווק · ${label}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת הנכסים נכשלה" }; }
}
export async function favoriteAssetAction(input: { assetId: string; value: boolean; entityType: string; entityId: string }): Promise<AssetActionState> {
  try { await setAssetFavorite(input.assetId, input.value); revalidate(input.entityType, input.entityId); return { ok: true, message: input.value ? "נוסף למועדפים" : "הוסר מהמועדפים" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function approveAssetAction(input: { assetId: string; entityType: string; entityId: string }): Promise<AssetActionState> {
  try { await approveAsset(input.assetId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הנכס אושר — ZONO ילמד מזה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
export async function rejectAssetAction(input: { assetId: string; entityType: string; entityId: string }): Promise<AssetActionState> {
  try { await rejectAsset(input.assetId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הנכס נדחה — ZONO ילמד להימנע" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הדחייה נכשלה" }; }
}
export async function duplicateAssetAction(input: { assetId: string; entityType: string; entityId: string }): Promise<AssetActionState> {
  try { await duplicateAsset(input.assetId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הנכס שוכפל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השכפול נכשל" }; }
}
export async function approveAllAssetsAction(input: { campaignId: string; entityType: string; entityId: string }): Promise<AssetActionState> {
  try { const r = await approveAllForCampaign(input.campaignId); revalidate(input.entityType, input.entityId); return { ok: true, message: `${r.approved} נכסים אושרו` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור הקבוצתי נכשל" }; }
}
