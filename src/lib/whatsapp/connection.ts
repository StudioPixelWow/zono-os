// ============================================================================
// 📘 ZONO — WhatsApp connection state (server-only).
// Fuses the REAL Cloud-API env config (cloudConfig) with the whatsapp_accounts
// health columns + last webhook + template sync into ONE honest state machine
// that drives the /whatsapp connection gate. No new schema, no new engine — it
// only READS existing sources. It never exposes tokens and never sends.
//
//   not_configured           — required server env missing
//   configured_not_connected — env present, account not activated yet
//   webhook_pending          — account activated, no verified webhook yet
//   connected_empty          — connected + webhook verified, zero conversations
//   connected_active         — connected with conversations → full dashboard
// Manual/assisted mode is always available as a fallback (?mode=manual).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { cloudConfig } from "@/lib/whatsapp/cloud/service";

export type WhatsappConnState =
  | "not_configured"
  | "configured_not_connected"
  | "webhook_pending"
  | "connected_empty"
  | "connected_active";

export interface WhatsappConnection {
  state: WhatsappConnState;
  mode: "live" | "mock";
  configured: boolean;
  /** Which of the 4 required server env vars are missing. */
  missingEnv: string[];
  // Account facts (honest; null when unknown).
  wabaStatus: string | null;          // whatsapp_accounts.connection_status
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  webhookVerified: boolean;
  lastWebhookAt: string | null;
  templatesStatus: "synced" | "none";
  templatesCount: number;
  appSecretConfigured: boolean;       // media/signature verification enabled
  health: "healthy" | "degraded" | "pending" | "down";
  conversationCount: number;
  needsReplyCount: number;
}

const REQUIRED_ENV = ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"] as const;

interface AccountRow {
  connection_status?: string | null;
  phone_number_id?: string | null;
  display_phone_number?: string | null;
  webhook_status?: string | null;
  last_webhook_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Read the fused WhatsApp connection state. Never throws — returns an honest
 *  not_configured/degraded snapshot on any failure. */
export async function getWhatsappConnection(): Promise<WhatsappConnection> {
  const cfg = cloudConfig();
  const missingEnv = REQUIRED_ENV.filter((k) => {
    if (k === "WHATSAPP_PHONE_NUMBER_ID") return !cfg.phoneNumberId;
    if (k === "WHATSAPP_ACCESS_TOKEN") return !cfg.accessToken;
    if (k === "WHATSAPP_APP_SECRET") return !cfg.appSecret;
    return !cfg.verifyToken; // WHATSAPP_VERIFY_TOKEN
  });
  const configured = missingEnv.length === 0;
  const appSecretConfigured = !!cfg.appSecret;

  let account: AccountRow | null = null;
  let conversationCount = 0;
  let needsReplyCount = 0;
  try {
    const { profile } = await getSessionContext();
    const orgId = profile?.org_id ?? null;
    if (orgId) {
      const db = await createClient();
      const acc = await db.from("whatsapp_accounts")
        .select("connection_status,phone_number_id,display_phone_number,webhook_status,last_webhook_at,metadata")
        .eq("organization_id", orgId).maybeSingle();
      account = (acc.data as AccountRow | null) ?? null;
      const conv = await db.from("whatsapp_conversations").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      conversationCount = conv.count ?? 0;
      // Conversations still needing a reply (best-effort; `unread` is the stable
      // signal). Kept informational — the gate decides purely on conversationCount.
      const nr = await db.from("whatsapp_conversations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("unread", true);
      needsReplyCount = nr.count ?? 0;
    }
  } catch { /* honest: keep defaults */ }

  const wabaStatus = account?.connection_status ?? null;
  const phoneNumberId = account?.phone_number_id ?? cfg.phoneNumberId ?? null;
  const displayPhoneNumber = account?.display_phone_number ?? null;
  const lastWebhookAt = account?.last_webhook_at ?? null;
  const webhookVerified = account?.webhook_status === "active" || !!lastWebhookAt;
  const templates = account?.metadata?.templates;
  const templatesCount = Array.isArray(templates) ? templates.length : 0;
  const templatesStatus: "synced" | "none" = templatesCount > 0 ? "synced" : "none";

  // ── State machine ─────────────────────────────────────────────────────────
  let state: WhatsappConnState;
  if (!configured) {
    state = "not_configured";
  } else if (!account || !wabaStatus || wabaStatus === "not_configured" || wabaStatus === "expired") {
    state = "configured_not_connected";
  } else if (!webhookVerified) {
    state = "webhook_pending";
  } else if (conversationCount === 0) {
    state = "connected_empty";
  } else {
    state = "connected_active";
  }

  const health: WhatsappConnection["health"] =
    !configured ? "down"
    : state === "configured_not_connected" || state === "webhook_pending" ? "pending"
    : appSecretConfigured ? "healthy" : "degraded";

  return {
    state, mode: cfg.mode, configured, missingEnv,
    wabaStatus, phoneNumberId, displayPhoneNumber,
    webhookVerified, lastWebhookAt, templatesStatus, templatesCount,
    appSecretConfigured, health, conversationCount, needsReplyCount,
  };
}
