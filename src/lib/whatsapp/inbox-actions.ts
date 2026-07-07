// ============================================================================
// 💬 ZONO WhatsApp Unified Inbox — server actions. 36.0.
// Thin delegators over the read service. All outbound drafting/approval reuses
// the EXISTING whatsapp actions (createDraftAction / approveDraftAction) — this
// file adds NO send path. Read-only + Ask.
// ============================================================================
"use server";
import { getUnifiedInbox, getConversationDetail, answerWhatsappQuestion, type ConversationDetail, type WaAnswer } from "./inbox-service";
import type { UnifiedInbox } from "./inbox";
import { getBuyerPropertyMatches } from "@/lib/matching-intelligence/service";

/** Compact suggested-property card for the conversation intelligence rail. */
export interface ConvMatch { propertyId: string; title: string; locality: string | null; price: number | null; compatibility: number | null; reason: string | null; href: string }

/** Suggested properties for the conversation's linked buyer — reuses the existing
 *  matching-intelligence engine (read-only; returns [] when there are no matches). */
export async function getConversationMatchesAction(buyerId: string): Promise<{ ok: boolean; result?: ConvMatch[]; error?: string }> {
  if (!buyerId) return { ok: false, error: "missing buyer" };
  try {
    const raw = await getBuyerPropertyMatches(buyerId);
    const result: ConvMatch[] = raw.slice(0, 4).map((m) => ({
      propertyId: m.propertyId, title: m.title, locality: m.locality ?? null, price: m.price ?? null,
      compatibility: m.compatibility ?? null, reason: m.reason ?? null, href: `/properties/${m.propertyId}`,
    }));
    return { ok: true, result };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function getUnifiedInboxAction(): Promise<{ ok: boolean; result?: UnifiedInbox; error?: string }> {
  try { return { ok: true, result: await getUnifiedInbox() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function getConversationDetailAction(conversationId: string): Promise<{ ok: boolean; result?: ConversationDetail; error?: string }> {
  if (!conversationId) return { ok: false, error: "missing id" };
  try { return { ok: true, result: await getConversationDetail(conversationId) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function askWhatsappAction(question: string): Promise<{ ok: boolean; result?: WaAnswer; error?: string }> {
  const q = (question ?? "").trim();
  if (!q) return { ok: false, error: "empty" };
  try { return { ok: true, result: await answerWhatsappQuestion(q) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}
