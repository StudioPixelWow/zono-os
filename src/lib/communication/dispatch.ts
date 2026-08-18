/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Communication Automation: dispatch mechanics (server-only). The low-
// level layer over the existing `notification_deliveries` log + `notify` provider
// abstraction. Every send is idempotent via a (org, dedup_key) claim — a cron
// re-run or provider retry never double-sends. In-app is a first-class "channel"
// here (claim → insert notifications row). External channels either send now or,
// when deferred for quiet hours, stay `queued` with a `scheduled_at` for the
// dispatcher to send later. Bounded retries with backoff on transient failures.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { providerFor } from "@/lib/notify/providers";
import type { NotificationChannel, DeliveryRequest } from "@/lib/notify/types";

const TABLE = "notification_deliveries";
const MAX_ATTEMPTS = 3;

const ENTITY_COL: Record<string, string> = {
  lead: "lead_id", buyer: "buyer_id", seller: "seller_id",
  property: "property_id", deal: "deal_id", meeting: "meeting_id", task: "task_id",
};

export interface InAppInput {
  orgId: string; userId: string; dedupKey: string;
  level: "info" | "success" | "warning" | "critical"; category: string;
  title: string; body: string; href: string | null;
  entity?: { type: string; id: string } | null;
}

/** Claim (org, dedupKey). Returns false when already claimed (a real duplicate). */
async function claim(db: any, row: any): Promise<boolean> {
  const { error } = await db.from(TABLE).insert(row);
  return !error;
}

/** In-app: dedup-claim, then insert the notifications row. Idempotent. */
export async function dispatchInApp(db: any, i: InAppInput): Promise<boolean> {
  const claimed = await claim(db, {
    org_id: i.orgId, user_id: i.userId, channel: "in_app", provider: "in_app",
    status: "queued", dedup_key: i.dedupKey, payload: { title: i.title },
  });
  if (!claimed) return false;
  const notif: any = { org_id: i.orgId, user_id: i.userId, level: i.level, category: i.category, title: i.title, body: i.body, href: i.href };
  if (i.entity && ENTITY_COL[i.entity.type]) notif[ENTITY_COL[i.entity.type]] = i.entity.id;
  const { data } = await db.from("notifications").insert(notif).select("id").maybeSingle();
  await db.from(TABLE).update({ status: "delivered", notification_id: (data as any)?.id ?? null, updated_at: new Date().toISOString() })
    .eq("org_id", i.orgId).eq("dedup_key", i.dedupKey);
  return true;
}

/** External channel: claim; then send now, or leave queued (deferred) for the cron. */
export async function dispatchExternal(
  db: any, channel: NotificationChannel, req: DeliveryRequest, opts: { scheduledAt?: string | null },
): Promise<{ sent: boolean; skipped?: boolean }> {
  const provider = channel === "whatsapp" ? "whatsapp_cloud" : channel;
  const claimed = await claim(db, {
    org_id: req.orgId, user_id: req.userId ?? null, notification_id: req.notificationId ?? null,
    channel, provider, status: "queued", dedup_key: req.dedupKey, scheduled_at: opts.scheduledAt ?? null,
    payload: { to: req.to, title: req.title ?? null, body: req.body, template: req.template ?? null },
  });
  if (!claimed) return { sent: false, skipped: true };
  if (opts.scheduledAt) return { sent: false }; // deferred → dispatcher sends when due

  const result = await providerFor(channel).deliver(req);
  await db.from(TABLE).update({
    status: result.status,
    provider_message_id: result.ok ? result.providerMessageId : null,
    error: result.ok ? null : result.error, attempts: 1, updated_at: new Date().toISOString(),
  }).eq("org_id", req.orgId).eq("dedup_key", req.dedupKey);
  return { sent: result.ok };
}

/** Dispatcher: send due deferred rows + retry transient failures. Bounded. */
export async function processDueQueue(limit = 200): Promise<{ sent: number; failed: number; retried: number }> {
  const db: any = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data } = await db.from(TABLE)
    .select("id,org_id,user_id,channel,dedup_key,payload,attempts")
    .eq("status", "queued").neq("channel", "in_app").lte("scheduled_at", nowIso).limit(limit);
  const rows = (data ?? []) as any[];
  let sent = 0, failed = 0, retried = 0;
  for (const r of rows) {
    const channel = r.channel as NotificationChannel;
    const p = r.payload ?? {};
    const req: DeliveryRequest = { orgId: r.org_id, userId: r.user_id, channel, to: p.to, title: p.title, body: p.body, template: p.template ?? null, dedupKey: r.dedup_key };
    const result = await providerFor(channel).deliver(req);
    const attempts = (r.attempts ?? 0) + 1;
    if (result.ok) {
      await db.from(TABLE).update({ status: result.status, provider_message_id: result.providerMessageId, attempts, updated_at: nowIso }).eq("id", r.id);
      sent++;
    } else if (/transient/.test(result.error) && attempts < MAX_ATTEMPTS) {
      await db.from(TABLE).update({ attempts, scheduled_at: new Date(Date.now() + attempts * 15 * 60_000).toISOString(), error: result.error, updated_at: nowIso }).eq("id", r.id);
      retried++;
    } else {
      await db.from(TABLE).update({ status: "failed", attempts, error: result.error, updated_at: nowIso }).eq("id", r.id);
      failed++;
    }
  }
  return { sent, failed, retried };
}
