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
import { invalidateCache } from "@/lib/platform-persistence/compute-cache";
import { projectEventToTimeline, type DomainEventLike } from "./subscriber";
import { projectEventToNotification, notificationEntityColumn } from "./notification-subscriber";
import { projectEventToGraphEdges } from "./graph-subscriber";
import { projectEventToMemory } from "./memory-subscriber";
import { projectEventToAutomation } from "./automation-subscriber";
import { projectEventToRecommendationRefresh } from "./recommendation-subscriber";
import { recordDelivery } from "./subscriber-deliveries";
import { classifyEventForSearch } from "@/lib/search-projection/subscriber";
import { indexEntity, softDeleteEntity } from "@/lib/search-projection/indexer";

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
  automationCandidates: number; // events classified into a downstream automation
  recommendationRefreshes: number; // events that invalidated a live-read cache
  cachesInvalidated: number;    // daily_os / executive_os invalidations issued
  searchIndexed: number;        // search_documents upserts/soft-deletes applied
  failed: number;
}

type Row = DomainEventLike & { id: string; retry_count: number };
type Db = ReturnType<typeof createServiceRoleClient>;

/**
 * Process up to `limit` unprocessed domain events into the timeline.
 * Safe to call repeatedly (cron) — only touches unprocessed / stuck rows.
 */
export async function drainDomainEvents(limit = 200): Promise<DrainResult> {
  const db = createServiceRoleClient();
  const out: DrainResult = {
    scanned: 0, projected: 0, timelineRows: 0, duplicateSkips: 0,
    skipped: 0, notified: 0, graphEdges: 0, memoryRows: 0,
    automationCandidates: 0, recommendationRefreshes: 0, cachesInvalidated: 0, searchIndexed: 0, failed: 0,
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
    const t0 = Date.now();
    try {
      const projections = projectEventToTimeline(row);
      if (projections.length === 0) {
        await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "timeline", status: "skipped", latencyMs: Date.now() - t0 });
        // A timeline-skipped event can still drive automation / recommendations.
        await runDownstreamSubscribers(db, row, out, t0);
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
      await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "timeline", status: "done", latencyMs: Date.now() - t0 });

      // All other subscribers (notification / graph / memory / automation /
      // recommendation) — SECONDARY + best-effort; a failure here never fails
      // the event (the timeline projection already landed).
      await runDownstreamSubscribers(db, row, out, t0);

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

/**
 * Run every SECONDARY subscriber for one event (notification, graph, memory,
 * automation, recommendation). Each is independently best-effort and records its
 * own per-subscriber delivery. Automation NEVER executes — it classifies the
 * event into a downstream candidate that surfaces via the stateless approval
 * inbox. Recommendation keeps Daily OS / Executive event-driven by invalidating
 * their compute caches (replacing polling). Idempotent: notifications dedupe on
 * (org_id,event_id); cache invalidation + delivery inserts are safe on reprocess.
 */
