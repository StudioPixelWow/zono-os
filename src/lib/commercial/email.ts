// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — transactional email (server).
//
// The welcome email now routes through the CANONICAL delivery layer
// (communication/dispatch → notify/providers Resend transport). No second email
// provider, no legacy EMAIL_API_KEY/EMAIL_FROM. Idempotent per (org, dedup_key)
// on notification_deliveries (one welcome per org), preserves the provider
// message id, and never fabricates a "sent" result — when Resend is not
// configured it reports not-sent honestly and provisioning never blocks on it.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchExternal } from "@/lib/communication/dispatch";

export interface EmailResult { sent: boolean; reason?: string }

export async function sendWelcomeEmail(orgId: string, to: string, ownerName: string): Promise<EmailResult> {
  const email = (to ?? "").trim();
  if (!orgId || !email.includes("@")) return { sent: false, reason: "no_email" };
  const name = (ownerName ?? "").trim();

  const res = await dispatchExternal(createServiceRoleClient(), "email", {
    orgId, userId: null, channel: "email",
    to: email,
    title: "ברוכים הבאים ל-ZONO",
    body: `${name ? `שלום ${name},` : "שלום,"}\nהחשבון שלך ב-ZONO הופעל בהצלחה. אפשר להתחבר ולהתחיל לעבוד.\n\nצוות ZONO`,
    html: null,
    dedupKey: `welcome:${orgId}`,   // business/dedup key — one welcome per org
  }, { scheduledAt: null });

  if (res.skipped) return { sent: false, reason: "already_sent" };
  return { sent: res.sent, reason: res.sent ? "sent" : "delivery_failed" };
}
