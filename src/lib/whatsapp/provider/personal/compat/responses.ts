// ============================================================================
// 📘 C9 COMPAT — Evolution RESPONSE → canonical mapping (server-only, pure).
// ----------------------------------------------------------------------------
// Converts Evolution response shapes into ZONO's canonical connection/send
// results. The adapter consumes ONLY these canonical outputs.
// ============================================================================
import type { WaConnState, WaQr, WaSendResult } from "../../types";
import type {
  RawChat, RawConnect, RawConnectionState, RawContact, RawCreate,
  RawFindChats, RawFindContacts, RawFindMessages, RawMessageBody,
  RawMessageRecord, RawSendResult,
} from "./raw";
import { normalizeState } from "./status";

/** Canonical connection reading emitted by the compat layer. Never carries creds. */
export interface CanonicalConnection {
  state: WaConnState;
  qr: WaQr | null;
  phone: string | null;
  displayName: string | null;
}

const QR_TTL_MS = 60_000; // QR validity window we advertise to the client

function toQr(base64: string | null | undefined, code: string | null | undefined, nowIso: string): WaQr | null {
  if (!base64 && !code) return null;
  return { image: base64 ?? null, raw: code ?? null, expiresAt: new Date(Date.parse(nowIso) + QR_TTL_MS).toISOString() };
}

/** Map GET /instance/connect (QR/pairing) into a canonical connection. */
export function fromConnect(raw: RawConnect | null, nowIso: string): CanonicalConnection {
  const qr = toQr(raw?.base64, raw?.code, nowIso);
  return { state: qr ? "waiting_qr" : "connecting", qr, phone: null, displayName: null };
}

/** Map POST /instance/create into a canonical connection (may already carry a QR). */
export function fromCreate(raw: RawCreate | null, nowIso: string): CanonicalConnection {
  const qr = toQr(raw?.qrcode?.base64, raw?.qrcode?.code, nowIso);
  return { state: qr ? "waiting_qr" : "connecting", qr, phone: null, displayName: null };
}

/** Map GET /instance/connectionState into a canonical connection (no QR here). */
export function fromConnectionState(raw: RawConnectionState | null): CanonicalConnection {
  const s = raw?.instance?.state ?? raw?.state ?? null;
  return { state: normalizeState(s, false), qr: null, phone: null, displayName: null };
}

/** Map a send response into the canonical send result. */
export function fromSend(raw: RawSendResult | null): WaSendResult {
  const id = raw?.key?.id ?? null;
  if (!id) return { ok: false, error: "send_no_ack" };
  return { ok: true, providerMessageId: id };
}

// ── READ mappers (findContacts / findChats / findMessages → canonical) ───────
// Everything below is Evolution-shape-aware and MUST stay in compat/. The
// canonical outputs carry only a numeric phone + neutral fields.

/** Canonical contact reading (no JID/provider vocabulary escapes). */
export interface CanonicalContact { phone: string; name: string | null }
/** Canonical existing-chat reading. */
export interface CanonicalChat { phone: string; name: string | null; lastMessage: string | null; at: string | null }
/** Canonical message reading within a chat. */
export interface CanonicalMessage { id: string; direction: "inbound" | "outbound"; body: string; at: string | null }

/** JID → digits. Strips the WhatsApp/LID suffixes and keeps only the numeric
 *  phone. Group JIDs (@g.us) and anything without digits return null so callers
 *  skip them. Pure. */
export function jidToDigits(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const raw = String(jid).trim();
  if (/@g\.us$/i.test(raw)) return null;                 // group — skip
  const local = raw.replace(/@(s\.whatsapp\.net|c\.us|lid)$/i, "").split(":")[0];
  const digits = local.replace(/[^\d]/g, "");
  return digits.length ? digits : null;
}

/** Coerce an updatedAt/messageTimestamp (seconds | ms | ISO string) to ISO. */
function toIso(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    if (/^\d+$/.test(t)) return toIso(Number(t));         // numeric string
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  if (!Number.isFinite(value)) return null;
  // Heuristic: 10-digit values are seconds, larger are milliseconds.
  const ms = value < 1e12 ? value * 1000 : value;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Pull a display-able text body out of a raw message body (defensive). */
function bodyText(m: RawMessageBody | null | undefined): string {
  if (!m) return "";
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.documentMessage?.caption ??
    m.documentMessage?.fileName ??
    ""
  ) || "";
}

function contactRows(raw: RawFindContacts): RawContact[] {
  if (Array.isArray(raw)) return raw;
  return raw?.contacts ?? [];
}

function chatRows(raw: RawFindChats): RawChat[] {
  if (Array.isArray(raw)) return raw;
  return raw?.chats ?? [];
}

function messageRows(raw: RawFindMessages): RawMessageRecord[] {
  if (Array.isArray(raw)) return raw;
  const m = raw?.messages;
  if (Array.isArray(m)) return m;
  return m?.records ?? [];
}

/** Map findContacts → canonical contacts (personal only, deduped by phone). */
export function fromFindContacts(raw: RawFindContacts): CanonicalContact[] {
  const out: CanonicalContact[] = [];
  const seen = new Set<string>();
  for (const c of contactRows(raw)) {
    const phone = jidToDigits(c?.id ?? c?.remoteJid);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const name = (c?.pushName ?? c?.name ?? null) || null;
    out.push({ phone, name });
  }
  return out;
}

function chatLastMessage(lm: RawChat["lastMessage"]): string | null {
  if (lm == null) return null;
  if (typeof lm === "string") return lm || null;
  return bodyText(lm.message) || null;
}

/** Map findChats → canonical chats (personal only, newest first). */
export function fromFindChats(raw: RawFindChats): CanonicalChat[] {
  const out: CanonicalChat[] = [];
  const seen = new Set<string>();
  for (const c of chatRows(raw)) {
    const phone = jidToDigits(c?.id ?? c?.remoteJid);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      phone,
      name: (c?.pushName ?? c?.name ?? null) || null,
      lastMessage: chatLastMessage(c?.lastMessage),
      at: toIso(c?.updatedAt ?? c?.messageTimestamp),
    });
  }
  out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return out;
}

/** Map findMessages → canonical messages (oldest first). */
export function fromFindMessages(raw: RawFindMessages): CanonicalMessage[] {
  const rows = messageRows(raw);
  const out: CanonicalMessage[] = rows.map((r, i) => ({
    id: r?.key?.id ?? `m${i}`,
    direction: r?.key?.fromMe ? "outbound" : "inbound",
    body: bodyText(r?.message),
    at: toIso(r?.messageTimestamp),
  }));
  out.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return out;
}