async function runDownstreamSubscribers(db: Db, row: Row, out: DrainResult, t0: number): Promise<void> {
  // ── Notification — idempotent via notifications(org_id, event_id). ──────────
  try {
    const note = projectEventToNotification(row);
    if (note) {
      const fkCol = notificationEntityColumn(note.entityType);
      const noteRow: Record<string, unknown> = {
        org_id: note.org_id, user_id: note.user_id, level: note.level,
        category: note.category, title: note.title, href: note.href, event_id: row.id,
      };
      if (fkCol) noteRow[fkCol] = note.entityId;
      const { error: nErr } = await db.from("notifications").insert(noteRow as never);
      if (!nErr) { out.notified++; await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "notification", status: "done", latencyMs: Date.now() - t0 }); }
      else if (isDuplicate(nErr)) await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "notification", status: "duplicate", latencyMs: Date.now() - t0 });
    }
  } catch { /* notification is non-critical */ }

  // ── Graph — incremental edges on the canonical entity_relationships substrate.
  //    upsert = create/refresh (idempotent on the 6-part key; reactivates a retired
  //    edge); retire = inactivate (status→inactive, valid_to=now — history kept). ──
  try {
    let applied = 0;
    const now = new Date().toISOString();
    for (const op of projectEventToGraphEdges(row)) {
      if (op.op === "retire") {
        const { error } = await db.from("entity_relationships")
          .update({ status: "inactive", valid_to: now, last_seen_at: now } as never)
          .eq("org_id", op.org_id)
          .eq("source_entity_type", op.source_entity_type).eq("source_entity_id", op.source_entity_id)
          .eq("target_entity_type", op.target_entity_type).eq("target_entity_id", op.target_entity_id)
          .eq("relationship_type", op.relationship_type);
        if (!error) applied++;
      } else {
        const { error } = await db.from("entity_relationships").upsert({
          org_id: op.org_id,
          source_entity_type: op.source_entity_type, source_entity_id: op.source_entity_id,
          target_entity_type: op.target_entity_type, target_entity_id: op.target_entity_id,
          relationship_type: op.relationship_type,
          status: "active",
          strength_score: op.strength ?? 0,
          metadata: op.metadata ?? {},
          last_seen_at: now,
          valid_to: null, // reactivate if it had been retired
          source_event_id: row.id,
        } as never, { onConflict: "org_id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type" });
        if (!error) { out.graphEdges++; applied++; }
      }
    }
    if (applied) await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "graph", status: "done", latencyMs: Date.now() - t0 });
  } catch { /* graph is non-critical */ }

  // ── Org-Memory — milestones only. ───────────────────────────────────────────
  try {
    const mem = projectEventToMemory(row);
    if (mem) {
      const { error: mErr } = await db.from("zono_org_memory_events" as never).insert(mem as never);
      if (!mErr) { out.memoryRows++; await recordDelivery(db, { orgId: row.organization_id, eventId: row.id, subscriber: "memory", status: "done", latencyMs: Date.now() - t0 }); }
    }
  } catch { /* memory is non-critical */ }

  // ── Automation — CLASSIFY ONLY (never execute). The candidate surfaces via the
  //    stateless approval-bundle inbox on next read; here we just record it. ────
  try {
    const intent = projectEventToAutomation(row);
    if (intent) {
      out.automationCandidates++;
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "automation", status: "done",
        latencyMs: Date.now() - t0,
        metadata: { journeyTrigger: intent.journeyTrigger, bundleEventType: intent.bundleEventType, requiresApproval: intent.requiresApproval },
      });
    }
  } catch { /* automation classification is non-critical */ }

  // ── Search — keep the canonical search_documents projection event-driven. ────
  try {
    const intent = classifyEventForSearch(row);
    if (intent) {
      const status = intent.action === "soft_delete"
        ? await softDeleteEntity(db, row.organization_id, intent.entityType, intent.entityId, row.id)
        : await indexEntity(db, row.organization_id, intent.entityType, intent.entityId, row.id);
      if (status === "done") out.searchIndexed++;
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "search",
        status: status === "done" ? "done" : status === "error" ? "failed" : "skipped",
        latencyMs: Date.now() - t0,
        metadata: { action: intent.action, entityType: intent.entityType, result: status },
      });
    }
  } catch { /* search projection is non-critical */ }

  // ── Recommendation — keep Daily OS / Executive event-driven (no polling). ────
  try {
    const refresh = projectEventToRecommendationRefresh(row);
    if (refresh) {
      out.recommendationRefreshes++;
      if (refresh.refreshDaily) { if (await invalidateCache(row.organization_id, "daily_os")) out.cachesInvalidated++; }
      if (refresh.refreshExecutive) { if (await invalidateCache(row.organization_id, "executive_os")) out.cachesInvalidated++; }
      await recordDelivery(db, {
        orgId: row.organization_id, eventId: row.id, subscriber: "recommendation", status: "done",
        latencyMs: Date.now() - t0,
        metadata: { areas: refresh.affectedAreas, refreshDaily: refresh.refreshDaily, refreshExecutive: refresh.refreshExecutive },
      });
    }
  } catch { /* recommendation refresh is non-critical */ }
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
