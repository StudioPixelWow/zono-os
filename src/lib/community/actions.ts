"use server";
import { revalidatePath } from "next/cache";
import { recordComment, recordMessengerThread, markCommentConverted, connectSocialAccount } from "./service";
import { INTENT_LABELS } from "./engine";

export interface CommunityActionState { ok?: boolean; error?: string; message?: string }
function revalidate() { try { revalidatePath("/communities"); revalidatePath("/"); } catch { /* noop */ } }

export async function recordCommentAction(input: { text: string; author?: string; communityId?: string; propertyId?: string }): Promise<CommunityActionState> {
  try { const r = await recordComment(input); revalidate(); return { ok: true, message: `התגובה נרשמה — כוונה זוהתה: ${INTENT_LABELS[r.intent] ?? r.intent}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום התגובה נכשל" }; }
}
export async function recordMessengerThreadAction(input: { lastMessage: string; contact?: string; communityId?: string }): Promise<CommunityActionState> {
  try { const r = await recordMessengerThread(input); revalidate(); return { ok: true, message: `השיחה נרשמה — כוונה: ${INTENT_LABELS[r.intent] ?? r.intent}` }; }
  catch (e) { return { error: e instanceof Error ? e.message : "רישום השיחה נכשל" }; }
}
export async function markCommentConvertedAction(commentId: string): Promise<CommunityActionState> {
  try { await markCommentConverted(commentId); revalidate(); return { ok: true, message: "התגובה סומנה כליד" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון התגובה נכשל" }; }
}
export async function connectSocialAccountAction(provider: string): Promise<CommunityActionState> {
  try { await connectSocialAccount(provider); revalidate(); return { ok: true, message: "חיבור ידני נרשם — אין שמירת אסימון. מוכן לאינטגרציית Meta API עתידית." }; }
  catch (e) { return { error: e instanceof Error ? e.message : "החיבור נכשל" }; }
}
