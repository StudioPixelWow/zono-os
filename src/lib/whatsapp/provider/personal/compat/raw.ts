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

/** QRCODE_UPDATED webhook payload (subset). Evolution v2 sends the QR either
 *  nested under `qrcode` or flat on `data`. Both carry the scannable PNG as a
 *  data-URL in `base64` and the raw string in `code`. No credentials here. */
export interface RawQrUpdate {
  qrcode?: { code?: string | null; base64?: string | null; pairingCode?: string | null } | null;
  base64?: string | null;
  code?: string | null;
  pairingCode?: string | null;
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

// ── READ shapes (findContacts / findChats / findMessages) ────────────────────
// Evolution v2 varies these between builds; every field is optional and the
// mappers parse defensively. Groups (JIDs ending @g.us) are skipped upstream.

/** A single contact row from POST /chat/findContacts. */
export interface RawContact {
  id?: string | null;            // JID, e.g. "972501234567@s.whatsapp.net"
  remoteJid?: string | null;     // some builds use remoteJid instead of id
  pushName?: string | null;
  name?: string | null;
}

/** POST /chat/findContacts — an array, or `{ contacts: [...] }`. */
export type RawFindContacts = RawContact[] | { contacts?: RawContact[] | null } | null;

/** A stored message body (shared by chats' lastMessage and message records). */
export interface RawMessageBody {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
  imageMessage?: { caption?: string | null } | null;
  documentMessage?: { caption?: string | null; fileName?: string | null } | null;
}

/** A single chat row from POST /chat/findChats. */
export interface RawChat {
  id?: string | null;            // JID
  remoteJid?: string | null;     // some builds use remoteJid instead of id
  pushName?: string | null;
  name?: string | null;
  updatedAt?: number | string | null;
  messageTimestamp?: number | string | null;
  // lastMessage may be a plain string or an object carrying a message body.
  lastMessage?: string | { message?: RawMessageBody | null } | null;
}

/** POST /chat/findChats — an array, or `{ chats: [...] }`. */
export type RawFindChats = RawChat[] | { chats?: RawChat[] | null } | null;

/** A single message record from POST /chat/findMessages. */
export interface RawMessageRecord {
  key?: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null } | null;
  message?: RawMessageBody | null;
  messageTimestamp?: number | string | null;
  pushName?: string | null;
}

/** POST /chat/findMessages — an array, `{ messages: { records: [...] } }`, or
 *  `{ messages: [...] }`. */
export type RawFindMessages =
  | RawMessageRecord[]
  | { messages?: { records?: RawMessageRecord[] | null } | RawMessageRecord[] | null }
  | null;
