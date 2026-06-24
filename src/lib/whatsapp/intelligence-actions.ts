"use server";
// ============================================================================
// ZONO — WhatsApp Intelligence server actions.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  analyzeConversation, analyzeAllConversations, syncConversationToCrm,
  generateConversationPortal, getMissedResponseAlerts, getIntelligenceOverview,
  type AnalyzeResult, type MissedAlert, type IntelligenceOverview,
} from "./intelligence";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." });

export async function analyzeConversationAction(id: string): Promise<Result<AnalyzeResult>> {
  try { const d = await analyzeConversation(id); revalidatePath("/whatsapp"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function analyzeAllConversationsAction(): Promise<Result<{ analyzed: number }>> {
  try { const d = await analyzeAllConversations(); revalidatePath("/whatsapp"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function syncConversationToCrmAction(id: string): Promise<Result<{ entityType: "buyer" | "seller"; entityId: string; created: boolean }>> {
  try { const d = await syncConversationToCrm(id); revalidatePath("/whatsapp"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function generateConversationPortalAction(id: string): Promise<Result<{ token: string; entityType: string }>> {
  try { const d = await generateConversationPortal(id); revalidatePath("/whatsapp"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function getMissedResponseAlertsAction(): Promise<Result<MissedAlert[]>> {
  try { return { ok: true, data: await getMissedResponseAlerts() }; } catch (e) { return fail(e); }
}
export async function getIntelligenceOverviewAction(): Promise<Result<IntelligenceOverview>> {
  try { return { ok: true, data: await getIntelligenceOverview() }; } catch (e) { return fail(e); }
}
