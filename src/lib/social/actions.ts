"use server";

import { revalidatePath } from "next/cache";
import { convertSocialLeadToLead, generateSocialFollowups, recomputeSocialLeads, reviewSocialLead, setFollowupStatus } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface SocialActionState { error?: string; ok?: boolean; message?: string }

function revalidate() {
  revalidatePath("/social-leads");
  revalidatePath("/");
  revalidatePath("/command");
}

export async function recomputeSocialLeadsAction(): Promise<SocialActionState> {
  try {
    const s = await recomputeSocialLeads();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[social] decision recalc failed:", e); }
    revalidate();
    return { ok: true, message: `${s.interactions} אינטראקציות נותחו · ${s.leads} לידים חברתיים חדשים` };
  } catch (e) { return { error: e instanceof Error ? e.message : "ניתוח הלידים החברתיים נכשל" }; }
}

export async function reviewSocialLeadAction(id: string, status: string, agentId?: string | null, reason?: string): Promise<SocialActionState> {
  try { await reviewSocialLead(id, status, { agentId, reason }); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}

export async function convertSocialLeadAction(id: string): Promise<SocialActionState> {
  try {
    const r = await convertSocialLeadToLead(id);
    revalidate();
    if (r.buyerId) { revalidatePath("/buyers"); revalidatePath(`/buyers/${r.buyerId}`); }
    if (r.sellerId) { revalidatePath("/sellers"); revalidatePath(`/sellers/${r.sellerId}`); }
    return { ok: true, message: r.sellerId ? "הומר לליד + מוכר במערכת" : "הומר לליד + קונה במערכת" };
  } catch (e) { return { error: e instanceof Error ? e.message : "ההמרה נכשלה" }; }
}

export async function generateSocialFollowupsAction(): Promise<SocialActionState> {
  try { const r = await generateSocialFollowups(); revalidate(); return { ok: true, message: `נוצרו ${r.created} מעקבים` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המעקבים נכשלה" }; }
}

export async function setFollowupStatusAction(id: string, status: string): Promise<SocialActionState> {
  try { await setFollowupStatus(id, status); revalidatePath("/social-leads"); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
