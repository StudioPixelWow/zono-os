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
  buildTextPayload, buildTemplatePayload, type CloudConfig, type IncomingMessage,
} from "./core";
import {
  classifyError, mapTemplates, mediaPath, mimeToExt, buildMediaPayload, buildLocationPayload,
  type ClassifiedError, type WaTemplate,
} from "./hardening";

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

/** MULTI-TENANT routing — resolve the org from the webhook's phone_number_id. */
async function resolveOrgByPhoneNumberId(db: ReturnType<typeof createServiceRoleClient>, phoneNumberId: string | null): Promise<{ orgId: string | null; accountId: string | null }> {
  if (phoneNumberId) {
    try {
      const { data } = await db.from("whatsapp_accounts").select("id,organization_id").eq("phone_number_id" as never, phoneNumberId as never).limit(1).maybeSingle();
      const row = data as Row | null;
      if (row?.organization_id) return { orgId: s(row.organization_id), accountId: s(row.id) };
    } catch { /* column may not be migrated yet → fall through */ }
    try {
      const { data } = await db.from("whatsapp_accounts").select("id,organization_id").eq("metadata->>phone_number_id" as never, phoneNumberId as never).limit(1).maybeSingle();
      const row = data as Row | null;
      if (row?.organization_id) return { orgId: s(row.organization_id), accountId: s(row.id) };
    } catch { /* fall through */ }
  }
  // Single-tenant fallback (env or the one connected account).
  const envOrg = process.env.WHATSAPP_ORG_ID?.trim();
  if (envOrg) return { orgId: envOrg, accountId: null };
  try {
    const { data } = await db.from("whatsapp_accounts").select("id,organization_id").in("connection_status", ["connected", "sandbox"]).limit(1).maybeSingle();
    const row = data as Row | null;
    return { orgId: s(row?.organization_id), accountId: s(row?.id) };
  } catch { return { orgId: null, accountId: null }; }
}

async function touchWebhookHealth(db: ReturnType<typeof createServiceRoleClient>, accountId: string | null): Promise<void> {
  if (!accountId) return;
  try { await db.from("whatsapp_accounts").update({ webhook_status: "active", last_webhook_at: new Date().toISOString() } as never).eq("id", accountId); } catch { /* best-effort (columns may be pre-migration) */ }
}

export interface ProcessResult { processed: number; duplicates: number; statusUpdates: number; orgId: string | null; rejected?: string }

