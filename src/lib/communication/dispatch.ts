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
    payload: { to: req.to, title: req.title ?? null, body: req.body, html: req.html ?? null, template: req.template ?? null },
  });
  if (!claimed) return { sent: false, skipped: true };
  if (opts.scheduledAt) return { sent: false }; // deferred → dispatcher sends when due

  const result = await providerFor(channel).deliver(req);
  const nowIso = new Date().toISOString();
  // A TRANSIENT failure on an immediate send must stay recoverable: re-queue it
  // with backoff so processDueQueue retries it, instead of collapsing to a
  // terminal `failed` at attempt 1 that the dispatcher would never pick up.
  if (!result.ok && /transient/.test(result.error) && MAX_ATTEMPTS > 1) {
    await db.from(TABLE).update({
      status: "queued", attempts: 1, error: result.error,
      scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(), updated_at: nowIso,
    }).eq("org_id", req.orgId).eq("dedup_key", req.dedupKey);
    return { sent: false };
  }
  await db.from(TABLE).update({
    status: result.status,
    provider_message_id: result.ok ? result.providerMessageId : null,
    error: result.ok ? null : result.error, attempts: 1, updated_at: nowIso,
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
    // PER-ROW CLAIM (concurrency): atomically lease this row before sending so two
    // overlapping dispatcher runs never both call deliver() on it. The status CHECK
    // has no intermediate 'sending' state, so we lease by pushing scheduled_at ~10m
    // ahead (removing it from every other worker's `.lte(scheduled_at, now)` window)
    // guarded by an optimistic attempts match. A crash mid-send self-heals when the
    // lease elapses (bounded by MAX_ATTEMPTS). Loser → skip.
    const prevAttempts = r.attempts ?? 0;
    const { data: claimed } = await db.from(TABLE)
      .update({ scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString(), attempts: prevAttempts + 1, updated_at: nowIso })
      .eq("id", r.id).eq("status", "queued").eq("attempts", prevAttempts).lte("scheduled_at", nowIso)
      .select("id").maybeSingle();
    if (!claimed) continue; // another worker claimed it
    const channel = r.channel as NotificationChannel;
    const p = r.payload ?? {};
    const req: DeliveryRequest = { orgId: r.org_id, userId: r.user_id, channel, to: p.to, title: p.title, body: p.body, html: p.html ?? null, template: p.template ?? null, dedupKey: r.dedup_key };
    const result = await providerFor(channel).deliver(req);
    const attempts = prevAttempts + 1;
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

/**
 * ORPHAN REAPER (reliability). An immediate external send inserts a `queued` row
 * with `scheduled_at = null` then delivers in the same call; if the process crashes
 * between the insert and the terminal update, the row is stuck `queued`+null and is
 * NEVER selected by processDueQueue (`.lte(scheduled_at, now)` excludes null). This
 * makes such stale rows due again so the existing dispatcher finishes them — no
 * second job platform, no new status. Bounded. Also returns the terminal dead-letter
 * count for minimal operator visibility.
 */
export async function reapOrphanDeliveries(limit = 200, staleMinutes = 15): Promise<{ reaped: number; failedCount: number }> {
  const db: any = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  // External queued rows the dispatcher can't see: scheduled_at IS NULL, older than
  // the stale window (created_at guard avoids yanking a row mid immediate-send).
  const { data } = await db.from(TABLE)
    .update({ scheduled_at: nowIso, updated_at: nowIso })
    .eq("status", "queued").neq("channel", "in_app").is("scheduled_at", null).lt("created_at", staleIso)
    .select("id").limit(limit);
  let failedCount = 0;
  try {
    const { count } = await db.from(TABLE).select("id", { count: "exact", head: true }).eq("status", "failed");
    failedCount = count ?? 0;
  } catch { /* best-effort */ }
  return { reaped: (data ?? []).length, failedCount };
}

/**
 * Manager/admin manual retry of a terminally-FAILED external delivery. Re-queues the
 * row (attempts reset, due now) so the existing dispatcher re-sends it — reuses the
 * dispatch path, no new mechanism. Caller MUST enforce org scope + role. Idempotent:
 * only a row currently `failed` in the caller's org is re-queued.
 */
export async function requeueFailedDelivery(orgId: string, deliveryId: string): Promise<boolean> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from(TABLE)
    .update({ status: "queued", attempts: 0, scheduled_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
    .eq("id", deliveryId).eq("org_id", orgId).eq("status", "failed")
    .select("id").maybeSingle();
  return !!data;
}
