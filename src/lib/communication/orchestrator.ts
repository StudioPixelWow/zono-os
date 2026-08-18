/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Communication Automation: THE ORCHESTRATOR (server-only). The single
// brain: a real domain event in → decide (via the pure policy matrix) WHO, WHICH
// channel(s), WHETHER preferences/quiet-hours allow it, dedup, and hand off to
// the existing delivery layer (in-app notifications · WhatsApp Business · Resend
// email). Business transactions NEVER call this synchronously — it runs from the
// communication cron over the domain_events outbox, so a slow/failed provider can
// never break a core write. Idempotent by (org, dedup_key). No cross-tenant.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { planFor, isForceDeliverable, type CommRecipientRole, type CommPriority } from "./policy";
import { renderTemplate, withDeepLink, type TemplateFacts } from "./templates";
import { isQuietHours, nextAllowedSend } from "./quiet-hours";
import { dispatchInApp, dispatchExternal } from "./dispatch";
import type { DeliveryRequest } from "@/lib/notify/types";

export interface CommEvent {
  eventType: string;
  orgId: string;
  entityId: string;
  entityType?: string | null;
  actorUserId?: string | null;
  payload?: Record<string, unknown> | null;
  occurredAt?: string | null;
}

interface Prefs { whatsapp: boolean; email: boolean; morningEmail: boolean; urgentWhatsapp: boolean; meetingReminders: boolean }
export const DEFAULT_PREFS: Prefs = { whatsapp: true, email: true, morningEmail: true, urgentWhatsapp: true, meetingReminders: true };
export function normalizePrefs(j: any): Prefs {
  const p = (j && typeof j === "object") ? j : {};
  return {
    whatsapp: p.whatsapp !== false,
    email: p.email !== false,
    morningEmail: p.morningEmail !== false,
    urgentWhatsapp: p.urgentWhatsapp !== false,
    meetingReminders: p.meetingReminders !== false,
  };
}

export interface Recipient { userId: string; firstName: string | null; phone: string | null; email: string | null; prefs: Prefs }

export async function loadRecipient(db: any, userId: string | null): Promise<Recipient | null> {
  if (!userId) return null;
  const { data } = await db.from("users").select("id,full_name,phone,email,notification_preferences").eq("id", userId).maybeSingle();
  if (!data) return null;
  const first = ((data.full_name ?? "") as string).trim().split(/\s+/)[0] || null;
  return { userId: data.id, firstName: first, phone: data.phone ?? null, email: data.email ?? null, prefs: normalizePrefs(data.notification_preferences) };
}

async function resolveRecipient(db: any, evt: CommEvent, role: CommRecipientRole): Promise<Recipient | null> {
  if (role === "actor") return loadRecipient(db, evt.actorUserId ?? null);
  if (role === "assignee") {
    if (evt.entityType === "lead") {
      const { data } = await db.from("leads").select("owner_id").eq("id", evt.entityId).eq("org_id", evt.orgId).maybeSingle();
      return loadRecipient(db, (data?.owner_id ?? evt.actorUserId) ?? null);
    }
    return loadRecipient(db, evt.actorUserId ?? null);
  }
  // manager / owner → the office owner (avoids a role join; single, correct recipient)
  const { data } = await db.from("organizations").select("created_by_user_id").eq("id", evt.orgId).maybeSingle();
  return loadRecipient(db, (data?.created_by_user_id ?? null));
}

const CATEGORY: Record<string, string> = {
  "lead.followup_due": "followup_due", "lead.followup_overdue": "followup_due", "lead.hot_without_next_action": "followup_due",
  "lead.sla_breached": "followup_due", "lead.unassigned": "new_lead", "publish.failed": "system",
  "support.ticket_created": "system", "support.ticket_updated": "system",
  "billing.payment_failed": "system", "billing.payment_succeeded": "system",
  "billing.subscription_activated": "system", "billing.subscription_cancelled": "system",
};
const LEVEL: Record<CommPriority, "info" | "success" | "warning" | "critical"> = { critical: "critical", important: "warning", digest: "info", silent: "info" };

