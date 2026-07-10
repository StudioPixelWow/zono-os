/**
 * activityIntelligenceService — the write/read API every module uses to record
 * and read the unified activity & relationship layer (server-only).
 *
 * logActivityEvent is intentionally resilient: it never throws to its caller,
 * so adding activity logging to an existing flow can't break that flow.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  activityEventRepository,
  communicationRepository,
  entityRelationshipRepository,
  timelineRepository,
  type ActivityEventRow,
  type RelationshipRow,
  type TimelineQuery,
} from "./repository";
import { EVENT_TYPES, type ActivitySummary, type LogActivityInput } from "./types";

const DAY = 86_400_000;

/** Create a normalized activity event. Best-effort — never throws. */
export async function logActivityEvent(input: LogActivityInput): Promise<void> {
  try {
    const { user, profile } = await getSessionContext();
    if (!profile) return;
    await activityEventRepository.insert({
      org_id: profile.org_id,
      actor_user_id: user?.id ?? null,
      actor_type: input.metadata?.actorType === "system" ? "system" : "user",
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      title: input.title,
      description: input.description ?? null,
      channel: input.channel ?? null,
      direction: input.direction ?? null,
      priority: input.priority ?? null,
      status: input.status ?? null,
      sentiment: input.sentiment ?? null,
      metadata: (input.metadata ?? {}) as never,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
  } catch (e) {
    console.error("[activity] logActivityEvent failed:", e);
  }
}

export interface CreateRelationshipInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationshipType: string;
  strengthScore?: number;
  metadata?: Record<string, unknown>;
}

/** Create (or refresh) a relationship between two entities. Best-effort. */
export async function createRelationship(input: CreateRelationshipInput): Promise<void> {
  try {
    const { user, profile } = await getSessionContext();
    if (!profile) return;
    await entityRelationshipRepository.upsert({
      org_id: profile.org_id,
      source_entity_type: input.sourceType,
      source_entity_id: input.sourceId,
      target_entity_type: input.targetType,
      target_entity_id: input.targetId,
      relationship_type: input.relationshipType,
      strength_score: input.strengthScore ?? 0,
      status: "active",
      metadata: (input.metadata ?? {}) as never,
      created_by_user_id: user?.id ?? null,
    });
  } catch (e) {
    console.error("[activity] createRelationship failed:", e);
  }
}

/**
 * The single entity-timeline read every cockpit uses. Backward compatible: pass
 * a number for a simple limit, or a TimelineQuery for pagination + date /
 * event-type / actor / visibility filtering.
 */
export function getEntityTimeline(
  entityType: string,
  entityId: string,
  limitOrQuery: number | TimelineQuery = 100,
): Promise<ActivityEventRow[]> {
  const q: TimelineQuery = typeof limitOrQuery === "number" ? { limit: limitOrQuery } : limitOrQuery;
  return timelineRepository.getEntityTimeline(entityType, entityId, q);
}

export function getEntityRelationships(
  entityType: string,
  entityId: string,
): Promise<RelationshipRow[]> {
  return entityRelationshipRepository.listForEntity(entityType, entityId);
}

// ── Typed log helpers ────────────────────────────────────────────────────────
interface MinimalTask {
  id: string;
  title: string;
  property_id?: string | null;
  buyer_id?: string | null;
  seller_id?: string | null;
}
function taskTarget(t: MinimalTask): { type: string; id: string } | null {
  if (t.property_id) return { type: "property", id: t.property_id };
  if (t.buyer_id) return { type: "buyer", id: t.buyer_id };
  if (t.seller_id) return { type: "seller", id: t.seller_id };
  return null;
}

export function logTaskCreated(task: MinimalTask): Promise<void> {
  const tgt = taskTarget(task);
  return logActivityEvent({
    eventType: EVENT_TYPES.taskCreated,
    entityType: tgt?.type ?? "task",
    entityId: tgt?.id ?? task.id,
    relatedEntityType: "task",
    relatedEntityId: task.id,
    title: `נוצרה משימה: ${task.title}`,
    priority: "medium",
  });
}

export function logTaskCompleted(task: MinimalTask): Promise<void> {
  const tgt = taskTarget(task);
  return logActivityEvent({
    eventType: EVENT_TYPES.taskCompleted,
    entityType: tgt?.type ?? "task",
    entityId: tgt?.id ?? task.id,
    relatedEntityType: "task",
    relatedEntityId: task.id,
    title: `הושלמה משימה: ${task.title}`,
    status: "done",
  });
}

export function logNoteCreated(note: { id: string; property_id?: string | null; buyer_id?: string | null }): Promise<void> {
  const type = note.property_id ? "property" : note.buyer_id ? "buyer" : "note";
  const id = note.property_id ?? note.buyer_id ?? note.id;
  return logActivityEvent({
    eventType: EVENT_TYPES.noteCreated,
    entityType: type,
    entityId: id,
    relatedEntityType: "note",
    relatedEntityId: note.id,
    title: "נוספה הערה",
  });
}

export function logMeetingScheduled(meeting: { id: string; title: string; property_id?: string | null; buyer_id?: string | null }): Promise<void> {
  const type = meeting.property_id ? "property" : meeting.buyer_id ? "buyer" : "meeting";
  const id = meeting.property_id ?? meeting.buyer_id ?? meeting.id;
  return logActivityEvent({
    eventType: EVENT_TYPES.meetingScheduled,
    entityType: type,
    entityId: id,
    relatedEntityType: "meeting",
    relatedEntityId: meeting.id,
    title: `נקבעה פגישה: ${meeting.title}`,
  });
}

/** Meeting lifecycle timeline events (completed / cancelled / rescheduled / no_show). */
export function logMeetingLifecycle(
  eventType: string,
  meeting: { id: string; title: string; property_id?: string | null; buyer_id?: string | null; seller_id?: string | null; lead_id?: string | null },
  title: string,
  description?: string | null,
): Promise<void> {
  const entityType = meeting.property_id
    ? "property"
    : meeting.buyer_id
      ? "buyer"
      : meeting.seller_id
        ? "seller"
        : meeting.lead_id
          ? "lead"
          : "meeting";
  const entityId = meeting.property_id ?? meeting.buyer_id ?? meeting.seller_id ?? meeting.lead_id ?? meeting.id;
  return logActivityEvent({
    eventType,
    entityType,
    entityId,
    relatedEntityType: "meeting",
    relatedEntityId: meeting.id,
    title,
    description: description ?? undefined,
  });
}

export function logDocumentSent(doc: { id: string; title: string; property_id?: string | null }): Promise<void> {
  return logActivityEvent({
    eventType: EVENT_TYPES.documentSent,
    entityType: doc.property_id ? "property" : "document",
    entityId: doc.property_id ?? doc.id,
    relatedEntityType: "document",
    relatedEntityId: doc.id,
    title: `נשלח מסמך: ${doc.title}`,
  });
}

export function logPropertyStatusChanged(property: { id: string; status: string }): Promise<void> {
  return logActivityEvent({
    eventType: EVENT_TYPES.statusChanged,
    entityType: "property",
    entityId: property.id,
    title: `סטטוס הנכס עודכן ל-${property.status}`,
    status: property.status,
  });
}

export function logScoreChanged(entityType: string, entityId: string, summary: string): Promise<void> {
  return logActivityEvent({
    eventType: EVENT_TYPES.scoreChanged,
    entityType,
    entityId,
    title: "ציונים עודכנו",
    description: summary,
  });
}

export function getRecentOrganizationActivity(limit = 30): Promise<ActivityEventRow[]> {
  return activityEventRepository.listRecentForOrg(limit);
}

/** Activity counts/recency for any entity (used by intelligence + UI). */
export async function getActivitySummaryForEntity(
  entityType: string,
  entityId: string,
): Promise<ActivitySummary> {
  const events = await activityEventRepository.listForEntity(entityType, entityId, 500);
  const last = events[0]?.occurred_at ?? null;
  const count = (pred: (e: ActivityEventRow) => boolean) => events.filter(pred).length;
  return {
    lastActivityAt: last,
    daysWithoutActivity: last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY) : null,
    tasksCompleted: count((e) => e.event_type === EVENT_TYPES.taskCompleted),
    meetingsScheduled: count((e) => e.event_type === EVENT_TYPES.meetingScheduled),
    notesCreated: count((e) => e.event_type === EVENT_TYPES.noteCreated),
    touchpoints: count((e) => e.event_type.includes("touchpoint") || e.event_type.includes("interaction")),
    totalEvents: events.length,
  };
}

