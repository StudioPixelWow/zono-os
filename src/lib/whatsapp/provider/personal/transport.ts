// ============================================================================
// 📘 ZONO — Per-agent TRANSPORT preference (server-only).
// ----------------------------------------------------------------------------
// Each agent chooses which WhatsApp transport their sends use: the official
// Business API (default, recommended) or the Personal QR Beta. This is a routing
// preference ONLY — it is NEVER part of conversation identity. Switching does not
// touch canonical conversations, CRM links, AI history or message history (C8):
// both transports feed the same shared model keyed on the contact. Audited.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import type { WaSessionCtx } from "../types";

export type TransportPreference = "business" | "personal";

const PROVIDER = "whatsapp_web";

/** Read the agent's transport preference (default: business). */
export async function getTransportPreference(ctx: WaSessionCtx): Promise<TransportPreference> {
  const db = await createClient();
  const { data } = await db.from("whatsapp_accounts" as never).select("metadata")
    .eq("organization_id", ctx.orgId).eq("provider", PROVIDER).eq("user_id", ctx.userId).maybeSingle();
  const pref = (data as { metadata?: { transport_preference?: TransportPreference } } | null)?.metadata?.transport_preference;
  return pref === "personal" ? "personal" : "business";
}

/** Set the agent's transport preference. Does not alter any conversation/history. */
export async function setTransportPreference(ctx: WaSessionCtx, pref: TransportPreference): Promise<{ ok: boolean; error?: string }> {
  if (pref !== "business" && pref !== "personal") return { ok: false, error: "invalid_transport" };
  const db = await createClient();
  const { data: row } = await db.from("whatsapp_accounts" as never).select("id,metadata")
    .eq("organization_id", ctx.orgId).eq("provider", PROVIDER).eq("user_id", ctx.userId).maybeSingle();
  const prev = row as { id?: string; metadata?: Record<string, unknown> } | null;
  const metadata = { ...(prev?.metadata ?? {}), transport_preference: pref };
  if (prev?.id) {
    await db.from("whatsapp_accounts" as never).update({ metadata } as never).eq("id", prev.id);
  } else {
    await db.from("whatsapp_accounts" as never).insert({
      organization_id: ctx.orgId, user_id: ctx.userId, provider: PROVIDER, provider_kind: "bridge",
      connection_status: "sandbox", approval_required: true, metadata,
    } as never);
  }
  await logAudit({
    action: "whatsapp.personal.transport_selected", category: "configuration", entityType: "whatsapp_account", entityId: ctx.userId,
    summary: `WhatsApp transport preference set: ${pref}`, metadata: { transport: pref },
  });
  return { ok: true };
}
