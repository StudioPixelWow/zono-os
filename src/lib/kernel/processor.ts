// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 2 · Event Kernel · Outbox processor (server-only).
// Drains the append-only domain_events outbox and projects each event into the
// ONE canonical activity timeline (idempotently, with related-entity fan-out).
// Runs under the service role (cron / worker) — no user session.
//
// State machine per row:
//   pending / failed / stale-processing
//     → claim ('processing')
//     → project → upsert activity_events (idempotent per target timeline)
//     → mark 'done' + processed_at
//   duplicate projection (already present) → counted, NOT an error
//   error → retry_count+1; keep 'pending' until MAX_RETRIES, then 'failed'
//           (dead-letter) with error_summary (last_error)
// Best-effort per row: one bad row never blocks the batch. Self-healing: a row
// stuck in 'processing' (crashed mid-drain) is re-scanned and reprocessed —
// safe because the timeline projection is idempotent.
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
  projected: number;       // domain events that produced ≥1 timeline row
  timelineRows: number;    // total activity_events rows written (fan-out counted)
  duplicateSkips: number;  // idempotent no-ops (already projected)
  skipped: number;         // events with no timeline projection
  notified: number;
  graphEdges: number;
  memoryRows: number;
  failed: number;
}

type Row = DomainEventLike & { id: string; retry_count: number };

/**
 * Process up to `limit` unprocessed domain events into the timeline.
 * Safe to call repeatedly (cron) — only touches unprocessed / stuck rows.
 */
export async function drainDomainEvents(limit = 200): Promise<DrainResult> {
  const db = createServiceRoleClient();
  const out: DrainResult = {
    scanned: 0, projected: 0, timelineRows: 0, duplicateSkips: 0,
    skipped: 0, notified: 0, graphEdges: 0, memoryRows: 0, failed: 0,
  };

  // Oldest-first so the timeline stays chronological. 'processing' is included
  // so a row stuck by a crashed drain self-heals (idempotent reprocess).
  const { data, error } = await db
    .from("domain_events" as never)
    .select("id,event_type,event_version,organization_id,actor_user_id,entity_type,entity_id,payload,metadata,occurred_at,retry_count")
    .in("processing_status", ["pending", "failed", "processing"] as never)
    .order("occurred_at", { ascending: true })
    .limit(limit);

  if (error || !data) return out;
  const rows = data as unknown as Row[];
  if (rows.length === 0) return out;

  // Claim the batch → 'processing' (best-effort; idempotency covers double-drain).
  await db
    .from("domain_events" as never)
    .update({ processing_status: "processing" } as never)
    .in("id", rows.map((r) => r.id) as never);

  for (const row of rows) {
    out.scanned++;
    try {
      const projections = projectEventToTimeline(row);
      if (projections.length === 0) {
        await markDone(db, row.id);
        out.skipped++;
        continue;
      }

      // Idempotent projection: one row per (event_id, target entity). A repeat
      // is a unique-violation we swallow and count — never a duplicate row.
      for (const p of projections) {
        const { error: insErr } = await db.from("activity_events").insert({
          org_id: p.org_id,
          event_id: p.event_id,
          event_type: p.event_type,
          entity_type: p.entity_type,
          entity_id: p.entity_id,
          related_entity_type: p.related_entity_type,
          related_entity_id: p.related_entity_id,
          title: p.title,
          description: p.description,
          actor_user_id: p.actor_user_id,
          occurred_at: p.occurred_at,
          visibility: p.visibility,
          source: p.source,
          metadata: p.metadata,
        } as never);
        if (insErr) {
          if (isDuplicate(insErr)) { out.duplicateSkips++; continue; }
          throw new Error(insErr.message);
        }
        out.timelineRows++;
      }

      // Stage 3 · Notification subscriber — SECONDARY + best-effort.
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

      // Stage 4A · Graph subscriber — SECONDARY + best-effort.
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
      const status = nextRetry >= MAX_RETRIES ? "failed" : "pending"; // 'failed' = dead-letter
      await db
        .from("domain_events" as never)
        .update({
          retry_count: nextRetry,
          processing_status: status,
          error_summary: e instanceof Error ? e.message.slice(0, 500) : "project failed",
        } as never)
        .eq("id", row.id);
    }
  }
  return out;
}

/** Postgres unique-violation (idempotent no-op), not a real failure. */
function isDuplicate(err: { code?: string; message?: string }): boolean {
  return err.code === "23505" || (err.message ?? "").toLowerCase().includes("duplicate key");
}

async function markDone(db: ReturnType<typeof createServiceRoleClient>, id: string): Promise<void> {
  await db
    .from("domain_events" as never)
    .update({ processing_status: "done", processed_at: new Date().toISOString() } as never)
    .eq("id", id);
}
