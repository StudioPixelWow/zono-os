// ============================================================================
// 📘 ZONO — Personal transport WEBHOOK PATH + self URL (server-only).
// ----------------------------------------------------------------------------
// The path Evolution POSTs inbound events to. This is ZONO's OWN route (not an
// Evolution concept) — kept next to the adapter because the adapter tells
// Evolution where to call back when it creates a session.
// ============================================================================
import "server-only";

/** ZONO's personal-transport inbound webhook route. */
export const PERSONAL_INBOUND_WEBHOOK_PATH = "/api/whatsapp/personal/webhook";

/** Absolute URL Evolution should call back on. Derived from ZONO's public URL. */
export function personalWebhookUrl(): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || "").trim();
  if (!base) return null;
  const withScheme = base.startsWith("http") ? base : `https://${base}`;
  return `${withScheme.replace(/\/+$/, "")}${PERSONAL_INBOUND_WEBHOOK_PATH}`;
}

/** The dedicated inbound webhook bearer (separate from the outbound path). The
 *  worker is configured to send this on every callback so ZONO can fail closed. */
export function personalWebhookToken(): string | null {
  return process.env.PERSONAL_WEBHOOK_TOKEN?.trim() || process.env.WHATSAPP_BRIDGE_TOKEN?.trim() || null;
}
