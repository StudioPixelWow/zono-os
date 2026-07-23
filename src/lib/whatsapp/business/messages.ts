// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS PLATFORM OS — per-org sender
// (server-only).
//
// Multi-tenant outbound over the WhatsApp Cloud API. Loads the ORG's own
// encrypted token + phone_number_id (from business/tokens) and POSTs to
// /{phone_number_id}/messages. Reuses the pure payload builders in
// whatsapp/cloud/core.ts and adds the interactive / list / contacts builders
// that were missing. Records outbound into the EXISTING whatsapp_conversations /
// whatsapp_messages tables (the canonical model) — never a new message model.
// Delivery/read/failed status arrives asynchronously via the existing webhook.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getWaOAuthConfig } from "./oauth";
import { getConnectionServiceRole, decryptToken } from "./tokens";
import { hashPhone, normalizePhone, buildTextPayload, buildTemplatePayload } from "@/lib/whatsapp/cloud/core";
import type { WaButton, WaListSection, WaMediaKind, WaSendResult, WaErrorType } from "./types";

const waTo = (to: string) => normalizePhone(to).replace(/^0/, "972");

function classify(status: number, body: string): WaErrorType {
  if (status === 401) return "auth_expired";
  if (status === 403) return /permission|scope/i.test(body) ? "permission" : "rate_limit";
  if (status === 429) return "rate_limit";
  if (status >= 400 && status < 500) return "invalid";
  return "unknown";
}

/** Low-level authed send. Resolves the org's token + phone number id, POSTs the
 *  payload, records the outbound message, and returns the wa message id. */
async function send(orgId: string, to: string, payload: Record<string, unknown>, preview: string): Promise<WaSendResult> {
  const conn = await getConnectionServiceRole(orgId);
  if (!conn || (conn.status !== "connected" && conn.status !== "syncing")) return { ok: false, error: "not_connected" };
  if (!conn.phoneNumberId) return { ok: false, error: "no_phone_number" };
  const token = decryptToken(conn);
  if (!token) return { ok: false, error: "no_token", type: "auth_expired" };
  const cfg = getWaOAuthConfig();
  const url = `https://graph.facebook.com/${cfg.graphVersion || "v21.0"}/${conn.phoneNumberId}/messages`;
  let body = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    body = await res.text();
    if (!res.ok) {
      const err = (() => { try { return (JSON.parse(body) as { error?: { message?: string } }).error?.message; } catch { return null; } })();
      return { ok: false, error: err || `send failed (http ${res.status})`, type: classify(res.status, body) };
    }
    const json = JSON.parse(body) as { messages?: { id?: string }[] };
    const messageId = json.messages?.[0]?.id ?? "";
    await recordOutbound(orgId, to, preview, messageId);
    return { ok: true, messageId };
  } catch {
    return { ok: false, error: "network error", type: "network" };
  }
}

/** Record an outbound message into the canonical tables (get-or-create the
 *  conversation by phone hash, insert an outbound whatsapp_messages row). */
async function recordOutbound(orgId: string, to: string, body: string, waMessageId: string): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const phoneHash = hashPhone(to);
    const { data: existing } = await db.from("whatsapp_conversations" as never)
      .select("id").eq("organization_id", orgId).eq("contact_phone_hash", phoneHash).limit(1).maybeSingle();
    let convId = (existing as unknown as { id: string } | null)?.id ?? null;
    if (!convId) {
      const { data: created } = await db.from("whatsapp_conversations" as never)
        .insert({ organization_id: orgId, contact_phone_hash: phoneHash, channel: "whatsapp", last_message: body, last_message_at: new Date().toISOString() } as never)
        .select("id").maybeSingle();
      convId = (created as unknown as { id: string } | null)?.id ?? null;
    }
    if (!convId) return;
    await db.from("whatsapp_messages" as never).insert({
      organization_id: orgId, conversation_id: convId, direction: "outbound", source: "meta_api",
      body, status: "sent", metadata: { wa_message_id: waMessageId, to: normalizePhone(to) },
    } as never);
    await db.from("whatsapp_conversations" as never).update({ last_message: body, last_message_at: new Date().toISOString() } as never).eq("id", convId);
  } catch { /* best-effort persistence — the send itself already succeeded */ }
}

// ── Public senders (each resolves the org's own creds) ───────────────────────
export function sendText(orgId: string, to: string, text: string): Promise<WaSendResult> {
  return send(orgId, to, buildTextPayload({ to, body: text }), text);
}

export function sendTemplate(orgId: string, to: string, name: string, lang = "he", components: unknown[] = []): Promise<WaSendResult> {
  return send(orgId, to, buildTemplatePayload(to, name, lang, components), `[template:${name}]`);
}

/** Media by public URL. `kind` = image | document | video | audio. */
export function sendMedia(orgId: string, to: string, kind: WaMediaKind, link: string, opts: { caption?: string; filename?: string } = {}): Promise<WaSendResult> {
  const media: Record<string, unknown> = { link };
  if (opts.caption && (kind === "image" || kind === "video" || kind === "document")) media.caption = opts.caption;
  if (opts.filename && kind === "document") media.filename = opts.filename;
  const payload = { messaging_product: "whatsapp", to: waTo(to), type: kind, [kind]: media };
  return send(orgId, to, payload, opts.caption ?? `[${kind}]`);
}

export function sendLocation(orgId: string, to: string, loc: { lat: number; lng: number; name?: string; address?: string }): Promise<WaSendResult> {
  const payload = { messaging_product: "whatsapp", to: waTo(to), type: "location", location: { latitude: loc.lat, longitude: loc.lng, name: loc.name, address: loc.address } };
  return send(orgId, to, payload, "[location]");
}

export function sendContacts(orgId: string, to: string, contacts: { name: string; phone: string }[]): Promise<WaSendResult> {
  const payload = {
    messaging_product: "whatsapp", to: waTo(to), type: "contacts",
    contacts: contacts.map((c) => ({ name: { formatted_name: c.name, first_name: c.name }, phones: [{ phone: c.phone, type: "CELL" }] })),
  };
  return send(orgId, to, payload, "[contacts]");
}

/** Interactive reply buttons (max 3). */
export function sendButtons(orgId: string, to: string, bodyText: string, buttons: WaButton[]): Promise<WaSendResult> {
  const payload = {
    messaging_product: "whatsapp", to: waTo(to), type: "interactive",
    interactive: { type: "button", body: { text: bodyText }, action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) } },
  };
  return send(orgId, to, payload, bodyText);
}

/** Interactive list message. */
export function sendList(orgId: string, to: string, bodyText: string, buttonLabel: string, sections: WaListSection[]): Promise<WaSendResult> {
  const payload = {
    messaging_product: "whatsapp", to: waTo(to), type: "interactive",
    interactive: {
      type: "list", body: { text: bodyText },
      action: { button: buttonLabel, sections: sections.map((s) => ({ title: s.title, rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })) })) },
    },
  };
  return send(orgId, to, payload, bodyText);
}
