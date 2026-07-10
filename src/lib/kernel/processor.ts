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
import { projectEventToNotification, notificationEntityColumn } from "./notification-subscriber";
import { projectEventToGraphEdges } from "./graph-subscriber";
import { projectEventToMemory } from "./memory-subscriber";

const MAX_RETRIES = 5;

export interface DrainResult {
  scanned: number;
  projected: number;
  skipped: number;
  notified: number;
  graphEdges: number;
  memoryRows: number;
  failed: number;
}

/**
 * Process up to `limit` pending domain events into the timeline.
 * Safe to call repeatedly (cron) — it only ever touches rows still pending.
 */
export async function drainDomainEvents(limit = 200): Promise<DrainResult> {
  const db = createServiceRoleClient();
  const out: DrainResult = { scanned: 0, projected: 0, skipped: 0, notified: 0, graphEdges: 0, memoryRows: 0, failed: 0 };

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

      // Stage 3 · Notification subscriber — SECONDARY + best-effort. A failure
      // here must never fail the event (the timeline projection already landed).
      try {
        const note = projectEventToNotification(row);
        if (note) {
          const fkCol = notificationEntityColumn(note.entityType);
          const noteRow: Record<string, unknown> = {
            org_id: note.org_id, user_id: note.user_id, level: note.level,
            category: note.category, title: note.title, href: note.href,
          };
          if (fkCol) noteRow[fkCol] = note.entityId;
          const { error: nErr } = await db.from("notifications").insert(noteRow as never);
          if (!nErr) out.notified++;
        }
      } catch { /* notification is non-critical */ }

      // Stage 4A · Graph subscriber — SECONDARY + best-effort. Edge dupes on a
      // rare reprocess are tolerated (graph readers dedupe on read).
      try {
        for (const edge of projectEventToGraphEdges(row)) {
          const { error: gErr } = await db.from("entity_relationships").insert(edge as never);
          if (!gErr) out.graphEdges++;
        }
      } catch { /* graph is non-critical */ }

      // Stage 4B · Org-Memory subscriber — SECONDARY + best-effort. Milestones only.
      try {
        const mem = projectEventToMemory(row);
        if (mem) {
          const { error: mErr } = await db.from("zono_org_memory_events" as never).insert(mem as never);
          if (!mErr) out.memoryRows++;
        }
      } catch { /* memory is non-critical */ }

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
