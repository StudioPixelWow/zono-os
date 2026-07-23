// ============================================================================
// 📘 C9 COMPAT — Evolution WEBHOOK → canonical mapping (server-only, pure).
// ----------------------------------------------------------------------------
// The single normalizer the personal inbound route delegates to. It parses an
// Evolution webhook envelope, resolves the owning (org,user) from the instance
// name, and returns a canonical result. The route never reads an Evolution
// field. Foreign instances, outbound echoes, and unknown events → "ignore".
// ============================================================================
import type { WaConnState, WaInboundMessage, WaSessionCtx } from "../../types";
import type { RawWebhookEnvelope, RawInboundMessage, RawConnectionState } from "./raw";
import { ctxFromInstance } from "./instance";
import { normalizeWebhookState } from "./status";

export type NormalizedWebhook =
  | { kind: "message"; ctx: WaSessionCtx; message: WaInboundMessage }
  | { kind: "status"; ctx: WaSessionCtx; state: WaConnState }
  | { kind: "ignore"; reason: string };

function extractText(m: RawInboundMessage["message"]): { text: string; kind: WaInboundMessage["kind"] } {
  if (!m) return { text: "", kind: "text" };
  if (typeof m.conversation === "string" && m.conversation) return { text: m.conversation, kind: "text" };
  if (m.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, kind: "text" };
  if (m.imageMessage) return { text: m.imageMessage.caption ?? "", kind: "image" };
  if (m.documentMessage) return { text: m.documentMessage.caption ?? m.documentMessage.fileName ?? "", kind: "document" };
  if (m.audioMessage) return { text: "", kind: "audio" };
  if (m.locationMessage) return { text: "", kind: "location" };
  return { text: "", kind: "text" };
}

function toIso(ts: number | string | null | undefined): string {
  if (ts == null) return new Date(0).toISOString(); // caller may substitute now()
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return new Date(0).toISOString();
  // Evolution/WA timestamps are seconds.
  return new Date(n * 1000).toISOString();
}

function firstMessage(data: unknown): RawInboundMessage | null {
  // messages.upsert data may be a single object or { messages: [...] }.
  if (Array.isArray(data)) return (data[0] as RawInboundMessage) ?? null;
  const d = data as { messages?: RawInboundMessage[] } & RawInboundMessage;
  if (Array.isArray(d?.messages)) return d.messages[0] ?? null;
  if (d?.key) return d;
  return null;
}

/** Normalize a raw (parsed-JSON) Evolution webhook body. Pure (no I/O). Accepts
 *  `unknown` so the route can hand over the body without touching Evolution
 *  shapes; coercion happens here. `nowIso` substitutes for a missing timestamp. */
export function normalizeWebhook(input: unknown, nowIso: string): NormalizedWebhook {
  const env = (input ?? {}) as RawWebhookEnvelope;
  const ctx = ctxFromInstance(env.instance);
  if (!ctx) return { kind: "ignore", reason: "unknown_instance" };
  const event = (env.event ?? "").toLowerCase();

  if (event === "messages.upsert" || event === "messages_upsert") {
    const raw = firstMessage(env.data);
    if (!raw?.key) return { kind: "ignore", reason: "no_message" };
    if (raw.key.fromMe) return { kind: "ignore", reason: "outbound_echo" };
    const jid = raw.key.remoteJid ?? "";
    if (jid.endsWith("@g.us")) return { kind: "ignore", reason: "group_unsupported" };
    const fromPhone = jid.replace(/@.*/, "");
    if (!fromPhone) return { kind: "ignore", reason: "no_sender" };
    const { text, kind } = extractText(raw.message);
    const message: WaInboundMessage = {
      fromPhone,
      contactName: raw.pushName ?? null,
      text,
      kind,
      mediaRef: null,
      providerMessageId: raw.key.id ?? `${fromPhone}:${raw.messageTimestamp ?? ""}`,
      timestamp: raw.messageTimestamp != null ? toIso(raw.messageTimestamp) : nowIso,
    };
    return { kind: "message", ctx, message };
  }

  if (event === "connection.update" || event === "connection_update") {
    const state = normalizeWebhookState((env.data as RawConnectionState)?.state ?? (env.data as RawConnectionState)?.instance?.state);
    return { kind: "status", ctx, state };
  }

  if (event === "qrcode.updated" || event === "qrcode_updated") {
    return { kind: "status", ctx, state: "waiting_qr" };
  }

  return { kind: "ignore", reason: "unhandled_event" };
}
