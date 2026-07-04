// ============================================================================
// 💬 ZONO — WhatsApp Cloud API connector · pure core. PHASE 48.0.
// Config resolution, incoming webhook parser, status mapping, phone hashing,
// idempotency keys, signature-format helpers. Pure & deterministic — the server
// layer does all I/O and persists into the EXISTING whatsapp_* tables. No new
// table, no new inbox, no new AI agent. Nothing is auto-sent here.
// ============================================================================
import { createHash, createHmac } from "node:crypto";

// ── Config (server reads real env; this stays pure over an env record) ───────
export interface CloudConfig {
  phoneNumberId: string | null; accessToken: string | null; appSecret: string | null;
  verifyToken: string | null; graphVersion: string; mode: "live" | "mock"; missing: string[];
}
export function resolveCloudConfig(env: Record<string, string | undefined>): CloudConfig {
  const val = (k: string) => { const v = env[k]?.trim(); return v ? v : null; };
  const phoneNumberId = val("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = val("WHATSAPP_ACCESS_TOKEN");
  const appSecret = val("WHATSAPP_APP_SECRET") ?? val("META_APP_SECRET");
  const verifyToken = val("WHATSAPP_VERIFY_TOKEN");
  const graphVersion = val("WHATSAPP_GRAPH_VERSION") ?? val("META_GRAPH_VERSION") ?? "v21.0";
  const missing: string[] = [];
  if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");
  // Live only when we can both receive-verify and send; otherwise mock (safe, no external calls).
  const mode: "live" | "mock" = phoneNumberId && accessToken ? "live" : "mock";
  return { phoneNumberId, accessToken, appSecret, verifyToken, graphVersion, mode, missing };
}

// ── Phone normalization + hash (matches whatsapp_conversations.contact_phone_hash) ──
export function normalizePhone(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9 && digits.startsWith("5")) return "0" + digits;   // 5XXXXXXXX → 05XXXXXXXX
  return digits;
}
export function hashPhone(raw: string): string { return createHash("sha256").update(normalizePhone(raw)).digest("hex"); }

// ── Incoming message model ───────────────────────────────────────────────────
export type WaMsgType = "text" | "image" | "audio" | "video" | "document" | "location" | "button" | "interactive" | "unsupported";
export interface IncomingMessage {
  waMessageId: string; from: string; name: string | null; type: WaMsgType;
  text: string | null; mediaId: string | null; mime: string | null; filename: string | null;
  isVoice: boolean; location: { lat: number; lng: number; name: string | null; address: string | null } | null;
  interactive: { kind: string; id: string | null; title: string | null } | null;
  timestamp: string; // ISO
}
export interface StatusUpdate { waMessageId: string; status: WaStatus; recipient: string | null; timestamp: string; errorCode: number | null; errorTitle: string | null }

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const toIso = (ts: unknown): string => { const n = Number(ts); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString(); };

