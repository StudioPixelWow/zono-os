// ============================================================================
// 🔔 ZONO OS — Batch 6.6 · NOTIFICATION DELIVERY — channel providers (server-only).
//
// The WhatsApp provider delivers through the per-org WhatsApp Business sender
// (business/messages) — real, no mocks. Email / Push / SMS are declared with
// future-ready providers that report not-configured and skip honestly (never
// fabricate a send), so a real implementation drops in later with zero change to
// the dispatch layer or business logic.
// ============================================================================
import "server-only";
import { getConnectionServiceRole } from "@/lib/whatsapp/business/tokens";
import { sendText, sendTemplate } from "@/lib/whatsapp/business/messages";
import type { DeliveryProvider, DeliveryRequest, DeliveryResult, NotificationChannel } from "./types";

// ── WhatsApp (real) ───────────────────────────────────────────────────────────
const whatsappProvider: DeliveryProvider = {
  channel: "whatsapp",
  async isConfigured(orgId: string): Promise<boolean> {
    const conn = await getConnectionServiceRole(orgId);
    return !!conn && (conn.status === "connected" || conn.status === "syncing") && !!conn.phoneNumberId;
  },
  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    if (!(await this.isConfigured(req.orgId))) return { ok: false, status: "skipped", error: "whatsapp_not_connected" };
    // Business-initiated messages must use an approved template; fall back to a
    // session text only when the caller explicitly provides no template.
    const r = req.template
      ? await sendTemplate(req.orgId, req.to, req.template.name, req.template.language ?? "he",
          (req.template.variables ?? []).length
            ? [{ type: "body", parameters: (req.template.variables ?? []).map((t) => ({ type: "text", text: t })) }]
            : [])
      : await sendText(req.orgId, req.to, req.title ? `${req.title}\n${req.body}` : req.body);
    return r.ok ? { ok: true, status: "sent", providerMessageId: r.messageId } : { ok: false, status: "failed", error: r.error };
  },
};

// ── Future channels (declared, honestly not-configured) ──────────────────────
function futureProvider(channel: NotificationChannel): DeliveryProvider {
  return {
    channel,
    async isConfigured() { return false; },
    async deliver() { return { ok: false, status: "skipped", error: `${channel}_provider_not_configured` }; },
  };
}

const PROVIDERS: Record<NotificationChannel, DeliveryProvider> = {
  whatsapp: whatsappProvider,
  email: futureProvider("email"),
  push: futureProvider("push"),
  sms: futureProvider("sms"),
};

export function providerFor(channel: NotificationChannel): DeliveryProvider {
  return PROVIDERS[channel];
}
