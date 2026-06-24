// ============================================================================
// ZONO — WhatsApp Intelligence (server-only). Turns each conversation into
// structured business intelligence over REAL ingested messages:
//   analyze (role/intent/summary/NBA) · sync to CRM (buyer/seller + activity) ·
//   generate a personal portal · missed-response alerts.
// Meta-compliant: operates only on messages already ingested via the official
// WhatsApp Cloud API webhook. No fake messages, no unofficial providers.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { summarizeConversation, type WaMessage, type ConversationAnalysis } from "./engine";
import { logActivityEvent } from "@/lib/activity/service";
import { createClientPortal } from "@/lib/client-portals/service";

async function ctx() {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) throw new Error("אין הרשאה.");
  const db = await createClient();
  return { db, orgId: profile.org_id };
}

const CONV = "whatsapp_conversations";
const MSG = "whatsapp_messages";

interface ConvRow {
  id: string; contact_name: string | null; buyer_id: string | null; seller_id: string | null;
  property_id: string | null; detected_role: string | null; portal_token: string | null;
}

async function loadConversation(db: Awaited<ReturnType<typeof createClient>>, orgId: string, id: string): Promise<{ conv: ConvRow; messages: WaMessage[] } | null> {
  const { data: conv } = await db.from(CONV as never)
    .select("id,contact_name,buyer_id,seller_id,property_id,detected_role,portal_token")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!conv) return null;
  const { data: msgs } = await db.from(MSG as never)
    .select("direction,body,created_at").eq("conversation_id", id).eq("organization_id", orgId)
    .order("created_at", { ascending: true }).limit(300);
  const messages = ((msgs ?? []) as { direction: string; body: string | null; created_at: string }[])
    .map((m) => ({ direction: m.direction === "outbound" ? "outbound" as const : "inbound" as const, body: m.body, createdAt: m.created_at }));
  return { conv: conv as unknown as ConvRow, messages };
}

export interface AnalyzeResult extends ConversationAnalysis { conversationId: string }

/** Analyze one conversation and persist derived intelligence. */
export async function analyzeConversation(conversationId: string): Promise<AnalyzeResult> {
  const { db, orgId } = await ctx();
  const loaded = await loadConversation(db, orgId, conversationId);
  if (!loaded) throw new Error("השיחה לא נמצאה.");
  const analysis = summarizeConversation(loaded.messages, loaded.conv.contact_name);
  const lastInbound = [...loaded.messages].reverse().find((m) => m.direction === "inbound")?.createdAt ?? null;
  await db.from(CONV as never).update({
    detected_role: analysis.role, intent: analysis.topIntent, intent_score: analysis.intentScore,
    summary: analysis.summary, next_best_action: analysis.nextBestAction,
    needs_response: analysis.needsResponse, last_inbound_at: lastInbound,
    property_intent: analysis.propertyIntent, analyzed_at: new Date().toISOString(),
  } as never).eq("id", conversationId).eq("organization_id", orgId);
  return { ...analysis, conversationId };
}

/** Analyze every open conversation (bounded). */
export async function analyzeAllConversations(): Promise<{ analyzed: number }> {
  const { db, orgId } = await ctx();
  const { data } = await db.from(CONV as never).select("id").eq("organization_id", orgId).order("last_message_at", { ascending: false }).limit(100);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  let analyzed = 0;
  for (const id of ids) { try { await analyzeConversation(id); analyzed++; } catch { /* skip */ } }
  return { analyzed };
}