function factsFrom(evt: CommEvent, firstName: string | null): TemplateFacts {
  const p = (evt.payload ?? {}) as Record<string, unknown>;
  return {
    firstName,
    leadName: (p.leadName as string) ?? (p.full_name as string) ?? null,
    reason: (p.reason as string) ?? null,
    ticketNumber: (p.ticketNumber as string) ?? null,
    count: (p.count as number) ?? null,
    amount: (p.amount as string) ?? null,
    title: (p.title as string) ?? null,
  };
}

function appBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
}

/** dedup bucket: ≥1 day → per-calendar-day; else per-window-index. */
function dedupBucket(nowIso: string, windowMin: number): string {
  if (windowMin >= 1440) return nowIso.slice(0, 10);
  const ms = Date.parse(nowIso);
  return String(Math.floor(ms / (Math.max(1, windowMin) * 60_000)));
}

/**
 * Evaluate + deliver one event across the allowed channels. Idempotent, org-safe,
 * preference-aware, quiet-hours-aware. Returns which channels were acted on.
 */
export async function processCommunicationEvent(evt: CommEvent): Promise<{ ok: boolean; skipped?: boolean; channels?: string[] }> {
  const rule = planFor(evt.eventType);
  if (!rule || !evt.orgId || !evt.entityId) return { ok: true, skipped: true };

  const db: any = createServiceRoleClient();
  const r = await resolveRecipient(db, evt, rule.recipient);
  if (!r) return { ok: true, skipped: true };

  const occurredIso = evt.occurredAt ?? new Date().toISOString();
  const nowIso = new Date().toISOString();
  const force = isForceDeliverable(rule.priority, evt.eventType);
  const msg = rule.template ? renderTemplate(rule.template, factsFrom(evt, r.firstName)) : { title: evt.eventType, body: "" };
  const href = rule.deepLink(evt.entityId);
  const base = appBaseUrl();
  const bucket = dedupBucket(occurredIso, rule.dedupWindowMin);
  const done: string[] = [];

  // ── In-app (broadest channel) ──────────────────────────────────────────────
  if (rule.channels.inApp) {
    const ok = await dispatchInApp(db, {
      orgId: evt.orgId, userId: r.userId, dedupKey: `${evt.eventType}:${r.userId}:in_app:${bucket}`,
      level: LEVEL[rule.priority], category: CATEGORY[evt.eventType] ?? "system",
      title: msg.title, body: msg.body || msg.title, href,
      entity: evt.entityType ? { type: evt.entityType, id: evt.entityId } : null,
    });
    if (ok) done.push("in_app");
  }

  // ── Email (Resend) — pref-gated (forced for critical billing/security) ──────
  if (rule.channels.email && r.email && (r.prefs.email || force)) {
    const em = withDeepLink(msg, href, base);
    const req: DeliveryRequest = {
      orgId: evt.orgId, userId: r.userId, channel: "email", to: r.email,
      title: em.title, body: em.body, dedupKey: `${evt.eventType}:${r.userId}:email:${bucket}`,
    };
    const res = await dispatchExternal(db, "email", req, { scheduledAt: null });
    if (res.sent) done.push("email");
  }

  // ── WhatsApp — rare, urgent-gated, quiet-hours-deferred (unless critical) ────
  if (rule.channels.whatsapp && r.phone && ((r.prefs.whatsapp && r.prefs.urgentWhatsapp) || force)) {
    const wa = withDeepLink(msg, href, base);
    const deferred = !force && isQuietHours(nowIso);
    const req: DeliveryRequest = {
      orgId: evt.orgId, userId: r.userId, channel: "whatsapp", to: r.phone,
      title: wa.title, body: wa.body,
      template: rule.template ? { name: rule.template, language: "he", variables: [] } : null,
      dedupKey: `${evt.eventType}:${r.userId}:whatsapp:${bucket}`,
    };
    const res = await dispatchExternal(db, "whatsapp", req, { scheduledAt: deferred ? nextAllowedSend(nowIso) : null });
    if (res.sent || deferred) done.push(deferred ? "whatsapp:deferred" : "whatsapp");
  }

  return { ok: true, channels: done };
}
