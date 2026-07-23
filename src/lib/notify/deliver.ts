// ============================================================================
// 🔔 ZONO OS — Batch 6.6 · NOTIFICATION DELIVERY — dispatch (server-only).
//
// The single entry point every ZONO notification uses to be delivered over an
// external channel. Idempotent: one delivery per (org, dedupKey) — enforced by
// the notification_deliveries unique constraint, so a retried dispatch never
// double-sends. Routes to the channel provider, records the outcome, and returns
// the result. Business logic calls deliver(); it never talks to a provider
// directly, so adding email/push/sms later changes nothing here.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { providerFor } from "./providers";
import type { DeliveryRequest, DeliveryResult } from "./types";

const TABLE = "notification_deliveries";

export async function deliver(req: DeliveryRequest): Promise<DeliveryResult> {
  const db = createServiceRoleClient();

  // Idempotency gate: claim the (org, dedupKey) row first. A unique violation
  // means this delivery was already attempted — return skipped, never re-send.
  const { error: claimErr } = await db.from(TABLE as never).insert({
    org_id: req.orgId, user_id: req.userId ?? null, notification_id: req.notificationId ?? null,
    channel: req.channel, provider: req.channel === "whatsapp" ? "whatsapp_cloud" : req.channel,
    status: "queued", dedup_key: req.dedupKey,
    payload: { title: req.title ?? null, hasTemplate: !!req.template },
  } as never);
  if (claimErr) return { ok: false, status: "skipped", error: "duplicate_delivery" };

  const result = await providerFor(req.channel).deliver(req);

  await db.from(TABLE as never).update({
    status: result.ok ? result.status : result.status,
    provider_message_id: result.ok ? result.providerMessageId : null,
    error: result.ok ? null : result.error,
    updated_at: new Date().toISOString(),
  } as never).eq("org_id", req.orgId).eq("dedup_key", req.dedupKey);

  return result;
}
