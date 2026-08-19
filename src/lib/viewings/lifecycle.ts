/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Viewing automation lifecycle (server-only). Slice 3.
// The `meetings` table (type ∈ viewing/open_house) is the SINGLE viewing entity;
// this module adds the customer-lifecycle semantics on top of the existing
// calendar-os meeting lifecycle: a token-validated CUSTOMER CONFIRM, a reschedule
// request, and POST-VIEWING FEEDBACK that feeds REAL CRM + matching state (reco
// status, entity_relationships edges) and — for the choices that need a human —
// an idempotent agent task. It NEVER creates or advances a deal autonomously and
// NEVER touches privileged deal state from the customer path. Every viewing.*
// transition is emitted as a canonical business event (idempotent) so the comm
// layer and timeline stay the single source of truth. Reminders reuse the
// existing meeting.reminder scanner (a viewing IS a meeting).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { DomainEventType } from "@/lib/kernel/events";

type Row = Record<string, unknown>;
const VIEW_COLS = "id,org_id,title,type,status,start_at,end_at,organizer_id,buyer_id,seller_id,lead_id,property_id,deal_id";
const VIEWING_TYPES = new Set(["viewing", "open_house"]);

export type ViewingFeedbackChoice = "interested" | "advance" | "not_suitable" | "talk_to_agent";
const CHOICE_LABEL: Record<ViewingFeedbackChoice, string> = {
  interested: "הנכס מעניין את הלקוח",
  advance: "הלקוח רוצה להתקדם",
  not_suitable: "הנכס לא מתאים ללקוח",
  talk_to_agent: "הלקוח מבקש לדבר עם הסוכן",
};

export function isViewingMeeting(type: unknown): boolean {
  return typeof type === "string" && VIEWING_TYPES.has(type);
}

const TIME_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
export function heViewingTime(startAt: unknown): string | null {
  if (typeof startAt !== "string" || !startAt) return null;
  const d = new Date(startAt);
  return Number.isNaN(d.getTime()) ? null : TIME_FMT.format(d);
}

// ── Canonical viewing.* emitter (best-effort; entityType is always "meeting") ──
async function emitViewing(
  type: DomainEventType, orgId: string, m: Row,
  payload: Record<string, unknown>, idempotencyKey: string | null, actorUserId: string | null,
): Promise<void> {
  try {
    const { emitBusinessEvent } = await import("@/lib/kernel");
    await emitBusinessEvent({
      type, entityType: "meeting", entityId: String(m.id), orgId, actorUserId,
      payload: { title: (m.title as string | null) ?? null, ...payload },
      idempotencyKey,
    });
  } catch { /* best-effort — telemetry/comm are never allowed to break a write */ }
}

async function contactName(db: any, m: Row): Promise<string | null> {
  try {
    if (m.buyer_id) { const { data } = await db.from("buyers").select("full_name").eq("id", m.buyer_id).maybeSingle(); return (data?.full_name as string | null) ?? null; }
    if (m.lead_id) { const { data } = await db.from("leads").select("full_name").eq("id", m.lead_id).maybeSingle(); return (data?.full_name as string | null) ?? null; }
  } catch { /* name is cosmetic */ }
  return null;
}

// ── Idempotent viewing-derived agent task (mirrors the followup:/wa: namespaces) ──
async function ensureViewingTask(
  db: any, orgId: string, source: string,
  t: { assigneeId: string | null; title: string; buyerId?: string | null; leadId?: string | null; propertyId?: string | null; priority?: "high" | "urgent" },
): Promise<void> {
  try {
    const { data: existing } = await db.from("tasks").select("id")
      .eq("org_id", orgId).eq("intelligence_source", source).in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
    if (existing?.id) return;
    const row: any = {
      org_id: orgId, assignee_id: t.assigneeId ?? null, title: t.title, status: "todo",
      priority: t.priority ?? "high", intelligence_source: source, is_automatable: true,
    };
    if (t.buyerId) row.buyer_id = t.buyerId;
    if (t.leadId) row.lead_id = t.leadId;
    if (t.propertyId) row.property_id = t.propertyId;
    await db.from("tasks").insert(row);
  } catch { /* best-effort */ }
}

async function loadViewing(db: any, orgId: string, meetingId: string): Promise<Row | null> {
  const { data } = await db.from("meetings").select(VIEW_COLS).eq("id", meetingId).eq("org_id", orgId).maybeSingle();
  return (data as Row | null) ?? null;
}

// ── Agent-initiated transitions (called from the calendar-os meeting lifecycle) ──
// These stay SILENT in the comm matrix (the agent performed them); the emitted
// events give the canonical viewing vocabulary + timeline/telemetry.

