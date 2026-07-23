// ============================================================================
// 📘 ZONO — Personal transport OUTBOUND SAFEGUARDS (server-only).
// ----------------------------------------------------------------------------
// Personal WhatsApp is human-in-the-loop by default. Every outbound send passes
// these gates before the transport is touched: kill switch → explicit approval →
// conservative per-agent rate/burst limit → idempotency/dedup → send → record +
// audit. Bulk marketing / cold outreach / broadcasts are NOT supported here; the
// official Business API (Batch 6.6) is the transport for approved templates,
// automation and scale. No AI/automation path may call this without `approved`.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { decide } from "@/lib/platform/rate-limit/rate-limit";
import type { RateLimitConfig } from "@/lib/platform/types";
import type { WaSessionCtx } from "../types";
import { isPersonalWhatsappEnabled, PERSONAL_DISABLED_REASON } from "../personal-flag";
import { personalTransportProvider } from "./adapter";

/** Conservative Beta limits — intentionally low to reduce ban risk. */
const PERSONAL_RATE: RateLimitConfig = { limit: 15, windowMs: 60_000 };  // 15 msgs / min / agent
const BURST: RateLimitConfig = { limit: 5, windowMs: 10_000 };           // ≤5 in any 10s
const COOLDOWN_MS = 1_500;                                               // min gap between sends

const phoneHash = (phone: string): string =>
  crypto.createHash("sha256").update(phone.replace(/[^\d]/g, "")).digest("hex").slice(0, 40);

// Best-effort in-memory windows (per server instance). Production hardening =
// back these with Redis/DB; documented in the Operations Runbook.
const windows = new Map<string, { count: number; startMs: number }>();
const bursts = new Map<string, { count: number; startMs: number }>();
const lastSendAt = new Map<string, number>();

function windowCheck(map: Map<string, { count: number; startMs: number }>, key: string, cfg: RateLimitConfig, now: number): boolean {
  const w = map.get(key);
  if (!w || now - w.startMs >= cfg.windowMs) { map.set(key, { count: 1, startMs: now }); return true; }
  const d = decide(w.count, w.startMs, cfg, now);
  if (d.allowed) { w.count++; return true; }
  return false;
}

export interface PersonalSendInput {
  toPhone: string;
  text: string;
  /** Human approval — MUST be true. AI/automation cannot set this implicitly. */
  approved: boolean;
  /** Client-supplied idempotency key to make retries safe. */
  idempotencyKey: string;
}

export type PersonalSendResult =
  | { ok: true; providerMessageId?: string; conversationId?: string; duplicate?: boolean }
  | { ok: false; reason: string; retryAfterMs?: number };

/** Send an approved, rate-limited, idempotent personal-transport message. */
export async function sendPersonalText(ctx: WaSessionCtx, input: PersonalSendInput): Promise<PersonalSendResult> {
  if (!isPersonalWhatsappEnabled()) return { ok: false, reason: PERSONAL_DISABLED_REASON };
  if (!input.approved) return { ok: false, reason: "approval_required" };
  if (!input.toPhone.trim() || !input.text.trim()) return { ok: false, reason: "missing_fields" };
  if (!input.idempotencyKey.trim()) return { ok: false, reason: "missing_idempotency_key" };

  const now = Date.now();
  const agentKey = `${ctx.orgId}:${ctx.userId}`;

  // Cooldown + burst + sustained rate.
  const last = lastSendAt.get(agentKey) ?? 0;
  if (now - last < COOLDOWN_MS) return { ok: false, reason: "cooldown", retryAfterMs: COOLDOWN_MS - (now - last) };
  if (!windowCheck(bursts, agentKey, BURST, now)) return { ok: false, reason: "burst_limited", retryAfterMs: BURST.windowMs };
  if (!windowCheck(windows, agentKey, PERSONAL_RATE, now)) return { ok: false, reason: "rate_limited", retryAfterMs: PERSONAL_RATE.windowMs };

  const db = await createClient();

  // Idempotency: same key already recorded → return the prior result.
  const existing = await db.from("whatsapp_messages" as never).select("id,conversation_id")
    .eq("organization_id", ctx.orgId)
    .filter("metadata->>idempotency_key", "eq", input.idempotencyKey).maybeSingle();
  if (existing.data) {
    const e = existing.data as { id: string; conversation_id: string };
    return { ok: true, duplicate: true, conversationId: e.conversation_id };
  }

  // Resolve/create the canonical conversation for this contact (shared model).
  const hash = phoneHash(input.toPhone);
  const nowIso = new Date().toISOString();
  const found = await db.from("whatsapp_conversations" as never).select("id")
    .eq("organization_id", ctx.orgId).eq("assigned_agent_id", ctx.userId).eq("contact_phone_hash", hash).maybeSingle();
  let convId = (found.data as { id: string } | null)?.id ?? null;
  if (!convId) {
    const created = await db.from("whatsapp_conversations" as never).insert({
      organization_id: ctx.orgId, assigned_agent_id: ctx.userId, contact_phone_hash: hash,
      channel: "whatsapp", state: "active", last_message: input.text, last_message_at: nowIso, last_outbound_at: nowIso,
    } as never).select("id").maybeSingle();
    convId = (created.data as { id: string } | null)?.id ?? null;
  }

  // Send through the transport (kill-switch re-checked inside the provider).
  const sent = await personalTransportProvider.sendMessage(ctx, { toPhone: input.toPhone, text: input.text });
  lastSendAt.set(agentKey, now);
  if (!sent.ok) return { ok: false, reason: sent.error ?? "send_failed" };

  // Record the outbound message with idempotency key + transport metadata.
  if (convId) {
    await db.from("whatsapp_messages" as never).insert({
      organization_id: ctx.orgId, conversation_id: convId, direction: "outbound", source: "meta_api",
      body: input.text,
      metadata: { provider_message_id: sent.providerMessageId, idempotency_key: input.idempotencyKey, via: "whatsapp_web_bridge", transport: "personal" },
      created_at: nowIso,
    } as never);
    await db.from("whatsapp_conversations" as never).update({ last_message: input.text, last_message_at: nowIso, last_outbound_at: nowIso } as never).eq("id", convId);
  }

  await logAudit({
    action: "whatsapp.personal.sent", category: "configuration", entityType: "whatsapp_conversation", entityId: convId ?? undefined,
    summary: "Personal WhatsApp message sent (approved)", metadata: { transport: "personal" }, // NEVER body/phone
  });

  return { ok: true, providerMessageId: sent.providerMessageId, conversationId: convId ?? undefined };
}
