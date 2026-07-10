// ============================================================================
// 📘 ZONO — WhatsApp PROVIDER abstraction (pure types).
// ----------------------------------------------------------------------------
// The UI, Inbox, AI Conversation Brain, Timeline and CRM depend ONLY on these
// types — never on whatsapp-web.js / Baileys / the Cloud API directly. The
// concrete provider (temporary QR/WhatsApp-Web bridge today, official Cloud API
// tomorrow) is selected in the registry and can be swapped without touching any
// consumer. This is what makes the QR phase disposable.
// ============================================================================

/** Which concrete provider is active. Swap here, not in the UI. */
export type WaProviderKind = "bridge" | "cloud" | "none";

/** Granular connection state for the per-user session. */
export type WaConnState =
  | "disconnected"   // no session
  | "waiting_qr"     // QR generated, waiting for the phone to scan
  | "qr_expired"     // QR timed out — a fresh one will be generated
  | "scanning"       // phone scanned, handshake started
  | "connecting"     // authenticating / restoring session
  | "connected"      // session live — Inbox receives messages
  | "error"          // provider/bridge error
  | "unavailable";   // provider not configured/running in this environment

/** A QR payload to render. `image` is a data-URL (preferred); `raw` is the
 *  underlying string if the client renders the QR itself. */
export interface WaQr {
  image: string | null;
  raw: string | null;
  expiresAt: string;   // ISO — when this QR stops being valid
}

/** Client-safe connection snapshot. NEVER carries session secrets/tokens. */
export interface WaConnectionSnapshot {
  providerKind: WaProviderKind;
  state: WaConnState;
  qr: WaQr | null;
  displayName: string | null;
  phone: string | null;
  lastConnectedAt: string | null;
  error: string | null;
}

/** Per-session scope. There is NEVER a global/shared WhatsApp session. */
export interface WaSessionCtx {
  orgId: string;
  userId: string;
}

/** An inbound message as delivered by the provider (bridge webhook). Mapped into
 *  the EXISTING conversation model — not a new inbox. */
export interface WaInboundMessage {
  fromPhone: string;
  contactName: string | null;
  text: string;
  kind: "text" | "image" | "document" | "audio" | "location";
  mediaRef: string | null;
  providerMessageId: string;
  timestamp: string;
}

export interface WaSendInput { toPhone: string; text: string }
export interface WaSendResult { ok: boolean; providerMessageId?: string; error?: string }
export interface WaMediaRef { url: string | null; mime: string | null; error?: string }

/**
 * The single interface every WhatsApp provider implements. Consumers call these;
 * the concrete implementation (bridge/cloud) is resolved by the registry.
 *
 * `listenMessages` is realized out-of-band: the provider pushes inbound messages
 * to ZONO's bridge webhook (INBOUND_WEBHOOK_PATH), which maps them onto the
 * existing conversation model. The method returns the subscription contract so
 * a provider can be wired to it declaratively.
 */
export interface WhatsAppProvider {
  readonly kind: WaProviderKind;
  connect(ctx: WaSessionCtx): Promise<WaConnectionSnapshot>;
  disconnect(ctx: WaSessionCtx): Promise<{ ok: boolean }>;
  connectionState(ctx: WaSessionCtx): Promise<WaConnectionSnapshot>;
  generateQR(ctx: WaSessionCtx): Promise<WaConnectionSnapshot>;
  listenMessages(ctx: WaSessionCtx): Promise<{ webhookPath: string; subscribed: boolean }>;
  sendMessage(ctx: WaSessionCtx, input: WaSendInput): Promise<WaSendResult>;
  typing(ctx: WaSessionCtx, toPhone: string, on: boolean): Promise<void>;
  media(ctx: WaSessionCtx, mediaRef: string): Promise<WaMediaRef>;
  session(ctx: WaSessionCtx): Promise<{ exists: boolean; ref: string | null }>;
  deleteSession(ctx: WaSessionCtx): Promise<{ ok: boolean }>;
}

/** Where the provider posts inbound messages + connection events. */
export const INBOUND_WEBHOOK_PATH = "/api/whatsapp/bridge";
