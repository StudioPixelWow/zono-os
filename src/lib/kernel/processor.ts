// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 2 · Event Kernel · Outbox processor (server-only).
// Drains the append-only domain_events outbox and projects each pending event
// into the unified activity timeline (the first Kernel subscriber). Runs under
// the service role (cron / worker) — no user session. Idempotent per row:
//   pending  → project → insert activity_events → mark 'done' + processed_at
//   skipped  → mark 'done' (no projection for this type)
//   error    → increment retry_count; keep 'pending' until MAX, then 'failed'
// Best-effort per row: one bad row never blocks the batch.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { projectEventToTimeline, type DomainEventLike } from "./subscriber";

const MAX_RETRIES = 5;

export interface DrainResult {
  scanned: number;
  projected: number;
  skipped: number;
  failed: number;
}

/**
 * Process up to `limit` pending domain events into the timeline.
 * Safe to call repeatedly (cron) — it only ever touches rows still pending.
 */
export async function drainDomainEvents(limit = 200): Promise<DrainResult> {
  const db = createServiceRoleClient();
  const out: DrainResult = { scanned: 0, projected: 0, skipped: 0, failed: 0 };

  // Oldest-first so the timeline stays chronological. Only unprocessed rows.
  const { data, error } = await db
    .from("domain_events" as never)
    .select("id,event_type,event_version,organization_id,actor_user_id,entity_type,entity_id,payload,occurred_at,retry_count")
    .in("processing_status", ["pending", "failed"] as never)
    .order("occurred_at", { ascending: true })
    .limit(limit);

  if (error || !data) return out;
  const rows = data as unknown as (DomainEventLike & { id: string; retry_count: number })[];

  for (const row of rows) {
    out.scanned++;
    try {
      const projection = projectEventToTimeline(row);
      if (!projection) {
        await markDone(db, row.id);
        out.skipped++;
        continue;
      }
      const { error: insErr } = await db.from("activity_events").insert({
        org_id: projection.org_id,
        event_type: projection.event_type,
        entity_type: projection.entity_type,
        entity_id: projection.entity_id,
        title: projection.title,
        actor_id: projection.actor_id,
        occurred_at: projection.occurred_at,
      } as never);
      if (insErr) throw new Error(insErr.message);
      await markDone(db, row.id);
      out.projected++;
    } catch (e) {
      out.failed++;
      const nextRetry = (row.retry_count ?? 0) + 1;
      const status = nextRetry >= MAX_RETRIES ? "failed" : "pending";
      await db
        .from("domain_events" as never)
        .update({ retry_count: nextRetry, processing_status: status, error_summary: e instanceof Error ? e.message.slice(0, 500) : "project failed" } as never)
        .eq("id", row.id);
    }
  }
  return out;
}

async function markDone(db: ReturnType<typeof createServiceRoleClient>, id: string): Promise<void> {
  await db
    .from("domain_events" as never)
    .update({ processing_status: "done", processed_at: new Date().toISOString() } as never)
    .eq("id", id);
}