export async function onViewingScheduled(orgId: string, m: Row, actorUserId: string | null, meta?: Record<string, unknown>): Promise<void> {
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  await emitViewing(DOMAIN_EVENTS.viewingScheduled, orgId, m, { when: heViewingTime(m.start_at), ...(meta ?? {}) }, `viewing.scheduled:${m.id}`, actorUserId);
}

export async function onViewingRescheduled(orgId: string, m: Row, actorUserId: string | null): Promise<void> {
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  // A new start_at naturally re-keys the meeting.reminder idempotency key, so the
  // old reminder is invalidated and exactly one new reminder can fire.
  await emitViewing(DOMAIN_EVENTS.viewingRescheduled, orgId, m, { when: heViewingTime(m.start_at) }, `viewing.rescheduled:${m.id}:${String(m.start_at).slice(0, 16)}`, actorUserId);
}

export async function onViewingCancelled(orgId: string, m: Row, actorUserId: string | null, reason: string | null): Promise<void> {
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  await emitViewing(DOMAIN_EVENTS.viewingCancelled, orgId, m, { reason: reason ?? null }, `viewing.cancelled:${m.id}`, actorUserId);
}

export async function onViewingCompleted(orgId: string, m: Row, actorUserId: string | null): Promise<void> {
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  await emitViewing(DOMAIN_EVENTS.viewingCompleted, orgId, m, { when: heViewingTime(m.start_at) }, `viewing.completed:${m.id}`, actorUserId);
  // Post-viewing follow-up for a BUYER viewing with no lead (the lead path is
  // already covered by onMeetingCompletedEnsureFollowUp). Idempotent.
  if (m.buyer_id && !m.lead_id) {
    const db: any = createServiceRoleClient();
    const name = await contactName(db, m);
    await ensureViewingTask(db, orgId, `viewing:post:${m.id}`, {
      assigneeId: (m.organizer_id as string | null) ?? null,
      title: `פולואפ לאחר ביקור — ${name ?? "לקוח"}`,
      buyerId: (m.buyer_id as string | null) ?? null, propertyId: (m.property_id as string | null) ?? null, priority: "high",
    });
  }
}

export async function onViewingNoShow(orgId: string, m: Row, actorUserId: string | null): Promise<void> {
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  const db: any = createServiceRoleClient();
  const name = await contactName(db, m);
  await ensureViewingTask(db, orgId, `viewing:no_show:${m.id}`, {
    assigneeId: (m.organizer_id as string | null) ?? null,
    title: `הלקוח לא הגיע לביקור — ${name ?? "ליצור קשר"}`,
    buyerId: (m.buyer_id as string | null) ?? null, leadId: (m.lead_id as string | null) ?? null,
    propertyId: (m.property_id as string | null) ?? null, priority: "high",
  });
  await emitViewing(DOMAIN_EVENTS.viewingFollowupRequired, orgId, m, { reason: "הלקוח לא הגיע לביקור", leadName: name }, `viewing.followup:no_show:${m.id}`, actorUserId);
}

// ── Customer-initiated (token-validated, no session) transitions ─────────────

/** Customer confirms attendance from the secure /v page. Sets status=confirmed. */
export async function confirmViewing(orgId: string, meetingId: string): Promise<{ ok: boolean; reason: string; alreadyConfirmed?: boolean }> {
  const db: any = createServiceRoleClient();
  const m = await loadViewing(db, orgId, meetingId);
  if (!m) return { ok: false, reason: "not_found" };
  if (!isViewingMeeting(m.type)) return { ok: false, reason: "not_a_viewing" };
  const status = String(m.status);
  if (status === "cancelled") return { ok: false, reason: "cancelled" };
  if (status === "completed" || status === "no_show") return { ok: false, reason: "already_done" };
  if (status === "confirmed") return { ok: true, reason: "ok", alreadyConfirmed: true };
  const { error } = await db.from("meetings").update({ status: "confirmed" }).eq("id", meetingId).eq("org_id", orgId).eq("status", status);
  if (error) return { ok: false, reason: "update_failed" };
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  const name = await contactName(db, m);
  await emitViewing(DOMAIN_EVENTS.viewingConfirmed, orgId, m, { when: heViewingTime(m.start_at), leadName: name }, `viewing.confirmed:${meetingId}`, null);
  return { ok: true, reason: "ok" };
}

