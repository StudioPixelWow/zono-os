// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — Message Center overview (server, Part 7).
// Composes the browser-safe connection projection + webhook/message health +
// available phone numbers (for the select-number step) + templates. All reads
// are org-scoped; tokens never leave the server.
// ============================================================================
import "server-only";
import { getWaOAuthConfig, listPhoneNumbers } from "./oauth";
import { getConnection, currentOrgId, decryptToken, readAccountHealth, toPublic } from "./tokens";
import { listTemplates } from "./templates";
import type { WaConnectionPublic, WaPhoneNumber, WaTemplate } from "./types";

export interface WhatsappOverview {
  connection: WaConnectionPublic;
  config: { configured: boolean; enabled: boolean; ready: boolean; missing: string[] };
  phoneNumbers: WaPhoneNumber[];    // numbers under the WABA (for the select step)
  templates: WaTemplate[];
}

export async function getWhatsappOverview(): Promise<WhatsappOverview> {
  const cfg = getWaOAuthConfig();
  const orgId = await currentOrgId();
  const conn = await getConnection();
  const health = orgId ? await readAccountHealth(orgId).catch(() => ({ lastWebhookAt: null, lastMessageAt: null })) : { lastWebhookAt: null, lastMessageAt: null };

  let phoneNumbers: WaPhoneNumber[] = [];
  let templates: WaTemplate[] = [];
  if (orgId && conn?.wabaId) {
    const token = decryptToken(conn);
    if (token) {
      phoneNumbers = (await listPhoneNumbers(cfg, token, conn.wabaId).catch(() => ({ numbers: [] }))).numbers;
      templates = await listTemplates(orgId).catch(() => []);
    }
  }

  return {
    connection: toPublic(conn, health),
    config: { configured: cfg.configured, enabled: cfg.enabled, ready: cfg.ready, missing: cfg.missing },
    phoneNumbers,
    templates,
  };
}