/** Idempotent, multi-tenant webhook processor — dedups by wa message id, routes by phone_number_id, persists inbound, downloads media, applies statuses. */
export async function processWebhook(payload: unknown): Promise<ProcessResult> {
  const { messages, statuses, phoneNumberId } = parseWebhook(payload);
  const db = createServiceRoleClient();
  const { orgId, accountId } = await resolveOrgByPhoneNumberId(db, phoneNumberId);
  let processed = 0, duplicates = 0, statusUpdates = 0;
  if (!orgId) return { processed, duplicates, statusUpdates, orgId: null, rejected: "unknown_phone_number_id" };
  await touchWebhookHealth(db, accountId);

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
      const media = m.mediaId ? await downloadMedia(db, orgId, m) : null;   // mock-safe; stores into the documents bucket
      await db.from("whatsapp_messages").insert({
        organization_id: orgId, conversation_id: convId, direction: "inbound", source: "meta_api",
        body: bodyOf(m), intent: null, is_voice_note: m.isVoice,
        transcription_status: m.isVoice ? "pending" : "none",   // voice → pending (no transcription unless an engine exists)
        status: "received",
        // Private (RLS-protected) — plaintext number for replies + media pointer + raw for audit; never exposed publicly.
        metadata: { wa_message_id: m.waMessageId, from: m.from, wa_type: m.type, media: media ?? undefined, raw: m as unknown as Row },
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

// ── Media download → existing 'documents' storage bucket (mock-safe) ─────────
export interface StoredMedia { media_id: string; mime: string | null; filename: string | null; storage_bucket: string | null; storage_path: string | null; downloaded: boolean; error?: string }
async function downloadMedia(db: ReturnType<typeof createServiceRoleClient>, orgId: string, m: IncomingMessage): Promise<StoredMedia> {
  const base: StoredMedia = { media_id: m.mediaId ?? "", mime: m.mime, filename: m.filename, storage_bucket: null, storage_path: null, downloaded: false };
  const cfg = cloudConfig();
  if (cfg.mode === "mock" || !cfg.accessToken || !m.mediaId) return base;   // no external calls in mock
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${m.mediaId}`, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
    const meta = (await metaRes.json().catch(() => ({}))) as Row;
    const url = s(meta.url); const mime = s(meta.mime_type) ?? m.mime;
    if (!url) return { ...base, error: "no_media_url" };
    const binRes = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
    if (!binRes.ok) return { ...base, error: `download_${binRes.status}` };
    const buf = new Uint8Array(await binRes.arrayBuffer());
    const path = mediaPath(orgId, m.waMessageId, m.mediaId, mime);
    const { error } = await db.storage.from("documents").upload(path, buf, { contentType: mime ?? "application/octet-stream", upsert: true });
    if (error) return { ...base, mime, error: "storage_" + error.message };
    return { media_id: m.mediaId, mime, filename: m.filename ?? `${m.mediaId}.${mimeToExt(mime) ?? "bin"}`, storage_bucket: "documents", storage_path: path, downloaded: true };
  } catch (e) { return { ...base, error: e instanceof Error ? e.message : "media_download_failed" }; }
}

// ── Outbound client (mock-safe; NEVER called unless a draft is approved) ─────
export interface SendResult { ok: boolean; mock: boolean; providerMessageId: string | null; error: string | null; errorKind: ClassifiedError["kind"] | null; httpStatus: number | null }
const MOCK: SendResult = { ok: true, mock: true, providerMessageId: null, error: null, errorKind: null, httpStatus: null };

/** Low-level Cloud API message POST with retry + error classification. Mock-safe. */
async function postMessage(payload: Record<string, unknown>): Promise<SendResult> {
  const cfg = cloudConfig();
  if (cfg.mode === "mock" || !cfg.accessToken || !cfg.phoneNumberId) return MOCK;
  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => ({}))) as Row;
      if (!res.ok) {
        const err = (json.error as Row | undefined);
        const cls = classifyError(res.status, Number(err?.code) || null, s(err?.message) ?? "");
        if (cls.retriable && attempt === 0) { await new Promise((r) => setTimeout(r, 500)); continue; }
        return { ok: false, mock: false, providerMessageId: null, error: cls.message || `HTTP ${res.status}`, errorKind: cls.kind, httpStatus: res.status };
      }
      const id = s(((json.messages as Row[] | undefined)?.[0])?.id);
      return { ok: true, mock: false, providerMessageId: id, error: null, errorKind: null, httpStatus: res.status };
    } catch (e) { if (attempt === 1) return { ok: false, mock: false, providerMessageId: null, error: e instanceof Error ? e.message : "network", errorKind: "provider_down", httpStatus: null }; }
  }
  return { ok: false, mock: false, providerMessageId: null, error: "unreachable", errorKind: "provider_down", httpStatus: null };
}

export const sendText = (to: string, body: string): Promise<SendResult> => postMessage(buildTextPayload({ to, body }));
export const sendTemplate = (to: string, name: string, lang = "he", components: unknown[] = []): Promise<SendResult> => postMessage(buildTemplatePayload(to, name, lang, components));
export const sendMedia = (to: string, kind: "image" | "audio" | "video", ref: { id?: string; link?: string; caption?: string }): Promise<SendResult> => postMessage(buildMediaPayload(to, kind, ref));
export const sendDocument = (to: string, ref: { id?: string; link?: string; filename?: string; caption?: string }): Promise<SendResult> => postMessage(buildMediaPayload(to, "document", ref));
export const sendLocation = (to: string, loc: { lat: number; lng: number; name?: string; address?: string }): Promise<SendResult> => postMessage(buildLocationPayload(to, loc));

// ── Template sync (STEP 5) — fetch approved templates → whatsapp_accounts.metadata.templates ──
export interface TemplateSyncResult { ok: boolean; count: number; mock: boolean; error?: string }
export async function syncTemplates(): Promise<TemplateSyncResult> {
  const cfg = cloudConfig();
  const db = createServiceRoleClient();
  const { data: acct } = await db.from("whatsapp_accounts").select("id,waba_id,metadata").in("connection_status", ["connected", "sandbox"]).limit(1).maybeSingle();
  const a = acct as Row | null;
  if (!a?.id) return { ok: false, count: 0, mock: cfg.mode === "mock", error: "no_account" };
  const wabaId = s(a.waba_id) ?? s((a.metadata as Row | undefined)?.waba_id);
  if (cfg.mode === "mock" || !cfg.accessToken || !wabaId) return { ok: true, count: 0, mock: true, error: cfg.mode === "mock" ? "mock_mode" : "no_waba_id" };
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${wabaId}/message_templates?limit=200`, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, count: 0, mock: false, error: `HTTP ${res.status}` };
    const templates: WaTemplate[] = mapTemplates(json);
    await db.from("whatsapp_accounts").update({ metadata: { ...(a.metadata as object ?? {}), templates, templates_synced_at: new Date().toISOString() } } as never).eq("id", s(a.id) as string);
    return { ok: true, count: templates.length, mock: false };
  } catch (e) { return { ok: false, count: 0, mock: false, error: e instanceof Error ? e.message : "sync_failed" }; }
}

/** Recipient phone for a conversation — read from the latest inbound message's private metadata. */
export async function recipientForConversation(orgId: string, conversationId: string): Promise<string | null> {
  const db = createServiceRoleClient();
  try {
    const { data } = await db.from("whatsapp_messages").select("metadata").eq("organization_id", orgId).eq("conversation_id", conversationId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return s(((data as Row | null)?.metadata as Row | undefined)?.from);
  } catch { return null; }
}
