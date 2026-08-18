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

// ── Email (real — Resend REST, gated on RESEND_API_KEY) ───────────────────────
// No SDK dependency (plain fetch). Disabled honestly when the key is missing —
// never fabricates a send. Classifies transient (429/5xx/network → retryable) vs
// permanent (4xx → terminal) so the dispatcher can back off correctly.
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const emailProvider: DeliveryProvider = {
  channel: "email",
  async isConfigured(): Promise<boolean> {
    return !!process.env.RESEND_API_KEY;
  },
  async deliver(req: DeliveryRequest): Promise<DeliveryResult> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, status: "skipped", error: "email_not_configured" };
    if (!req.to || !req.to.includes("@")) return { ok: false, status: "skipped", error: "invalid_email" };
    const from = process.env.RESEND_FROM || "ZONO <notifications@zono.co.il>";
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [req.to], subject: req.title || "ZONO", text: req.body }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, status: "sent", providerMessageId: data?.id ?? null };
      }
      const body = await res.text().catch(() => "");
      const transient = res.status === 429 || res.status >= 500;
      return { ok: false, status: "failed", error: `resend_${res.status}_${transient ? "transient" : "permanent"}:${body.slice(0, 120)}` };
    } catch (e) {
      return { ok: false, status: "failed", error: `resend_network_transient:${e instanceof Error ? e.message : "error"}` };
    }
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
  email: emailProvider,
  push: futureProvider("push"),
  sms: futureProvider("sms"),
};

export function providerFor(channel: NotificationChannel): DeliveryProvider {
  return PROVIDERS[channel];
}
