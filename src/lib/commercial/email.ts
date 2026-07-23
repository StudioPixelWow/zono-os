// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — transactional email (server).
//
// No transactional-email provider is configured in the platform yet. This is
// the single seam a future provider (Resend/SendGrid/SES) plugs into — until
// then it no-ops (best-effort), so provisioning never blocks on email. It
// returns whether the mail was actually sent.
// ============================================================================
import "server-only";

export interface EmailResult { sent: boolean; reason?: string }

export async function sendWelcomeEmail(to: string, ownerName: string): Promise<EmailResult> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) {
    // Provider not wired yet — record intent, do not throw.
    if (typeof console !== "undefined") console.info(`[commercial] welcome email queued (provider not configured): ${to} · ${ownerName}`);
    return { sent: false, reason: "provider_not_configured" };
  }
  // Future: POST to the provider here. Intentionally left unimplemented until
  // credentials exist — never fabricate a "sent" result.
  return { sent: false, reason: "provider_not_configured" };
}
