"use server";
import { revalidatePath } from "next/cache";
import { saveBrandProfile, saveBrandColors, saveBrandAsset, type SaveBrandInput } from "./service";

export interface BrandActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/settings/brand"); revalidatePath("/"); } catch { /* noop */ } }

export async function saveBrandProfileAction(input: SaveBrandInput): Promise<BrandActionState> {
  try { await saveBrandProfile(input); revalidate(); return { ok: true, message: "פרופיל המותג נשמר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השמירה נכשלה" }; }
}
export async function saveBrandColorsAction(input: { entityType: string; entityId: string; primary: string; secondary: string; accent: string; palette: string[]; confidence: number; source: string }): Promise<BrandActionState> {
  try { await saveBrandColors(input.entityType, input.entityId, input); revalidate(); return { ok: true, message: "צבעי המותג נשמרו" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת הצבעים נכשלה" }; }
}
export async function saveBrandAssetAction(input: { entityType: string; entityId: string; assetKind: string; url: string; storagePath?: string | null }): Promise<BrandActionState> {
  try { await saveBrandAsset(input.entityType, input.entityId, input.assetKind, input.url, input.storagePath); revalidate(); return { ok: true, message: "הנכס נשמר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת הנכס נכשלה" }; }
}