/** Parse a Meta WhatsApp webhook payload → normalized messages + statuses. Robust to shape drift. */
export function parseWebhook(payload: unknown): { messages: IncomingMessage[]; statuses: StatusUpdate[]; phoneNumberId: string | null } {
  const messages: IncomingMessage[] = []; const statuses: StatusUpdate[] = [];
  let phoneNumberId: string | null = null;
  const root = (payload && typeof payload === "object" ? payload : {}) as Row;
  for (const entry of arr(root.entry)) {
    for (const change of arr(entry.changes)) {
      const value = (change.value ?? {}) as Row;
      phoneNumberId = phoneNumberId ?? s((value.metadata as Row | undefined)?.phone_number_id);
      const contacts = arr(value.contacts);
      const nameByWaId = new Map<string, string | null>();
      for (const c of contacts) nameByWaId.set(s(c.wa_id) ?? "", s((c.profile as Row | undefined)?.name));
      for (const m of arr(value.messages)) {
        const id = s(m.id); const from = s(m.from); if (!id || !from) continue;
        const type = s(m.type) ?? "unsupported";
        const base = { waMessageId: id, from, name: nameByWaId.get(from) ?? null, timestamp: toIso(m.timestamp), text: null as string | null, mediaId: null as string | null, mime: null as string | null, filename: null as string | null, isVoice: false, location: null as IncomingMessage["location"], interactive: null as IncomingMessage["interactive"] };
        if (type === "text") { messages.push({ ...base, type: "text", text: s((m.text as Row | undefined)?.body) }); }
        else if (type === "image" || type === "video" || type === "document" || type === "audio") {
          const media = (m[type] as Row | undefined) ?? {};
          messages.push({ ...base, type: type as WaMsgType, mediaId: s(media.id), mime: s(media.mime_type), filename: s(media.filename), text: s(media.caption), isVoice: type === "audio" && media.voice === true });
        }
        else if (type === "location") { const l = (m.location as Row | undefined) ?? {}; messages.push({ ...base, type: "location", location: { lat: Number(l.latitude) || 0, lng: Number(l.longitude) || 0, name: s(l.name), address: s(l.address) } }); }
        else if (type === "button") { const b = (m.button as Row | undefined) ?? {}; messages.push({ ...base, type: "button", text: s(b.text), interactive: { kind: "button", id: s(b.payload), title: s(b.text) } }); }
        else if (type === "interactive") { const it = (m.interactive as Row | undefined) ?? {}; const reply = (it.button_reply ?? it.list_reply ?? {}) as Row; messages.push({ ...base, type: "interactive", text: s(reply.title), interactive: { kind: s(it.type) ?? "interactive", id: s(reply.id), title: s(reply.title) } }); }
        else { messages.push({ ...base, type: "unsupported", text: `[${type}]` }); }
      }
      for (const st of arr(value.statuses)) {
        const id = s(st.id); if (!id) continue;
        const err = arr(st.errors)[0] ?? {};
        statuses.push({ waMessageId: id, status: mapStatus(s(st.status)), recipient: s(st.recipient_id), timestamp: toIso(st.timestamp), errorCode: Number(err.code) || null, errorTitle: s(err.title) });
      }
    }
  }
  return { messages, statuses, phoneNumberId };
}

// ── Status mapping ───────────────────────────────────────────────────────────
export type WaStatus = "sent" | "delivered" | "read" | "failed" | "received" | "unknown";
export function mapStatus(meta: string | null): WaStatus {
  switch ((meta ?? "").toLowerCase()) {
    case "sent": return "sent"; case "delivered": return "delivered"; case "read": return "read";
    case "failed": return "failed"; default: return meta ? "unknown" : "received";
  }
}
export const isTerminalStatus = (s2: WaStatus) => s2 === "read" || s2 === "failed";

// ── Idempotency key (dedup duplicate webhooks by wa message id) ──────────────
export const idempotencyKey = (waMessageId: string) => `wa:${waMessageId}`;

// ── Signature format helpers (HMAC computed in the server with node:crypto) ──
export function parseSignatureHeader(header: string | null): string | null {
  if (!header) return null; const m = /^sha256=([a-f0-9]{64})$/i.exec(header.trim()); return m ? m[1].toLowerCase() : null;
}
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0;
}
/** HMAC-SHA256 of the raw body with the app secret — matches Meta's X-Hub-Signature-256. */
export function computeSignature(appSecret: string, rawBody: string): string {
  return createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

// ── Outbound payload builders (pure — the client POSTs these) ────────────────
export interface OutboundText { to: string; body: string }
export function buildTextPayload(o: OutboundText): Record<string, unknown> {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(o.to).replace(/^0/, "972"), type: "text", text: { preview_url: false, body: o.body } };
}
export function buildTemplatePayload(to: string, name: string, lang = "he", components: unknown[] = []): Record<string, unknown> {
  return { messaging_product: "whatsapp", to: normalizePhone(to).replace(/^0/, "972"), type: "template", template: { name, language: { code: lang }, components } };
}
