// ============================================================================
// 💬 ZONO — WhatsApp Cloud API connector · server service (server-only). 48.0.
// Verifies webhooks, persists inbound into the EXISTING whatsapp_messages /
// whatsapp_conversations, tracks delivery statuses, and provides a mock-safe
// outbound client. Idempotent (dedup by wa message id in metadata). No new
// table, no new inbox. NOTHING is auto-sent — outbound is only reached from the
// approved-draft send action.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  resolveCloudConfig, parseWebhook, hashPhone, computeSignature, parseSignatureHeader, timingSafeEqualHex,
  buildTextPayload, type CloudConfig, type IncomingMessage,
} from "./core";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
export function cloudConfig(): CloudConfig { return resolveCloudConfig(process.env as Record<string, string | undefined>); }

// ── Webhook GET verification ─────────────────────────────────────────────────
export function verifyWebhook(params: { mode: string | null; token: string | null; challenge: string | null }): { ok: boolean; challenge: string | null } {
  const cfg = cloudConfig();
  if (params.mode === "subscribe" && cfg.verifyToken && params.token === cfg.verifyToken) return { ok: true, challenge: params.challenge };
  return { ok: false, challenge: null };
}

// ── POST signature verification (X-Hub-Signature-256) ────────────────────────
export function verifySignature(rawBody: string, header: string | null): { ok: boolean; reason: string } {
  const cfg = cloudConfig();
  if (!cfg.appSecret) return { ok: true, reason: "no_app_secret_configured" }; // can't verify; accept but flag
  const provided = parseSignatureHeader(header);
  if (!provided) return { ok: false, reason: "missing_or_malformed_signature" };
  return { ok: timingSafeEqualHex(computeSignature(cfg.appSecret, rawBody), provided), reason: "hmac" };
}

async function resolveOrgId(db: ReturnType<typeof createServiceRoleClient>): Promise<string | null> {
  const envOrg = process.env.WHATSAPP_ORG_ID?.trim();
  if (envOrg) return envOrg;
  try {
    const { data } = await db.from("whatsapp_accounts").select("organization_id").in("connection_status", ["connected", "sandbox"]).limit(1).maybeSingle();
    return s((data as Row | null)?.organization_id);
  } catch { return null; }
}

export interface ProcessResult { processed: number; duplicates: number; statusUpdates: number; orgId: string | null }

/** Idempotent webhook processor — dedups by wa message id, persists inbound, applies statuses. */
export async function processWebhook(payload: unknown): Promise<ProcessResult> {
  const { messages, statuses } = parseWebhook(payload);
  const db = createServiceRoleClient();
  const orgId = await resolveOrgId(db);
  let processed = 0, duplicates = 0, statusUpdates = 0;
  if (!orgId) return { processed, duplicates, statusUpdates, orgId };

  // Status updates → update the outbound message's status (dedup-safe).
  for (const st of statuses) {
    try {
      const { error } = await db.from("whatsapp_messages").update({ status: st.status } as never)
        .eq("organization_id" as never, orgId as never).eq("metadata->>wa_message_id" as never, st.waMessageId as never);
      if (!error) statusUpdates++;
    } catch { /* best-effort */ }
  }

  for (const m of messages) {
    try {
      // Idempotency — skip if this wa message id already stored.
      const { data: existing } = await db.from("whatsapp_messages").select("id").eq("organization_id" as never, orgId as never).eq("metadata->>wa_message_id" as never, m.waMessageId as never).limit(1).maybeSingle();
      if (existing) { duplicates++; continue; }
      const convId = await resolveOrCreateConversation(db, orgId, m);
      await db.from("whatsapp_messages").insert({
        organization_id: orgId, conversation_id: convId, direction: "inbound", source: "meta_api",
        body: bodyOf(m), intent: null, is_voice_note: m.isVoice,
        status: "received",
        // Private (RLS-protected) — keeps the plaintext number for replies + raw for audit; never exposed publicly.
        metadata: { wa_message_id: m.waMessageId, from: m.from, wa_type: m.type, media_id: m.mediaId, mime: m.mime, raw: m as unknown as Row },
      } as never);
      if (convId) await db.from("whatsapp_conversations").update({ last_message: bodyOf(m), last_message_at: m.timestamp, unread: true, state: "requires_reply" } as never).eq("organization_id", orgId).eq("id", convId);
      processed++;
    } catch { /* best-effort per message */ }
  }
  return { processed, duplicates, statusUpdates, orgId };
}

