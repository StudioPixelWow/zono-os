// ============================================================================
// 📘 ZONO — PERSONAL transport ADAPTER (server-only). Implements WhatsAppProvider.
// ----------------------------------------------------------------------------
// The thin bridge between ZONO's stable WhatsAppProvider contract and the
// Evolution-backed personal transport. It:
//   · enforces the C10 kill switch at every mutating entry point,
//   · talks to Evolution ONLY through the C9 compat layer (canonical types in/out),
//   · persists client-safe snapshots via the existing per-user session store,
//   · never handles credentials/QR beyond passing the compat's client-safe QR up.
// No Evolution endpoint/payload/status string appears here — only compat calls.
// Registry resolves this as the "bridge" kind; swapping the backend is a change
// to compat/ + this file only (C3).
// ============================================================================
import "server-only";
import { writeSession, readSessionSnapshot, clearSession } from "../session";
import type {
  WaConnectionSnapshot, WaMediaRef, WaSendInput, WaSendResult, WaSessionCtx, WhatsAppProvider,
} from "../types";
import { INBOUND_WEBHOOK_PATH } from "../types";
import { isPersonalWhatsappEnabled, PERSONAL_DISABLED_NOTICE } from "../personal-flag";
import { personalWebhookUrl, personalWebhookToken } from "./webhook-url";
import * as compat from "./compat";
import { errorLabel, type CanonicalConnection } from "./compat";

const KIND = "bridge" as const;

function unavailable(error: string | null = null): WaConnectionSnapshot {
  return { providerKind: KIND, state: "unavailable", qr: null, displayName: null, phone: null, lastConnectedAt: null, error };
}

function disabledSnapshot(): WaConnectionSnapshot {
  return { providerKind: KIND, state: "unavailable", qr: null, displayName: null, phone: null, lastConnectedAt: null, error: PERSONAL_DISABLED_NOTICE };
}

/** Persist a canonical connection reading, then return the stored client-safe snapshot. */
async function persist(ctx: WaSessionCtx, c: CanonicalConnection): Promise<WaConnectionSnapshot> {
  await writeSession(ctx, KIND, { state: c.state, qr: c.qr, displayName: c.displayName, phone: c.phone, error: null });
  return readSessionSnapshot(ctx, KIND);
}

export const personalTransportProvider: WhatsAppProvider = {
  kind: KIND,

  // ── Pairing / lifecycle (all kill-switch gated) ──────────────────────────
  async connect(ctx) {
    if (!isPersonalWhatsappEnabled()) return disabledSnapshot();
    if (!compat.personalConfigured()) { await writeSession(ctx, KIND, { state: "unavailable", error: null }); return unavailable(); }
    const webhookUrl = personalWebhookUrl();
    if (!webhookUrl) return unavailable("missing_app_url");
    const r = await compat.createSession(ctx, webhookUrl, personalWebhookToken());
    if (!r.ok) { await writeSession(ctx, KIND, { state: "error", error: errorLabel(r.error.category) }); return readSessionSnapshot(ctx, KIND); }
    return persist(ctx, r.data);
  },

  async generateQR(ctx) {
    if (!isPersonalWhatsappEnabled()) return disabledSnapshot();
    if (!compat.personalConfigured()) { await writeSession(ctx, KIND, { state: "unavailable" }); return unavailable(); }
    const r = await compat.connectSession(ctx);
    if (!r.ok) { await writeSession(ctx, KIND, { state: "error", error: errorLabel(r.error.category) }); return readSessionSnapshot(ctx, KIND); }
    return persist(ctx, r.data);
  },

  async connectionState(ctx) {
    // Read-only: allowed even when disabled so the UI can show real state.
    if (!compat.personalConfigured()) return readSessionSnapshot(ctx, KIND);
    const r = await compat.getState(ctx);
    if (r.ok) await writeSession(ctx, KIND, { state: r.data.state, displayName: r.data.displayName, phone: r.data.phone, error: null });
    return readSessionSnapshot(ctx, KIND);
  },

  async disconnect(ctx) {
    // Graceful disconnect stays available even when the transport is disabled (C10).
    if (compat.personalConfigured()) await compat.disconnectSession(ctx);
    await clearSession(ctx, false);
    return { ok: true };
  },

  async deleteSession(ctx) {
    // Administrative revoke stays available even when disabled (C10).
    if (compat.personalConfigured()) await compat.deleteSession(ctx);
    await clearSession(ctx, true);
    return { ok: true };
  },

  async listenMessages() {
    // Realized by Evolution PUSHING to ZONO's personal webhook. The canonical
    // ingest path is shared; the interface reports the shared webhook contract.
    return { webhookPath: INBOUND_WEBHOOK_PATH, subscribed: compat.personalConfigured() };
  },

  // ── Transport send (raw). Approval + rate limits live in outbound.ts; this
  //    stays kill-switch gated as defense in depth. ─────────────────────────
  async sendMessage(ctx, input: WaSendInput): Promise<WaSendResult> {
    if (!isPersonalWhatsappEnabled()) return { ok: false, error: PERSONAL_DISABLED_NOTICE };
    if (!compat.personalConfigured()) return { ok: false, error: "unavailable" };
    return compat.sendText(ctx, input);
  },

  async typing(ctx, toPhone: string, on: boolean): Promise<void> {
    if (!isPersonalWhatsappEnabled() || !compat.personalConfigured()) return;
    await compat.sendPresence(ctx, toPhone, on);
  },

  async media(): Promise<WaMediaRef> {
    // Inbound media fetch is not exposed in the Beta; return honest unavailable.
    return { url: null, mime: null, error: "unavailable" };
  },

  async session(ctx): Promise<{ exists: boolean; ref: string | null }> {
    const snap = await readSessionSnapshot(ctx, KIND);
    return { exists: snap.state === "connected", ref: null };
  },
};
