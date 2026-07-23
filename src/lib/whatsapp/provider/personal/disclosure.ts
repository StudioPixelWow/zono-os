// ============================================================================
// 📘 ZONO — Personal WhatsApp DISCLOSURE gate (server-only).
// ----------------------------------------------------------------------------
// A personal session may only be created AFTER the agent explicitly acknowledges
// the Beta/risk disclosure. We store org + user + timestamp + disclosure version
// + context (audit) and a flag on the agent's own whatsapp_web row. We NEVER
// store QR payloads or session credentials. Transport-generic — no Evolution.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import type { WaSessionCtx } from "../types";

/** Bump when the disclosure text changes — re-acknowledgement is then required. */
export const DISCLOSURE_VERSION = "2026-07-personal-beta-v1";

const PROVIDER = "whatsapp_web";

interface AckMeta { version: string; acknowledgedAt: string }

/** Has this agent acknowledged the CURRENT disclosure version? */
export async function hasAcknowledged(ctx: WaSessionCtx): Promise<boolean> {
  const db = await createClient();
  const { data } = await db.from("whatsapp_accounts" as never).select("metadata")
    .eq("organization_id", ctx.orgId).eq("provider", PROVIDER).eq("user_id", ctx.userId).maybeSingle();
  const ack = ((data as { metadata?: { personal_disclosure?: AckMeta } } | null)?.metadata?.personal_disclosure) ?? null;
  return ack?.version === DISCLOSURE_VERSION;
}

/** Record an explicit acknowledgement (audited + flagged on the agent's row). */
export async function acknowledgeDisclosure(ctx: WaSessionCtx, context: string): Promise<{ ok: boolean }> {
  const db = await createClient();
  const at = new Date().toISOString();
  const ack: AckMeta = { version: DISCLOSURE_VERSION, acknowledgedAt: at };

  const { data: row } = await db.from("whatsapp_accounts" as never).select("id,metadata")
    .eq("organization_id", ctx.orgId).eq("provider", PROVIDER).eq("user_id", ctx.userId).maybeSingle();
  const prev = (row as { id?: string; metadata?: Record<string, unknown> } | null);
  const metadata = { ...(prev?.metadata ?? {}), personal_disclosure: ack };

  if (prev?.id) {
    await db.from("whatsapp_accounts" as never).update({ metadata } as never).eq("id", prev.id);
  } else {
    await db.from("whatsapp_accounts" as never).insert({
      organization_id: ctx.orgId, user_id: ctx.userId, provider: PROVIDER, provider_kind: "bridge",
      connection_status: "sandbox", approval_required: true, metadata,
    } as never);
  }

  await logAudit({
    action: "whatsapp.personal.disclosure_ack", category: "approval", entityType: "whatsapp_account", entityId: ctx.userId,
    summary: "Personal WhatsApp Beta disclosure acknowledged",
    metadata: { version: DISCLOSURE_VERSION, context, acknowledgedAt: at }, // NEVER QR/creds
  });
  return { ok: true };
}
