/**
 * Unified activity layer — repositories (RLS-scoped, server-only).
 * Never import from a Client Component; never use the service-role client.
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DB = Database["public"]["Tables"];
export type ActivityEventRow = DB["activity_events"]["Row"];

/** Filter/pagination options for the canonical entity-timeline read. */
export interface TimelineQuery {
  limit?: number;
  offset?: number;
  /** ISO — only events at/after this time. */
  since?: string;
  /** ISO — only events at/before this time. */
  until?: string;
  /** Restrict to these domain event types. */
  eventTypes?: string[];
  /** Only events by this actor. */
  actorUserId?: string;
  /** Visibility allow-list (portals pass ['public','shared']; brokers see all). */
  visibilityIn?: string[];
  /** Include events where the entity is the RELATED party (default true). */
  includeRelated?: boolean;
}
export type RelationshipRow = DB["entity_relationships"]["Row"];
export type ThreadRow = DB["communication_threads"]["Row"];
export type MessageRow = DB["communication_messages"]["Row"];

// ── activityEventRepository ──────────────────────────────────────────────────
export const activityEventRepository = {
  async insert(row: DB["activity_events"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("activity_events").insert(row);
    if (error) throw new Error(error.message);
  },
  /** Events where the entity is the subject OR the related entity. */
  async listForEntity(
    entityType: string,
    entityId: string,
    limit = 100,
  ): Promise<ActivityEventRow[]> {
    return this.queryForEntity(entityType, entityId, { limit });
  },
  /**
   * The canonical entity-timeline read. Supports pagination, date/event-type/
   * actor/visibility filtering, related-entity inclusion and STABLE ordering
   * (occurred_at desc, then id desc). Every cockpit reads through this — no
   * bespoke per-cockpit queries.
   */
  async queryForEntity(
    entityType: string,
    entityId: string,
    q: TimelineQuery = {},
  ): Promise<ActivityEventRow[]> {
    const supabase = await createClient();
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    let query = supabase.from("activity_events").select("*");

    // Subject-only, or subject OR related (default: include related timelines).
    if (q.includeRelated === false) {
      query = query.eq("entity_type", entityType).eq("entity_id", entityId);
    } else {
      query = query.or(
        `and(entity_type.eq.${entityType},entity_id.eq.${entityId}),and(related_entity_type.eq.${entityType},related_entity_id.eq.${entityId})`,
      );
    }
    if (q.since) query = query.gte("occurred_at", q.since);
    if (q.until) query = query.lte("occurred_at", q.until);
    if (q.eventTypes?.length) query = query.in("event_type", q.eventTypes);
    if (q.actorUserId) query = query.eq("actor_user_id", q.actorUserId);
    // `visibility` is added by the Stage-2 migration but not yet in generated
    // types — cast the column ref until types are regenerated.
    if (q.visibilityIn?.length) query = query.in("visibility" as never, q.visibilityIn as never);

    const { data } = await query
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    return data ?? [];
  },
  async listRecentForOrg(limit = 30): Promise<ActivityEventRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("activity_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },
  /** Lightweight org-wide events since a timestamp (for dashboard rollups). */
  async listForOrgSince(
    sinceIso: string,
    limit = 500,
  ): Promise<Pick<ActivityEventRow, "event_type" | "entity_type" | "entity_id" | "occurred_at" | "title">[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("activity_events")
      .select("event_type,entity_type,entity_id,occurred_at,title")
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  },
};

// ── entityRelationshipRepository ─────────────────────────────────────────────
export const entityRelationshipRepository = {
  async upsert(row: DB["entity_relationships"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("entity_relationships")
      .upsert(row as never, {
        onConflict:
          "org_id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type",
        ignoreDuplicates: false,
      });
    if (error) throw new Error(error.message);
  },
  /** Relationships where the entity is the source OR the target. */
  async listForEntity(entityType: string, entityId: string): Promise<RelationshipRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("entity_relationships")
      .select("*")
      .or(
        `and(source_entity_type.eq.${entityType},source_entity_id.eq.${entityId}),and(target_entity_type.eq.${entityType},target_entity_id.eq.${entityId})`,
      )
      .eq("status", "active")
      .limit(100);
    return data ?? [];
  },
};

// ── communicationRepository (future-ready) ───────────────────────────────────
export const communicationRepository = {
  async createThread(row: DB["communication_threads"]["Insert"]): Promise<ThreadRow> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("communication_threads")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
  async addMessage(row: DB["communication_messages"]["Insert"]): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("communication_messages").insert(row);
    if (error) throw new Error(error.message);
  },
  async listThreadsForProperty(propertyId: string): Promise<ThreadRow[]> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("communication_threads")
      .select("*")
      .eq("property_id", propertyId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    return data ?? [];
  },
};

// ── timelineRepository ───────────────────────────────────────────────────────
// The unified timeline reads from activity_events (the single source of truth).
export const timelineRepository = {
  getEntityTimeline: (entityType: string, entityId: string, q: TimelineQuery = {}) =>
    activityEventRepository.queryForEntity(entityType, entityId, q),
};