/** Create/link a buyer or seller from the conversation + log activity. */
export async function syncConversationToCrm(conversationId: string): Promise<{ entityType: "buyer" | "seller"; entityId: string; created: boolean }> {
  const { db, orgId } = await ctx();
  const loaded = await loadConversation(db, orgId, conversationId);
  if (!loaded) throw new Error("השיחה לא נמצאה.");
  const role = loaded.conv.detected_role ?? (await analyzeConversation(conversationId)).role;
  const isSeller = role === "seller";
  const entityType: "buyer" | "seller" = isSeller ? "seller" : "buyer";
  const table = isSeller ? "sellers" : "buyers";
  const existingId = isSeller ? loaded.conv.seller_id : loaded.conv.buyer_id;

  if (existingId) return { entityType, entityId: existingId, created: false };

  const name = loaded.conv.contact_name || "ליד מ-WhatsApp";
  const { data, error } = await db.from(table as never).insert({
    org_id: orgId, full_name: name, ...(isSeller ? {} : { temperature: "warm" }),
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  const entityId = (data as unknown as { id: string }).id;

  await db.from(CONV as never).update({
    [isSeller ? "seller_id" : "buyer_id"]: entityId, crm_synced_at: new Date().toISOString(),
  } as never).eq("id", conversationId).eq("organization_id", orgId);

  try {
    await logActivityEvent({
      eventType: "whatsapp.synced_to_crm", entityType, entityId,
      title: `נוצר כרטיס ${isSeller ? "מוכר" : "קונה"} משיחת WhatsApp`,
    } as never);
  } catch { /* best-effort */ }

  return { entityType, entityId, created: true };
}

/** Generate a personal buyer/seller portal for the conversation's linked entity. */
export async function generateConversationPortal(conversationId: string): Promise<{ token: string; entityType: string }> {
  const synced = await syncConversationToCrm(conversationId);
  const { db, orgId } = await ctx();
  const portal = await createClientPortal({ entityType: synced.entityType, entityId: synced.entityId, portalType: synced.entityType, visibility: "curated" });
  await db.from(CONV as never).update({ portal_token: portal.token } as never).eq("id", conversationId).eq("organization_id", orgId);
  return { token: portal.token, entityType: synced.entityType };
}

export interface MissedAlert {
  id: string; contactName: string | null; summary: string | null; nextBestAction: string | null;
  detectedRole: string | null; lastInboundAt: string | null; hoursWaiting: number;
}

/** Conversations awaiting a reply (last message inbound) — missed-response alerts. */
export async function getMissedResponseAlerts(minHours = 1): Promise<MissedAlert[]> {
  const { db, orgId } = await ctx();
  const { data } = await db.from(CONV as never)
    .select("id,contact_name,summary,next_best_action,detected_role,last_inbound_at,last_message_at")
    .eq("organization_id", orgId).eq("needs_response", true)
    .order("last_inbound_at", { ascending: true }).limit(50);
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const ts = (r.last_inbound_at as string) ?? (r.last_message_at as string) ?? null;
    const hoursWaiting = ts ? Math.floor((now - new Date(ts).getTime()) / 3_600_000) : 0;
    return {
      id: r.id as string, contactName: (r.contact_name as string) ?? null, summary: (r.summary as string) ?? null,
      nextBestAction: (r.next_best_action as string) ?? null, detectedRole: (r.detected_role as string) ?? null,
      lastInboundAt: ts, hoursWaiting,
    };
  }).filter((a) => a.hoursWaiting >= minHours);
}

export interface IntelligenceOverview {
  total: number; analyzed: number; needsResponse: number; buyers: number; sellers: number; synced: number;
}
export async function getIntelligenceOverview(): Promise<IntelligenceOverview> {
  const { db, orgId } = await ctx();
  const head = (b: (q: ReturnType<typeof baseSelect>) => ReturnType<typeof baseSelect>) => b(baseSelect());
  function baseSelect() { return db.from(CONV as never).select("id", { count: "exact", head: true }).eq("organization_id", orgId); }
  const [total, analyzed, needsResponse, buyers, sellers, synced] = await Promise.all([
    head((q) => q),
    head((q) => q.not("analyzed_at", "is", null)),
    head((q) => q.eq("needs_response", true)),
    head((q) => q.eq("detected_role", "buyer")),
    head((q) => q.eq("detected_role", "seller")),
    head((q) => q.not("crm_synced_at", "is", null)),
  ]);
  return {
    total: total.count ?? 0, analyzed: analyzed.count ?? 0, needsResponse: needsResponse.count ?? 0,
    buyers: buyers.count ?? 0, sellers: sellers.count ?? 0, synced: synced.count ?? 0,
  };
}
