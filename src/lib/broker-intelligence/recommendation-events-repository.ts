// ============================================================================
// 🔁 ZONO — BROKER INTELLIGENCE · Recommendation-events repository (server-only).
// Persists + reads the append-only lifecycle log (broker_recommendation_events).
// All access goes through the cookie/RLS client so Postgres keeps everything
// org-scoped. The table isn't in the generated Database types yet, so the table
// name + payloads are cast (`as never`) — same pattern the codebase uses for
// not-yet-typed tables. Reads never throw (return []); writes surface errors.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { LifecycleAction, LifecycleEvent } from "./lifecycle";

const TABLE = "broker_recommendation_events";

/** What the UI/action records when the broker acts on a recommendation. */
export interface RecordEventInput {
  recKey: string;
  entityType: string;
  entityId: string;
  area?: string | null;
  actionClass?: string | null;
  action: LifecycleAction;
  snoozeUntil?: string | null;
  title?: string | null;
  confidence?: number | null;
  priority?: number | null;
  note?: string | null;
}

async function currentOrgId(): Promise<string | null> {
  try {
    const { profile, state } = await getSessionContext();
    if (state !== "ready" || !profile?.org_id) return null;
    return profile.org_id;
  } catch {
    return null;
  }
}

/** Append one lifecycle event. Returns false if unauthenticated / write failed. */
export async function recordRecommendationEvent(input: RecordEventInput): Promise<boolean> {
  const org = await currentOrgId();
  if (!org) return false;
  const supabase = await createClient();
  const { error } = await supabase.from(TABLE as never).insert({
    organization_id: org,
    rec_key: input.recKey,
    entity_type: input.entityType,
    entity_id: input.entityId,
    area: input.area ?? null,
    action_class: input.actionClass ?? null,
    action: input.action,
    snooze_until: input.snoozeUntil ?? null,
    title: input.title ?? null,
    confidence: input.confidence ?? null,
    priority: input.priority ?? null,
    note: input.note ?? null,
  } as never);
  if (error) { console.error("[broker-rec-events] insert failed:", error.message); return false; }
  return true;
}

interface EventRow {
  rec_key: string;
  action: LifecycleAction;
  snooze_until: string | null;
  created_at: string;
}

/**
 * Recent lifecycle events for the current org, newest first. The pure
 * `reduceLatestStates` collapses these to a current state per recommendation.
 * Bounded read (`limit`) keeps it cheap — the broker's active set is small.
 */
export async function loadRecommendationEvents(limit = 500): Promise<LifecycleEvent[]> {
  const org = await currentOrgId();
  if (!org) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABLE as never)
      .select("rec_key,action,snooze_until,created_at")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as EventRow[]).map((r) => ({
      recKey: r.rec_key,
      action: r.action,
      at: r.created_at,
      snoozeUntil: r.snooze_until,
    }));
  } catch {
    return [];
  }
}

/**
 * Full event rows for the learning loop (Phase 4) — includes the decision
 * snapshot fields. Newest first, bounded.
 */
export interface OutcomeRow {
  rec_key: string;
  entity_type: string;
  area: string | null;
  action_class: string | null;
  action: LifecycleAction;
  confidence: number | null;
  priority: number | null;
  created_at: string;
}

export async function loadOutcomeRows(limit = 2000): Promise<OutcomeRow[]> {
  const org = await currentOrgId();
  if (!org) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABLE as never)
      .select("rec_key,entity_type,area,action_class,action,confidence,priority,created_at")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as unknown as OutcomeRow[];
  } catch {
    return [];
  }
}
