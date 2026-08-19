/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";
// ============================================================================
// ZONO — Inbound WhatsApp: agent triage actions. Manual same-org linkage of an
// unmatched/ambiguous conversation to a CRM contact. Cross-org is REJECTED: the
// server re-derives BOTH the conversation's org and the target's org and requires
// them to equal the caller's session org — the UI-provided org is never trusted.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { linkConversationToContact } from "./inbound-linkage";

export async function linkWhatsAppConversationAction(
  input: { conversationId: string; targetType: "buyer" | "lead" | "seller"; targetId: string },
): Promise<{ ok: boolean; error?: string }> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!input.conversationId || !input.targetId) return { ok: false, error: "חסרים נתונים לשיוך." };
  if (!["buyer", "lead", "seller"].includes(input.targetType)) return { ok: false, error: "סוג איש קשר לא תקין." };

  const db: any = createServiceRoleClient();
  // Cross-org guard #1: the conversation must belong to the caller's org.
  const { data: conv } = await db.from("whatsapp_conversations").select("id,organization_id").eq("id", input.conversationId).maybeSingle();
  if (!conv || conv.organization_id !== orgId) return { ok: false, error: "השיחה לא נמצאה." };
  // Cross-org guard #2: the target contact must belong to the SAME org.
  const table = input.targetType === "buyer" ? "buyers" : input.targetType === "lead" ? "leads" : "sellers";
  const { data: target } = await db.from(table).select("id,org_id,owner_id").eq("id", input.targetId).maybeSingle();
  if (!target || target.org_id !== orgId) return { ok: false, error: "איש הקשר אינו שייך למשרד." };

  await linkConversationToContact(db, orgId, input.conversationId, input.targetType, input.targetId, (target.owner_id as string | null) ?? null);
  return { ok: true };
}
