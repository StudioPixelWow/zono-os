"use server";
// ============================================================================
// 📘 ZONO — WhatsApp provider ACTIONS (server). Drive the per-user QR flow.
// Each action resolves the CURRENT broker's (org, user) scope — never a shared
// session — and delegates to the active provider (registry). Nothing here sends
// a message automatically; outgoing stays in the existing Draft + Approval flow.
// ============================================================================
import { getWhatsAppProvider } from "./registry";
import { resolveSessionCtx } from "./session";
import type { WaConnectionSnapshot } from "./types";

const OFFLINE: WaConnectionSnapshot = { providerKind: "none", state: "unavailable", qr: null, displayName: null, phone: null, lastConnectedAt: null, error: "אין הפעלה מחוברת" };

/** Start a connection: ask the provider to open a session and return the QR. */
export async function waConnectAction(): Promise<WaConnectionSnapshot> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return OFFLINE;
  return getWhatsAppProvider().connect(ctx);
}

/** Poll the live connection state (QR / scanning / connecting / connected). */
export async function waStatusAction(): Promise<WaConnectionSnapshot> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return OFFLINE;
  return getWhatsAppProvider().connectionState(ctx);
}

/** Force a fresh QR (used when the current one expires). */
export async function waRefreshQrAction(): Promise<WaConnectionSnapshot> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return OFFLINE;
  return getWhatsAppProvider().generateQR(ctx);
}

/** Disconnect the broker's own session (keeps the row; can reconnect). */
export async function waDisconnectAction(): Promise<{ ok: boolean }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false };
  return getWhatsAppProvider().disconnect(ctx);
}

/** Delete the broker's session entirely (removes stored session; new QR needed). */
export async function waDeleteSessionAction(): Promise<{ ok: boolean }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false };
  return getWhatsAppProvider().deleteSession(ctx);
}
