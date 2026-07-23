// ============================================================================
// 📘 C9 COMPAT — Evolution RAW payload shapes (server-only, internal).
// ----------------------------------------------------------------------------
// The Evolution-native JSON shapes. These types NEVER escape the compat layer —
// mappers convert them to canonical ZONO types. If Evolution changes a field,
// this file + the relevant mapper change; nothing above the boundary moves.
// ============================================================================

/** GET /instance/connect/{i} — QR / pairing payload. */
export interface RawConnect {
  code?: string | null;          // raw QR string
  base64?: string | null;        // data-URL PNG of the QR
  pairingCode?: string | null;
  count?: number;
}

/** GET /instance/connectionState/{i}. */
export interface RawConnectionState {
  instance?: { instanceName?: string; state?: string };
  state?: string;                // some builds return a flat state
}

/** POST /instance/create response (subset we use). */
export interface RawCreate {
  instance?: { instanceName?: string; status?: string };
  qrcode?: { code?: string | null; base64?: string | null };
  hash?: unknown;                // creds — NEVER read/stored by ZONO
}

/** POST /message/sendText|sendMedia response (subset). */
export interface RawSendResult {
  key?: { id?: string | null; remoteJid?: string | null };
  status?: string | null;
  message?: unknown;
}

/** A single inbound message row in a messages.upsert webhook. */
export interface RawInboundMessage {
  key?: { id?: string | null; remoteJid?: string | null; fromMe?: boolean };
  pushName?: string | null;
  messageTimestamp?: number | string | null;
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
    imageMessage?: { caption?: string | null } | null;
    documentMessage?: { caption?: string | null; fileName?: string | null } | null;
    audioMessage?: unknown;
    locationMessage?: unknown;
  } | null;
}

/** The generic Evolution webhook envelope. */
export interface RawWebhookEnvelope {
  event?: string | null;         // e.g. "messages.upsert", "connection.update", "qrcode.updated"
  instance?: string | null;      // instance name
  data?: unknown;
}