// ── Dashboard board (organization activity widgets) ──────────────────────────
export interface ActivityBoardItem {
  propertyId: string;
  title: string;
  meta: string;
}
export interface ActivityBoard {
  recent: ActivityEventRow[];
  noActivity: ActivityBoardItem[];
  upcomingMeetings: ActivityBoardItem[];
  tasksCompletedToday: number;
  total: number;
}

export async function listActivityBoard(): Promise<ActivityBoard> {
  const supabase = await createClient();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const sevenDaysAgo = Date.now() - 7 * DAY;

  const [recent, propsRes, propEventsRes, meetingsRes] = await Promise.all([
    activityEventRepository.listRecentForOrg(8),
    supabase.from("properties").select("id,title").neq("status", "archived"),
    supabase
      .from("activity_events")
      .select("entity_id,occurred_at")
      .eq("entity_type", "property")
      .gte("occurred_at", since30)
      .order("occurred_at", { ascending: false })
      .limit(1000),
    supabase
      .from("meetings")
      .select("id,title,start_at,property_id")
      .gte("start_at", now.toISOString())
      .order("start_at", { ascending: true })
      .limit(6),
  ]);

  const props = propsRes.data ?? [];
  const lastByProp = new Map<string, string>();
  for (const e of propEventsRes.data ?? []) {
    if (!lastByProp.has(e.entity_id)) lastByProp.set(e.entity_id, e.occurred_at);
  }
  const noActivity: ActivityBoardItem[] = props
    .filter((p) => {
      const last = lastByProp.get(p.id);
      return !last || new Date(last).getTime() < sevenDaysAgo;
    })
    .slice(0, 6)
    .map((p) => {
      const last = lastByProp.get(p.id);
      const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY) : null;
      return { propertyId: p.id, title: p.title, meta: days == null ? "אין פעילות" : `${days} ימים` };
    });

  const upcomingMeetings: ActivityBoardItem[] = (meetingsRes.data ?? []).map((m) => ({
    propertyId: m.property_id ?? "",
    title: m.title,
    meta: m.start_at ? new Date(m.start_at).toLocaleDateString("he-IL") : "—",
  }));

  const todayEvents = await activityEventRepository.listForOrgSince(startToday, 500);
  const tasksCompletedToday = todayEvents.filter((e) => e.event_type === EVENT_TYPES.taskCompleted).length;

  return {
    recent,
    noActivity,
    upcomingMeetings,
    tasksCompletedToday,
    total: recent.length + noActivity.length + upcomingMeetings.length + tasksCompletedToday,
  };
}

// Re-export future-ready communications repo for callers.
export { communicationRepository };
