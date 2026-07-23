// ============================================================================
// 📘 ZONO — Personal WhatsApp (Beta) GLOBAL KILL SWITCH (C10). Server-only.
// ----------------------------------------------------------------------------
// Transport-GENERIC on purpose — it names no provider (Evolution/Baileys/…), so
// every entry point (server actions + the personal inbound webhook route) can
// enforce it WITHOUT importing the adapter and WITHOUT learning any transport
// detail. Default is OFF in production: the Personal QR transport is disabled
// unless PERSONAL_WHATSAPP_ENABLED is explicitly truthy.
//
// When OFF, callers must refuse: new pairing, new sessions, QR refresh,
// reconnect, outbound sends, automated delivery. It must NEVER gate: the Cloud
// API (Batch 6.6), Communication OS, CRM, AI, Gmail, other integrations, or any
// historical data. Graceful disconnect/revoke stay allowed even when OFF.
// ============================================================================
import "server-only";

/** True only when the Personal WhatsApp (Beta) transport is explicitly enabled.
 *  Off by default so a fresh/prod environment never runs the Beta transport by
 *  accident. Flipping the env var toggles the transport with NO code deploy. */
export function isPersonalWhatsappEnabled(): boolean {
  const v = process.env.PERSONAL_WHATSAPP_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/** The user-facing (Hebrew) notice shown wherever the transport is disabled. */
export const PERSONAL_DISABLED_NOTICE = "WhatsApp האישי אינו זמין כרגע.";

/** Stable machine reason returned by blocked entry points. */
export const PERSONAL_DISABLED_REASON = "personal_transport_disabled";
