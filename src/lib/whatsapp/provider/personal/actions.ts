// ============================================================================
// 📘 ZONO — Personal WhatsApp (Beta) SERVER ACTIONS.
// ----------------------------------------------------------------------------
// The per-agent entry points the Beta UI calls. Each re-resolves the caller's
// (org,user) scope server-side (no client-supplied scope), enforces the C10 kill
// switch on mutating actions, requires the disclosure before pairing, and
// delegates to the provider/outbound. No Evolution detail appears here — only the
// canonical provider + transport-generic helpers.
// ============================================================================
"use server";
import crypto from "node:crypto";
import { resolveSessionCtx } from "../session";
import { personalTransportProvider } from "./adapter";
import { sendPersonalText } from "./outbound";
import { acknowledgeDisclosure, hasAcknowledged } from "./disclosure";
import { setTransportPreference, type TransportPreference } from "./transport";
import { isPersonalWhatsappEnabled, PERSONAL_DISABLED_NOTICE } from "../personal-flag";
import { recordReconnect, recordAck, recordSwitch } from "./observability";
import type { WaConnectionSnapshot } from "../types";

type Snap = WaConnectionSnapshot | { error: string };

/** Start (or re-pair) a personal session — requires enabled + acknowledged. */
export async function personalConnectAction(): Promise<Snap> {
  if (!isPersonalWhatsappEnabled()) return { error: PERSONAL_DISABLED_NOTICE };
  const ctx = await resolveSessionCtx();
  if (!ctx) return { error: "אין הרשאה." };
  if (!(await hasAcknowledged(ctx))) return { error: "נדרש אישור הצהרת הסיכון." };
  return personalTransportProvider.connect(ctx);
}

/** Refresh the QR (requires enabled + acknowledged). */
export async function personalRefreshQrAction(): Promise<Snap> {
  if (!isPersonalWhatsappEnabled()) return { error: PERSONAL_DISABLED_NOTICE };
  const ctx = await resolveSessionCtx();
  if (!ctx) return { error: "אין הרשאה." };
  if (!(await hasAcknowledged(ctx))) return { error: "נדרש אישור הצהרת הסיכון." };
  return personalTransportProvider.generateQR(ctx);
}

/** Reconnect = re-pair for a dropped session (requires enabled). */
export async function personalReconnectAction(): Promise<Snap> {
  if (!isPersonalWhatsappEnabled()) return { error: PERSONAL_DISABLED_NOTICE };
  const ctx = await resolveSessionCtx();
  if (!ctx) return { error: "אין הרשאה." };
  recordReconnect("requested", { org: ctx.orgId, agent: ctx.userId });
  return personalTransportProvider.generateQR(ctx);
}

/** Live connection state (read-only — allowed even when disabled). */
export async function personalStatusAction(): Promise<Snap> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { error: "אין הרשאה." };
  return personalTransportProvider.connectionState(ctx);
}

/** Graceful disconnect (allowed even when disabled — C10). */
export async function personalDisconnectAction(): Promise<{ ok: boolean }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false };
  return personalTransportProvider.disconnect(ctx);
}

/** Delete/revoke the session (allowed even when disabled — C10). */
export async function personalDeleteAction(): Promise<{ ok: boolean }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false };
  return personalTransportProvider.deleteSession(ctx);
}

/** Acknowledge the Beta/risk disclosure (gates pairing). */
export async function personalAcknowledgeAction(context: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const r = await acknowledgeDisclosure(ctx, context || "settings/whatsapp/personal");
  if (r.ok) recordAck({ org: ctx.orgId, agent: ctx.userId });
  return r;
}

/** Choose this agent's active transport (Business default vs Personal Beta). */
export async function personalSetTransportAction(pref: TransportPreference): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const r = await setTransportPreference(ctx, pref);
  if (r.ok) recordSwitch(pref, { org: ctx.orgId, agent: ctx.userId });
  return r;
}

/** Send an approved personal message (human-in-the-loop; rate-limited; idempotent). */
export async function personalSendAction(toPhone: string, text: string, approved: boolean, idempotencyKey?: string): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const ctx = await resolveSessionCtx();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const key = idempotencyKey?.trim() || crypto.createHash("sha256").update(`${ctx.userId}:${toPhone}:${text}`).digest("hex").slice(0, 32);
  const r = await sendPersonalText(ctx, { toPhone, text, approved, idempotencyKey: key });
  if (!r.ok) return { ok: false, error: r.reason };
  return { ok: true, duplicate: r.duplicate };
}