/** Customer asks to change the viewing time — hands an idempotent task to the agent. */
export async function requestViewingReschedule(orgId: string, meetingId: string): Promise<{ ok: boolean; reason: string }> {
  const db: any = createServiceRoleClient();
  const m = await loadViewing(db, orgId, meetingId);
  if (!m) return { ok: false, reason: "not_found" };
  if (!isViewingMeeting(m.type)) return { ok: false, reason: "not_a_viewing" };
  if (["cancelled", "completed", "no_show"].includes(String(m.status))) return { ok: false, reason: "closed" };
  const name = await contactName(db, m);
  await ensureViewingTask(db, orgId, `viewing:reschedule_request:${meetingId}`, {
    assigneeId: (m.organizer_id as string | null) ?? null,
    title: `בקשת שינוי מועד ביקור — ${name ?? "לקוח"}`,
    buyerId: (m.buyer_id as string | null) ?? null, leadId: (m.lead_id as string | null) ?? null,
    propertyId: (m.property_id as string | null) ?? null, priority: "high",
  });
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  await emitViewing(DOMAIN_EVENTS.viewingFollowupRequired, orgId, m, { reason: "הלקוח מבקש לשנות מועד ביקור", leadName: name }, `viewing.followup:reschedule:${meetingId}`, null);
  return { ok: true, reason: "ok" };
}

/**
 * Apply post-viewing feedback from the secure /v page. Feeds REAL CRM state:
 * recommendation status (if a reco row exists) + a canonical matching edge
 * (buyers only) + an idempotent agent task for the choices that need a human.
 * NEVER creates/advances a deal autonomously.
 */
export async function applyViewingFeedback(orgId: string, meetingId: string, choice: ViewingFeedbackChoice): Promise<{ ok: boolean; reason: string }> {
  const db: any = createServiceRoleClient();
  const m = await loadViewing(db, orgId, meetingId);
  if (!m) return { ok: false, reason: "not_found" };
  if (!isViewingMeeting(m.type)) return { ok: false, reason: "not_a_viewing" };

  const buyerId = (m.buyer_id as string | null) ?? null;
  const leadId = (m.lead_id as string | null) ?? null;
  const propertyId = (m.property_id as string | null) ?? null;
  const organizerId = (m.organizer_id as string | null) ?? null;
  const contactType: "buyer" | "lead" | null = buyerId ? "buyer" : leadId ? "lead" : null;
  const contactId = buyerId ?? leadId;
  const name = await contactName(db, m);

  // 1) Recommendation status — only when a matching reco row already exists
  //    (never fabricate one; a viewing may have been booked outside a bundle).
  if (contactType && contactId && propertyId) {
    const recoStatus = choice === "not_suitable" ? "rejected" : (choice === "interested" || choice === "advance") ? "interested" : null;
    if (recoStatus) {
      try {
        const { data: rec } = await db.from("customer_property_recommendations").select("id")
          .eq("org_id", orgId).eq("contact_type", contactType).eq("contact_id", contactId).eq("property_id", propertyId).limit(1).maybeSingle();
        if (rec?.id) {
          await db.from("customer_property_recommendations")
            .update({ status: recoStatus, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", rec.id);
        }
      } catch { /* best-effort */ }
    }
  }

  // 2) Canonical property-interest edge (matching signal; buyers only).
  if (contactType === "buyer" && contactId && propertyId && choice !== "talk_to_agent") {
    const rel = choice === "not_suitable" ? "buyer_rejected_property" : "buyer_interested_in_property";
    const strength = choice === "not_suitable" ? 10 : choice === "advance" ? 95 : 80;
    try {
      await db.from("entity_relationships").insert({
        org_id: orgId, source_entity_type: "buyer", source_entity_id: contactId,
        target_entity_type: "property", target_entity_id: propertyId,
        relationship_type: rel, strength_score: strength, status: "active",
      });
    } catch { /* edge is best-effort (may already exist) */ }
  }

  // 3) Agent action task for the choices that need a human. Deal PROGRESSION is
  //    surfaced as an action for the agent — never an autonomous deal write.
  if (choice === "advance" || choice === "talk_to_agent") {
    const ns = choice === "advance" ? "advance" : "talk";
    const title = choice === "advance"
      ? `לקדם עסקה — ${name ?? "לקוח"} מעוניין/ת להתקדם לאחר הביקור`
      : `הלקוח ${name ? `${name} ` : ""}מבקש/ת לדבר עם הסוכן על הנכס`;
    await ensureViewingTask(db, orgId, `viewing:${ns}:${meetingId}`, {
      assigneeId: organizerId, title, buyerId, leadId, propertyId,
      priority: choice === "talk_to_agent" ? "urgent" : "high",
    });
    const { DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitViewing(DOMAIN_EVENTS.viewingFollowupRequired, orgId, m,
      { reason: choice === "advance" ? "הלקוח רוצה להתקדם לעסקה" : "הלקוח מבקש לדבר עם הסוכן", leadName: name },
      `viewing.followup:${choice}:${meetingId}`, null);
  }

  // 4) Canonical feedback event (agent-facing notice; one per meeting+choice).
  const { DOMAIN_EVENTS } = await import("@/lib/kernel");
  await emitViewing(DOMAIN_EVENTS.viewingFeedbackReceived, orgId, m,
    { reason: CHOICE_LABEL[choice], leadName: name, choice }, `viewing.feedback:${meetingId}:${choice}`, null);
  return { ok: true, reason: "ok" };
}