function bodyOf(m: IncomingMessage): string {
  if (m.text) return m.text;
  if (m.type === "location" && m.location) return `📍 מיקום (${m.location.lat}, ${m.location.lng})${m.location.name ? ` · ${m.location.name}` : ""}`;
  if (m.mediaId) return `[${m.type}${m.filename ? `: ${m.filename}` : ""}]`;
  return `[${m.type}]`;
}

/** Resolve by hashed phone; create a conversation (+ unknown-number lead suggestion) if new. NEVER auto-creates a CRM lead. */
async function resolveOrCreateConversation(db: ReturnType<typeof createServiceRoleClient>, orgId: string, m: IncomingMessage): Promise<string | null> {
  const phoneHash = hashPhone(m.from);
  try {
    const { data } = await db.from("whatsapp_conversations").select("id").eq("organization_id", orgId).eq("contact_phone_hash", phoneHash).limit(1).maybeSingle();
    const found = s((data as Row | null)?.id);
    if (found) return found;
  } catch { /* fall through to create */ }
  try {
    const { data } = await db.from("whatsapp_conversations").insert({ organization_id: orgId, contact_phone_hash: phoneHash, contact_name: m.name, state: "requires_reply", intent: null } as never).select("id").maybeSingle();
    const convId = s((data as Row | null)?.id);
    // Unknown number → suggestion only (approval-gated elsewhere; nothing auto-created).
    if (convId) await db.from("whatsapp_ai_actions").insert({ organization_id: orgId, conversation_id: convId, action_type: "create_lead", title: "מספר לא מוכר — הצע יצירת ליד", requires_approval: true, status: "suggested" } as never).then(() => {}, () => {});
    return convId;
  } catch { return null; }
}

// ── Outbound client (mock-safe; NEVER called unless a draft is approved) ─────
export interface SendResult { ok: boolean; mock: boolean; waMessageId: string | null; error: string | null; httpStatus: number | null }
export async function sendText(to: string, body: string): Promise<SendResult> {
  const cfg = cloudConfig();
  if (cfg.mode === "mock" || !cfg.accessToken || !cfg.phoneNumberId) return { ok: true, mock: true, waMessageId: null, error: null, httpStatus: null };
  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;
  const payload = buildTextPayload({ to, body });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === 429 || res.status >= 500) { if (attempt === 0) { await new Promise((r) => setTimeout(r, 400)); continue; } }
      const json = (await res.json().catch(() => ({}))) as Row;
      if (!res.ok) { const err = (json.error as Row | undefined); return { ok: false, mock: false, waMessageId: null, error: s(err?.message) ?? `HTTP ${res.status}`, httpStatus: res.status }; }
      const id = s(((json.messages as Row[] | undefined)?.[0])?.id);
      return { ok: true, mock: false, waMessageId: id, error: null, httpStatus: res.status };
    } catch (e) { if (attempt === 1) return { ok: false, mock: false, waMessageId: null, error: e instanceof Error ? e.message : "network", httpStatus: null }; }
  }
  return { ok: false, mock: false, waMessageId: null, error: "unreachable", httpStatus: null };
}

/** Recipient phone for a conversation — read from the latest inbound message's private metadata. */
export async function recipientForConversation(orgId: string, conversationId: string): Promise<string | null> {
  const db = createServiceRoleClient();
  try {
    const { data } = await db.from("whatsapp_messages").select("metadata").eq("organization_id", orgId).eq("conversation_id", conversationId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return s(((data as Row | null)?.metadata as Row | undefined)?.from);
  } catch { return null; }
}
