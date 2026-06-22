"use server";
import { revalidatePath } from "next/cache";
import { generateCampaign, duplicateCampaign, setCampaignStatus, approveCampaign } from "./campaign-service";

export interface CampaignActionState { ok?: boolean; error?: string; message?: string }
function revalidate(entityType?: string, entityId?: string) {
  try { if (entityType && entityId) revalidatePath(`/creative-studio/${entityType}/${entityId}`); } catch { /* noop */ }
}

export async function generateCampaignAction(entityType: string, entityId: string, campaignType?: string): Promise<CampaignActionState> {
  try {
    const r = await generateCampaign(entityType, entityId, campaignType);
    revalidate(entityType, entityId);
    const label = r.provider === "mock" ? "מצב הדגמה" : r.provider === "gemini" ? "Gemini" : r.provider === "openai" ? "OpenAI" : r.provider;
    return { ok: true, message: `נבנה קמפיין עם ${r.assets} נכסים שיווקיים · ${label}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת הקמפיין נכשלה" }; }
}
export async function duplicateCampaignAction(input: { campaignId: string; entityType: string; entityId: string }): Promise<CampaignActionState> {
  try { await duplicateCampaign(input.campaignId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקמפיין שוכפל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השכפול נכשל" }; }
}
export async function archiveCampaignAction(input: { campaignId: string; entityType: string; entityId: string }): Promise<CampaignActionState> {
  try { await setCampaignStatus(input.campaignId, "archived"); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקמפיין הועבר לארכיון" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הארכוב נכשל" }; }
}
export async function deleteCampaignAction(input: { campaignId: string; entityType: string; entityId: string }): Promise<CampaignActionState> {
  try { await setCampaignStatus(input.campaignId, "deleted"); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקמפיין נמחק" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "המחיקה נכשלה" }; }
}
export async function approveCampaignAction(input: { campaignId: string; entityType: string; entityId: string }): Promise<CampaignActionState> {
  try { await approveCampaign(input.campaignId); revalidate(input.entityType, input.entityId); return { ok: true, message: "הקמפיין אושר — ZONO ילמד מזה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "האישור נכשל" }; }
}
